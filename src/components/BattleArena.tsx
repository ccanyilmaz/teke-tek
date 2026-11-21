import React, { useEffect, useRef, useState } from 'react';
import { Gamepad2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../game/audio';
import { getCharacterById } from '../game/characters';
import {
  clampFighterToArena,
  createMatchState,
  DEFAULT_ARENA_BOUNDS,
  PORTRAIT_ARENA_BOUNDS,
  stepMatch,
} from '../game/engine';
import { ArenaRenderer } from '../game/renderer';
import type {
  CharacterId,
  GameScreenState,
  MatchState,
  MatchSummary,
} from '../game/types';
import { CharacterPortrait } from './CharacterPortrait';
import { TouchControls } from './TouchControls';

interface BattleArenaProps {
  screenState: GameScreenState;
  playerCharacterId: CharacterId;
  opponentCharacterId: CharacterId;
  matchSeed: number;
  muted: boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onMatchFinish: (summary: MatchSummary) => void;
}

export const BattleArena: React.FC<BattleArenaProps> = ({
  screenState,
  playerCharacterId,
  opponentCharacterId,
  matchSeed,
  muted,
  onToggleMute,
  onTogglePause,
  onMatchFinish,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ArenaRenderer>(new ArenaRenderer());

  // Mutable refs for 60fps loop (zero React re-renders per frame)
  const screenStateRef = useRef<GameScreenState>(screenState);
  const matchRef = useRef<MatchState>(
    createMatchState(playerCharacterId, opponentCharacterId)
  );
  const titleShowcaseRef = useRef<MatchState>(
    createMatchState('turk', 'fransiz')
  );
  const keysHeldRef = useRef<Set<string>>(new Set());
  const touchMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const punchQueuedRef = useRef<boolean>(false);
  const finishDispatchedRef = useRef<boolean>(false);

  // Direct DOM refs for 60Hz HP bar updates & trailing ghost bars
  const playerHpBarRef = useRef<HTMLDivElement | null>(null);
  const playerGhostBarRef = useRef<HTMLDivElement | null>(null);
  const opponentHpBarRef = useRef<HTMLDivElement | null>(null);
  const opponentGhostBarRef = useRef<HTMLDivElement | null>(null);
  const ghostPlayerHpRef = useRef<number>(100);
  const ghostOpponentHpRef = useRef<number>(100);

  const lastHudHpRef = useRef<{ player: number; opponent: number }>({
    player: 100,
    opponent: 100,
  });
  const [hudHp, setHudHp] = useState<{ player: number; opponent: number }>({
    player: 100,
    opponent: 100,
  });
  const [hitPulse, setHitPulse] = useState<{ player: boolean; opponent: boolean }>({
    player: false,
    opponent: false,
  });
  const [showDesktopTouchPad, setShowDesktopTouchPad] = useState(false);

  const onMatchFinishRef = useRef(onMatchFinish);
  const onTogglePauseRef = useRef(onTogglePause);
  const onToggleMuteRef = useRef(onToggleMute);

  useEffect(() => {
    onMatchFinishRef.current = onMatchFinish;
    onTogglePauseRef.current = onTogglePause;
    onToggleMuteRef.current = onToggleMute;
  }, [onMatchFinish, onTogglePause, onToggleMute]);

  useEffect(() => {
    screenStateRef.current = screenState;
    if (screenState === 'playing') {
      keysHeldRef.current.clear();
      touchMoveRef.current = { x: 0, y: 0 };
      punchQueuedRef.current = false;
    }
  }, [screenState]);

  const activeBoundsRef = useRef(DEFAULT_ARENA_BOUNDS);

  // Reset match state whenever matchSeed or chosen fighters change
  useEffect(() => {
    const fresh = createMatchState(
      playerCharacterId,
      opponentCharacterId,
      activeBoundsRef.current
    );
    matchRef.current = fresh;
    finishDispatchedRef.current = false;
    ghostPlayerHpRef.current = 100;
    ghostOpponentHpRef.current = 100;
    lastHudHpRef.current = { player: 100, opponent: 100 };
    rendererRef.current.resetEffects();
    setHudHp({ player: 100, opponent: 100 });
    setHitPulse({ player: false, opponent: false });

    if (playerHpBarRef.current) playerHpBarRef.current.style.width = '100%';
    if (playerGhostBarRef.current) playerGhostBarRef.current.style.width = '100%';
    if (opponentHpBarRef.current) opponentHpBarRef.current.style.width = '100%';
    if (opponentGhostBarRef.current) opponentGhostBarRef.current.style.width = '100%';
  }, [playerCharacterId, opponentCharacterId, matchSeed]);

  // Unified Keyboard Input & Focus-Loss Hygiene
  useEffect(() => {
    const clearInputs = () => {
      keysHeldRef.current.clear();
      touchMoveRef.current = { x: 0, y: 0 };
      punchQueuedRef.current = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();

      if (screenStateRef.current === 'playing' || screenStateRef.current === 'paused') {
        if (code === 'Escape' || key === 'p') {
          e.preventDefault();
          onTogglePauseRef.current();
          return;
        }
        if (key === 'm') {
          e.preventDefault();
          onToggleMuteRef.current();
          return;
        }
      }

      if (screenStateRef.current !== 'playing') return;

      if (
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD' ||
        code === 'ArrowUp' ||
        code === 'ArrowLeft' ||
        code === 'ArrowDown' ||
        code === 'ArrowRight'
      ) {
        e.preventDefault();
        keysHeldRef.current.add(code);
      } else if (code === 'Space' && !e.repeat) {
        e.preventDefault();
        punchQueuedRef.current = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Isolated 60fps Canvas Loop + ResizeObserver
  useEffect(() => {
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
    let renderedFrozenState = false;

    const syncCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      cssWidth = Math.max(280, Math.floor(rect.width));
      cssHeight = Math.max(200, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const isPortrait = cssHeight > cssWidth * 1.05;
      const nextBounds = isPortrait ? PORTRAIT_ARENA_BOUNDS : DEFAULT_ARENA_BOUNDS;
      if (activeBoundsRef.current !== nextBounds) {
        activeBoundsRef.current = nextBounds;
        titleShowcaseRef.current.bounds = nextBounds;
        const m = matchRef.current;
        if (m.elapsedTime < 0.05) {
          matchRef.current = createMatchState(
            m.player.characterId,
            m.opponent.characterId,
            nextBounds
          );
        } else {
          m.bounds = nextBounds;
          clampFighterToArena(m.player, nextBounds);
          clampFighterToArena(m.opponent, nextBounds);
        }
      }
      renderedFrozenState = false;
    };

    syncCanvasSize();
    const observer = new ResizeObserver(() => syncCanvasSize());
    observer.observe(container);

    const loop = (now: number) => {
      const rawDt = (now - lastTs) / 1000;
      lastTs = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const state = screenStateRef.current;
      const renderer = rendererRef.current;

      if (state === 'title') {
        renderedFrozenState = false;
        totalTime += dt;
        // Live playful shadow-boxing showcase in center arena
        const showcase = titleShowcaseRef.current;
        const b = showcase.bounds;
        showcase.player.x = b.width * 0.31 + Math.sin(totalTime * 1.7) * (b.width * 0.07);
        showcase.player.y = b.height * 0.56 + Math.cos(totalTime * 2.2) * (b.height * 0.06);
        showcase.player.walkPhase += dt * 6;
        const pCycle = totalTime % 1.4;
        showcase.player.punchPhase = pCycle > 1.05 && pCycle < 1.22 ? 'active' : 'idle';

        showcase.opponent.x = b.width * 0.69 - Math.sin(totalTime * 1.5) * (b.width * 0.07);
        showcase.opponent.y = b.height * 0.46 - Math.cos(totalTime * 1.9) * (b.height * 0.06);
        showcase.opponent.walkPhase += dt * 6;
        const oCycle = (totalTime + 0.7) % 1.4;
        showcase.opponent.punchPhase = oCycle > 1.05 && oCycle < 1.22 ? 'active' : 'idle';

        showcase.player.facingAngle = Math.atan2(
          showcase.opponent.y - showcase.player.y,
          showcase.opponent.x - showcase.player.x
        );
        showcase.opponent.facingAngle = Math.atan2(
          showcase.player.y - showcase.opponent.y,
          showcase.player.x - showcase.opponent.x
        );
        renderer.render(ctx, cssWidth, cssHeight, showcase, totalTime, true);
      } else if (state === 'playing') {
        renderedFrozenState = false;
        totalTime += dt;
        const match = matchRef.current;
        const held = keysHeldRef.current;

        let moveX = touchMoveRef.current.x;
        let moveY = touchMoveRef.current.y;

        if (held.has('KeyA') || held.has('ArrowLeft')) moveX -= 1;
        if (held.has('KeyD') || held.has('ArrowRight')) moveX += 1;
        if (held.has('KeyW') || held.has('ArrowUp')) moveY -= 1;
        if (held.has('KeyS') || held.has('ArrowDown')) moveY += 1;

        const punchPressed = punchQueuedRef.current;
        punchQueuedRef.current = false;

        stepMatch(match, { moveX, moveY, punchPressed }, dt);

        // Emit dust when moving quickly
        if (Math.hypot(match.player.vx, match.player.vy) > 160 && Math.random() < 0.16) {
          renderer.spawnDust(match.player.x, match.player.y);
        }
        if (Math.hypot(match.opponent.vx, match.opponent.vy) > 160 && Math.random() < 0.16) {
          renderer.spawnDust(match.opponent.x, match.opponent.y);
        }

        // Consume simulation events for SFX + particles
        for (const ev of match.events) {
          if (ev.type === 'swing') {
            soundEngine.playSwing();
          } else if (ev.type === 'hit' || ev.type === 'ko') {
            soundEngine.playHit();
            renderer.spawnHitBurst(
              ev.x,
              ev.y,
              ev.dirX,
              ev.dirY,
              ev.comicWord,
              ev.type === 'ko'
            );
          }
        }

        renderer.updateEffects(dt);
        renderer.render(ctx, cssWidth, cssHeight, match, totalTime, false);

        // Update HP bar widths + delayed trailing ghost bar via DOM refs
        const pPct = Math.max(0, (match.player.hp / match.player.maxHp) * 100);
        const oPct = Math.max(0, (match.opponent.hp / match.opponent.maxHp) * 100);
        ghostPlayerHpRef.current += (pPct - ghostPlayerHpRef.current) * Math.min(1, dt * 4.5);
        ghostOpponentHpRef.current += (oPct - ghostOpponentHpRef.current) * Math.min(1, dt * 4.5);

        if (playerHpBarRef.current) playerHpBarRef.current.style.width = `${pPct}%`;
        if (playerGhostBarRef.current) {
          playerGhostBarRef.current.style.width = `${ghostPlayerHpRef.current}%`;
        }
        if (opponentHpBarRef.current) opponentHpBarRef.current.style.width = `${oPct}%`;
        if (opponentGhostBarRef.current) {
          opponentGhostBarRef.current.style.width = `${ghostOpponentHpRef.current}%`;
        }

        if (
          lastHudHpRef.current.player !== match.player.hp ||
          lastHudHpRef.current.opponent !== match.opponent.hp
        ) {
          const playerDamaged = match.player.hp < lastHudHpRef.current.player;
          const opponentDamaged = match.opponent.hp < lastHudHpRef.current.opponent;
          lastHudHpRef.current = {
            player: match.player.hp,
            opponent: match.opponent.hp,
          };
          setHudHp(lastHudHpRef.current);

          if (playerDamaged) {
            setHitPulse((hp) => ({ ...hp, player: true }));
            window.setTimeout(() => setHitPulse((hp) => ({ ...hp, player: false })), 180);
          }
          if (opponentDamaged) {
            setHitPulse((hp) => ({ ...hp, opponent: true }));
            window.setTimeout(() => setHitPulse((hp) => ({ ...hp, opponent: false })), 180);
          }
        }

        if (match.finished && !finishDispatchedRef.current && match.winnerRole) {
          finishDispatchedRef.current = true;
          const winnerId =
            match.winnerRole === 'player'
              ? match.player.characterId
              : match.opponent.characterId;
          const loserId =
            match.winnerRole === 'player'
              ? match.opponent.characterId
              : match.player.characterId;

          if (match.winnerRole === 'player') soundEngine.playVictory();
          else soundEngine.playDefeat();

          onMatchFinishRef.current({
            winnerRole: match.winnerRole,
            winnerCharacterId: winnerId,
            loserCharacterId: loserId,
            victoryPhrase: match.victoryPhrase,
            playerHpRemaining: match.player.hp,
            opponentHpRemaining: match.opponent.hp,
            playerHitsLanded: match.player.hitsLanded,
            durationSeconds: match.elapsedTime,
          });
        }
      } else if (!renderedFrozenState) {
        renderedFrozenState = true;
        renderer.render(ctx, cssWidth, cssHeight, matchRef.current, totalTime, false);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const playerDef = getCharacterById(playerCharacterId);
  const opponentDef = getCharacterById(opponentCharacterId);
  const showArenaShell =
    screenState === 'playing' || screenState === 'paused' || screenState === 'gameover';

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#FBF7EE]">
      {/* Top Combat HUD (hidden on Title & Select) */}
      {showArenaShell && (
        <header className="pointer-events-none z-20 mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-1.5 px-2 pt-2 pb-1 sm:gap-4 sm:px-5 sm:pt-3">
          {/* Player Fighter Bar */}
          <div
            className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl border-2 px-1.5 py-1.5 shadow-[0_3px_0_#1E293B] transition-colors duration-150 sm:gap-3 sm:px-3 sm:py-2 ${
              hitPulse.player
                ? 'border-[#E63946] bg-[#FEE2E2]'
                : 'border-[#1E293B] bg-[#FFFDF7]'
            }`}
          >
            <CharacterPortrait
              characterId={playerDef.id}
              size={40}
              className="h-7 w-7 shrink-0 sm:h-11 sm:w-11"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[11px] font-black text-[#1E293B] sm:text-sm sm:tracking-wide">
                  {playerDef.upperName}
                </span>
                <span
                  aria-label={`${playerDef.name} can puanı`}
                  className="shrink-0 text-[11px] font-black text-[#E63946] tabular-nums sm:text-sm"
                >
                  {hudHp.player}
                </span>
              </div>
              <div className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full border-2 border-[#1E293B] bg-[#E2E8F0] sm:h-3.5">
                <div
                  ref={playerGhostBarRef}
                  className="absolute inset-y-0 left-0 bg-[#FACC15]"
                  style={{ width: '100%' }}
                />
                <div
                  ref={playerHpBarRef}
                  className="relative h-full bg-[#16A34A]"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* Center Controls Cluster */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_3px_0_#1E293B] active:translate-y-0.5 active:shadow-none"
            >
              {muted ? (
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onTogglePause();
              }}
              aria-label={screenState === 'paused' ? 'Devam et' : 'Duraklat'}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FDE68A] text-[#1E293B] shadow-[0_3px_0_#1E293B] active:translate-y-0.5 active:shadow-none"
            >
              {screenState === 'paused' ? (
                <Play className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Pause className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Opponent Fighter Bar */}
          <div
            className={`flex min-w-0 flex-1 flex-row-reverse items-center gap-1.5 rounded-2xl border-2 px-1.5 py-1.5 shadow-[0_3px_0_#1E293B] transition-colors duration-150 sm:gap-3 sm:px-3 sm:py-2 ${
              hitPulse.opponent
                ? 'border-[#E63946] bg-[#FEE2E2]'
                : 'border-[#1E293B] bg-[#FFFDF7]'
            }`}
          >
            <CharacterPortrait
              characterId={opponentDef.id}
              size={40}
              className="h-7 w-7 shrink-0 sm:h-11 sm:w-11"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-row-reverse items-baseline justify-between gap-1">
                <span className="truncate text-[11px] font-black text-[#1E293B] sm:text-sm sm:tracking-wide">
                  {opponentDef.upperName}
                </span>
                <span
                  aria-label={`${opponentDef.name} can puanı`}
                  className="shrink-0 text-[11px] font-black text-[#0284C7] tabular-nums sm:text-sm"
                >
                  {hudHp.opponent}
                </span>
              </div>
              <div className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full border-2 border-[#1E293B] bg-[#E2E8F0] sm:h-3.5">
                <div
                  ref={opponentGhostBarRef}
                  className="absolute inset-y-0 right-0 bg-[#FACC15]"
                  style={{ width: '100%' }}
                />
                <div
                  ref={opponentHpBarRef}
                  className="relative ml-auto h-full bg-[#0284C7]"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Isolated Canvas Mount */}
      <div
        ref={containerRef}
        className="relative min-h-0 w-full flex-1"
      >
        <canvas
          ref={canvasRef}
          data-testid="arena-canvas"
          className="block h-full w-full touch-none"
        />
      </div>

      {/* Bottom Controls Deck (Always shown on Mobile/Tablet, toggleable on Desktop) */}
      {showArenaShell && (
        <footer className="z-20 mx-auto w-full max-w-5xl shrink-0 px-2 pb-2 sm:px-5 sm:pb-3">
          {/* Mobile / Tablet Touch Controls */}
          <div className={showDesktopTouchPad ? 'block' : 'block lg:hidden'}>
            <TouchControls
              onMoveVectorChange={(x, y) => {
                touchMoveRef.current = { x, y };
              }}
              onPunch={() => {
                if (screenStateRef.current === 'playing') {
                  punchQueuedRef.current = true;
                }
              }}
            />
          </div>

          {/* Desktop Hint Strip + Optional Touch Pad Toggle */}
          <div className="hidden items-center justify-between gap-4 px-2 py-1 lg:flex">
            <p className="text-xs font-bold tracking-wide text-[#475569]">
              W A S D / Ok Tuşları: Hareket · Boşluk: Yumruk · Esc / P: Duraklat · M: Ses
            </p>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setShowDesktopTouchPad((v) => !v);
              }}
              className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-[#FFFDF7] px-3 py-1 text-xs font-bold text-[#475569] hover:border-[#1E293B] hover:text-[#1E293B]"
            >
              <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showDesktopTouchPad ? 'Dokunmatik Kontrolleri Gizle' : 'Dokunmatik Kontrolleri Göster'}</span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};
