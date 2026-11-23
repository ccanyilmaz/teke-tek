import { getArenaThemeForRound } from '../game/arenas';
import { evaluateMatchAchievements, evaluateMatchTitle } from '../game/awards';
import { getCharacterById } from '../game/characters';
import { computeDamageStage } from '../game/damageVisuals';
import { createMatchState, stepTwoPlayerMatch } from '../game/engine';
import { MAX_ROUNDS, ROUNDS_TO_WIN } from '../game/rounds';
import type {
  CharacterId,
  InputIntent,
  MatchSeriesState,
  MatchState,
  MatchSummary,
  RoundResultRecord,
  WeaponId,
} from '../game/types';
import { pickDifferentWeapon, pickFairRandomWeaponPair } from '../game/weapons';
import {
  ONLINE_CONSTANTS,
  parseRoomClientMessage,
  sanitizeNickname,
  type MatchOverReason,
  type OnlinePlayerMeta,
  type OnlineRoomPhase,
  type OnlineRoomSnapshot,
  type PlayerSlot,
  type RoomClientMessage,
  type RoomServerMessage,
} from './protocol';

interface InternalPlayerSlot {
  role: PlayerSlot;
  sessionId: string;
  token: string;
  nickname: string;
  connId: string | null;
  connected: boolean;
  characterId: CharacterId | null;
  characterLocked: boolean;
  weaponId: WeaponId;
  rerollUsed: boolean;
  rouletteReady: boolean;
  wins: number;
  totalDamageTaken: number;
  totalHits: number;
  totalAttacks: number;
  totalDamageDealt: number;
  totalSapanHits: number;
  maxCombo: number;
  weaponsUsed: WeaponId[];
  disconnectedAtMs: number | null;
  // Input state & edge latches
  lastSeq: number;
  heldMoveX: number;
  heldMoveY: number;
  blockHeld: boolean;
  punchQueued: boolean;
  specialQueued: boolean;
  dodgeQueued: boolean;
  // Rate limiting
  rateWindowStartMs: number;
  rateCount: number;
}

interface InternalRoundRecord {
  roundNumber: number;
  winnerRole: PlayerSlot;
  p1WeaponId: WeaponId;
  p2WeaponId: WeaponId;
  p1HpRemaining: number;
  p2HpRemaining: number;
  p1Hits: number;
  p2Hits: number;
  p1Attacks: number;
  p2Attacks: number;
  p1DamageDealt: number;
  p2DamageDealt: number;
  p1DamageTakenInRound: number;
  p2DamageTakenInRound: number;
  p1SapanHits: number;
  p2SapanHits: number;
  p1MaxCombo: number;
  p2MaxCombo: number;
  durationSeconds: number;
}

export interface GameRoomTransport {
  sendToConn: (connId: string, msg: RoomServerMessage) => void;
  broadcast: (msg: RoomServerMessage) => void;
  closeConn?: (connId: string, code?: number, reason?: string) => void;
}

function createEmptySlot(
  role: PlayerSlot,
  sessionId: string,
  token: string,
  nickname?: string
): InternalPlayerSlot {
  const defaultName = role === 'player' ? 'Oyuncu 1' : 'Oyuncu 2';
  return {
    role,
    sessionId,
    token,
    nickname: sanitizeNickname(nickname, defaultName),
    connId: null,
    connected: false,
    characterId: null,
    characterLocked: false,
    weaponId: 'yumruk',
    rerollUsed: false,
    rouletteReady: false,
    wins: 0,
    totalDamageTaken: 0,
    totalHits: 0,
    totalAttacks: 0,
    totalDamageDealt: 0,
    totalSapanHits: 0,
    maxCombo: 0,
    weaponsUsed: [],
    disconnectedAtMs: null,
    lastSeq: -1,
    heldMoveX: 0,
    heldMoveY: 0,
    blockHeld: false,
    punchQueued: false,
    specialQueued: false,
    dodgeQueued: false,
    rateWindowStartMs: 0,
    rateCount: 0,
  };
}

