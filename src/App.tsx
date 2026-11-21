/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { BattleArena } from './components/BattleArena';
import { CharacterSelect } from './components/CharacterSelect';
import { GameOverModal, PauseModal } from './components/GameModals';
import { TitleScreen } from './components/TitleScreen';
import { soundEngine } from './game/audio';
import { pickRandomOpponent } from './game/characters';
import { loadLocalStats, recordMatchOutcome, saveLocalStats } from './game/storage';
import type { CharacterId, GameScreenState, LocalStats, MatchSummary } from './game/types';
import { useOnlineStatus } from './hooks/usePWAInstall';

function getInitialAutostart(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

export default function App() {
  const autostart = getInitialAutostart();
  const isOnline = useOnlineStatus();

  const [stats, setStats] = useState<LocalStats>(() => {
    const loaded = loadLocalStats();
    soundEngine.setMuted(loaded.muted);
    return loaded;
  });

  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterId>('turk');
  const [opponentCharacterId, setOpponentCharacterId] = useState<CharacterId>(
    () => pickRandomOpponent('turk').id
  );
  const [screenState, setScreenState] = useState<GameScreenState>(
    autostart ? 'playing' : 'title'
  );
  const [matchSeed, setMatchSeed] = useState<number>(1);
  const [lastSummary, setLastSummary] = useState<MatchSummary | null>(null);

  // Sync game state to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = screenState;
  }, [screenState]);

  const handleToggleMute = useCallback(() => {
    setStats((prev) => {
      const nextMuted = !prev.muted;
      soundEngine.setMuted(nextMuted);
      if (!nextMuted) soundEngine.playClick();
      const next = { ...prev, muted: nextMuted };
      saveLocalStats(next);
      return next;
    });
  }, []);

  const handleGoToSelect = useCallback(() => {
    soundEngine.playClick();
    setScreenState('select');
  }, []);

  const handleSelectCharacter = useCallback((id: CharacterId) => {
    soundEngine.playClick();
    setSelectedCharacterId(id);
  }, []);

  const startFreshMatch = useCallback((playerId: CharacterId) => {
    const opp = pickRandomOpponent(playerId);
    setOpponentCharacterId(opp.id);
    setLastSummary(null);
    setMatchSeed((s) => s + 1);
    setScreenState('playing');
  }, []);

  const handleStartFight = useCallback(() => {
    soundEngine.playClick();
    startFreshMatch(selectedCharacterId);
  }, [selectedCharacterId, startFreshMatch]);

  const handleTogglePause = useCallback(() => {
    soundEngine.playClick();
    setScreenState((prev) =>
      prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev
    );
  }, []);

  const handleMatchFinish = useCallback((summary: MatchSummary) => {
    setLastSummary(summary);
    setStats((prev) =>
      recordMatchOutcome(
        prev,
        summary.winnerCharacterId,
        summary.winnerRole === 'player'
      )
    );
    setScreenState('gameover');
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#FBF7EE] text-[#1E293B]">
      {/* Character Selection Screen */}
      {screenState === 'select' ? (
        <CharacterSelect
          selectedId={selectedCharacterId}
          stats={stats}
          onSelect={handleSelectCharacter}
          onStartMatch={handleStartFight}
          onBack={() => {
            soundEngine.playClick();
            setScreenState('title');
          }}
          onToggleMute={handleToggleMute}
        />
      ) : (
        /* Persistent Canvas Arena (also drives live Title showcase behind TitleScreen) */
        <BattleArena
          screenState={screenState}
          playerCharacterId={selectedCharacterId}
          opponentCharacterId={opponentCharacterId}
          matchSeed={matchSeed}
          muted={stats.muted}
          onToggleMute={handleToggleMute}
          onTogglePause={handleTogglePause}
          onMatchFinish={handleMatchFinish}
        />
      )}

      {/* Title Screen Overlay */}
      {screenState === 'title' && (
        <TitleScreen
          muted={stats.muted}
          onToggleMute={handleToggleMute}
          onStart={handleGoToSelect}
        />
      )}

      {/* Pause Modal */}
      {screenState === 'paused' && (
        <PauseModal
          onResume={() => {
            soundEngine.playClick();
            setScreenState('playing');
          }}
          onRestart={() => {
            soundEngine.playClick();
            startFreshMatch(selectedCharacterId);
          }}
          onCharacterSelect={() => {
            soundEngine.playClick();
            setScreenState('select');
          }}
        />
      )}

      {/* Victory / Defeat Modal */}
      {screenState === 'gameover' && lastSummary && (
        <GameOverModal
          summary={lastSummary}
          onPlayAgain={() => {
            soundEngine.playClick();
            startFreshMatch(selectedCharacterId);
          }}
          onCharacterSelect={() => {
            soundEngine.playClick();
            setScreenState('select');
          }}
        />
      )}

      {/* Subtle Offline Notice */}
      {!isOnline && (
        <div className="pointer-events-none fixed bottom-2 left-2 z-50 rounded-lg border-2 border-[#1E293B] bg-[#FDE68A] px-2.5 py-1 text-xs font-bold text-[#1E293B]">
          Çevrimdışı Mod
        </div>
      )}
    </main>
  );
}
