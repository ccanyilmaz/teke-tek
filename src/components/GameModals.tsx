import React from 'react';
import { getCharacterById } from '../game/characters';
import type { MatchSummary } from '../game/types';
import { CharacterPortrait } from './CharacterPortrait';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onCharacterSelect: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onCharacterSelect,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0F172A]/55 p-4"
    >
      <div className="w-full max-w-sm rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-6 text-center shadow-[0_8px_0_#1E293B]">
        <h2 id="pause-modal-title" className="text-2xl font-black text-[#1E293B]">
          DURAKLATILDI
        </h2>
        <p className="mt-1.5 text-sm font-medium text-[#64748B]">
          Kısa bir nefes molası.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onResume}
            className="min-h-[48px] w-full cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#E63946] px-4 py-2.5 text-base font-black text-white shadow-[0_4px_0_#1E293B] active:translate-y-0.5 active:shadow-none"
          >
            DEVAM ET
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[48px] w-full cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#FDE68A] px-4 py-2.5 text-base font-black text-[#1E293B] shadow-[0_4px_0_#1E293B] active:translate-y-0.5 active:shadow-none"
          >
            YENİDEN BAŞLA
          </button>
          <button
            type="button"
            onClick={onCharacterSelect}
            className="min-h-[48px] w-full cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-4 py-2.5 text-base font-bold text-[#1E293B] shadow-[0_3px_0_#1E293B] active:translate-y-0.5 active:shadow-none"
          >
            KARAKTER SEÇ
          </button>
        </div>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  summary: MatchSummary;
  onPlayAgain: () => void;
  onCharacterSelect: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  summary,
  onPlayAgain,
  onCharacterSelect,
}) => {
  const winnerDef = getCharacterById(summary.winnerCharacterId);
  const playerWon = summary.winnerRole === 'player';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gameover-modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0F172A]/60 p-4"
    >
      <div className="w-full max-w-md rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-6 text-center shadow-[0_10px_0_#1E293B] sm:p-7">
        <div className="mx-auto flex justify-center">
          <CharacterPortrait characterId={winnerDef.id} size={88} />
        </div>

        <p className="mt-3 text-xs font-extrabold uppercase tracking-wider text-[#64748B]">
          {playerWon ? 'Tebrikler, Kazandın' : 'Bu Turda Rakip Üstün Geldi'}
        </p>

        <h2
          id="gameover-modal-title"
          className="mt-1 text-2xl font-black tracking-tight text-[#1E293B] sm:text-3xl"
        >
          {summary.victoryPhrase}
        </h2>

        {/* Compact tabular-nums match stats */}
        <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border-2 border-[#E2D9C5] bg-[#FBF7EE] p-3">
          <div>
            <div className="text-[11px] font-bold uppercase text-[#64748B]">Senin Canın</div>
            <div className="mt-0.5 text-lg font-black text-[#1E293B] tabular-nums">
              {Math.round(summary.playerHpRemaining)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase text-[#64748B]">İsabet</div>
            <div className="mt-0.5 text-lg font-black text-[#1E293B] tabular-nums">
              {summary.playerHitsLanded}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase text-[#64748B]">Süre</div>
            <div className="mt-0.5 text-lg font-black text-[#1E293B] tabular-nums">
              {Math.round(summary.durationSeconds)} sn
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="min-h-[50px] flex-1 cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#E63946] px-4 py-3 text-base font-black text-white shadow-[0_4px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            YENİDEN OYNA
          </button>
          <button
            type="button"
            onClick={onCharacterSelect}
            className="min-h-[50px] flex-1 cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#FDE68A] px-4 py-3 text-base font-black text-[#1E293B] shadow-[0_4px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            KARAKTER SEÇ
          </button>
        </div>
      </div>
    </div>
  );
};