function toPublicPlayerMeta(slot: InternalPlayerSlot): OnlinePlayerMeta {
  return {
    role: slot.role,
    sessionId: slot.sessionId,
    nickname: slot.nickname,
    connected: slot.connected,
    characterId: slot.characterId,
    characterLocked: slot.characterLocked,
    weaponId: slot.weaponId,
    rerollUsed: slot.rerollUsed,
    rouletteReady: slot.rouletteReady,
    wins: slot.wins,
    totalDamageTaken: slot.totalDamageTaken,
    damageStage: computeDamageStage(slot.totalDamageTaken),
    totalHits: slot.totalHits,
    totalAttacks: slot.totalAttacks,
    totalDamageDealt: slot.totalDamageDealt,
    totalSapanHits: slot.totalSapanHits,
    maxCombo: slot.maxCombo,
    weaponsUsed: [...slot.weaponsUsed],
    disconnectedAtMs: slot.disconnectedAtMs,
  };
}

export class GameRoomCore {
  readonly roomId: string;
  private p1: InternalPlayerSlot;
  private p2: InternalPlayerSlot;
  private connToRole = new Map<string, PlayerSlot>();

  private phase: OnlineRoomPhase = 'character-select';
  private roundNumber = 1;
  private phaseDeadlineMs: number | null = null;
  private rouletteSpun = false;
  private rouletteSpinDoneAtMs = 0;

  private match: MatchState | null = null;
  private history: InternalRoundRecord[] = [];
  private lastRoundWinnerRole: PlayerSlot | null = null;
  private matchWinnerRole: PlayerSlot | null = null;
  private matchOverReason: MatchOverReason | null = null;
  private summaryForPlayer1: MatchSummary | null = null;
  private summaryForPlayer2: MatchSummary | null = null;

  private disconnectedRole: PlayerSlot | null = null;
  private reconnectDeadlineMs: number | null = null;
  private pausedRemainingPhaseMs: number | null = null;

  private lastSimMs = 0;
  private simAccumulatorMs = 0;
  private lastBroadcastMs = 0;

  private readonly rng: () => number;
  private readonly transport: GameRoomTransport;

  constructor(
    roomId: string,
    player1: { sessionId: string; token: string; nickname?: string },
    player2: { sessionId: string; token: string; nickname?: string },
    transport: GameRoomTransport,
    nowMs = Date.now(),
    rng: () => number = Math.random
  ) {
    this.roomId = roomId;
    this.p1 = createEmptySlot('player', player1.sessionId, player1.token, player1.nickname);
    this.p2 = createEmptySlot('opponent', player2.sessionId, player2.token, player2.nickname);
    this.transport = transport;
    this.rng = rng;
    this.phaseDeadlineMs = nowMs + ONLINE_CONSTANTS.selectionTimeoutMs;
    this.lastSimMs = nowMs;
    this.lastBroadcastMs = nowMs;
  }

  getPhase(): OnlineRoomPhase {
    return this.phase;
  }

  isFinished(): boolean {
    return this.phase === 'gameover';
  }

  private getSlot(role: PlayerSlot): InternalPlayerSlot {
    return role === 'player' ? this.p1 : this.p2;
  }

  private getOtherSlot(role: PlayerSlot): InternalPlayerSlot {
    return role === 'player' ? this.p2 : this.p1;
  }

  getSnapshot(nowMs = Date.now()): OnlineRoomSnapshot {
    const isFinal =
      this.p1.wins === ROUNDS_TO_WIN - 1 && this.p2.wins === ROUNDS_TO_WIN - 1;
    const theme = getArenaThemeForRound(this.roundNumber).id;
    return {
      roomId: this.roomId,
      phase: this.phase,
      roundNumber: this.roundNumber,
      arenaTheme: theme,
      isFinalRound: isFinal,
      serverNowMs: nowMs,
      phaseDeadlineMs: this.phaseDeadlineMs,
      rouletteSpun: this.rouletteSpun,
      disconnectedRole: this.disconnectedRole,
      reconnectDeadlineMs: this.reconnectDeadlineMs,
      player1: toPublicPlayerMeta(this.p1),
      player2: toPublicPlayerMeta(this.p2),
      match: this.match,
      lastRoundWinnerRole: this.lastRoundWinnerRole,
      matchWinnerRole: this.matchWinnerRole,
      matchOverReason: this.matchOverReason,
      summaryForPlayer1: this.summaryForPlayer1,
      summaryForPlayer2: this.summaryForPlayer2,
    };
  }

