import React, { useEffect, useRef, useState } from 'react';
import { Gamepad2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../game/audio';
import { getArenaThemeForRound } from '../game/arenas';
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
  DamageStage,
  GameScreenState,
  MatchState,
  WeaponId,
} from '../game/types';
import { getWeaponById } from '../game/weapons';
import { CharacterPortrait } from './CharacterPortrait';
import { TouchControls } from './TouchControls';
import { WeaponIcon } from './WeaponIcon';

export interface RoundCompletionPayload {
  roundNumber: number;
  winnerRole: 'player' | 'opponent';
  playerTotalDamageTaken: number;
  opponentTotalDamageTaken: number;
  playerHpRemaining: number;
  playerHitsLanded: number;
  playerAttacksAttempted: number;
  playerDamageDealt: number;
  playerSapanHits: number;
  playerMaxCombo: number;
  durationSeconds: number;
}

interface BattleArenaProps {
  screenState: GameScreenState;
  playerCharacterId: CharacterId;
  opponentCharacterId: CharacterId;
  playerWeaponId: WeaponId;
  opponentWeaponId: WeaponId;
  playerWins: number;
  opponentWins: number;
  currentRound: number;
  playerTotalDamageTaken: number;
  opponentTotalDamageTaken: number;
  isFinalRound: boolean;
  matchSeed: number;
  muted: boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onRoundFinish: (payload: RoundCompletionPayload) => void;
}

type IntermissionPhase = 'none' | 'round-winner' | 'new-weapons' | 'final-countdown';

