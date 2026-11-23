import { CHARACTERS } from '../game/characters';
import { DEFAULT_ARENA_BOUNDS } from '../game/engine';
import type {
  ArenaThemeId,
  CharacterId,
  DamageStage,
  InputIntent,
  MatchState,
  MatchSummary,
  WeaponId,
} from '../game/types';
import { WEAPONS } from '../game/weapons';

export const ONLINE_CONSTANTS = {
  arenaBounds: DEFAULT_ARENA_BOUNDS,
  selectionTimeoutMs: 30_000,
  vsRevealMs: 2_300,
  rouletteSpinLockMs: 2_100,
  rouletteAutoStartGraceMs: 4_500,
  roundIntermissionMs: 2_400,
  finalRoundIntermissionMs: 3_150,
  reconnectGraceMs: 20_000,
  simTickMs: 1000 / 60,
  broadcastIntervalMs: 1000 / 30,
  maxWsMessageBytes: 2048,
  rateLimitPerSec: 80,
} as const;

export type PlayerSlot = 'player' | 'opponent';

export type OnlineRoomPhase =
  | 'waiting'
  | 'character-select'
  | 'vs'
  | 'weapon-roulette'
  | 'playing'
  | 'round-intermission'
  | 'gameover';

export type MatchOverReason =
  | 'ko_series'
  | 'disconnect_timeout'
  | 'opponent_left'
  | 'selection_timeout';

export interface OnlinePlayerMeta {
  role: PlayerSlot;
  sessionId: string;
  nickname: string;
  connected: boolean;
  characterId: CharacterId | null;
  characterLocked: boolean;
  weaponId: WeaponId;
  rerollUsed: boolean;
  rouletteReady: boolean;
  wins: number;
  totalDamageTaken: number;
  damageStage: DamageStage;
  totalHits: number;
  totalAttacks: number;
  totalDamageDealt: number;
  totalSapanHits: number;
  maxCombo: number;
  weaponsUsed: WeaponId[];
  disconnectedAtMs: number | null;
}

export interface OnlineRoomSnapshot {
  roomId: string;
  phase: OnlineRoomPhase;
  roundNumber: number;
  arenaTheme: ArenaThemeId;
  isFinalRound: boolean;
  serverNowMs: number;
  phaseDeadlineMs: number | null;
  rouletteSpun: boolean;
  disconnectedRole: PlayerSlot | null;
  reconnectDeadlineMs: number | null;
  player1: OnlinePlayerMeta;
  player2: OnlinePlayerMeta;
  match: MatchState | null;
  lastRoundWinnerRole: PlayerSlot | null;
  matchWinnerRole: PlayerSlot | null;
  matchOverReason: MatchOverReason | null;
  summaryForPlayer1: MatchSummary | null;
  summaryForPlayer2: MatchSummary | null;
}

export type MatchmakingClientMessage =
  | { type: 'FIND_MATCH'; nickname?: string }
  | { type: 'CANCEL_MATCH' }
  | { type: 'PING'; ts: number };

export type MatchmakingServerMessage =
  | {
      type: 'QUEUE_STATUS';
      status: 'idle' | 'searching' | 'cancelled';
      queueSize: number;
      waitedMs: number;
    }
  | {
      type: 'MATCH_FOUND';
      roomId: string;
      role: PlayerSlot;
      token: string;
      colo?: string;
    }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'PONG'; ts: number; serverNowMs: number };

export type RoomClientMessage =
  | { type: 'JOIN_ROOM'; sessionId: string; token: string }
  | { type: 'SELECT_CHARACTER'; characterId: CharacterId }
  | { type: 'SPIN_WEAPONS' }
  | { type: 'WEAPON_REROLL' }
  | { type: 'ROULETTE_READY' }
  | { type: 'INPUT'; seq: number; intent: InputIntent }
  | { type: 'LEAVE_MATCH' }
  | { type: 'PING'; ts: number };

export type RoomServerMessage =
  | { type: 'ROOM_SYNC'; snapshot: OnlineRoomSnapshot }
  | {
      type: 'OPPONENT_CHARACTER_SELECTED';
      role: PlayerSlot;
      characterId: CharacterId;
      locked: boolean;
    }
  | {
      type: 'VS_REVEAL';
      player1CharacterId: CharacterId;
      player2CharacterId: CharacterId;
      durationMs: number;
    }
  | {
      type: 'WEAPON_ROULETTE_START';
      roundNumber: number;
      spinning: boolean;
      player1WeaponId: WeaponId;
      player2WeaponId: WeaponId;
      autoStartDeadlineMs: number | null;
    }
  | {
      type: 'WEAPON_REROLLED';
      role: PlayerSlot;
      weaponId: WeaponId;
      autoStartDeadlineMs: number | null;
    }
  | {
      type: 'ROUND_START';
      roundNumber: number;
      arenaTheme: ArenaThemeId;
      snapshot: OnlineRoomSnapshot;
    }
  | {
      type: 'GAME_STATE';
      serverNowMs: number;
      match: MatchState;
      ackSeqP1: number;
      ackSeqP2: number;
    }
  | {
      type: 'ROUND_OVER';
      roundNumber: number;
      winnerRole: PlayerSlot;
      player1Wins: number;
      player2Wins: number;
      nextRoundNumber: number;
      nextArenaTheme: ArenaThemeId;
      nextPlayer1WeaponId: WeaponId;
      nextPlayer2WeaponId: WeaponId;
      intermissionMs: number;
    }
  | {
      type: 'MATCH_OVER';
      reason: MatchOverReason;
      winnerRole: PlayerSlot | null;
      summaryForPlayer1: MatchSummary | null;
      summaryForPlayer2: MatchSummary | null;
      snapshot: OnlineRoomSnapshot;
    }
  | {
      type: 'PLAYER_DISCONNECTED';
      role: PlayerSlot;
      reconnectDeadlineMs: number;
      graceMs: number;
    }
  | {
      type: 'PLAYER_RECONNECTED';
      role: PlayerSlot;
      snapshot: OnlineRoomSnapshot;
    }
  | { type: 'OPPONENT_LEFT'; role: PlayerSlot }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'PONG'; ts: number; serverNowMs: number };