  join(
    connId: string,
    sessionId: string,
    token: string,
    nowMs = Date.now()
  ): { ok: true; role: PlayerSlot } | { ok: false; code: string; message: string } {
    let target: InternalPlayerSlot | null = null;
    if (sessionId === this.p1.sessionId && token === this.p1.token) {
      target = this.p1;
    } else if (sessionId === this.p2.sessionId && token === this.p2.token) {
      target = this.p2;
    }

    if (!target) {
      this.transport.sendToConn(connId, {
        type: 'ERROR',
        code: 'UNAUTHORIZED',
        message: 'Oda veya oturum doğrulaması başarısız.',
      });
      return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' };
    }

    // Reject concurrent duplicate active connection for the same sessionId
    if (target.connected && target.connId && target.connId !== connId) {
      this.transport.sendToConn(connId, {
        type: 'ERROR',
        code: 'DUPLICATE_SESSION',
        message: 'Bu oturum zaten aktif bir bağlantıya sahip.',
      });
      return {
        ok: false,
        code: 'DUPLICATE_SESSION',
        message: 'Duplicate active session blocked',
      };
    }

    const wasDisconnected =
      !target.connected && target.disconnectedAtMs !== null && this.phase !== 'gameover';
    const pausedDurationMs =
      wasDisconnected && target.disconnectedAtMs !== null
        ? Math.max(0, nowMs - target.disconnectedAtMs)
        : 0;

    target.connId = connId;
    target.connected = true;
    target.disconnectedAtMs = null;
    target.rateWindowStartMs = nowMs;
    target.rateCount = 0;
    this.connToRole.set(connId, target.role);

    if (wasDisconnected) {
      const other = this.getOtherSlot(target.role);
      if (other.connected) {
        this.disconnectedRole = null;
        this.reconnectDeadlineMs = null;
        if (this.pausedRemainingPhaseMs !== null) {
          this.phaseDeadlineMs = nowMs + this.pausedRemainingPhaseMs;
          this.pausedRemainingPhaseMs = null;
        } else if (this.phaseDeadlineMs !== null) {
          this.phaseDeadlineMs += pausedDurationMs;
        }
        this.lastSimMs = nowMs;
      } else {
        this.disconnectedRole = other.role;
        this.reconnectDeadlineMs =
          (other.disconnectedAtMs ?? nowMs) + ONLINE_CONSTANTS.reconnectGraceMs;
      }

      const snap = this.getSnapshot(nowMs);
      this.transport.broadcast({
        type: 'PLAYER_RECONNECTED',
        role: target.role,
        snapshot: snap,
      });
    } else {
      this.transport.sendToConn(connId, {
        type: 'ROOM_SYNC',
        snapshot: this.getSnapshot(nowMs),
      });
    }

    return { ok: true, role: target.role };
  }

  disconnect(connId: string, nowMs = Date.now()): void {
    const role = this.connToRole.get(connId);
    if (!role) return;
    this.connToRole.delete(connId);

    const slot = this.getSlot(role);
    if (slot.connId !== connId) return;

    slot.connId = null;
    slot.connected = false;
    slot.disconnectedAtMs = nowMs;
    slot.heldMoveX = 0;
    slot.heldMoveY = 0;
    slot.blockHeld = false;

    if (this.phase === 'gameover') {
      return;
    }

    if (this.disconnectedRole === null) {
      this.disconnectedRole = role;
      this.reconnectDeadlineMs = nowMs + ONLINE_CONSTANTS.reconnectGraceMs;
      if (this.phaseDeadlineMs !== null) {
        this.pausedRemainingPhaseMs = Math.max(0, this.phaseDeadlineMs - nowMs);
      }
    }

    this.transport.broadcast({
      type: 'PLAYER_DISCONNECTED',
      role,
      reconnectDeadlineMs:
        this.reconnectDeadlineMs ?? nowMs + ONLINE_CONSTANTS.reconnectGraceMs,
      graceMs: ONLINE_CONSTANTS.reconnectGraceMs,
    });
  }

  handleRawMessage(connId: string, rawText: string, nowMs = Date.now()): void {
    const msg = parseRoomClientMessage(rawText);
    if (!msg) {
      this.transport.sendToConn(connId, {
        type: 'ERROR',
        code: 'INVALID_MESSAGE',
        message: 'Geçersiz istemci mesajı.',
      });
      return;
    }

    if (msg.type === 'JOIN_ROOM') {
      this.join(connId, msg.sessionId, msg.token, nowMs);
      return;
    }

    const role = this.connToRole.get(connId);
    if (!role) {
      this.transport.sendToConn(connId, {
        type: 'ERROR',
        code: 'NOT_JOINED',
        message: 'Önce odaya katılmalısın.',
      });
      return;
    }

    const slot = this.getSlot(role);

    // Sliding 1-second rate limiter
    if (nowMs - slot.rateWindowStartMs >= 1000) {
      slot.rateWindowStartMs = nowMs;
      slot.rateCount = 1;
    } else {
      slot.rateCount += 1;
      if (slot.rateCount > ONLINE_CONSTANTS.rateLimitPerSec) {
        this.transport.sendToConn(connId, {
          type: 'ERROR',
          code: 'RATE_LIMITED',
          message: 'Çok fazla istek gönderildi.',
        });
        return;
      }
    }

    this.handleAuthorizedMessage(slot, connId, msg, nowMs);
  }

