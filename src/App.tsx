/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState, useEffect } from 'react';
import { BattleArena, type RoundCompletionPayload } from './components/BattleArena';
import { CharacterSelect } from './components/CharacterSelect';
import { GameOverModal, PauseModal } from './components/GameModals';
import { OnlineExperience } from './components/OnlineExperience';
import {
  OrientationGuard,
  tryLockLandscapeOrientation,
} from './components/OrientationGuard';
import { TitleScreen } from './components/TitleScreen';
import { VSScreen } from './components/VSScreen';
import { WeaponRouletteScreen } from './components/WeaponRouletteScreen';
import {
  type ActiveRoomCredentials,
  loadActiveRoomCredentials,
} from './multiplayer/client';
import { soundEngine } from './game/audio';
import {
  evaluateMatchAchievements,
  evaluateMatchTitle,
} from './game/awards';
import { getCharacterById, pickRandomOpponent } from './game/characters';
import {
  applyRoundOutcome,
  createMatchSeries,
  isFinalDeciderRound,
} from './game/rounds';
import { loadMutedPreference, saveMutedPreference } from './game/storage';
import type {
  CharacterId,
  GameScreenState,
  MatchSeriesState,
  MatchSummary,
  WeaponId,
} from './game/types';
import { pickRandomWeapon } from './game/weapons';
import { useOnlineStatus } from './hooks/usePWAInstall';

