import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Gamepad2,
  LogOut,
  RefreshCw,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import { getArenaThemeForRound } from '../game/arenas';
import { CHARACTERS, getCharacterById } from '../game/characters';
import { createMatchState, DEFAULT_ARENA_BOUNDS } from '../game/engine';
import { ArenaRenderer } from '../game/renderer';
import type { CharacterId, InputIntent, MatchState, WeaponId } from '../game/types';
import { getWeaponById, WEAPONS } from '../game/weapons';
import {
  type ActiveRoomCredentials,
  buildWebSocketUrl,
  clearActiveRoomCredentials,
  ensureOnlineSession,
  loadActiveRoomCredentials,
  loadOnlineNickname,
  saveActiveRoomCredentials,
  saveOnlineNickname,
} from '../multiplayer/client';
import {
  NICKNAME_MAX_LEN,
  sanitizeNickname,
  type MatchmakingServerMessage,
  type OnlineRoomSnapshot,
  type PlayerSlot,
  type RoomClientMessage,
  type RoomServerMessage,
} from '../multiplayer/protocol';
import { CharacterPortrait } from './CharacterPortrait';
import { GameOverModal } from './GameModals';
import { useScreenWakeLock } from './OrientationGuard';
import { TouchControls } from './TouchControls';
import { WeaponIcon } from './WeaponIcon';

interface OnlineExperienceProps {
  muted: boolean;
  onToggleMute: () => void;
  onExitToMenu: () => void;
  initialActiveRoom?: ActiveRoomCredentials | null;
}

type OnlineViewMode = 'nickname' | 'connecting' | 'searching' | 'room' | 'error';

function cloneMatchForVisual(source: MatchState): MatchState {
  return {
    ...source,
    player: { ...source.player },
    opponent: { ...source.opponent },
    projectiles: source.projectiles.map((p) => ({ ...p })),
    floorStones: source.floorStones.map((s) => ({ ...s })),
    events: [],
    ai: { ...source.ai },
  };
}