  private handleAuthorizedMessage(
    slot: InternalPlayerSlot,
    connId: string,
    msg: RoomClientMessage,
    nowMs: number
  ): void {
    switch (msg.type) {
      case 'PING': {
        this.transport.sendToConn(connId, {
          type: 'PONG',
          ts: msg.ts,
          serverNowMs: nowMs,
        });
        return;
      }

      case 'LEAVE_MATCH': {
        if (this.phase === 'gameover') return;
        const winner = this.getOtherSlot(slot.role).role;
        this.transport.broadcast({
          type: 'OPPONENT_LEFT',
          role: slot.role,
        });
        this.concludeSeries(winner, 'opponent_left', nowMs);
        return;
      }

      case 'SELECT_CHARACTER': {
        if (this.phase !== 'character-select') return;
        // Same character is allowed; opponent selection is live-broadcast
        slot.characterId = msg.characterId;
        slot.characterLocked = true;
        this.transport.broadcast({
          type: 'OPPONENT_CHARACTER_SELECTED',
          role: slot.role,
          characterId: msg.characterId,
          locked: true,
        });

        if (this.p1.characterId && this.p2.characterId) {
          this.phase = 'vs';
          this.phaseDeadlineMs = nowMs + ONLINE_CONSTANTS.vsRevealMs;
          this.transport.broadcast({
            type: 'VS_REVEAL',
            player1CharacterId: this.p1.characterId,
            player2CharacterId: this.p2.characterId,
            durationMs: ONLINE_CONSTANTS.vsRevealMs,
          });
        }
        return;
      }

      case 'SPIN_WEAPONS': {
        if (this.phase !== 'weapon-roulette' || this.rouletteSpun) return;
        this.triggerWeaponRouletteSpin(nowMs);
        return;
      }

      case 'WEAPON_REROLL': {
        if (this.phase !== 'weapon-roulette' || !this.rouletteSpun || slot.rerollUsed) {
          return;
        }
        if (nowMs < this.rouletteSpinDoneAtMs) {
          // Allow reroll right once initial reel locks; if requested a touch early, ignore cleanly
          return;
        }
        slot.rerollUsed = true;
        slot.rouletteReady = false;
        const nextWeapon = pickDifferentWeapon(slot.weaponId, this.rng).id;
        slot.weaponId = nextWeapon;
        const nextDeadline = Math.max(
          this.phaseDeadlineMs ?? nowMs,
          nowMs + 2_600
        );
        this.phaseDeadlineMs = nextDeadline;
        this.transport.broadcast({
          type: 'WEAPON_REROLLED',
          role: slot.role,
          weaponId: nextWeapon,
          autoStartDeadlineMs: nextDeadline,
        });
        return;
      }

      case 'ROULETTE_READY': {
        if (this.phase !== 'weapon-roulette' || !this.rouletteSpun) return;
        slot.rouletteReady = true;
        if (
          this.p1.rouletteReady &&
          this.p2.rouletteReady &&
          nowMs >= this.rouletteSpinDoneAtMs &&
          this.disconnectedRole === null
        ) {
          this.startRound(this.roundNumber, nowMs);
        }
        return;
      }

      case 'INPUT': {
        if (this.phase !== 'playing' || !this.match || this.disconnectedRole !== null) {
          return;
        }
        if (msg.seq <= slot.lastSeq) {
          return;
        }
        slot.lastSeq = msg.seq;
        slot.heldMoveX = msg.intent.moveX;
        slot.heldMoveY = msg.intent.moveY;
        slot.blockHeld = Boolean(msg.intent.blockHeld);
        // Latch edge-triggered combat buttons until the next fixed 60Hz sim step consumes them
        if (msg.intent.punchPressed) slot.punchQueued = true;
        if (msg.intent.specialPressed) slot.specialQueued = true;
        if (msg.intent.dodgePressed) slot.dodgeQueued = true;
        return;
      }
    }
  }