export const BattleArena: React.FC<BattleArenaProps> = ({
  screenState,
  playerCharacterId,
  opponentCharacterId,
  playerWeaponId,
  opponentWeaponId,
  playerWins,
  opponentWins,
  currentRound,
  playerTotalDamageTaken,
  opponentTotalDamageTaken,
  isFinalRound,
  matchSeed,
  muted,
  onToggleMute,
  onTogglePause,
  onRoundFinish,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ArenaRenderer>(new ArenaRenderer());
  const activeBoundsRef = useRef(DEFAULT_ARENA_BOUNDS);

  const screenStateRef = useRef<GameScreenState>(screenState);
  const matchRef = useRef<MatchState>(
    createMatchState(playerCharacterId, opponentCharacterId, activeBoundsRef.current, {
      playerWeaponId,
      opponentWeaponId,
      playerTotalDamageTaken,
      opponentTotalDamageTaken,
      roundNumber: currentRound,
    })
  );
  const titleShowcaseRef = useRef<MatchState>(
    createMatchState('turk', 'fransiz', DEFAULT_ARENA_BOUNDS, {
      playerWeaponId: 'sopa',
      opponentWeaponId: 'terlik',
      roundNumber: 1,
    })
  );

  const keysHeldRef = useRef<Set<string>>(new Set());
  const touchMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchBlockingRef = useRef<boolean>(false);
  const punchQueuedRef = useRef<boolean>(false);
  const specialQueuedRef = useRef<boolean>(false);
  const dodgeQueuedRef = useRef<boolean>(false);
  const roundFinishDispatchedRef = useRef<boolean>(false);

  const playerHpBarRef = useRef<HTMLDivElement | null>(null);
  const playerGhostBarRef = useRef<HTMLDivElement | null>(null);
  const opponentHpBarRef = useRef<HTMLDivElement | null>(null);
  const opponentGhostBarRef = useRef<HTMLDivElement | null>(null);
  const ghostPlayerHpRef = useRef<number>(100);
  const ghostOpponentHpRef = useRef<number>(100);

  const lastHudSnapshotRef = useRef<{
    playerHp: number;
    opponentHp: number;
    playerAmmo: number;
    opponentAmmo: number;
    playerStage: DamageStage;
    opponentStage: DamageStage;
  }>({
    playerHp: 100,
    opponentHp: 100,
    playerAmmo: playerWeaponId === 'sapan' ? 5 : 0,
    opponentAmmo: opponentWeaponId === 'sapan' ? 5 : 0,
    playerStage: 0,
    opponentStage: 0,
  });

  const [hudHp, setHudHp] = useState<{ player: number; opponent: number }>({
    player: 100,
    opponent: 100,
  });
  const [hudAmmo, setHudAmmo] = useState<{ player: number; opponent: number }>({
    player: playerWeaponId === 'sapan' ? 5 : 0,
    opponent: opponentWeaponId === 'sapan' ? 5 : 0,
  });
  const [hudDamageStage, setHudDamageStage] = useState<{
    player: DamageStage;
    opponent: DamageStage;
  }>({
    player: 0,
    opponent: 0,
  });
  const [hitPulse, setHitPulse] = useState<{ player: boolean; opponent: boolean }>({
    player: false,
    opponent: false,
  });
  const [showDesktopTouchPad, setShowDesktopTouchPad] = useState(false);

  // Inter-round automatic transition banner state (Rounds 2..5)
  const [intermissionPhase, setIntermissionPhase] = useState<IntermissionPhase>('none');
  const [intermissionWinnerText, setIntermissionWinnerText] = useState<string>('');
  const [countdownNum, setCountdownNum] = useState<number>(3);
  const intermissionRef = useRef<IntermissionPhase>('none');
  const prevRoundRef = useRef<number>(currentRound);
  const prevMatchSeedRef = useRef<number>(matchSeed);

  const [hudCombat, setHudCombat] = useState<{
    specialCooldownTenths: number;
    dodgeCooldownTenths: number;
    blocking: boolean;
    combo: number;
  }>({
    specialCooldownTenths: 0,
    dodgeCooldownTenths: 0,
    blocking: false,
    combo: 0,
  });

  const lastCombatSnapRef = useRef<{
    specialCooldownTenths: number;
    dodgeCooldownTenths: number;
    blocking: boolean;
    combo: number;
  }>({
    specialCooldownTenths: 0,
    dodgeCooldownTenths: 0,
    blocking: false,
    combo: 0,
  });

  const onRoundFinishRef = useRef(onRoundFinish);
  const onTogglePauseRef = useRef(onTogglePause);
  const onToggleMuteRef = useRef(onToggleMute);

  useEffect(() => {
    onRoundFinishRef.current = onRoundFinish;
    onTogglePauseRef.current = onTogglePause;
    onToggleMuteRef.current = onToggleMute;
  }, [onRoundFinish, onTogglePause, onToggleMute]);

  useEffect(() => {
    screenStateRef.current = screenState;
    if (screenState === 'playing') {
      keysHeldRef.current.clear();
      touchMoveRef.current = { x: 0, y: 0 };
      touchBlockingRef.current = false;
      punchQueuedRef.current = false;
      specialQueuedRef.current = false;
      dodgeQueuedRef.current = false;
    }
  }, [screenState]);

  useEffect(() => {
    intermissionRef.current = intermissionPhase;
  }, [intermissionPhase]);

  // Reset / initialize round state cleanly whenever matchSeed or round changes
  useEffect(() => {
    const isNewMatch = prevMatchSeedRef.current !== matchSeed;
    const isNextRoundInSeries = !isNewMatch && prevRoundRef.current !== currentRound;
    prevMatchSeedRef.current = matchSeed;
    prevRoundRef.current = currentRound;

    const fresh = createMatchState(
      playerCharacterId,
      opponentCharacterId,
      activeBoundsRef.current,
      {
        playerWeaponId,
        opponentWeaponId,
        playerTotalDamageTaken,
        opponentTotalDamageTaken,
        roundNumber: currentRound,
      }
    );
    matchRef.current = fresh;
    roundFinishDispatchedRef.current = false;
    ghostPlayerHpRef.current = 100;
    ghostOpponentHpRef.current = 100;

    lastHudSnapshotRef.current = {
      playerHp: 100,
      opponentHp: 100,
      playerAmmo: fresh.player.ammo,
      opponentAmmo: fresh.opponent.ammo,
      playerStage: fresh.player.damageStage,
      opponentStage: fresh.opponent.damageStage,
    };

    rendererRef.current.resetEffects();
    setHudHp({ player: 100, opponent: 100 });
    setHudAmmo({ player: fresh.player.ammo, opponent: fresh.opponent.ammo });
    setHudDamageStage({
      player: fresh.player.damageStage,
      opponent: fresh.opponent.damageStage,
    });
    setHitPulse({ player: false, opponent: false });

    if (playerHpBarRef.current) playerHpBarRef.current.style.width = '100%';
    if (playerGhostBarRef.current) playerGhostBarRef.current.style.width = '100%';
    if (opponentHpBarRef.current) opponentHpBarRef.current.style.width = '100%';
    if (opponentGhostBarRef.current) opponentGhostBarRef.current.style.width = '100%';

    // Automatic inter-round transition sequence for Rounds 2..5 (no extra button click needed!)
    if (isNextRoundInSeries && screenStateRef.current === 'playing') {
      const timers: number[] = [];
      intermissionRef.current = 'round-winner';
      setIntermissionPhase('round-winner');

      timers.push(
        window.setTimeout(() => {
          intermissionRef.current = 'new-weapons';
          setIntermissionPhase('new-weapons');
          soundEngine.playRouletteLock();
        }, 750)
      );

      if (isFinalRound) {
        timers.push(
          window.setTimeout(() => {
            intermissionRef.current = 'final-countdown';
            setIntermissionPhase('final-countdown');
            setCountdownNum(3);
            soundEngine.playCountdownBeep(false);
          }, 1650)
        );
        timers.push(
          window.setTimeout(() => {
            setCountdownNum(2);
            soundEngine.playCountdownBeep(false);
          }, 2150)
        );
        timers.push(
          window.setTimeout(() => {
            setCountdownNum(1);
            soundEngine.playCountdownBeep(true);
          }, 2650)
        );
        timers.push(
          window.setTimeout(() => {
            intermissionRef.current = 'none';
            setIntermissionPhase('none');
          }, 3150)
        );
      } else {
        timers.push(
          window.setTimeout(() => {
            setCountdownNum(2);
            soundEngine.playCountdownBeep(false);
          }, 1500)
        );
        timers.push(
          window.setTimeout(() => {
            setCountdownNum(1);
            soundEngine.playCountdownBeep(true);
          }, 1900)
        );
        timers.push(
          window.setTimeout(() => {
            intermissionRef.current = 'none';
            setIntermissionPhase('none');
          }, 2300)
        );
      }

      return () => {
        timers.forEach((id) => window.clearTimeout(id));
      };
    } else {
      intermissionRef.current = 'none';
      setIntermissionPhase('none');
    }
  }, [
    playerCharacterId,
    opponentCharacterId,
    playerWeaponId,
    opponentWeaponId,
    currentRound,
    playerTotalDamageTaken,
    opponentTotalDamageTaken,
    isFinalRound,
    matchSeed,
  ]);

  // Unified Keyboard Input & Focus-Loss Hygiene
  useEffect(() => {
    const clearInputs = () => {
      keysHeldRef.current.clear();
      touchMoveRef.current = { x: 0, y: 0 };
      touchBlockingRef.current = false;
      punchQueuedRef.current = false;
      specialQueuedRef.current = false;
      dodgeQueuedRef.current = false;
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

      if (screenStateRef.current !== 'playing' || intermissionRef.current !== 'none') return;

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
      } else if (code === 'Space' && !e.repeat) {
        e.preventDefault();
        punchQueuedRef.current = true;
      } else if ((code === 'KeyE' || code === 'KeyL' || code === 'KeyJ') && !e.repeat) {
        e.preventDefault();
        specialQueuedRef.current = true;
      } else if ((code === 'KeyQ' || code === 'KeyC') && !e.repeat) {
        e.preventDefault();
        dodgeQueuedRef.current = true;
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
            nextBounds,
            {
              playerWeaponId: m.player.weaponId,
              opponentWeaponId: m.opponent.weaponId,
              playerTotalDamageTaken: m.player.totalDamageTaken,
              opponentTotalDamageTaken: m.opponent.totalDamageTaken,
              roundNumber: m.roundNumber,
            }
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
      } else if (state === 'playing' && intermissionRef.current === 'none') {
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
        const specialPressed = specialQueuedRef.current;
        const dodgePressed = dodgeQueuedRef.current;
        const blockHeld =
          touchBlockingRef.current ||
          held.has('ShiftLeft') ||
          held.has('ShiftRight') ||
          held.has('KeyK');

        punchQueuedRef.current = false;
        specialQueuedRef.current = false;
        dodgeQueuedRef.current = false;

        stepMatch(
          match,
          { moveX, moveY, punchPressed, specialPressed, dodgePressed, blockHeld },
          dt
        );

        if (Math.hypot(match.player.vx, match.player.vy) > 160 && Math.random() < 0.16) {
          renderer.spawnDust(match.player.x, match.player.y);
        }
        if (Math.hypot(match.opponent.vx, match.opponent.vy) > 160 && Math.random() < 0.16) {
          renderer.spawnDust(match.opponent.x, match.opponent.y);
        }

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
            renderer.spawnHitBurst(
              ev.x,
              ev.y,
              ev.dirX,
              ev.dirY,
              ev.comicWord,
              ev.type === 'ko',
              ev.weaponId
            );
          }
        }

        renderer.updateEffects(dt);
        renderer.render(ctx, cssWidth, cssHeight, match, totalTime, false);

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

        const prevSnap = lastHudSnapshotRef.current;
        if (
          prevSnap.playerHp !== match.player.hp ||
          prevSnap.opponentHp !== match.opponent.hp
        ) {
          const playerDamaged = match.player.hp < prevSnap.playerHp;
          const opponentDamaged = match.opponent.hp < prevSnap.opponentHp;
          prevSnap.playerHp = match.player.hp;
          prevSnap.opponentHp = match.opponent.hp;
          setHudHp({ player: match.player.hp, opponent: match.opponent.hp });

          if (playerDamaged) {
            setHitPulse((hp) => ({ ...hp, player: true }));
            window.setTimeout(() => setHitPulse((hp) => ({ ...hp, player: false })), 180);
          }
          if (opponentDamaged) {
            setHitPulse((hp) => ({ ...hp, opponent: true }));
            window.setTimeout(() => setHitPulse((hp) => ({ ...hp, opponent: false })), 180);
          }
        }

        if (
          prevSnap.playerAmmo !== match.player.ammo ||
          prevSnap.opponentAmmo !== match.opponent.ammo
        ) {
          prevSnap.playerAmmo = match.player.ammo;
          prevSnap.opponentAmmo = match.opponent.ammo;
          setHudAmmo({ player: match.player.ammo, opponent: match.opponent.ammo });
        }

        if (
          prevSnap.playerStage !== match.player.damageStage ||
          prevSnap.opponentStage !== match.opponent.damageStage
        ) {
          prevSnap.playerStage = match.player.damageStage;
          prevSnap.opponentStage = match.opponent.damageStage;
          setHudDamageStage({
            player: match.player.damageStage,
            opponent: match.opponent.damageStage,
          });
        }

        const specialTenths = Math.ceil(match.player.specialCooldown * 10);
        const dodgeTenths = Math.ceil(match.player.dodgeCooldown * 10);
        const blockingNow = match.player.isBlocking;
        const comboNow = match.player.comboCount;
        const prevC = lastCombatSnapRef.current;
        if (
          prevC.specialCooldownTenths !== specialTenths ||
          prevC.dodgeCooldownTenths !== dodgeTenths ||
          prevC.blocking !== blockingNow ||
          prevC.combo !== comboNow
        ) {
          prevC.specialCooldownTenths = specialTenths;
          prevC.dodgeCooldownTenths = dodgeTenths;
          prevC.blocking = blockingNow;
          prevC.combo = comboNow;
          setHudCombat({
            specialCooldownTenths: specialTenths,
            dodgeCooldownTenths: dodgeTenths,
            blocking: blockingNow,
            combo: comboNow,
          });
        }

        if (match.finished && !roundFinishDispatchedRef.current && match.winnerRole) {
          roundFinishDispatchedRef.current = true;
          const wDef = getCharacterById(
            match.winnerRole === 'player'
              ? match.player.characterId
              : match.opponent.characterId
          );
          setIntermissionWinnerText(wDef.upperName);
          if (match.winnerRole === 'player') soundEngine.playVictory();
          else soundEngine.playDefeat();

          onRoundFinishRef.current({
            roundNumber: prevRoundRef.current,
            winnerRole: match.winnerRole,
            playerTotalDamageTaken: match.player.totalDamageTaken,
            opponentTotalDamageTaken: match.opponent.totalDamageTaken,
            playerHpRemaining: match.player.hp,
            playerHitsLanded: match.player.hitsLanded,
            playerAttacksAttempted: match.player.attacksAttempted,
            playerDamageDealt: match.player.damageDealt,
            playerSapanHits: match.player.sapanHits,
            playerMaxCombo: match.player.maxCombo,
            durationSeconds: match.elapsedTime,
          });
        }
      } else if (!renderedFrozenState || intermissionRef.current !== 'none') {
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
  const playerWeapon = getWeaponById(playerWeaponId);
  const opponentWeapon = getWeaponById(opponentWeaponId);
  const arenaTheme = getArenaThemeForRound(currentRound);

  const playerOutOfStones = playerWeaponId === 'sapan' && hudAmmo.player <= 0;
  const opponentOutOfStones = opponentWeaponId === 'sapan' && hudAmmo.opponent <= 0;

  const showArenaShell =
    screenState === 'playing' || screenState === 'paused' || screenState === 'gameover';

  const touchActionLabel =
    playerWeaponId === 'sapan' && !playerOutOfStones ? 'ATIŞ' : 'SALDIR';

  return (
    <div
      className="relative flex h-dvh w-full flex-col overflow-hidden transition-colors duration-300"
      style={{
        backgroundColor:
          screenState === 'title' ? '#FBF7EE' : arenaTheme.outerCanvasBg,
      }}
    >
      {/* Top Combat HUD: HP + Weapon + Persistent Round Scores */}
      {showArenaShell && (
        <header className="pointer-events-none z-20 mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-1.5 px-2 pt-[max(0.45rem,env(safe-area-inset-top))] pb-1 sm:gap-3 sm:px-5 sm:pt-3">
          {/* Player Fighter Card */}
          <div
            className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl border-2 px-1.5 py-1 shadow-[0_3px_0_#1E293B] transition-colors duration-150 sm:gap-3 sm:px-3 sm:py-2 ${
              hitPulse.player
                ? 'border-[#E63946] bg-[#FEE2E2]'
                : 'border-[#1E293B] bg-[#FFFDF7]'
            }`}
          >
            <CharacterPortrait
              characterId={playerDef.id}
              damageStage={hudDamageStage.player}
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
              <div className="relative mt-0.5 h-2.5 w-full overflow-hidden rounded-full border-2 border-[#1E293B] bg-[#E2E8F0] sm:mt-1 sm:h-3">
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
              <div className="mt-0.5 flex items-center gap-1 text-[10px] font-extrabold text-[#475569] sm:text-xs">
                <WeaponIcon
                  weaponId={playerOutOfStones ? 'yumruk' : playerWeapon.id}
                  size={15}
                  className="shrink-0"
                />
                <span className="truncate">
                  {playerOutOfStones ? 'Yumruk' : playerWeapon.name}
                </span>
                {hudCombat.combo >= 2 && (
                  <span className="ml-1 shrink-0 font-black text-[#E63946] tabular-nums">
                    {hudCombat.combo}x KOMBO
                  </span>
                )}
                {playerWeaponId === 'sapan' ? (
                  <span
                    aria-label={`Sapan taşı ${hudAmmo.player}`}
                    className="ml-auto shrink-0 font-black text-[#B45309] tabular-nums"
                  >
                    {hudAmmo.player}/5
                  </span>
                ) : (
                  <span className="ml-auto hidden shrink-0 text-[10px] font-black text-[#B45309] tabular-nums sm:inline">
                    {hudCombat.specialCooldownTenths === 0
                      ? 'ÖZEL HAZIR'
                      : `${(hudCombat.specialCooldownTenths / 10).toFixed(1)}s`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center Cluster: Persistent Round Score + Mute / Pause */}
          <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-1">
            <div
              aria-label={`Raund skoru ${playerWins} - ${opponentWins}, Raund ${currentRound}`}
              className={`rounded-xl border-2 border-[#1E293B] px-2 py-0.5 text-center shadow-[0_2px_0_#1E293B] ${
                isFinalRound ? 'bg-[#FACC15]' : 'bg-[#FFFDF7]'
              }`}
            >
              <div className="text-xs leading-tight font-black text-[#1E293B] tabular-nums sm:text-sm">
                {playerWins} - {opponentWins}
              </div>
              <div className="text-[9px] leading-none font-extrabold tracking-wider text-[#475569] uppercase">
                {isFinalRound ? 'FİNAL' : `R${currentRound}/5`}
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
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_2px_0_#1E293B] active:translate-y-0.5 active:shadow-none sm:h-10 sm:w-10"
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
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FDE68A] text-[#1E293B] shadow-[0_2px_0_#1E293B] active:translate-y-0.5 active:shadow-none sm:h-10 sm:w-10"
              >
                {screenState === 'paused' ? (
                  <Play className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Pause className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Opponent Fighter Card */}
          <div
            className={`flex min-w-0 flex-1 flex-row-reverse items-center gap-1.5 rounded-2xl border-2 px-1.5 py-1 shadow-[0_3px_0_#1E293B] transition-colors duration-150 sm:gap-3 sm:px-3 sm:py-2 ${
              hitPulse.opponent
                ? 'border-[#E63946] bg-[#FEE2E2]'
                : 'border-[#1E293B] bg-[#FFFDF7]'
            }`}
          >
            <CharacterPortrait
              characterId={opponentDef.id}
              damageStage={hudDamageStage.opponent}
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
              <div className="relative mt-0.5 h-2.5 w-full overflow-hidden rounded-full border-2 border-[#1E293B] bg-[#E2E8F0] sm:mt-1 sm:h-3">
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
              <div className="mt-0.5 flex flex-row-reverse items-center gap-1 text-[10px] font-extrabold text-[#475569] sm:text-xs">
                <WeaponIcon
                  weaponId={opponentOutOfStones ? 'yumruk' : opponentWeapon.id}
                  size={15}
                  className="shrink-0"
                />
                <span className="truncate">
                  {opponentOutOfStones ? 'Yumruk' : opponentWeapon.name}
                </span>
                {opponentWeaponId === 'sapan' && (
                  <span
                    aria-label={`Rakip sapan taşı ${hudAmmo.opponent}`}
                    className="mr-auto shrink-0 font-black text-[#B45309] tabular-nums"
                  >
                    {hudAmmo.opponent}/5
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Isolated Canvas Mount */}
      <div ref={containerRef} className="relative min-h-0 w-full flex-1">
        <canvas
          ref={canvasRef}
          data-testid="arena-canvas"
          className="block h-full w-full touch-none"
        />

        {showArenaShell && intermissionPhase === 'none' && (
          <div className="pointer-events-none absolute top-1.5 left-1/2 z-10 -translate-x-1/2">
            <span
              className="inline-flex items-center gap-1 rounded-full border-2 border-[#1E293B] px-2.5 py-0.5 text-[10px] font-black tracking-wide uppercase shadow-[0_2px_0_#1E293B] sm:text-xs"
              style={{
                backgroundColor: arenaTheme.badgeBg,
                color: arenaTheme.badgeText,
              }}
            >
              {arenaTheme.name}
            </span>
          </div>
        )}

        {/* Automatic Round Transition & Final Round (2-2) Overlays */}
        {showArenaShell && intermissionPhase !== 'none' && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[#0F172A]/45 p-4">
            <div className="w-full max-w-md rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-5 text-center shadow-[0_8px_0_#1E293B]">
              {intermissionPhase === 'round-winner' && (
                <>
                  <p className="text-xs font-black uppercase tracking-widest text-[#E63946]">
                    RAUND {currentRound - 1} TAMAMLANDI
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-[#1E293B]">
                    RAUND KAZANANI: {intermissionWinnerText || 'BERABERE'}
                  </h2>
                  <p className="mt-2 text-lg font-black text-[#0284C7] tabular-nums">
                    SKOR: {playerWins} - {opponentWins}
                  </p>
                </>
              )}

              {(intermissionPhase === 'new-weapons' ||
                intermissionPhase === 'final-countdown') && (
                <>
                  {isFinalRound && (
                    <div className="mb-3 rounded-xl border-2 border-[#1E293B] bg-[#FACC15] px-3 py-1.5 text-xs font-black tracking-wide text-[#1E293B] sm:text-sm">
                      SON RAUND – KAZANAN BELLİ OLACAK!
                    </div>
                  )}
                  <p className="text-xs font-black uppercase tracking-widest text-[#16A34A]">
                    YENİ SİLAHLAR · {arenaTheme.name}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="flex flex-col items-center rounded-2xl border-2 border-[#1E293B] bg-[#FEF3C7] p-2.5">
                      <span className="text-[10px] font-black text-[#E63946]">
                        {playerDef.upperName}
                      </span>
                      <WeaponIcon weaponId={playerWeapon.id} size={34} className="my-1" />
                      <span className="text-xs font-black text-[#1E293B]">
                        {playerWeapon.name}
                      </span>
                    </div>
                    <div className="flex flex-col items-center rounded-2xl border-2 border-[#1E293B] bg-[#E0F2FE] p-2.5">
                      <span className="text-[10px] font-black text-[#0284C7]">
                        {opponentDef.upperName}
                      </span>
                      <WeaponIcon weaponId={opponentWeapon.id} size={34} className="my-1" />
                      <span className="text-xs font-black text-[#1E293B]">
                        {opponentWeapon.name}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-base font-black text-[#1E293B] tabular-nums">
                    {intermissionPhase === 'final-countdown'
                      ? `FİNAL RAUNDU BAŞLIYOR: ${countdownNum}`
                      : `RAUND ${currentRound} BAŞLIYOR...`}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Deck */}
      {showArenaShell && (
        <footer className="z-20 mx-auto w-full max-w-5xl shrink-0 px-1.5 pb-[max(0.55rem,env(safe-area-inset-bottom))] min-[390px]:px-2 sm:px-5 sm:pb-3">
          <div className={showDesktopTouchPad ? 'block' : 'block lg:hidden'}>
            <TouchControls
              actionLabel={touchActionLabel}
              specialReady={hudCombat.specialCooldownTenths === 0}
              specialCooldownSec={hudCombat.specialCooldownTenths / 10}
              dodgeReady={hudCombat.dodgeCooldownTenths === 0}
              dodgeCooldownSec={hudCombat.dodgeCooldownTenths / 10}
              isBlocking={hudCombat.blocking}
              onMoveVectorChange={(x, y) => {
                touchMoveRef.current = { x, y };
              }}
              onPunch={() => {
                if (
                  screenStateRef.current === 'playing' &&
                  intermissionRef.current === 'none'
                ) {
                  punchQueuedRef.current = true;
                }
              }}
              onSpecial={() => {
                if (
                  screenStateRef.current === 'playing' &&
                  intermissionRef.current === 'none'
                ) {
                  specialQueuedRef.current = true;
                }
              }}
              onDodge={() => {
                if (
                  screenStateRef.current === 'playing' &&
                  intermissionRef.current === 'none'
                ) {
                  dodgeQueuedRef.current = true;
                }
              }}
              onBlockChange={(blocking) => {
                touchBlockingRef.current = blocking;
              }}
            />
          </div>

          <div className="hidden items-center justify-between gap-4 px-2 py-1 lg:flex">
            <p className="rounded-full border border-[#1E293B]/25 bg-[#FFFDF7]/92 px-3 py-1 text-xs font-bold tracking-wide text-[#1E293B] shadow-[0_2px_0_rgba(30,41,59,0.2)]">
              WASD/Ok: Hareket · Boşluk: Saldır · E: Özel · Q: Kaçın · Shift: Blok · Esc: Duraklat
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
              <span>
                {showDesktopTouchPad
                  ? 'Dokunmatik Kontrolleri Gizle'
                  : 'Dokunmatik Kontrolleri Göster'}
              </span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};