const VALID_CHARACTER_IDS = new Set<string>(CHARACTERS.map((c) => c.id));
const VALID_WEAPON_IDS = new Set<string>(WEAPONS.map((w) => w.id));
const OPAQUE_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export function isValidCharacterId(v: unknown): v is CharacterId {
  return typeof v === 'string' && VALID_CHARACTER_IDS.has(v);
}

export function isValidWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && VALID_WEAPON_IDS.has(v);
}

export function isValidOpaqueId(v: unknown): v is string {
  return typeof v === 'string' && OPAQUE_ID_RE.test(v);
}

function clampAxis(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function sanitizeInputIntent(raw: unknown): InputIntent {
  if (!raw || typeof raw !== 'object') {
    return { moveX: 0, moveY: 0, punchPressed: false };
  }
  const r = raw as Record<string, unknown>;
  let moveX = clampAxis(r.moveX);
  let moveY = clampAxis(r.moveY);
  const mag = Math.hypot(moveX, moveY);
  if (mag > 1) {
    moveX /= mag;
    moveY /= mag;
  }
  return {
    moveX,
    moveY,
    punchPressed: r.punchPressed === true,
    specialPressed: r.specialPressed === true,
    dodgePressed: r.dodgePressed === true,
    blockHeld: r.blockHeld === true,
  };
}

export const NICKNAME_MIN_LEN = 2;
export const NICKNAME_MAX_LEN = 16;

export function sanitizeNickname(raw: unknown, fallback = ''): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const clamped = Array.from(cleaned).slice(0, NICKNAME_MAX_LEN).join('').trim();
  if (Array.from(clamped).length < NICKNAME_MIN_LEN) {
    return fallback;
  }
  return clamped;
}

export function isValidNickname(raw: unknown): boolean {
  return sanitizeNickname(raw, '') !== '';
}

export function parseMatchmakingClientMessage(
  rawText: string
): MatchmakingClientMessage | null {
  if (typeof rawText !== 'string' || rawText.length > ONLINE_CONSTANTS.maxWsMessageBytes) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.type === 'FIND_MATCH') {
    const cleanName = sanitizeNickname(obj.nickname, '');
    return cleanName
      ? { type: 'FIND_MATCH', nickname: cleanName }
      : { type: 'FIND_MATCH' };
  }
  if (obj.type === 'CANCEL_MATCH') return { type: 'CANCEL_MATCH' };
  if (obj.type === 'PING' && typeof obj.ts === 'number' && Number.isFinite(obj.ts)) {
    return { type: 'PING', ts: obj.ts };
  }
  return null;
}

export function parseRoomClientMessage(rawText: string): RoomClientMessage | null {
  if (typeof rawText !== 'string' || rawText.length > ONLINE_CONSTANTS.maxWsMessageBytes) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  switch (obj.type) {
    case 'JOIN_ROOM':
      if (!isValidOpaqueId(obj.sessionId) || !isValidOpaqueId(obj.token)) {
        return null;
      }
      return { type: 'JOIN_ROOM', sessionId: obj.sessionId, token: obj.token };
    case 'SELECT_CHARACTER':
      if (!isValidCharacterId(obj.characterId)) return null;
      return { type: 'SELECT_CHARACTER', characterId: obj.characterId };
    case 'SPIN_WEAPONS':
      return { type: 'SPIN_WEAPONS' };
    case 'WEAPON_REROLL':
      return { type: 'WEAPON_REROLL' };
    case 'ROULETTE_READY':
      return { type: 'ROULETTE_READY' };
    case 'INPUT': {
      const seq =
        typeof obj.seq === 'number' && Number.isInteger(obj.seq) && obj.seq >= 0
          ? obj.seq
          : -1;
      if (seq < 0) return null;
      return {
        type: 'INPUT',
        seq,
        intent: sanitizeInputIntent(obj.intent),
      };
    }
    case 'LEAVE_MATCH':
      return { type: 'LEAVE_MATCH' };
    case 'PING':
      if (typeof obj.ts !== 'number' || !Number.isFinite(obj.ts)) return null;
      return { type: 'PING', ts: obj.ts };
    default:
      return null;
  }
}

export function generateOpaqueId(bytes = 16): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < arr.length; i++) {
    out += alphabet[arr[i] % alphabet.length];
  }
  return out;
}