  private triggerWeaponRouletteSpin(nowMs: number): void {
    const pair = pickFairRandomWeaponPair(this.rng, true);
    this.p1.weaponId = pair.player;
    this.p2.weaponId = pair.opponent;
    this.p1.rouletteReady = false;
    this.p2.rouletteReady = false;
    this.rouletteSpun = true;
    this.rouletteSpinDoneAtMs = nowMs + ONLINE_CONSTANTS.rouletteSpinLockMs;
    this.phaseDeadlineMs =
      this.rouletteSpinDoneAtMs + ONLINE_CONSTANTS.rouletteAutoStartGraceMs;

    this.transport.broadcast({
      type: 'WEAPON_ROULETTE_START',
      roundNumber: this.roundNumber,
      spinning: true,
      player1WeaponId: pair.player,
      player2WeaponId: pair.opponent,
      autoStartDeadlineMs: this.phaseDeadlineMs,
    });
  }

  private startRound(roundNum: number, nowMs: number): void {
    const c1 = this.p1.characterId ?? 'turk';
    const c2 = this.p2.characterId ?? 'fransiz';

    if (!this.p1.weaponsUsed.includes(this.p1.weaponId)) {
      this.p1.weaponsUsed.push(this.p1.weaponId);
    }
    if (!this.p2.weaponsUsed.includes(this.p2.weaponId)) {
      this.p2.weaponsUsed.push(this.p2.weaponId);
    }

    this.p1.punchQueued = false;
    this.p1.specialQueued = false;
    this.p1.dodgeQueued = false;
    this.p2.punchQueued = false;
    this.p2.specialQueued = false;
    this.p2.dodgeQueued = false;

    this.roundNumber = roundNum;
    this.match = createMatchState(c1, c2, ONLINE_CONSTANTS.arenaBounds, {
      playerWeaponId: this.p1.weaponId,
      opponentWeaponId: this.p2.weaponId,
      playerTotalDamageTaken: this.p1.totalDamageTaken,
      opponentTotalDamageTaken: this.p2.totalDamageTaken,
      roundNumber: roundNum,
    });
    this.match.player.nickname = this.p1.nickname;
    this.match.opponent.nickname = this.p2.nickname;

    this.phase = 'playing';
    this.phaseDeadlineMs = null;
    this.lastSimMs = nowMs;
    this.simAccumulatorMs = 0;
    this.lastBroadcastMs = nowMs;

    const snap = this.getSnapshot(nowMs);
    this.transport.broadcast({
      type: 'ROUND_START',
      roundNumber: roundNum,
      arenaTheme: snap.arenaTheme,
      snapshot: snap,
    });
  }