export const OnlineExperience: React.FC<OnlineExperienceProps> = ({
  muted,
  onToggleMute,
  onExitToMenu,
  initialActiveRoom = null,
}) => {
  const [viewMode, setViewMode] = useState<OnlineViewMode>(() =>
    initialActiveRoom || loadActiveRoomCredentials() ? 'connecting' : 'nickname'
  );
  const [nickname, setNickname] = useState<string>(() => loadOnlineNickname());
  const [nicknameInput, setNicknameInput] = useState<string>(() => loadOnlineNickname());
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [queueInfo, setQueueInfo] = useState<{ queueSize: number; waitedMs: number }>({
    queueSize: 1,
    waitedMs: 0,
  });
  const [searchStartedAt, setSearchStartedAt] = useState<number>(() => Date.now());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<PlayerSlot>(initialActiveRoom?.role ?? 'player');
  const [room, setRoom] = useState<OnlineRoomSnapshot | null>(null);
  const [socketReconnecting, setSocketReconnecting] = useState(false);

  // Synced Weapon Roulette visual wheel state
  const [rouletteDisplayP1, setRouletteDisplayP1] = useState<WeaponId>('yumruk');
  const [rouletteDisplayP2, setRouletteDisplayP2] = useState<WeaponId>('sopa');
  const [rouletteSpinning, setRouletteSpinning] = useState(false);
  const [rerollSpinRole, setRerollSpinRole] = useState<PlayerSlot | null>(null);

  // Arena rendering & HUD state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ArenaRenderer>(new ArenaRenderer());
  const latestServerMatchRef = useRef<MatchState | null>(null);
  const visualMatchRef = useRef<MatchState | null>(null);
  const playerHpBarRef = useRef<HTMLDivElement | null>(null);
  const playerGhostBarRef = useRef<HTMLDivElement | null>(null);
  const opponentHpBarRef = useRef<HTMLDivElement | null>(null);
  const opponentGhostBarRef = useRef<HTMLDivElement | null>(null);
  const ghostP1HpRef = useRef<number>(100);
  const ghostP2HpRef = useRef<number>(100);
  const lastAppliedWidthRef = useRef({ p1: 100, p1g: 100, p2: 100, p2g: 100 });
  const [showDesktopTouchPad, setShowDesktopTouchPad] = useState(false);

  const [hudCombat, setHudCombat] = useState<{
    p1Hp: number;
    p2Hp: number;
    p1Ammo: number;
    p2Ammo: number;
    specialCooldownTenths: number;
    dodgeCooldownTenths: number;
    blocking: boolean;
    combo: number;
    p1HitPulse: boolean;
    p2HitPulse: boolean;
  }>({
    p1Hp: 100,
    p2Hp: 100,
    p1Ammo: 0,
    p2Ammo: 0,
    specialCooldownTenths: 0,
    dodgeCooldownTenths: 0,
    blocking: false,
    combo: 0,
    p1HitPulse: false,
    p2HitPulse: false,
  });

  // WebSocket & lifecycle refs
  const matchmakingWsRef = useRef<WebSocket | null>(null);
  const roomWsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<number>(0);
  const myRoleRef = useRef<PlayerSlot>(myRole);
  const roomPhaseRef = useRef<string>('waiting');

  // Input refs
  const keysHeldRef = useRef<Set<string>>(new Set());
  const touchMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchBlockingRef = useRef<boolean>(false);
  const punchPendingRef = useRef<boolean>(false);
  const specialPendingRef = useRef<boolean>(false);
  const dodgePendingRef = useRef<boolean>(false);
  const inputSeqRef = useRef<number>(1);
  const lastSentMoveRef = useRef<{ x: number; y: number; block: boolean }>({
    x: 0,
    y: 0,
    block: false,
  });

  useScreenWakeLock(room?.phase === 'playing');

  useEffect(() => {
    myRoleRef.current = myRole;
  }, [myRole]);

  useEffect(() => {
    roomPhaseRef.current = room?.phase ?? 'waiting';
    document.body.dataset.state = room ? `online-${room.phase}` : `online-${viewMode}`;
  }, [room, viewMode]);

  // Smooth UI clock for countdowns & matchmaking timer
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const closeAllSockets = useCallback(() => {
    intentionalCloseRef.current = true;
    window.clearTimeout(reconnectTimerRef.current);
    if (matchmakingWsRef.current) {
      try {
        matchmakingWsRef.current.close();
      } catch {
        // ignore
      }
      matchmakingWsRef.current = null;
    }
    if (roomWsRef.current) {
      try {
        roomWsRef.current.close();
      } catch {
        // ignore
      }
      roomWsRef.current = null;
    }
  }, []);

  const sendRoomMessage = useCallback((msg: RoomClientMessage) => {
    const ws = roomWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const applyServerMatchEvents = useCallback((match: MatchState) => {
    const renderer = rendererRef.current;
    for (const ev of match.events) {
      if (ev.type === 'swing') {
        soundEngine.playSwing(ev.weaponId);
      } else if (ev.type === 'special') {
        soundEngine.playSpecial(ev.weaponId);
      } else if (ev.type === 'dodge') {
        soundEngine.playDodge();
        renderer.spawnDodgeCue(ev.x, ev.y, ev.dirX, ev.dirY);
      } else if (ev.type === 'evaded') {
        renderer.spawnEvadeCue(ev.x, ev.y, ev.comicWord);
      } else if (ev.type === 'blocked') {
        soundEngine.playBlock(Boolean(ev.comicWord?.includes('TAM')));
        renderer.spawnBlockBurst(ev.x, ev.y, ev.comicWord);
      } else if (ev.type === 'stone-shoot') {
        soundEngine.playStoneShoot();
      } else if (ev.type === 'stone-pickup') {
        soundEngine.playStonePickup();
        renderer.spawnPickupBurst(ev.x, ev.y, ev.comicWord);
      } else if (ev.type === 'hit' || ev.type === 'ko') {
        soundEngine.playHit(ev.weaponId);
        const remainingRatio =
          ev.targetRemainingHp !== undefined
            ? Math.max(0, ev.targetRemainingHp / 100)
            : 0.6;
        renderer.spawnHitBurst(
          ev.x,
          ev.y,
          ev.dirX,
          ev.dirY,
          ev.comicWord,
          ev.type === 'ko',
          ev.weaponId,
          remainingRatio,
          ev.damageAmount ?? 8
        );
        if (ev.type === 'ko') {
          if (ev.attackerRole === myRoleRef.current) soundEngine.playVictory();
          else soundEngine.playDefeat();
        }
      }
    }
  }, []);

  const syncMatchSnapshot = useCallback((match: MatchState | null, snapPositions = false) => {
    latestServerMatchRef.current = match;
    if (!match) {
      visualMatchRef.current = null;
      return;
    }

    if (snapPositions || !visualMatchRef.current) {
      visualMatchRef.current = cloneMatchForVisual(match);
      ghostP1HpRef.current = match.player.hp;
      ghostP2HpRef.current = match.opponent.hp;
    }

    const me = myRoleRef.current === 'player' ? match.player : match.opponent;
    setHudCombat((prev) => ({
      p1Hp: match.player.hp,
      p2Hp: match.opponent.hp,
      p1Ammo: match.player.ammo,
      p2Ammo: match.opponent.ammo,
      specialCooldownTenths: Math.ceil(me.specialCooldown * 10),
      dodgeCooldownTenths: Math.ceil(me.dodgeCooldown * 10),
      blocking: me.isBlocking,
      combo: me.comboCount,
      p1HitPulse: match.player.hp < prev.p1Hp,
      p2HitPulse: match.opponent.hp < prev.p2Hp,
    }));
  }, []);

  const connectToRoom = useCallback(
    (creds: ActiveRoomCredentials, sid: string, attempt = 0) => {
      if (unmountedRef.current) return;
      if (matchmakingWsRef.current) {
        try {
          matchmakingWsRef.current.close();
        } catch {
          // ignore
        }
        matchmakingWsRef.current = null;
      }
      if (roomWsRef.current) {
        try {
          roomWsRef.current.close();
        } catch {
          // ignore
        }
      }

      intentionalCloseRef.current = false;
      setMyRole(creds.role);
      myRoleRef.current = creds.role;
      saveActiveRoomCredentials(creds);

      const wsUrl = buildWebSocketUrl(
        `/ws/room/${encodeURIComponent(creds.roomId)}?sessionId=${encodeURIComponent(sid)}`
      );
      const ws = new WebSocket(wsUrl);
      roomWsRef.current = ws;

      let pingInterval = 0;

      ws.onopen = () => {
        if (unmountedRef.current) return;
        setSocketReconnecting(false);
        setViewMode('room');
        ws.send(
          JSON.stringify({
            type: 'JOIN_ROOM',
            sessionId: sid,
            token: creds.token,
          })
        );
        pingInterval = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
          }
        }, 2000);
        ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
      };

      ws.onmessage = (ev) => {
        if (unmountedRef.current || typeof ev.data !== 'string') return;
        let msg: RoomServerMessage;
        try {
          msg = JSON.parse(ev.data) as RoomServerMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'PONG':
            setPingMs(Math.max(1, Math.round(Date.now() - msg.ts)));
            break;

          case 'ROOM_SYNC':
            setRoom(msg.snapshot);
            setRouletteDisplayP1(msg.snapshot.player1.weaponId);
            setRouletteDisplayP2(msg.snapshot.player2.weaponId);
            syncMatchSnapshot(msg.snapshot.match, true);
            if (msg.snapshot.phase === 'gameover') {
              clearActiveRoomCredentials();
            }
            break;

          case 'OPPONENT_CHARACTER_SELECTED':
            setRoom((prev) => {
              if (!prev) return prev;
              if (msg.role === 'player') {
                return {
                  ...prev,
                  player1: {
                    ...prev.player1,
                    characterId: msg.characterId,
                    characterLocked: msg.locked,
                  },
                };
              }
              return {
                ...prev,
                player2: {
                  ...prev.player2,
                  characterId: msg.characterId,
                  characterLocked: msg.locked,
                },
              };
            });
            break;

          case 'VS_REVEAL':
            soundEngine.playRouletteLock();
            setRoom((prev) =>
              prev
                ? {
                    ...prev,
                    phase: 'vs',
                    phaseDeadlineMs: Date.now() + msg.durationMs,
                    player1: { ...prev.player1, characterId: msg.player1CharacterId },
                    player2: { ...prev.player2, characterId: msg.player2CharacterId },
                  }
                : prev
            );
            break;

          case 'WEAPON_ROULETTE_START':
            setRouletteSpinning(true);
            setRoom((prev) =>
              prev
                ? {
                    ...prev,
                    phase: 'weapon-roulette',
                    rouletteSpun: true,
                    phaseDeadlineMs: msg.autoStartDeadlineMs,
                    player1: {
                      ...prev.player1,
                      weaponId: msg.player1WeaponId,
                      rouletteReady: false,
                    },
                    player2: {
                      ...prev.player2,
                      weaponId: msg.player2WeaponId,
                      rouletteReady: false,
                    },
                  }
                : prev
            );
            break;

          case 'WEAPON_REROLLED':
            setRerollSpinRole(msg.role);
            setRoom((prev) => {
              if (!prev) return prev;
              if (msg.role === 'player') {
                return {
                  ...prev,
                  phaseDeadlineMs: msg.autoStartDeadlineMs,
                  player1: {
                    ...prev.player1,
                    weaponId: msg.weaponId,
                    rerollUsed: true,
                    rouletteReady: false,
                  },
                };
              }
              return {
                ...prev,
                phaseDeadlineMs: msg.autoStartDeadlineMs,
                player2: {
                  ...prev.player2,
                  weaponId: msg.weaponId,
                  rerollUsed: true,
                  rouletteReady: false,
                },
              };
            });
            break;

          case 'ROUND_START':
            rendererRef.current.resetEffects(true);
            setRouletteSpinning(false);
            setRerollSpinRole(null);
            setRoom(msg.snapshot);
            syncMatchSnapshot(msg.snapshot.match, true);
            break;

          case 'GAME_STATE':
            applyServerMatchEvents(msg.match);
            syncMatchSnapshot(msg.match, false);
            break;

          case 'ROUND_OVER':
            setRoom((prev) =>
              prev
                ? {
                    ...prev,
                    phase: 'round-intermission',
                    lastRoundWinnerRole: msg.winnerRole,
                    roundNumber: msg.nextRoundNumber,
                    arenaTheme: msg.nextArenaTheme,
                    phaseDeadlineMs: Date.now() + msg.intermissionMs,
                    player1: {
                      ...prev.player1,
                      wins: msg.player1Wins,
                      weaponId: msg.nextPlayer1WeaponId,
                    },
                    player2: {
                      ...prev.player2,
                      wins: msg.player2Wins,
                      weaponId: msg.nextPlayer2WeaponId,
                    },
                  }
                : prev
            );
            soundEngine.playRouletteLock();
            break;

          case 'PLAYER_DISCONNECTED':
            setRoom((prev) =>
              prev
                ? {
                    ...prev,
                    disconnectedRole: msg.role,
                    reconnectDeadlineMs: msg.reconnectDeadlineMs,
                    player1:
                      msg.role === 'player'
                        ? { ...prev.player1, connected: false }
                        : prev.player1,
                    player2:
                      msg.role === 'opponent'
                        ? { ...prev.player2, connected: false }
                        : prev.player2,
                  }
                : prev
            );
            break;

          case 'PLAYER_RECONNECTED':
            setRoom(msg.snapshot);
            syncMatchSnapshot(msg.snapshot.match, true);
            break;

          case 'MATCH_OVER':
            clearActiveRoomCredentials();
            setRoom(msg.snapshot);
            syncMatchSnapshot(msg.snapshot.match, false);
            break;

          case 'ERROR':
            if (msg.code === 'UNAUTHORIZED' || msg.code === 'ROOM_NOT_FOUND') {
              clearActiveRoomCredentials();
              setErrorMsg(msg.message);
              setViewMode('error');
            } else if (msg.code === 'DUPLICATE_SESSION') {
              setErrorMsg(msg.message);
              setViewMode('error');
            }
            break;
        }
      };

      ws.onclose = () => {
        window.clearInterval(pingInterval);
        if (unmountedRef.current || intentionalCloseRef.current) return;
        const stored = loadActiveRoomCredentials();
        if (stored && stored.roomId === creds.roomId && roomPhaseRef.current !== 'gameover') {
          setSocketReconnecting(true);
          const delay = Math.min(2500, 450 + attempt * 450);
          reconnectTimerRef.current = window.setTimeout(() => {
            connectToRoom(creds, sid, attempt + 1);
          }, delay);
        }
      };

      ws.onerror = () => {
        // Close handler handles retry seamlessly
      };
    },
    [applyServerMatchEvents, syncMatchSnapshot]
  );

  const startMatchmaking = useCallback(
    async (explicitRoom?: ActiveRoomCredentials | null, chosenNickname?: string) => {
      closeAllSockets();
      intentionalCloseRef.current = false;
      setErrorMsg(null);
      setRoom(null);
      latestServerMatchRef.current = null;
      visualMatchRef.current = null;
      rendererRef.current.resetEffects(true);

      try {
        const session = await ensureOnlineSession();
        if (unmountedRef.current) return;
        setSessionId(session.sessionId);

        const activeRoom = explicitRoom ?? loadActiveRoomCredentials();
        if (activeRoom) {
          setViewMode('connecting');
          connectToRoom(activeRoom, session.sessionId);
          return;
        }

        const cleanNick = sanitizeNickname(
          chosenNickname ?? nickname ?? loadOnlineNickname(),
          ''
        );
        if (!cleanNick) {
          setViewMode('nickname');
          return;
        }

        setViewMode('searching');
        setSearchStartedAt(Date.now());
        setQueueInfo({ queueSize: 1, waitedMs: 0 });

        const wsUrl = buildWebSocketUrl(
          `/ws/matchmaking?sessionId=${encodeURIComponent(session.sessionId)}`
        );
        const ws = new WebSocket(wsUrl);
        matchmakingWsRef.current = ws;

        let pingInterval = 0;

        ws.onopen = () => {
          if (unmountedRef.current) return;
          ws.send(JSON.stringify({ type: 'FIND_MATCH', nickname: cleanNick }));
          ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
          pingInterval = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
            }
          }, 2500);
        };

        ws.onmessage = (ev) => {
          if (unmountedRef.current || typeof ev.data !== 'string') return;
          let msg: MatchmakingServerMessage;
          try {
            msg = JSON.parse(ev.data) as MatchmakingServerMessage;
          } catch {
            return;
          }

          if (msg.type === 'PONG') {
            setPingMs(Math.max(1, Math.round(Date.now() - msg.ts)));
          } else if (msg.type === 'QUEUE_STATUS') {
            setQueueInfo({ queueSize: msg.queueSize, waitedMs: msg.waitedMs });
          } else if (msg.type === 'MATCH_FOUND') {
            soundEngine.playRouletteLock();
            window.clearInterval(pingInterval);
            matchmakingWsRef.current = null;
            try {
              ws.close();
            } catch {
              // ignore
            }
            connectToRoom(
              { roomId: msg.roomId, token: msg.token, role: msg.role },
              session.sessionId
            );
          } else if (msg.type === 'ERROR') {
            setErrorMsg(msg.message);
            setViewMode('error');
          }
        };

        ws.onclose = () => {
          window.clearInterval(pingInterval);
          if (!unmountedRef.current && !intentionalCloseRef.current && !roomWsRef.current) {
            setErrorMsg('Eşleştirme sunucusuyla bağlantı kesildi.');
            setViewMode('error');
          }
        };
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Online sunucuya bağlanılamadı.'
        );
        setViewMode('error');
      }
    },
    [closeAllSockets, connectToRoom, nickname]
  );

  // Initial mount bootstrap: auto-reconnect only if an active room exists; otherwise prompt nickname first
  useEffect(() => {
    unmountedRef.current = false;
    const activeRoom = initialActiveRoom ?? loadActiveRoomCredentials();
    if (activeRoom) {
      void startMatchmaking(activeRoom);
    }
    return () => {
      unmountedRef.current = true;
      closeAllSockets();
    };
  }, [closeAllSockets, initialActiveRoom, startMatchmaking]);

  // Initial Roulette Wheel deceleration effect
  useEffect(() => {
    if (!rouletteSpinning || !room) return;
    let cancelled = false;
    let t1 = 0;
    let t2 = 0;
    let s1 = 0;
    let s2 = 0;
    const total1 = 14;
    const total2 = 17;

    const tick1 = () => {
      if (cancelled) return;
      s1 += 1;
      if (s1 >= total1) {
        setRouletteDisplayP1(room.player1.weaponId);
        soundEngine.playRouletteLock();
        return;
      }
      setRouletteDisplayP1(WEAPONS[(s1 * 3) % WEAPONS.length].id);
      const p = s1 / total1;
      soundEngine.playRouletteTick(1 - p * 0.5);
      t1 = window.setTimeout(tick1, Math.round(48 + p * p * 165));
    };

    const tick2 = () => {
      if (cancelled) return;
      s2 += 1;
      if (s2 >= total2) {
        setRouletteDisplayP2(room.player2.weaponId);
        soundEngine.playRouletteLock();
        setRouletteSpinning(false);
        return;
      }
      setRouletteDisplayP2(WEAPONS[(s2 * 7 + 1) % WEAPONS.length].id);
      const p = s2 / total2;
      t2 = window.setTimeout(tick2, Math.round(52 + p * p * 175));
    };

    t1 = window.setTimeout(tick1, 45);
    t2 = window.setTimeout(tick2, 75);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [rouletteSpinning, room?.player1.weaponId, room?.player2.weaponId]);

  // Reroll fast spin effect
  useEffect(() => {
    if (!rerollSpinRole || !room) return;
    let cancelled = false;
    let step = 0;
    const total = 8;
    let tid = 0;
    const targetWeapon =
      rerollSpinRole === 'player' ? room.player1.weaponId : room.player2.weaponId;

    const tick = () => {
      if (cancelled) return;
      step += 1;
      if (step >= total) {
        if (rerollSpinRole === 'player') setRouletteDisplayP1(targetWeapon);
        else setRouletteDisplayP2(targetWeapon);
        soundEngine.playRouletteLock();
        setRerollSpinRole(null);
        return;
      }
      const w = WEAPONS[(step * 5 + 2) % WEAPONS.length].id;
      if (rerollSpinRole === 'player') setRouletteDisplayP1(w);
      else setRouletteDisplayP2(w);
      soundEngine.playRouletteTick(0.7 - (step / total) * 0.35);
      tid = window.setTimeout(tick, 50 + step * 8);
    };

    tid = window.setTimeout(tick, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [rerollSpinRole, room?.player1.weaponId, room?.player2.weaponId]);

  // Input transmission (instant on edges/changes + 30Hz held keepalive)
  const flushInputPacket = useCallback(
    (force = false) => {
      if (roomPhaseRef.current !== 'playing') return;
      const ws = roomWsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const held = keysHeldRef.current;
      let moveX = touchMoveRef.current.x;
      let moveY = touchMoveRef.current.y;
      if (held.has('KeyA') || held.has('ArrowLeft')) moveX -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) moveX += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) moveY -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) moveY += 1;
      const mag = Math.hypot(moveX, moveY);
      if (mag > 1) {
        moveX /= mag;
        moveY /= mag;
      }

      const blockHeld =
        touchBlockingRef.current ||
        held.has('ShiftLeft') ||
        held.has('ShiftRight') ||
        held.has('KeyK');

      const punchPressed = punchPendingRef.current;
      const specialPressed = specialPendingRef.current;
      const dodgePressed = dodgePendingRef.current;

      const changed =
        Math.abs(moveX - lastSentMoveRef.current.x) > 0.02 ||
        Math.abs(moveY - lastSentMoveRef.current.y) > 0.02 ||
        blockHeld !== lastSentMoveRef.current.block;

      if (!force && !changed && !punchPressed && !specialPressed && !dodgePressed) {
        return;
      }

      punchPendingRef.current = false;
      specialPendingRef.current = false;
      dodgePendingRef.current = false;
      lastSentMoveRef.current = { x: moveX, y: moveY, block: blockHeld };

      const intent: InputIntent = {
        moveX,
        moveY,
        punchPressed,
        specialPressed,
        dodgePressed,
        blockHeld,
      };
      const seq = inputSeqRef.current++;
      ws.send(JSON.stringify({ type: 'INPUT', seq, intent }));
    },
    []
  );

  useEffect(() => {
    const clearInputs = () => {
      keysHeldRef.current.clear();
      touchMoveRef.current = { x: 0, y: 0 };
      touchBlockingRef.current = false;
      punchPendingRef.current = false;
      specialPendingRef.current = false;
      dodgePendingRef.current = false;
      flushInputPacket(true);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        onToggleMute();
        return;
      }
      if (roomPhaseRef.current !== 'playing') return;

      if (
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD' ||
        code === 'ArrowUp' ||
        code === 'ArrowLeft' ||
        code === 'ArrowDown' ||
        code === 'ArrowRight' ||
        code === 'ShiftLeft' ||
        code === 'ShiftRight' ||
        code === 'KeyK'
      ) {
        if (code.startsWith('Arrow')) e.preventDefault();
        keysHeldRef.current.add(code);
        flushInputPacket(false);
      } else if (code === 'Space' && !e.repeat) {
        e.preventDefault();
        punchPendingRef.current = true;
        flushInputPacket(true);
      } else if ((code === 'KeyE' || code === 'KeyL' || code === 'KeyJ') && !e.repeat) {
        e.preventDefault();
        specialPendingRef.current = true;
        flushInputPacket(true);
      } else if ((code === 'KeyQ' || code === 'KeyC') && !e.repeat) {
        e.preventDefault();
        dodgePendingRef.current = true;
        flushInputPacket(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (keysHeldRef.current.delete(e.code)) {
        flushInputPacket(false);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearInputs();
    };

    const keepaliveId = window.setInterval(() => {
      if (roomPhaseRef.current === 'playing') {
        const m = lastSentMoveRef.current;
        if (Math.abs(m.x) > 0.01 || Math.abs(m.y) > 0.01 || m.block) {
          flushInputPacket(true);
        }
      }
    }, 33);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(keepaliveId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [flushInputPacket, onToggleMute]);

  // 60fps interpolated arena render loop
  const isArenaMounted =
    room?.phase === 'playing' ||
    room?.phase === 'round-intermission' ||
    room?.phase === 'gameover';

  useEffect(() => {
    if (!isArenaMounted) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cssWidth = container.clientWidth || 900;
    let cssHeight = container.clientHeight || 520;
    let lastTs = performance.now();
    let totalTime = 0;
    let rafId = 0;

    const syncCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      cssWidth = Math.max(280, Math.floor(rect.width));
      cssHeight = Math.max(200, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    syncCanvasSize();
    const observer = new ResizeObserver(() => syncCanvasSize());
    observer.observe(container);

    const loop = (now: number) => {
      const rawDt = (now - lastTs) / 1000;
      lastTs = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      totalTime += dt;

      const serverMatch = latestServerMatchRef.current;
      if (serverMatch) {
        if (!visualMatchRef.current) {
          visualMatchRef.current = cloneMatchForVisual(serverMatch);
        }
        const vis = visualMatchRef.current;
        const alpha = 1 - Math.exp(-28 * dt);

        const p1JumpDist = Math.hypot(
          serverMatch.player.x - vis.player.x,
          serverMatch.player.y - vis.player.y
        );
        const p2JumpDist = Math.hypot(
          serverMatch.opponent.x - vis.opponent.x,
          serverMatch.opponent.y - vis.opponent.y
        );

        const nextP1X =
          p1JumpDist > 160
            ? serverMatch.player.x
            : vis.player.x + (serverMatch.player.x - vis.player.x) * alpha;
        const nextP1Y =
          p1JumpDist > 160
            ? serverMatch.player.y
            : vis.player.y + (serverMatch.player.y - vis.player.y) * alpha;

        const nextP2X =
          p2JumpDist > 160
            ? serverMatch.opponent.x
            : vis.opponent.x + (serverMatch.opponent.x - vis.opponent.x) * alpha;
        const nextP2Y =
          p2JumpDist > 160
            ? serverMatch.opponent.y
            : vis.opponent.y + (serverMatch.opponent.y - vis.opponent.y) * alpha;

        vis.bounds = serverMatch.bounds;
        vis.roundNumber = serverMatch.roundNumber;
        vis.arenaTheme = serverMatch.arenaTheme;
        vis.cameraTrauma = serverMatch.cameraTrauma;
        vis.finished = serverMatch.finished;
        vis.winnerRole = serverMatch.winnerRole;
        vis.projectiles = serverMatch.projectiles;
        vis.floorStones = serverMatch.floorStones;
        vis.player = { ...serverMatch.player, x: nextP1X, y: nextP1Y };
        vis.opponent = { ...serverMatch.opponent, x: nextP2X, y: nextP2Y };

        const renderer = rendererRef.current;
        renderer.updateEffects(dt);
        renderer.render(ctx, cssWidth, cssHeight, vis, totalTime, false, myRoleRef.current);

        ghostP1HpRef.current += (vis.player.hp - ghostP1HpRef.current) * Math.min(1, dt * 4.5);
        ghostP2HpRef.current +=
          (vis.opponent.hp - ghostP2HpRef.current) * Math.min(1, dt * 4.5);

        const p1W = Math.round(Math.max(0, vis.player.hp) * 10) / 10;
        const p1gW = Math.round(Math.max(0, ghostP1HpRef.current) * 10) / 10;
        const p2W = Math.round(Math.max(0, vis.opponent.hp) * 10) / 10;
        const p2gW = Math.round(Math.max(0, ghostP2HpRef.current) * 10) / 10;
        const widths = lastAppliedWidthRef.current;

        if (playerHpBarRef.current && widths.p1 !== p1W) {
          widths.p1 = p1W;
          playerHpBarRef.current.style.width = `${p1W}%`;
        }
        if (playerGhostBarRef.current && widths.p1g !== p1gW) {
          widths.p1g = p1gW;
          playerGhostBarRef.current.style.width = `${p1gW}%`;
        }
        if (opponentHpBarRef.current && widths.p2 !== p2W) {
          widths.p2 = p2W;
          opponentHpBarRef.current.style.width = `${p2W}%`;
        }
        if (opponentGhostBarRef.current && widths.p2g !== p2gW) {
          widths.p2g = p2gW;
          opponentGhostBarRef.current.style.width = `${p2gW}%`;
        }
      } else {
        const fallback = createMatchState('turk', 'fransiz', DEFAULT_ARENA_BOUNDS, {
          roundNumber: room?.roundNumber ?? 1,
        });
        rendererRef.current.render(
          ctx,
          cssWidth,
          cssHeight,
          fallback,
          totalTime,
          false,
          myRoleRef.current
        );
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [isArenaMounted, room?.roundNumber]);

  const handleCancelSearch = () => {
    soundEngine.playClick();
    if (matchmakingWsRef.current?.readyState === WebSocket.OPEN) {
      matchmakingWsRef.current.send(JSON.stringify({ type: 'CANCEL_MATCH' }));
    }
    clearActiveRoomCredentials();
    closeAllSockets();
    onExitToMenu();
  };

  const handleLeaveMatch = () => {
    soundEngine.playClick();
    sendRoomMessage({ type: 'LEAVE_MATCH' });
    clearActiveRoomCredentials();
    closeAllSockets();
    onExitToMenu();
  };

  const handleFindNewOpponent = () => {
    soundEngine.playClick();
    clearActiveRoomCredentials();
    const activeNick = sanitizeNickname(nickname || loadOnlineNickname(), '');
    if (!activeNick) {
      setViewMode('nickname');
      return;
    }
    void startMatchmaking(null, activeNick);
  };

  const handleExitToMenu = () => {
    soundEngine.playClick();
    clearActiveRoomCredentials();
    closeAllSockets();
    onExitToMenu();
  };

  const handleNicknameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sanitizeNickname(nicknameInput, '');
    if (!clean) {
      setNicknameError('En az 2 karakterlik bir takma ad gir.');
      return;
    }
    soundEngine.playClick();
    setNicknameError(null);
    saveOnlineNickname(clean);
    setNickname(clean);
    setNicknameInput(clean);
    void startMatchmaking(null, clean);
  };

  // Helper formatters
  const elapsedSearchSec = Math.max(
    0,
    Math.floor(Math.max(queueInfo.waitedMs, nowMs - searchStartedAt) / 1000)
  );
  const searchTimeFormatted = `${String(Math.floor(elapsedSearchSec / 60)).padStart(
    2,
    '0'
  )}:${String(elapsedSearchSec % 60).padStart(2, '0')}`;

  // 0. NICKNAME PROMPT BEFORE MATCHMAKING
  if (viewMode === 'nickname') {
    return (
      <div
        data-testid="online-nickname-view"
        className="relative z-20 flex h-dvh w-full flex-col justify-between gap-2 overflow-y-auto bg-[#FBF7EE] px-4 py-2.5 sm:px-6 sm:py-4"
      >
        <div className="mx-auto flex w-full max-w-4xl shrink-0 items-center justify-between">
          <button
            type="button"
            onClick={handleExitToMenu}
            className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-3 py-1 text-xs font-black text-[#1E293B] shadow-[0_3px_0_#1E293B] active:translate-y-0.5 active:shadow-none sm:text-sm"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Ana Menü</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_3px_0_#1E293B]"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>

        <form
          noValidate
          onSubmit={handleNicknameSubmit}
          className="mx-auto my-auto flex w-full max-w-md shrink-0 flex-col items-center rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-4 text-center shadow-[0_6px_0_#1E293B] sm:p-5"
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-[#0284C7] sm:text-[11px]">
            ONLINE 1v1
          </span>
          <h1 className="mt-0.5 text-lg font-black tracking-tight text-[#1E293B] sm:text-2xl">
            OYUNCU ADINI GİR
          </h1>
          <p className="mt-0.5 text-xs font-semibold text-[#64748B] sm:text-sm">
            Bu isim savaş sırasında karakterinin üstünde görünecek.
          </p>

          <div className="mt-2.5 w-full">
            <input
              type="text"
              data-testid="online-nickname-input"
              aria-label="Oyuncu adı"
              maxLength={NICKNAME_MAX_LEN}
              autoFocus
              value={nicknameInput}
              onChange={(e) => {
                setNicknameInput(e.target.value);
                if (nicknameError) setNicknameError(null);
              }}
              className="w-full rounded-2xl border-[3px] border-[#1E293B] bg-[#F8FAFC] px-4 py-2 text-center text-base font-black text-[#1E293B] focus:bg-white focus:outline-none sm:text-lg"
            />
            {nicknameError ? (
              <p className="mt-1 text-xs font-black text-[#E63946]">{nicknameError}</p>
            ) : (
              <p className="mt-1 text-[11px] font-bold text-[#64748B]">
                2 - {NICKNAME_MAX_LEN} karakter
              </p>
            )}
          </div>

          <button
            type="submit"
            data-testid="nickname-submit-btn"
            className="mt-2.5 min-h-[42px] w-full cursor-pointer rounded-2xl border-[3px] border-[#1E293B] bg-[#0284C7] px-5 py-2 text-sm font-black text-white shadow-[0_4px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:text-base"
          >
            RAKİP BUL
          </button>
        </form>

        <div className="shrink-0 text-center text-[11px] font-bold text-[#64748B]">
          Rastgele gerçek rakiple eşleştirilirsin
        </div>
      </div>
    );
  }

  // 1. SEARCHING / CONNECTING / SYNCING VIEW
  if (viewMode === 'connecting' || viewMode === 'searching' || (viewMode === 'room' && !room)) {
    const isSyncingRoom = viewMode === 'connecting' || viewMode === 'room';
    return (
      <div
        data-testid="online-matchmaking-view"
        className="relative z-20 flex h-dvh w-full flex-col justify-between gap-2 overflow-y-auto bg-[#FBF7EE] px-4 py-2.5 sm:px-6 sm:py-4"
      >
        <div className="mx-auto flex w-full max-w-4xl shrink-0 items-center justify-between">
          <button
            type="button"
            onClick={handleCancelSearch}
            className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-3 py-1 text-xs font-black text-[#1E293B] shadow-[0_3px_0_#1E293B] active:translate-y-0.5 active:shadow-none sm:text-sm"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Ana Menü</span>
          </button>

          <div className="flex items-center gap-2">
            {pingMs !== null && (
              <span className="inline-flex items-center gap-1 rounded-xl border-2 border-[#1E293B] bg-[#DCFCE7] px-2.5 py-1 text-xs font-black text-[#166534] tabular-nums">
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                {pingMs} ms
              </span>
            )}
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_3px_0_#1E293B]"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="mx-auto my-auto flex w-full max-w-md shrink-0 flex-col items-center rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-4 text-center shadow-[0_6px_0_#1E293B] sm:p-6">
          <div className="relative mb-2 flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-[#1E293B] bg-[#E0F2FE] sm:h-14 sm:w-14">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#38BDF8]/40" />
            <Wifi className="relative h-6 w-6 text-[#0284C7] sm:h-7 sm:w-7" aria-hidden="true" />
          </div>

          <h1 className="text-lg font-black tracking-tight text-[#1E293B] sm:text-2xl">
            {isSyncingRoom ? 'ODAYA BAĞLANILIYOR...' : 'RAKİP ARANIYOR'}
          </h1>
          <p className="mt-0.5 text-xs font-bold text-[#64748B] sm:text-sm">
            {isSyncingRoom
              ? 'Aktif maç oturumuna yeniden bağlanılıyor'
              : nickname
              ? `${nickname} olarak rakip aranıyor...`
              : 'Gerçek bir rakiple otomatik eşleştiriliyorsun'}
          </p>

          <div className="mt-2.5 flex items-center gap-3">
            <div className="rounded-xl border-2 border-[#1E293B] bg-[#FEF3C7] px-3 py-1 text-sm font-black text-[#1E293B] tabular-nums">
              {searchTimeFormatted}
            </div>
            <div className="rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] px-3 py-1 text-xs font-bold text-[#475569] tabular-nums">
              Sırada: {queueInfo.queueSize}
            </div>
          </div>

          <button
            type="button"
            data-testid="cancel-matchmaking-btn"
            onClick={handleCancelSearch}
            className="mt-3 min-h-[42px] w-full max-w-xs cursor-pointer rounded-2xl border-[3px] border-[#1E293B] bg-[#E63946] px-5 py-2 text-sm font-black text-white shadow-[0_4px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:text-base"
          >
            Aramayı İptal Et
          </button>
        </div>

        <div className="shrink-0 text-center text-[11px] font-bold text-[#64748B]">
          {sessionId ? 'Online sunucuya bağlı' : 'Oturum hazırlanıyor...'}
        </div>
      </div>
    );
  }

  // 2. ERROR VIEW
  if (viewMode === 'error' || !room) {
    return (
      <div className="relative z-20 flex h-dvh w-full flex-col items-center justify-center bg-[#FBF7EE] p-4 text-center">
        <div className="w-full max-w-md rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-6 shadow-[0_8px_0_#1E293B]">
          <WifiOff className="mx-auto mb-3 h-10 w-10 text-[#E63946]" aria-hidden="true" />
          <h2 className="text-xl font-black text-[#1E293B]">BAĞLANTI SORUNU</h2>
          <p className="mt-2 text-sm font-semibold text-[#475569]">
            {errorMsg || 'Çevrimiçi odaya bağlanılamadı.'}
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={handleFindNewOpponent}
              className="min-h-[46px] flex-1 cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#0284C7] px-4 py-2 text-sm font-black text-white shadow-[0_4px_0_#1E293B]"
            >
              TEKRAR DENE
            </button>
            <button
              type="button"
              onClick={handleExitToMenu}
              className="min-h-[46px] flex-1 cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#FDE68A] px-4 py-2 text-sm font-black text-[#1E293B] shadow-[0_4px_0_#1E293B]"
            >
              ANA MENÜ
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mySlot = myRole === 'player' ? room.player1 : room.player2;
  const oppSlot = myRole === 'player' ? room.player2 : room.player1;
  const phaseCountdownSec =
    room.phaseDeadlineMs !== null
      ? Math.max(0, Math.ceil((room.phaseDeadlineMs - nowMs) / 1000))
      : 0;
  const disconnectCountdownSec =
    room.reconnectDeadlineMs !== null
      ? Math.max(0, Math.ceil((room.reconnectDeadlineMs - nowMs) / 1000))
      : 0;

  // 3. ONLINE CHARACTER SELECT VIEW
  if (room.phase === 'character-select') {
    const oppSelectedDef = oppSlot.characterId
      ? getCharacterById(oppSlot.characterId)
      : null;

    return (
      <div
        data-testid="online-character-select"
        className="relative z-20 flex h-dvh w-full flex-col justify-between overflow-y-auto bg-[#FBF7EE] px-3 pt-[max(0.45rem,env(safe-area-inset-top))] pb-[max(0.45rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4"
      >
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleLeaveMatch}
            className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-2.5 py-1 text-xs font-black text-[#E63946] shadow-[0_3px_0_#1E293B] sm:px-3 sm:text-sm"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Maçtan Ayrıl</span>
          </button>

          <div className="text-center">
            <h1 className="text-base font-black tracking-tight text-[#1E293B] sm:text-2xl">
              ONLINE 1v1 · KARAKTERİNİ SEÇ
            </h1>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              data-testid="online-select-timer"
              className={`rounded-xl border-2 border-[#1E293B] px-2.5 py-1 text-xs font-black tabular-nums sm:text-sm ${
                phaseCountdownSec <= 7
                  ? 'bg-[#FEE2E2] text-[#E63946]'
                  : 'bg-[#FACC15] text-[#1E293B]'
              }`}
            >
              {phaseCountdownSec}s
            </span>
            {pingMs !== null && (
              <span className="hidden rounded-xl border-2 border-[#1E293B] bg-[#DCFCE7] px-2 py-1 text-xs font-black text-[#166534] tabular-nums sm:inline">
                {pingMs}ms
              </span>
            )}
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_2px_0_#1E293B]"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Live Pick Status Banner */}
        <div className="mx-auto mt-1 flex w-full max-w-5xl items-center justify-center gap-3 text-xs font-black sm:text-sm">
          <span
            className={`rounded-xl border-2 border-[#1E293B] px-3 py-1 ${
              mySlot.characterLocked
                ? 'bg-[#DCFCE7] text-[#166534]'
                : 'bg-[#FEF3C7] text-[#92400E]'
            }`}
          >
            {mySlot.nickname}:{' '}
            {mySlot.characterId
              ? `${getCharacterById(mySlot.characterId).name} (Hazır)`
              : 'Seçimin bekleniyor'}
          </span>
          <span
            data-testid="opponent-pick-status"
            className={`rounded-xl border-2 border-[#1E293B] px-3 py-1 ${
              oppSelectedDef
                ? 'bg-[#E0F2FE] text-[#0369A1]'
                : 'bg-[#FFFDF7] text-[#64748B]'
            }`}
          >
            {oppSlot.nickname}:{' '}
            {oppSelectedDef
              ? `${oppSelectedDef.name} seçti`
              : 'Seçiyor...'}
          </span>
        </div>

        {/* 5 Character Cards Grid (same character allowed!) */}
        <div className="mx-auto my-auto w-full max-w-5xl py-1.5">
          <div
            role="list"
            aria-label="Online karakterler"
            className="grid grid-cols-5 gap-2 sm:gap-3 lg:gap-4"
          >
            {CHARACTERS.map((char) => {
              const pickedByMe = mySlot.characterId === char.id;
              const pickedByOpp = oppSlot.characterId === char.id;

              return (
                <button
                  key={char.id}
                  type="button"
                  aria-label={`${char.name} karakterini seç`}
                  onClick={() => {
                    soundEngine.playClick();
                    sendRoomMessage({ type: 'SELECT_CHARACTER', characterId: char.id });
                  }}
                  className={`relative flex cursor-pointer flex-col items-center rounded-2xl border-[3px] p-2 text-center transition-transform duration-150 sm:p-3 lg:p-4 ${
                    pickedByMe
                      ? '-translate-y-1 border-[#1E293B] bg-[#FEF3C7] shadow-[0_5px_0_#1E293B]'
                      : 'border-[#CBD5E1] bg-[#FFFDF7] shadow-[0_3px_0_#CBD5E1] hover:-translate-y-0.5 hover:border-[#64748B]'
                  }`}
                >
                  {(pickedByMe || pickedByOpp) && (
                    <div className="absolute -top-2.5 flex gap-1">
                      {pickedByMe && (
                        <span className="rounded-md border border-[#1E293B] bg-[#E63946] px-1.5 py-0.5 text-[9px] font-black text-white">
                          SEN
                        </span>
                      )}
                      {pickedByOpp && (
                        <span className="rounded-md border border-[#1E293B] bg-[#0284C7] px-1.5 py-0.5 text-[9px] font-black text-white">
                          RAKİP
                        </span>
                      )}
                    </div>
                  )}

                  <CharacterPortrait
                    characterId={char.id}
                    size={76}
                    className="h-14 w-14 sm:h-16 sm:w-16 lg:h-[84px] lg:w-[84px]"
                  />
                  <span className="mt-1.5 text-sm font-black text-[#1E293B] sm:text-base">
                    {char.name}
                  </span>
                  <span className="mt-0.5 line-clamp-1 text-[10px] font-medium text-[#64748B] sm:text-xs">
                    {char.tagline}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-center text-[11px] font-bold text-[#64748B] sm:text-xs">
          İki oyuncu aynı karakteri de seçebilir. İkiniz de seçince VS ekranına geçilir!
        </p>

        {room.disconnectedRole !== null && (
          <DisconnectOverlay
            disconnectedRole={room.disconnectedRole}
            myRole={myRole}
            secondsLeft={disconnectCountdownSec}
            onLeave={handleLeaveMatch}
          />
        )}
      </div>
    );
  }

  // 4. SYNCED VS SCREEN
  if (room.phase === 'vs') {
    const p1Def = getCharacterById(room.player1.characterId ?? 'turk');
    const p2Def = getCharacterById(room.player2.characterId ?? 'fransiz');

    return (
      <div
        data-testid="online-vs-view"
        className="relative z-20 flex h-dvh w-full flex-col justify-between bg-[#FBF7EE] px-4 py-3 sm:px-6 sm:py-5"
      >
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <button
            type="button"
            onClick={handleLeaveMatch}
            className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-3 py-1 text-xs font-black text-[#E63946] shadow-[0_3px_0_#1E293B]"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ayrıl</span>
          </button>
          <div className="text-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#0284C7] sm:text-xs">
              ONLINE 1v1 · İLK 3 RAUND KAZANIR
            </span>
            <h1 className="text-lg font-black text-[#1E293B] sm:text-2xl">
              KARŞILAŞMA HAZIR!
            </h1>
          </div>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_2px_0_#1E293B]"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>

        <div className="mx-auto my-auto flex w-full max-w-4xl flex-row items-center justify-center gap-3 sm:gap-6">
          <div
            className={`flex w-full max-w-[230px] flex-col items-center rounded-3xl border-[3px] border-[#1E293B] p-3 text-center shadow-[0_5px_0_#1E293B] sm:max-w-[260px] sm:p-5 ${
              myRole === 'player' ? 'bg-[#FEF3C7]' : 'bg-[#E0F2FE]'
            }`}
          >
            <span
              className={`mb-1 text-[10px] font-black uppercase tracking-wider sm:text-xs ${
                myRole === 'player' ? 'text-[#E63946]' : 'text-[#0284C7]'
              }`}
            >
              {room.player1.nickname} {myRole === 'player' ? '(SEN)' : '(RAKİP)'}
            </span>
            <CharacterPortrait
              characterId={p1Def.id}
              size={104}
              className="h-16 w-16 sm:h-24 sm:w-24"
            />
            <h2 className="mt-1.5 text-lg font-black text-[#1E293B] sm:text-2xl">
              {p1Def.upperName}
            </h2>
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[3px] border-[#1E293B] bg-[#FACC15] shadow-[0_4px_0_#1E293B] sm:h-20 sm:w-20">
            <span className="text-lg font-black text-[#1E293B] sm:text-3xl">VS</span>
          </div>

          <div
            className={`flex w-full max-w-[230px] flex-col items-center rounded-3xl border-[3px] border-[#1E293B] p-3 text-center shadow-[0_5px_0_#1E293B] sm:max-w-[260px] sm:p-5 ${
              myRole === 'opponent' ? 'bg-[#FEF3C7]' : 'bg-[#E0F2FE]'
            }`}
          >
            <span
              className={`mb-1 text-[10px] font-black uppercase tracking-wider sm:text-xs ${
                myRole === 'opponent' ? 'text-[#E63946]' : 'text-[#0284C7]'
              }`}
            >
              {room.player2.nickname} {myRole === 'opponent' ? '(SEN)' : '(RAKİP)'}
            </span>
            <CharacterPortrait
              characterId={p2Def.id}
              size={104}
              className="h-16 w-16 sm:h-24 sm:w-24"
            />
            <h2 className="mt-1.5 text-lg font-black text-[#1E293B] sm:text-2xl">
              {p2Def.upperName}
            </h2>
          </div>
        </div>

        <p className="text-center text-xs font-bold text-[#64748B] sm:text-sm">
          Silah ruletine geçiliyor...
        </p>

        {room.disconnectedRole !== null && (
          <DisconnectOverlay
            disconnectedRole={room.disconnectedRole}
            myRole={myRole}
            secondsLeft={disconnectCountdownSec}
            onLeave={handleLeaveMatch}
          />
        )}
      </div>
    );
  }

  // 5. SYNCED WEAPON ROULETTE
  if (room.phase === 'weapon-roulette') {
    const p1Def = getCharacterById(room.player1.characterId ?? 'turk');
    const p2Def = getCharacterById(room.player2.characterId ?? 'fransiz');
    const w1 = getWeaponById(rouletteDisplayP1);
    const w2 = getWeaponById(rouletteDisplayP2);
    const reelsSettled = room.rouletteSpun && !rouletteSpinning && rerollSpinRole === null;

    return (
      <div
        data-testid="online-roulette-view"
        className="relative z-20 flex h-dvh w-full flex-col justify-between bg-[#FBF7EE] px-3 pt-[max(0.45rem,env(safe-area-inset-top))] pb-[max(0.45rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4"
      >
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleLeaveMatch}
            className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-2.5 py-1 text-xs font-black text-[#E63946] shadow-[0_3px_0_#1E293B]"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ayrıl</span>
          </button>

          <h1 className="text-center text-base font-black text-[#1E293B] sm:text-2xl">
            ONLINE SİLAH RULETİ
          </h1>

          <div className="flex items-center gap-1.5">
            {phaseCountdownSec > 0 && (
              <span className="rounded-xl border-2 border-[#1E293B] bg-[#FACC15] px-2.5 py-1 text-xs font-black text-[#1E293B] tabular-nums">
                {phaseCountdownSec}s
              </span>
            )}
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_2px_0_#1E293B]"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="mx-auto my-auto grid w-full max-w-4xl grid-cols-2 gap-3 py-1.5 sm:gap-6">
          {/* P1 Reel */}
          <div
            className={`flex flex-col items-center rounded-3xl border-[3px] border-[#1E293B] p-2.5 text-center shadow-[0_5px_0_#1E293B] sm:p-5 ${
              myRole === 'player' ? 'bg-[#FEF3C7]' : 'bg-[#E0F2FE]'
            }`}
          >
            <div className="flex items-center gap-2">
              <CharacterPortrait characterId={p1Def.id} size={36} className="h-8 w-8" />
              <div className="text-left">
                <div
                  className={`text-[10px] font-black ${
                    myRole === 'player' ? 'text-[#E63946]' : 'text-[#0284C7]'
                  }`}
                >
                  {room.player1.nickname} {myRole === 'player' ? '(SEN)' : ''}
                </div>
                <div className="text-sm font-black text-[#1E293B]">{p1Def.upperName}</div>
              </div>
            </div>

            <div className="mt-2 flex min-h-[82px] w-full flex-col items-center justify-center rounded-2xl border-2 border-[#1E293B] bg-[#FFFDF7] px-2.5 py-1.5 sm:min-h-[116px]">
              <WeaponIcon weaponId={w1.id} size={38} className="h-9 w-9 sm:h-11 sm:w-11" />
              <div className="mt-0.5 text-sm font-black text-[#1E293B] sm:text-lg">
                {!room.rouletteSpun ? '???' : w1.upperName}
              </div>
              <div className="text-[10px] font-bold text-[#64748B] sm:text-xs">
                {!room.rouletteSpun ? 'Çark bekleniyor' : w1.tagline}
              </div>
            </div>
          </div>

          {/* P2 Reel */}
          <div
            className={`flex flex-col items-center rounded-3xl border-[3px] border-[#1E293B] p-2.5 text-center shadow-[0_5px_0_#1E293B] sm:p-5 ${
              myRole === 'opponent' ? 'bg-[#FEF3C7]' : 'bg-[#E0F2FE]'
            }`}
          >
            <div className="flex items-center gap-2">
              <CharacterPortrait characterId={p2Def.id} size={36} className="h-8 w-8" />
              <div className="text-left">
                <div
                  className={`text-[10px] font-black ${
                    myRole === 'opponent' ? 'text-[#E63946]' : 'text-[#0284C7]'
                  }`}
                >
                  {room.player2.nickname} {myRole === 'opponent' ? '(SEN)' : ''}
                </div>
                <div className="text-sm font-black text-[#1E293B]">{p2Def.upperName}</div>
              </div>
            </div>

            <div className="mt-2 flex min-h-[82px] w-full flex-col items-center justify-center rounded-2xl border-2 border-[#1E293B] bg-[#FFFDF7] px-2.5 py-1.5 sm:min-h-[116px]">
              <WeaponIcon weaponId={w2.id} size={38} className="h-9 w-9 sm:h-11 sm:w-11" />
              <div className="mt-0.5 text-sm font-black text-[#1E293B] sm:text-lg">
                {!room.rouletteSpun ? '???' : w2.upperName}
              </div>
              <div className="text-[10px] font-bold text-[#64748B] sm:text-xs">
                {!room.rouletteSpun ? 'Çark bekleniyor' : w2.tagline}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-2.5 pb-1">
          {!room.rouletteSpun && (
            <button
              type="button"
              data-start="true"
              onClick={() => {
                soundEngine.playClick();
                sendRoomMessage({ type: 'SPIN_WEAPONS' });
              }}
              className="min-h-[46px] w-full max-w-sm cursor-pointer rounded-2xl border-[3px] border-[#1E293B] bg-[#E63946] px-6 py-2 text-base font-black text-white shadow-[0_5px_0_#1E293B] active:translate-y-0.5 active:shadow-none"
            >
              SİLAHLARI BELİRLE
            </button>
          )}
          {(rouletteSpinning || rerollSpinRole !== null) && (
            <p className="py-2 text-sm font-black text-[#1E293B]">
              Silahlar dönüyor...
            </p>
          )}
          {reelsSettled && (
            <>
              {!mySlot.rerollUsed && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    sendRoomMessage({ type: 'WEAPON_REROLL' });
                  }}
                  className="inline-flex min-h-[46px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-[3px] border-[#1E293B] bg-[#FACC15] px-4 py-2 text-xs font-black text-[#1E293B] shadow-[0_4px_0_#1E293B] sm:text-sm"
                >
                  <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>SİLAH DEĞİŞTİR (1 HAK)</span>
                </button>
              )}
              <button
                type="button"
                disabled={mySlot.rouletteReady}
                onClick={() => {
                  soundEngine.playClick();
                  sendRoomMessage({ type: 'ROULETTE_READY' });
                }}
                className={`min-h-[46px] flex-1 cursor-pointer rounded-2xl border-[3px] border-[#1E293B] px-5 py-2 text-sm font-black shadow-[0_4px_0_#1E293B] ${
                  mySlot.rouletteReady
                    ? 'bg-[#CBD5E1] text-[#475569] shadow-none'
                    : 'bg-[#16A34A] text-white'
                }`}
              >
                {mySlot.rouletteReady ? 'RAKİP HAZIRLANIYOR...' : 'HAZIRIM!'}
              </button>
            </>
          )}
        </div>

        {room.disconnectedRole !== null && (
          <DisconnectOverlay
            disconnectedRole={room.disconnectedRole}
            myRole={myRole}
            secondsLeft={disconnectCountdownSec}
            onLeave={handleLeaveMatch}
          />
        )}
      </div>
    );
  }

  // 6. SERVER-AUTHORITATIVE ARENA / INTERMISSION / GAME OVER
  const p1Def = getCharacterById(room.player1.characterId ?? 'turk');
  const p2Def = getCharacterById(room.player2.characterId ?? 'fransiz');
  const p1Weapon = getWeaponById(room.player1.weaponId);
  const p2Weapon = getWeaponById(room.player2.weaponId);
  const arenaTheme = getArenaThemeForRound(room.roundNumber);
  const p1OutOfStones = p1Weapon.id === 'sapan' && hudCombat.p1Ammo <= 0;
  const p2OutOfStones = p2Weapon.id === 'sapan' && hudCombat.p2Ammo <= 0;
  const myWeapon = myRole === 'player' ? p1Weapon : p2Weapon;
  const myOutOfStones = myRole === 'player' ? p1OutOfStones : p2OutOfStones;
  const touchActionLabel =
    myWeapon.id === 'sapan' && !myOutOfStones ? 'ATIŞ' : 'SALDIR';

  const mySummary =
    myRole === 'player' ? room.summaryForPlayer1 : room.summaryForPlayer2;

  const reasonNote =
    room.matchOverReason === 'disconnect_timeout'
      ? room.matchWinnerRole === myRole
        ? 'Rakibin bağlantısı 20 saniye içinde geri dönmedi — hükmen kazandın!'
        : 'Bağlantı süresi dolduğu için maç sona erdi.'
      : room.matchOverReason === 'opponent_left'
      ? room.matchWinnerRole === myRole
        ? 'Rakip maçtan ayrıldı — hükmen kazandın!'
        : 'Maçtan ayrıldın.'
      : room.matchOverReason === 'selection_timeout'
      ? 'Karakter seçimi süresi doldu.'
      : null;

  return (
    <div
      data-testid="online-arena-shell"
      className="relative flex h-dvh w-full flex-col overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: arenaTheme.outerCanvasBg }}
    >
      {/* Top Online Combat HUD */}
      <header className="pointer-events-none z-20 mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-1.5 px-2 pt-[max(0.25rem,env(safe-area-inset-top))] pb-0.5 sm:gap-3 sm:px-5 sm:pt-2 sm:pb-1">
        {/* P1 Card */}
        <div
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl border-2 px-1.5 py-0.5 shadow-[0_3px_0_#1E293B] transition-colors duration-150 sm:gap-3 sm:px-3 sm:py-1.5 ${
            hudCombat.p1HitPulse
              ? 'border-[#E63946] bg-[#FEE2E2]'
              : myRole === 'player'
              ? 'border-[#1E293B] bg-[#FEFCE8]'
              : 'border-[#1E293B] bg-[#FFFDF7]'
          }`}
        >
          <CharacterPortrait
            characterId={p1Def.id}
            damageStage={room.player1.damageStage}
            size={40}
            className="h-7 w-7 shrink-0 sm:h-10 sm:w-10"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate text-[11px] font-black text-[#1E293B] sm:text-sm">
                {room.player1.nickname} · {p1Def.upperName}
              </span>
              <span className="shrink-0 text-[11px] font-black text-[#E63946] tabular-nums sm:text-sm">
                {hudCombat.p1Hp}
              </span>
            </div>
            <div className="relative mt-0.5 h-2 w-full overflow-hidden rounded-full border-2 border-[#1E293B] bg-[#E2E8F0] sm:mt-1 sm:h-3">
              <div
                ref={playerGhostBarRef}
                className="absolute inset-y-0 left-0 bg-[#FACC15]"
                style={{ width: '100%' }}
              />
              <div
                ref={playerHpBarRef}
                className={`relative h-full ${
                  myRole === 'player' ? 'bg-[#16A34A]' : 'bg-[#0284C7]'
                }`}
                style={{ width: '100%' }}
              />
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] font-extrabold text-[#475569] sm:text-xs">
              <WeaponIcon
                weaponId={p1OutOfStones ? 'yumruk' : p1Weapon.id}
                size={14}
                className="shrink-0"
              />
              <span className="truncate">
                {p1OutOfStones ? 'Yumruk' : p1Weapon.name}
              </span>
              {myRole === 'player' && hudCombat.combo >= 2 && (
                <span className="ml-1 shrink-0 font-black text-[#E63946] tabular-nums">
                  {hudCombat.combo}x
                </span>
              )}
              {p1Weapon.id === 'sapan' && (
                <span className="ml-auto shrink-0 font-black text-[#B45309] tabular-nums">
                  {hudCombat.p1Ammo}/5
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center Score + Ping + Leave/Mute */}
        <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-0.5 sm:gap-1">
          <div
            data-testid="online-score-pill"
            className={`rounded-xl border-2 border-[#1E293B] px-2 py-0.5 text-center shadow-[0_2px_0_#1E293B] ${
              room.isFinalRound ? 'bg-[#FACC15]' : 'bg-[#FFFDF7]'
            }`}
          >
            <div className="text-xs leading-tight font-black text-[#1E293B] tabular-nums sm:text-sm">
              {room.player1.wins} - {room.player2.wins}
            </div>
            <div className="text-[9px] leading-none font-extrabold tracking-wider text-[#475569] uppercase">
              {room.isFinalRound ? 'FİNAL' : `R${room.roundNumber}/5`}
              {pingMs !== null ? ` · ${pingMs}ms` : ''}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_2px_0_#1E293B]"
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                handleLeaveMatch();
              }}
              aria-label="Maçtan ayrıl"
              title="Maçtan Ayrıl"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FEE2E2] text-[#E63946] shadow-[0_2px_0_#1E293B]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* P2 Card */}
        <div
          className={`flex min-w-0 flex-1 flex-row-reverse items-center gap-1.5 rounded-2xl border-2 px-1.5 py-0.5 shadow-[0_3px_0_#1E293B] transition-colors duration-150 sm:gap-3 sm:px-3 sm:py-1.5 ${
            hudCombat.p2HitPulse
              ? 'border-[#E63946] bg-[#FEE2E2]'
              : myRole === 'opponent'
              ? 'border-[#1E293B] bg-[#FEFCE8]'
              : 'border-[#1E293B] bg-[#FFFDF7]'
          }`}
        >
          <CharacterPortrait
            characterId={p2Def.id}
            damageStage={room.player2.damageStage}
            size={40}
            className="h-7 w-7 shrink-0 sm:h-10 sm:w-10"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-row-reverse items-baseline justify-between gap-1">
              <span className="truncate text-[11px] font-black text-[#1E293B] sm:text-sm">
                {room.player2.nickname} · {p2Def.upperName}
              </span>
              <span className="shrink-0 text-[11px] font-black text-[#0284C7] tabular-nums sm:text-sm">
                {hudCombat.p2Hp}
              </span>
            </div>
            <div className="relative mt-0.5 h-2 w-full overflow-hidden rounded-full border-2 border-[#1E293B] bg-[#E2E8F0] sm:mt-1 sm:h-3">
              <div
                ref={opponentGhostBarRef}
                className="absolute inset-y-0 right-0 bg-[#FACC15]"
                style={{ width: '100%' }}
              />
              <div
                ref={opponentHpBarRef}
                className={`relative ml-auto h-full ${
                  myRole === 'opponent' ? 'bg-[#16A34A]' : 'bg-[#0284C7]'
                }`}
                style={{ width: '100%' }}
              />
            </div>
            <div className="mt-0.5 flex flex-row-reverse items-center gap-1 text-[10px] font-extrabold text-[#475569] sm:text-xs">
              <WeaponIcon
                weaponId={p2OutOfStones ? 'yumruk' : p2Weapon.id}
                size={14}
                className="shrink-0"
              />
              <span className="truncate">
                {p2OutOfStones ? 'Yumruk' : p2Weapon.name}
              </span>
              {myRole === 'opponent' && hudCombat.combo >= 2 && (
                <span className="mr-1 shrink-0 font-black text-[#E63946] tabular-nums">
                  {hudCombat.combo}x
                </span>
              )}
              {p2Weapon.id === 'sapan' && (
                <span className="mr-auto shrink-0 font-black text-[#B45309] tabular-nums">
                  {hudCombat.p2Ammo}/5
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Canvas Container */}
      <div ref={containerRef} className="relative min-h-0 w-full flex-1">
        <canvas
          ref={canvasRef}
          data-testid="arena-canvas"
          className="block h-full w-full touch-none"
        />

        {/* Round Intermission Banner (no arena name) */}
        {room.phase === 'round-intermission' && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[#0F172A]/45 p-4">
            <div className="w-full max-w-md rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-4 text-center shadow-[0_8px_0_#1E293B] sm:p-5">
              <p className="text-xs font-black uppercase tracking-widest text-[#E63946]">
                RAUND {Math.max(1, room.roundNumber - 1)} TAMAMLANDI
              </p>
              <h2 className="mt-1 text-xl font-black text-[#1E293B] sm:text-2xl">
                {room.lastRoundWinnerRole === myRole
                  ? 'BU RAUNDU KAZANDIN!'
                  : 'RAKİP RAUNDU ALDI'}
              </h2>
              {room.isFinalRound && (
                <div className="mt-2 rounded-xl border-2 border-[#1E293B] bg-[#FACC15] px-3 py-1 text-xs font-black text-[#1E293B]">
                  SON RAUND – KAZANAN BELLİ OLACAK!
                </div>
              )}
              <p className="mt-2 text-xs font-black uppercase tracking-widest text-[#16A34A]">
                YENİ SİLAHLAR
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center rounded-2xl border-2 border-[#1E293B] bg-[#FEF3C7] p-2">
                  <span className="text-[10px] font-black text-[#E63946]">
                    {room.player1.nickname}
                  </span>
                  <WeaponIcon weaponId={p1Weapon.id} size={30} className="my-1" />
                  <span className="text-xs font-black text-[#1E293B]">{p1Weapon.name}</span>
                </div>
                <div className="flex flex-col items-center rounded-2xl border-2 border-[#1E293B] bg-[#E0F2FE] p-2">
                  <span className="text-[10px] font-black text-[#0284C7]">
                    {room.player2.nickname}
                  </span>
                  <WeaponIcon weaponId={p2Weapon.id} size={30} className="my-1" />
                  <span className="text-xs font-black text-[#1E293B]">{p2Weapon.name}</span>
                </div>
              </div>
              <p className="mt-2 text-sm font-black text-[#1E293B] tabular-nums">
                RAUND {room.roundNumber} BAŞLIYOR... ({phaseCountdownSec}s)
              </p>
            </div>
          </div>
        )}

        {/* Reconnecting Pill if Local Socket Briefly Drops */}
        {socketReconnecting && room.phase !== 'gameover' && (
          <div className="pointer-events-none absolute top-2 left-1/2 z-30 -translate-x-1/2 rounded-full border-2 border-[#1E293B] bg-[#FACC15] px-3 py-1 text-xs font-black text-[#1E293B] shadow-[0_2px_0_#1E293B]">
            BAĞLANTI YENİLENİYOR...
          </div>
        )}

        {/* Floating Corner Touch Controls (Mobile/Landscape + Optional Desktop) */}
        {room.phase === 'playing' && room.disconnectedRole === null && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-[max(0.25rem,env(safe-area-inset-bottom))] ${
              showDesktopTouchPad ? 'block' : 'block lg:hidden'
            }`}
          >
            <TouchControls
              floating
              actionLabel={touchActionLabel}
              specialReady={hudCombat.specialCooldownTenths === 0}
              specialCooldownSec={hudCombat.specialCooldownTenths / 10}
              dodgeReady={hudCombat.dodgeCooldownTenths === 0}
              dodgeCooldownSec={hudCombat.dodgeCooldownTenths / 10}
              isBlocking={hudCombat.blocking}
              onMoveVectorChange={(x, y) => {
                touchMoveRef.current = { x, y };
                flushInputPacket(false);
              }}
              onPunch={() => {
                punchPendingRef.current = true;
                flushInputPacket(true);
              }}
              onSpecial={() => {
                specialPendingRef.current = true;
                flushInputPacket(true);
              }}
              onDodge={() => {
                dodgePendingRef.current = true;
                flushInputPacket(true);
              }}
              onBlockChange={(blocking) => {
                touchBlockingRef.current = blocking;
                flushInputPacket(true);
              }}
            />
          </div>
        )}

        {/* 20s Disconnect Countdown Overlay */}
        {room.disconnectedRole !== null && room.phase !== 'gameover' && (
          <DisconnectOverlay
            disconnectedRole={room.disconnectedRole}
            myRole={myRole}
            secondsLeft={disconnectCountdownSec}
            onLeave={handleLeaveMatch}
          />
        )}
      </div>

      {/* Desktop Keyboard Hint Footer */}
      <footer className="z-20 mx-auto hidden w-full max-w-5xl shrink-0 items-center justify-between gap-4 px-5 pb-2 pt-1 lg:flex">
        <p className="rounded-full border border-[#1E293B]/25 bg-[#FFFDF7]/92 px-3 py-1 text-xs font-bold tracking-wide text-[#1E293B]">
          WASD/Ok: Hareket · Boşluk: Saldır · E: Özel · Q: Kaçın · Shift: Blok
        </p>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            setShowDesktopTouchPad((v) => !v);
          }}
          className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-[#FFFDF7] px-3 py-1 text-xs font-bold text-[#475569] hover:border-[#1E293B] hover:text-[#1E293B]"
        >
          <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {showDesktopTouchPad
              ? 'Dokunmatik Kontrolleri Gizle'
              : 'Dokunmatik Kontrolleri Göster'}
          </span>
        </button>
      </footer>

      {/* Online Game Over Modal */}
      {room.phase === 'gameover' && mySummary && (
        <GameOverModal
          summary={mySummary}
          primaryLabel="YENİ RAKİP BUL"
          secondaryLabel="ANA MENÜ"
          reasonNote={reasonNote}
          onPlayAgain={handleFindNewOpponent}
          onCharacterSelect={handleExitToMenu}
        />
      )}

      {room.phase === 'gameover' && !mySummary && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#0F172A]/65 p-4"
        >
          <div className="w-full max-w-sm rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-6 text-center shadow-[0_10px_0_#1E293B]">
            <h2 className="text-2xl font-black text-[#1E293B]">MAÇ İPTAL EDİLDİ</h2>
            <p className="mt-2 text-sm font-semibold text-[#475569]">
              {reasonNote ?? 'İki oyuncu da zamanında seçim yapmadı.'}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleFindNewOpponent}
                className="min-h-[46px] flex-1 cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#E63946] px-4 py-2 text-sm font-black text-white shadow-[0_4px_0_#1E293B]"
              >
                YENİ RAKİP BUL
              </button>
              <button
                type="button"
                onClick={handleExitToMenu}
                className="min-h-[46px] flex-1 cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#FDE68A] px-4 py-2 text-sm font-black text-[#1E293B] shadow-[0_4px_0_#1E293B]"
              >
                ANA MENÜ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface DisconnectOverlayProps {
  disconnectedRole: PlayerSlot;
  myRole: PlayerSlot;
  secondsLeft: number;
  onLeave: () => void;
}

const DisconnectOverlay: React.FC<DisconnectOverlayProps> = ({
  disconnectedRole,
  myRole,
  secondsLeft,
  onLeave,
}) => {
  const isMe = disconnectedRole === myRole;

  return (
    <div
      role="alert"
      data-testid="disconnect-grace-overlay"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0F172A]/65 p-4"
    >
      <div className="w-full max-w-sm rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-5 text-center shadow-[0_8px_0_#1E293B]">
        <WifiOff className="mx-auto mb-2 h-8 w-8 text-[#E63946]" aria-hidden="true" />
        <h3 className="text-lg font-black text-[#1E293B]">
          {isMe ? 'BAĞLANTI KESİLDİ' : 'RAKİBİN BAĞLANTISI KESİLDİ'}
        </h3>
        <p className="mt-1 text-xs font-semibold text-[#475569] sm:text-sm">
          {isMe
            ? 'Otomatik yeniden bağlanılıyor...'
            : 'Yeniden bağlanması bekleniyor, gelmezse maçı kazanırsın.'}
        </p>
        <div className="mx-auto mt-3 inline-flex rounded-2xl border-2 border-[#1E293B] bg-[#FACC15] px-4 py-1.5 text-xl font-black text-[#1E293B] tabular-nums">
          {secondsLeft}s
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={onLeave}
            className="min-h-[40px] cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-4 py-1.5 text-xs font-black text-[#E63946] shadow-[0_3px_0_#1E293B]"
          >
            Maçtan Ayrıl
          </button>
        </div>
      </div>
    </div>
  );
};