function getInitialAutostart(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

function getInitialAutostartRound(): number {
  if (typeof window === 'undefined') return 1;
  const raw = Number(new URLSearchParams(window.location.search).get('round'));
  if (!Number.isFinite(raw) || raw < 1 || raw > 5) return 1;
  return Math.floor(raw);
}

export default function App() {
  const autostart = getInitialAutostart();
  const isOnline = useOnlineStatus();

  const [muted, setMuted] = useState<boolean>(() => {
    const loadedMuted = loadMutedPreference();
    soundEngine.setMuted(loadedMuted);
    return loadedMuted;
  });

  const [series, setSeries] = useState<MatchSeriesState>(() => {
    const opp = pickRandomOpponent('turk').id;
    const base = createMatchSeries(
      'turk',
      opp,
      autostart ? pickRandomWeapon().id : 'yumruk',
      autostart ? pickRandomWeapon().id : 'yumruk'
    );
    if (!autostart) return base;
    const startRound = getInitialAutostartRound();
    return {
      ...base,
      currentRound: startRound,
      playerWins: startRound === 5 ? 2 : 0,
      opponentWins: startRound === 5 ? 2 : 0,
    };
  });

  const [initialActiveRoom, setInitialActiveRoom] = useState<ActiveRoomCredentials | null>(
    () => (autostart ? null : loadActiveRoomCredentials())
  );
  const [mode, setMode] = useState<'single' | 'online'>(() =>
    !autostart && loadActiveRoomCredentials() ? 'online' : 'single'
  );

  const [screenState, setScreenState] = useState<GameScreenState>(
    autostart ? 'playing' : 'title'
  );
  const [matchSeed, setMatchSeed] = useState<number>(1);
  const [lastSummary, setLastSummary] = useState<MatchSummary | null>(null);

  useEffect(() => {
    if (mode === 'single') {
      document.body.dataset.state = screenState;
    }
  }, [mode, screenState]);

  const handleToggleMute = useCallback(() => {
    setMuted((prevMuted) => {
      const nextMuted = !prevMuted;
      soundEngine.setMuted(nextMuted);
      if (!nextMuted) soundEngine.playClick();
      saveMutedPreference(nextMuted);
      return nextMuted;
    });
  }, []);

  const handleGoToSelect = useCallback(() => {
    soundEngine.playClick();
    tryLockLandscapeOrientation();
    setMode('single');
    setScreenState('select');
  }, []);

  const handleGoOnline = useCallback(() => {
    soundEngine.playClick();
    tryLockLandscapeOrientation();
    setInitialActiveRoom(loadActiveRoomCredentials());
    setMode('online');
  }, []);

  const handleExitOnlineToMenu = useCallback(() => {
    setInitialActiveRoom(null);
    setMode('single');
    setScreenState('title');
  }, []);

  // Clicking a character immediately picks random opponent & enters VS Screen
  const handleSelectCharacterAndProceed = useCallback((id: CharacterId) => {
    soundEngine.playClick();
    const opp = pickRandomOpponent(id);
    setSeries(createMatchSeries(id, opp.id));
    setLastSummary(null);
    setScreenState('vs');
  }, []);

  const handleVSComplete = useCallback(() => {
    setScreenState('weapon-roulette');
  }, []);

  const handleUseReroll = useCallback(() => {
    setSeries((prev) => ({
      ...prev,
      rerollUsed: true,
    }));
  }, []);

  const handleWeaponRouletteComplete = useCallback(
    (playerWeaponId: WeaponId, opponentWeaponId: WeaponId) => {
      setSeries((prev) => ({
        ...prev,
        playerWeaponId,
        opponentWeaponId,
        weaponsUsed: prev.weaponsUsed.includes(playerWeaponId)
          ? prev.weaponsUsed
          : [...prev.weaponsUsed, playerWeaponId],
      }));
      setMatchSeed((s) => s + 1);
      setScreenState('playing');
    },
    []
  );

  const restartCurrentMatchToRoulette = useCallback(() => {
    setSeries((prev) => {
      const opp = pickRandomOpponent(prev.playerCharacterId);
      return createMatchSeries(prev.playerCharacterId, opp.id);
    });
    setLastSummary(null);
    setMatchSeed((s) => s + 1);
    setScreenState('vs');
  }, []);

  const handleTogglePause = useCallback(() => {
    soundEngine.playClick();
    setScreenState((prev) =>
      prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev
    );
  }, []);

  const handleRoundFinish = useCallback((payload: RoundCompletionPayload) => {
    setSeries((prev) => {
      const next = applyRoundOutcome(prev, payload.roundNumber, payload.winnerRole, {
        playerTotalDamageTaken: payload.playerTotalDamageTaken,
        opponentTotalDamageTaken: payload.opponentTotalDamageTaken,
        playerHpRemaining: payload.playerHpRemaining,
        playerHitsLanded: payload.playerHitsLanded,
        playerAttacksAttempted: payload.playerAttacksAttempted,
        playerDamageDealt: payload.playerDamageDealt,
        playerSapanHits: payload.playerSapanHits,
        playerMaxCombo: payload.playerMaxCombo,
        durationSeconds: payload.durationSeconds,
      });

      if (next.winnerRole !== null) {
        const winnerCharId =
          next.winnerRole === 'player'
            ? next.playerCharacterId
            : next.opponentCharacterId;
        const loserCharId =
          next.winnerRole === 'player'
            ? next.opponentCharacterId
            : next.playerCharacterId;
        const winnerDef = getCharacterById(winnerCharId);

        setLastSummary({
          winnerRole: next.winnerRole,
          winnerCharacterId: winnerCharId,
          loserCharacterId: loserCharId,
          playerCharacterId: next.playerCharacterId,
          opponentCharacterId: next.opponentCharacterId,
          playerWins: next.playerWins,
          opponentWins: next.opponentWins,
          totalRoundsPlayed: next.history.length,
          playerDamageStage: next.playerDamageStage,
          opponentDamageStage: next.opponentDamageStage,
          victoryPhrase: `ŞAMPİYON: ${winnerDef.upperName}`,
          playerHitsLanded: next.totalPlayerHits,
          playerAttacksMissed: Math.max(
            0,
            next.totalPlayerAttacks - next.totalPlayerHits
          ),
          playerDamageDealt: next.totalPlayerDamageDealt,
          playerDamageTaken: next.playerTotalDamageTaken,
          weaponsUsed: next.weaponsUsed,
          maxCombo: next.maxCombo,
          durationSeconds: next.totalDurationSeconds,
          titleAward: evaluateMatchTitle(next),
          achievements: evaluateMatchAchievements(next),
        });

        setScreenState('gameover');
      }

      return next;
    });
  }, []);

  const showBattleArena =
    screenState === 'title' ||
    screenState === 'playing' ||
    screenState === 'paused' ||
    screenState === 'gameover';

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#FBF7EE] text-[#1E293B]">
      {mode === 'online' ? (
        <OnlineExperience
          muted={muted}
          onToggleMute={handleToggleMute}
          onExitToMenu={handleExitOnlineToMenu}
          initialActiveRoom={initialActiveRoom}
        />
      ) : (
        <>
          {screenState === 'select' && (
            <CharacterSelect
              selectedId={series.playerCharacterId}
              muted={muted}
              onSelectAndProceed={handleSelectCharacterAndProceed}
              onBack={() => {
                soundEngine.playClick();
                setScreenState('title');
              }}
              onToggleMute={handleToggleMute}
            />
          )}

          {screenState === 'vs' && (
            <VSScreen
              playerCharacterId={series.playerCharacterId}
              opponentCharacterId={series.opponentCharacterId}
              muted={muted}
              onToggleMute={handleToggleMute}
              onBackToSelect={() => {
                soundEngine.playClick();
                setScreenState('select');
              }}
              onComplete={handleVSComplete}
            />
          )}

          {screenState === 'weapon-roulette' && (
            <WeaponRouletteScreen
              playerCharacterId={series.playerCharacterId}
              opponentCharacterId={series.opponentCharacterId}
              playerWins={series.playerWins}
              opponentWins={series.opponentWins}
              currentRound={series.currentRound}
              isFinalRound={isFinalDeciderRound(series)}
              rerollAvailable={!series.rerollUsed}
              muted={muted}
              onToggleMute={handleToggleMute}
              onUseReroll={handleUseReroll}
              onComplete={handleWeaponRouletteComplete}
            />
          )}

          {showBattleArena && (
            <BattleArena
              screenState={screenState}
              playerCharacterId={series.playerCharacterId}
              opponentCharacterId={series.opponentCharacterId}
              playerWeaponId={series.playerWeaponId}
              opponentWeaponId={series.opponentWeaponId}
              playerWins={series.playerWins}
              opponentWins={series.opponentWins}
              currentRound={series.currentRound}
              playerTotalDamageTaken={series.playerTotalDamageTaken}
              opponentTotalDamageTaken={series.opponentTotalDamageTaken}
              isFinalRound={isFinalDeciderRound(series)}
              matchSeed={matchSeed}
              muted={muted}
              onToggleMute={handleToggleMute}
              onTogglePause={handleTogglePause}
              onRoundFinish={handleRoundFinish}
            />
          )}

          {screenState === 'title' && (
            <TitleScreen
              muted={muted}
              onToggleMute={handleToggleMute}
              onStartSingle={handleGoToSelect}
              onStartOnline={handleGoOnline}
            />
          )}

          {screenState === 'paused' && (
            <PauseModal
              onResume={() => {
                soundEngine.playClick();
                setScreenState('playing');
              }}
              onRestart={() => {
                soundEngine.playClick();
                restartCurrentMatchToRoulette();
              }}
              onCharacterSelect={() => {
                soundEngine.playClick();
                setScreenState('select');
              }}
            />
          )}

          {screenState === 'gameover' && lastSummary && (
            <GameOverModal
              summary={lastSummary}
              onPlayAgain={() => {
                soundEngine.playClick();
                restartCurrentMatchToRoulette();
              }}
              onCharacterSelect={() => {
                soundEngine.playClick();
                setScreenState('select');
              }}
            />
          )}
        </>
      )}

      {!isOnline && (
        <div className="pointer-events-none fixed bottom-2 left-2 z-50 rounded-lg border-2 border-[#1E293B] bg-[#FDE68A] px-2.5 py-1 text-xs font-bold text-[#1E293B]">
          Çevrimdışı Mod
        </div>
      )}

      <OrientationGuard />
    </main>
  );
}