  tick(nowMs = Date.now()): void {
    if (this.phase === 'gameover') return;

    // 1. Check active disconnect grace timer (20s)
    if (this.disconnectedRole !== null && this.reconnectDeadlineMs !== null) {
      if (nowMs >= this.reconnectDeadlineMs) {
        const remainingRole = this.getOtherSlot(this.disconnectedRole);
        const winner = remainingRole.connected ? remainingRole.role : null;
        this.concludeSeries(winner, 'disconnect_timeout', nowMs);
      }
      // Match stays paused while a player is disconnected
      this.lastSimMs = nowMs;
      return;
    }

    // 2. Phase deadline transitions
    if (this.phase === 'character-select') {
      if (this.phaseDeadlineMs !== null && nowMs >= this.phaseDeadlineMs) {
        const p1Picked = Boolean(this.p1.characterId);
        const p2Picked = Boolean(this.p2.characterId);
        const winner: PlayerSlot | null =
          p1Picked && !p2Picked ? 'player' : !p1Picked && p2Picked ? 'opponent' : null;
        this.concludeSeries(winner, 'selection_timeout', nowMs);
      }
      return;
    }

    if (this.phase === 'vs') {
      if (this.phaseDeadlineMs !== null && nowMs >= this.phaseDeadlineMs) {
        this.phase = 'weapon-roulette';
        this.rouletteSpun = false;
        // Auto-spin safety after 10s if neither player clicks spin
        this.phaseDeadlineMs = nowMs + 10_000;
        this.transport.broadcast({
          type: 'ROOM_SYNC',
          snapshot: this.getSnapshot(nowMs),
        });
      }
      return;
    }

    if (this.phase === 'weapon-roulette') {
      if (!this.rouletteSpun) {
        if (this.phaseDeadlineMs !== null && nowMs >= this.phaseDeadlineMs) {
          this.triggerWeaponRouletteSpin(nowMs);
        }
        return;
      }
      if (this.phaseDeadlineMs !== null && nowMs >= this.phaseDeadlineMs) {
        this.startRound(this.roundNumber, nowMs);
      }
      return;
    }

    if (this.phase === 'round-intermission') {
      if (this.phaseDeadlineMs !== null && nowMs >= this.phaseDeadlineMs) {
        this.startRound(this.roundNumber, nowMs);
      }
      return;
    }

    // 3. Live 60Hz Server-Authoritative Combat Simulation
    if (this.phase === 'playing' && this.match) {
      const elapsedMs = Math.min(100, Math.max(0, nowMs - this.lastSimMs));
      this.lastSimMs = nowMs;
      this.simAccumulatorMs += elapsedMs;

      const fixedDt = 1 / 60;
      const allEvents = [];
      let stepped = false;

      while (this.simAccumulatorMs >= ONLINE_CONSTANTS.simTickMs) {
        this.simAccumulatorMs -= ONLINE_CONSTANTS.simTickMs;
        stepped = true;

        const p1Intent: InputIntent = {
          moveX: this.p1.heldMoveX,
          moveY: this.p1.heldMoveY,
          punchPressed: this.p1.punchQueued,
          specialPressed: this.p1.specialQueued,
          dodgePressed: this.p1.dodgeQueued,
          blockHeld: this.p1.blockHeld,
        };
        const p2Intent: InputIntent = {
          moveX: this.p2.heldMoveX,
          moveY: this.p2.heldMoveY,
          punchPressed: this.p2.punchQueued,
          specialPressed: this.p2.specialQueued,
          dodgePressed: this.p2.dodgeQueued,
          blockHeld: this.p2.blockHeld,
        };

        this.p1.punchQueued = false;
        this.p1.specialQueued = false;
        this.p1.dodgeQueued = false;
        this.p2.punchQueued = false;
        this.p2.specialQueued = false;
        this.p2.dodgeQueued = false;

        stepTwoPlayerMatch(this.match, p1Intent, p2Intent, fixedDt, this.rng);
        if (this.match.events.length > 0) {
          allEvents.push(...this.match.events);
        }

        if (this.match.finished && this.match.winnerRole) {
          break;
        }
      }

      if (allEvents.length > 0) {
        this.match.events = allEvents;
      }

      if (this.match.finished && this.match.winnerRole) {
        // Flush final KO frame then resolve round/series
        this.transport.broadcast({
          type: 'GAME_STATE',
          serverNowMs: nowMs,
          match: this.match,
          ackSeqP1: this.p1.lastSeq,
          ackSeqP2: this.p2.lastSeq,
        });
        this.resolveCompletedRound(this.match, nowMs);
        return;
      }

      if (
        stepped &&
        (allEvents.length > 0 ||
          nowMs - this.lastBroadcastMs >= ONLINE_CONSTANTS.broadcastIntervalMs)
      ) {
        this.lastBroadcastMs = nowMs;
        this.transport.broadcast({
          type: 'GAME_STATE',
          serverNowMs: nowMs,
          match: this.match,
          ackSeqP1: this.p1.lastSeq,
          ackSeqP2: this.p2.lastSeq,
        });
      }
    }
  }

