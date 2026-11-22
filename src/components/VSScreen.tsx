import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../game/audio';
import { CHARACTERS, getCharacterById } from '../game/characters';
import type { CharacterId } from '../game/types';
import { CharacterPortrait } from './CharacterPortrait';

interface VSScreenProps {
  playerCharacterId: CharacterId;
  opponentCharacterId: CharacterId;
  muted: boolean;
  onToggleMute: () => void;
  onBackToSelect: () => void;
  onComplete: () => void;
}

export const VSScreen: React.FC<VSScreenProps> = ({
  playerCharacterId,
  opponentCharacterId,
  muted,
  onToggleMute,
  onBackToSelect,
  onComplete,
}) => {
  const playerDef = getCharacterById(playerCharacterId);
  const opponentPool = useMemo(
    () => CHARACTERS.filter((c) => c.id !== playerCharacterId),
    [playerCharacterId]
  );

  const [displayedOpponentId, setDisplayedOpponentId] = useState<CharacterId>(
    opponentPool[0]?.id ?? opponentCharacterId
  );
  const [locked, setLocked] = useState(false);

  // Slot-machine / character roulette animation on the opponent side
  useEffect(() => {
    setLocked(false);
    let cancelled = false;
    let step = 0;
    const totalSteps = 15;
    let timerId = 0;

    const runStep = () => {
      if (cancelled) return;
      step += 1;

      if (step >= totalSteps) {
        setDisplayedOpponentId(opponentCharacterId);
        setLocked(true);
        soundEngine.playRouletteLock();
        return;
      }

      const poolIndex = step % opponentPool.length;
      const nextChar = opponentPool[poolIndex];
      // Ensure final pre-lock tick lands on a different character so lock feels dramatic
      if (step === totalSteps - 1 && nextChar.id === opponentCharacterId) {
        setDisplayedOpponentId(
          opponentPool[(poolIndex + 1) % opponentPool.length].id
        );
      } else {
        setDisplayedOpponentId(nextChar.id);
      }

      const progress = step / totalSteps;
      soundEngine.playRouletteTick(1 - progress * 0.65);

      // Progressive deceleration (fast start -> slow stop)
      const delay = Math.round(55 + progress * progress * 220);
      timerId = window.setTimeout(runStep, delay);
    };

    timerId = window.setTimeout(runStep, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [opponentCharacterId, opponentPool]);

  // Automatically proceed to Weapon Roulette shortly after opponent locks in
  useEffect(() => {
    if (!locked) return;
    const id = window.setTimeout(() => {
      onComplete();
    }, 950);
    return () => window.clearTimeout(id);
  }, [locked, onComplete]);

  const oppDef = getCharacterById(displayedOpponentId);

  return (
    <div className="relative z-20 flex h-dvh w-full flex-col justify-between overflow-y-auto bg-[#FBF7EE] px-4 py-3 sm:px-6 sm:py-6">
      {/* Top Bar */}
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToSelect}
          aria-label="Karakter seçimine dön"
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-3.5 py-2 text-sm font-bold text-[#1E293B] shadow-[0_3px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Geri</span>
        </button>

        <div className="text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-[#E63946]">
            İLK 3 RAUND KAZANIR
          </span>
          <h1 className="text-xl font-black tracking-tight text-[#1E293B] sm:text-3xl">
            RAKİP BELİRLENİYOR
          </h1>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_3px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
        >
          {muted ? (
            <VolumeX className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Volume2 className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Two-Sided VS Face-off */}
      <div className="mx-auto my-auto flex w-full max-w-4xl flex-col items-center justify-center gap-4 py-4 sm:flex-row sm:gap-6">
        {/* Left: Player (Locked) */}
        <div className="flex w-full max-w-[270px] flex-col items-center rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-4 text-center shadow-[0_6px_0_#1E293B] sm:p-6">
          <span className="mb-2 text-xs font-black uppercase tracking-wider text-[#E63946]">
            SENİN DÖVÜŞÇÜN
          </span>
          <CharacterPortrait
            characterId={playerDef.id}
            size={108}
            className="h-24 w-24 sm:h-28 sm:w-28"
          />
          <h2 className="mt-3 text-2xl font-black text-[#1E293B]">
            {playerDef.upperName}
          </h2>
          <p className="mt-1 text-xs font-medium text-[#64748B]">
            {playerDef.tagline}
          </p>
        </div>

        {/* Center VS Emblem */}
        <div className="flex shrink-0 flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#1E293B] bg-[#FACC15] shadow-[0_4px_0_#1E293B] sm:h-20 sm:w-20">
            <span className="text-2xl font-black tracking-tight text-[#1E293B] sm:text-3xl">
              VS
            </span>
          </div>
        </div>

        {/* Right: Opponent Slot Roulette */}
        <div
          className={`flex w-full max-w-[270px] flex-col items-center rounded-3xl border-[3px] p-4 text-center transition-all duration-150 sm:p-6 ${
            locked
              ? 'scale-[1.02] border-[#1E293B] bg-[#E0F2FE] shadow-[0_6px_0_#1E293B]'
              : 'border-[#0284C7] bg-[#FFFDF7] shadow-[0_6px_0_#0284C7]'
          }`}
        >
          <span className="mb-2 text-xs font-black uppercase tracking-wider text-[#0284C7]">
            {locked ? 'RAKİP HAZIR!' : 'RULET DÖNÜYOR...'}
          </span>
          <div className={locked ? 'scale-105 transition-transform' : 'transition-transform'}>
            <CharacterPortrait
              characterId={oppDef.id}
              size={108}
              className="h-24 w-24 sm:h-28 sm:w-28"
            />
          </div>
          <h2 className="mt-3 text-2xl font-black text-[#1E293B]">
            {oppDef.upperName}
          </h2>
          <p className="mt-1 text-xs font-medium text-[#64748B]">
            {oppDef.tagline}
          </p>
        </div>
      </div>

      {/* Bottom Auto-Transition Status */}
      <div className="mx-auto flex min-h-[48px] w-full max-w-sm flex-col items-center justify-center pb-2">
        <p className="text-sm font-bold text-[#64748B]">
          {locked ? 'Silah ruletine geçiliyor...' : 'Rastgele rakip seçiliyor...'}
        </p>
      </div>
    </div>
  );
};
