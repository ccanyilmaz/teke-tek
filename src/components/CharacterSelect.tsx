import React, { useEffect, useState } from 'react';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { CHARACTERS } from '../game/characters';
import type { CharacterId } from '../game/types';
import { CharacterPortrait } from './CharacterPortrait';

interface CharacterSelectProps {
  selectedId: CharacterId;
  muted: boolean;
  onSelectAndProceed: (id: CharacterId) => void;
  onBack: () => void;
  onToggleMute: () => void;
}

export const CharacterSelect: React.FC<CharacterSelectProps> = ({
  selectedId,
  muted,
  onSelectAndProceed,
  onBack,
  onToggleMute,
}) => {
  const [focusedId, setFocusedId] = useState<CharacterId>(selectedId);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSelectAndProceed(focusedId);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        const idx = CHARACTERS.findIndex((c) => c.id === focusedId);
        setFocusedId(CHARACTERS[(idx + 1) % CHARACTERS.length].id);
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        const idx = CHARACTERS.findIndex((c) => c.id === focusedId);
        setFocusedId(
          CHARACTERS[(idx - 1 + CHARACTERS.length) % CHARACTERS.length].id
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedId, onSelectAndProceed]);

  return (
    <div className="relative z-20 flex h-dvh w-full flex-col justify-between overflow-y-auto bg-[#FBF7EE] px-3 pt-[max(0.65rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
      {/* Top Bar */}
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Ana ekrana dön"
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-3.5 py-2 text-sm font-bold text-[#1E293B] shadow-[0_3px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Geri</span>
        </button>

        <h1 className="text-center text-xl font-black tracking-tight text-[#1E293B] sm:text-3xl">
          KARAKTERİNİ SEÇ
        </h1>

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

      {/* 5 Character Cards Grid (clicking a character immediately proceeds to VS screen) */}
      <div className="mx-auto my-auto w-full max-w-5xl py-3">
        <div
          role="list"
          aria-label="Oynanabilir karakterler"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4"
        >
          {CHARACTERS.map((char, index) => {
            const isHighlighted = char.id === focusedId;

            return (
              <button
                key={char.id}
                type="button"
                aria-label={`${char.name} karakterini seç`}
                onMouseEnter={() => setFocusedId(char.id)}
                onClick={() => onSelectAndProceed(char.id)}
                className={`group relative flex cursor-pointer flex-col items-center rounded-2xl border-[3px] p-3 text-center transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E293B] sm:p-4 ${
                  index === 4
                    ? 'col-span-2 mx-auto w-[calc(50%-0.375rem)] sm:col-span-1 sm:w-full'
                    : ''
                } ${
                  isHighlighted
                    ? '-translate-y-1 border-[#1E293B] bg-[#FEF3C7] shadow-[0_6px_0_#1E293B]'
                    : 'border-[#CBD5E1] bg-[#FFFDF7] shadow-[0_3px_0_#CBD5E1] hover:-translate-y-0.5 hover:border-[#64748B]'
                }`}
              >
                <div className="relative">
                  <CharacterPortrait
                    characterId={char.id}
                    size={76}
                    className={`transition-transform duration-150 sm:h-[88px] sm:w-[88px] ${
                      isHighlighted ? 'scale-105' : 'group-hover:scale-105'
                    }`}
                  />
                </div>

                <span className="mt-2.5 text-base font-black text-[#1E293B] sm:text-lg">
                  {char.name}
                </span>

                <span className="mt-0.5 pb-1 text-xs leading-snug font-medium text-[#64748B]">
                  {char.tagline}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto pb-1 text-center">
        <p className="text-xs font-bold text-[#64748B] sm:text-sm">
          Karakterine tıkla, rakibin rastgele belirlensin!
        </p>
      </div>
    </div>
  );
};