  private resolveCompletedRound(finishedMatch: MatchState, nowMs: number): void {
    const winnerRole = finishedMatch.winnerRole;
    if (!winnerRole) return;

    const completedRound = this.roundNumber;
    const prevP1Dmg = this.p1.totalDamageTaken;
    const prevP2Dmg = this.p2.totalDamageTaken;

    this.p1.totalDamageTaken = Math.max(prevP1Dmg, finishedMatch.player.totalDamageTaken);
    this.p2.totalDamageTaken = Math.max(prevP2Dmg, finishedMatch.opponent.totalDamageTaken);

    this.p1.totalHits += finishedMatch.player.hitsLanded;
    this.p1.totalAttacks += finishedMatch.player.attacksAttempted;
    this.p1.totalDamageDealt += finishedMatch.player.damageDealt;
    this.p1.totalSapanHits += finishedMatch.player.sapanHits;
    this.p1.maxCombo = Math.max(this.p1.maxCombo, finishedMatch.player.maxCombo);

    this.p2.totalHits += finishedMatch.opponent.hitsLanded;
    this.p2.totalAttacks += finishedMatch.opponent.attacksAttempted;
    this.p2.totalDamageDealt += finishedMatch.opponent.damageDealt;
    this.p2.totalSapanHits += finishedMatch.opponent.sapanHits;
    this.p2.maxCombo = Math.max(this.p2.maxCombo, finishedMatch.opponent.maxCombo);

    if (winnerRole === 'player') this.p1.wins += 1;
    else this.p2.wins += 1;

    this.lastRoundWinnerRole = winnerRole;

    this.history.push({
      roundNumber: completedRound,
      winnerRole,
      p1WeaponId: this.p1.weaponId,
      p2WeaponId: this.p2.weaponId,
      p1HpRemaining: finishedMatch.player.hp,
      p2HpRemaining: finishedMatch.opponent.hp,
      p1Hits: finishedMatch.player.hitsLanded,
      p2Hits: finishedMatch.opponent.hitsLanded,
      p1Attacks: finishedMatch.player.attacksAttempted,
      p2Attacks: finishedMatch.opponent.attacksAttempted,
      p1DamageDealt: finishedMatch.player.damageDealt,
      p2DamageDealt: finishedMatch.opponent.damageDealt,
      p1DamageTakenInRound: Math.max(0, this.p1.totalDamageTaken - prevP1Dmg),
      p2DamageTakenInRound: Math.max(0, this.p2.totalDamageTaken - prevP2Dmg),
      p1SapanHits: finishedMatch.player.sapanHits,
      p2SapanHits: finishedMatch.opponent.sapanHits,
      p1MaxCombo: finishedMatch.player.maxCombo,
      p2MaxCombo: finishedMatch.opponent.maxCombo,
      durationSeconds: finishedMatch.elapsedTime,
    });

    if (this.p1.wins >= ROUNDS_TO_WIN || this.p2.wins >= ROUNDS_TO_WIN) {
      this.concludeSeries(
        this.p1.wins >= ROUNDS_TO_WIN ? 'player' : 'opponent',
        'ko_series',
        nowMs
      );
      return;
    }

    const nextRound = Math.min(MAX_ROUNDS, completedRound + 1);
    const nextPair = pickFairRandomWeaponPair(this.rng, true);
    this.roundNumber = nextRound;
    this.p1.weaponId = nextPair.player;
    this.p2.weaponId = nextPair.opponent;

    const isFinal =
      this.p1.wins === ROUNDS_TO_WIN - 1 && this.p2.wins === ROUNDS_TO_WIN - 1;
    const intermissionMs = isFinal
      ? ONLINE_CONSTANTS.finalRoundIntermissionMs
      : ONLINE_CONSTANTS.roundIntermissionMs;

    this.phase = 'round-intermission';
    this.phaseDeadlineMs = nowMs + intermissionMs;

    this.transport.broadcast({
      type: 'ROUND_OVER',
      roundNumber: completedRound,
      winnerRole,
      player1Wins: this.p1.wins,
      player2Wins: this.p2.wins,
      nextRoundNumber: nextRound,
      nextArenaTheme: getArenaThemeForRound(nextRound).id,
      nextPlayer1WeaponId: nextPair.player,
      nextPlayer2WeaponId: nextPair.opponent,
      intermissionMs,
    });
  }

  private buildPerspectiveSummary(
    perspective: PlayerSlot,
    seriesWinnerCanonical: PlayerSlot
  ): MatchSummary {
    const me = this.getSlot(perspective);
    const foe = this.getOtherSlot(perspective);
    const myCharId = me.characterId ?? 'turk';
    const foeCharId = foe.characterId ?? 'fransiz';

    const winnerCanonicalChar =
      seriesWinnerCanonical === 'player'
        ? this.p1.characterId ?? 'turk'
        : this.p2.characterId ?? 'fransiz';
    const loserCanonicalChar =
      seriesWinnerCanonical === 'player'
        ? this.p2.characterId ?? 'fransiz'
        : this.p1.characterId ?? 'turk';

    const winnerForMe: 'player' | 'opponent' =
      seriesWinnerCanonical === perspective ? 'player' : 'opponent';

    const normalizedHistory: RoundResultRecord[] = this.history.map((r) => ({
      roundNumber: r.roundNumber,
      winnerRole: r.winnerRole === perspective ? 'player' : 'opponent',
      playerWeaponId: perspective === 'player' ? r.p1WeaponId : r.p2WeaponId,
      opponentWeaponId: perspective === 'player' ? r.p2WeaponId : r.p1WeaponId,
      playerHpRemaining:
        perspective === 'player' ? r.p1HpRemaining : r.p2HpRemaining,
      playerHitsLanded: perspective === 'player' ? r.p1Hits : r.p2Hits,
      playerAttacksAttempted:
        perspective === 'player' ? r.p1Attacks : r.p2Attacks,
      playerDamageDealt:
        perspective === 'player' ? r.p1DamageDealt : r.p2DamageDealt,
      playerDamageTakenInRound:
        perspective === 'player'
          ? r.p1DamageTakenInRound
          : r.p2DamageTakenInRound,
      playerSapanHits:
        perspective === 'player' ? r.p1SapanHits : r.p2SapanHits,
      playerMaxCombo: perspective === 'player' ? r.p1MaxCombo : r.p2MaxCombo,
      durationSeconds: r.durationSeconds,
    }));

    const totalDuration = this.history.reduce((s, r) => s + r.durationSeconds, 0);
    const seriesForEval: MatchSeriesState = {
      playerCharacterId: myCharId,
      opponentCharacterId: foeCharId,
      playerWins: me.wins,
      opponentWins: foe.wins,
      currentRound: this.roundNumber,
      playerWeaponId: me.weaponId,
      opponentWeaponId: foe.weaponId,
      rerollUsed: me.rerollUsed,
      playerTotalDamageTaken: me.totalDamageTaken,
      opponentTotalDamageTaken: foe.totalDamageTaken,
      playerDamageStage: computeDamageStage(me.totalDamageTaken),
      opponentDamageStage: computeDamageStage(foe.totalDamageTaken),
      totalPlayerHits: me.totalHits,
      totalPlayerAttacks: me.totalAttacks,
      totalPlayerDamageDealt: me.totalDamageDealt,
      totalSapanHits: me.totalSapanHits,
      maxCombo: me.maxCombo,
      weaponsUsed: me.weaponsUsed.length > 0 ? me.weaponsUsed : [me.weaponId],
      totalDurationSeconds: totalDuration,
      history: normalizedHistory,
      winnerRole: winnerForMe,
    };

    const winnerDef = getCharacterById(winnerCanonicalChar);

    return {
      winnerRole: winnerForMe,
      winnerCharacterId: winnerCanonicalChar,
      loserCharacterId: loserCanonicalChar,
      playerCharacterId: myCharId,
      opponentCharacterId: foeCharId,
      playerWins: me.wins,
      opponentWins: foe.wins,
      totalRoundsPlayed: this.history.length,
      playerDamageStage: computeDamageStage(me.totalDamageTaken),
      opponentDamageStage: computeDamageStage(foe.totalDamageTaken),
      victoryPhrase: `ŞAMPİYON: ${winnerDef.upperName}`,
      playerHitsLanded: me.totalHits,
      playerAttacksMissed: Math.max(0, me.totalAttacks - me.totalHits),
      playerDamageDealt: me.totalDamageDealt,
      playerDamageTaken: me.totalDamageTaken,
      weaponsUsed: me.weaponsUsed.length > 0 ? [...me.weaponsUsed] : [me.weaponId],
      maxCombo: me.maxCombo,
      durationSeconds: totalDuration,
      titleAward: evaluateMatchTitle(seriesForEval),
      achievements: evaluateMatchAchievements(seriesForEval),
    };
  }

  private concludeSeries(
    winnerRole: PlayerSlot | null,
    reason: MatchOverReason,
    nowMs: number
  ): void {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    this.phaseDeadlineMs = null;
    this.disconnectedRole = null;
    this.reconnectDeadlineMs = null;
    this.matchWinnerRole = winnerRole;
    this.matchOverReason = reason;

    if (winnerRole !== null) {
      this.summaryForPlayer1 = this.buildPerspectiveSummary('player', winnerRole);
      this.summaryForPlayer2 = this.buildPerspectiveSummary('opponent', winnerRole);
    } else {
      this.summaryForPlayer1 = null;
      this.summaryForPlayer2 = null;
    }

    const snap = this.getSnapshot(nowMs);
    this.transport.broadcast({
      type: 'MATCH_OVER',
      reason,
      winnerRole,
      summaryForPlayer1: this.summaryForPlayer1,
      summaryForPlayer2: this.summaryForPlayer2,
      snapshot: snap,
    });
  }
}
