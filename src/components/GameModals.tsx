import React from 'react';
import { motion } from 'motion/react';
import { Award, Crown, Trophy } from 'lucide-react';
import { getCharacterById } from '../game/characters';
import { getDamageStageLabel } from '../game/damageVisuals';
import type { MatchSummary } from '../game/types';
import { getWeaponById } from '../game/weapons';
import { CharacterPortrait } from './CharacterPortrait';
import { WeaponIcon } from './WeaponIcon';

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
  const loserDef = getCharacterById(summary.loserCharacterId);
  const playerWon = summary.winnerRole === 'player';

  const winnerDamageStage = playerWon
    ? summary.playerDamageStage
    : summary.opponentDamageStage;
  const loserDamageStage = playerWon
    ? summary.opponentDamageStage
    : summary.playerDamageStage;

  const winnerRoundScore = playerWon ? summary.playerWins : summary.opponentWins;
  const loserRoundScore = playerWon ? summary.opponentWins : summary.playerWins;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gameover-modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#0F172A]/65 p-3 sm:p-4"
    >
      <div className="my-auto max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-3xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-4 text-center shadow-[0_10px_0_#1E293B] sm:p-6">
        <p className="text-xs font-black uppercase tracking-widest text-[#E63946]">
          {playerWon ? 'TEBRİKLER, ŞAMPİYON SENSİN!' : 'RAKİP BU KEZ GALİP GELDİ!'}
        </p>

        <h2
          id="gameover-modal-title"
          className="mt-1 text-2xl font-black tracking-tight text-[#1E293B] sm:text-3xl"
        >
          MAÇ SONUCU: {summary.playerWins} - {summary.opponentWins}
        </h2>

        {/* Merit-Based Funny Title */}
        <div className="mx-auto mt-3 inline-flex max-w-full flex-col items-center rounded-2xl border-2 border-[#1E293B] bg-[#FEF3C7] px-4 py-2">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#B45309]">
            <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>UNVAN: {summary.titleAward.title}</span>
          </div>
          <p className="mt-0.5 text-xs font-semibold text-[#475569]">
            {summary.titleAward.reason}
          </p>
        </div>

        {/* Winner (Large + Victory Bounce) vs Loser (Beside + Dizzy Wobble), preserving accumulated visual damage */}
        <div className="mt-4 flex items-end justify-center gap-4 sm:gap-7">
          {/* Winner */}
          <div className="flex flex-col items-center">
            <motion.div
              animate={{ y: [0, -8, 0], rotate: [-2, 2, -2] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
              className="relative flex flex-col items-center"
            >
              <Crown
                className="mb-1 h-6 w-6 fill-[#FACC15] text-[#1E293B]"
                aria-hidden="true"
              />
              <CharacterPortrait
                characterId={winnerDef.id}
                size={96}
                damageStage={winnerDamageStage}
                mood="victory"
                className="h-20 w-20 sm:h-24 sm:w-24"
              />
            </motion.div>
            <span className="mt-1.5 text-sm font-black text-[#1E293B] sm:text-base">
              {winnerDef.upperName}
            </span>
            <span className="text-[11px] font-bold text-[#16A34A] tabular-nums">
              {winnerRoundScore} Raund · {getDamageStageLabel(winnerDamageStage)}
            </span>
          </div>

          {/* Loser */}
          <div className="flex flex-col items-center opacity-95">
            <motion.div
              animate={{ rotate: [-6, 4, -6], y: [0, 3, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative flex flex-col items-center"
            >
              <CharacterPortrait
                characterId={loserDef.id}
                size={76}
                damageStage={loserDamageStage}
                mood="defeat"
                className="h-[70px] w-[70px] sm:h-[78px] sm:w-[78px]"
              />
            </motion.div>
            <span className="mt-1.5 text-xs font-black text-[#475569] sm:text-sm">
              {loserDef.upperName}
            </span>
            <span className="text-[11px] font-bold text-[#64748B] tabular-nums">
              {loserRoundScore} Raund · {getDamageStageLabel(loserDamageStage)}
            </span>
          </div>
        </div>

        {/* Full Match Stats Grid */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border-2 border-[#E2D9C5] bg-[#FBF7EE] p-3">
          <div>
            <div className="text-[10px] font-bold uppercase text-[#64748B]">İsabetli Saldırı</div>
            <div className="mt-0.5 text-base font-black text-[#1E293B] tabular-nums sm:text-lg">
              {summary.playerHitsLanded}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-[#64748B]">Kaçırılan</div>
            <div className="mt-0.5 text-base font-black text-[#1E293B] tabular-nums sm:text-lg">
              {summary.playerAttacksMissed}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-[#64748B]">En Yüksek Kombo</div>
            <div className="mt-0.5 text-base font-black text-[#E63946] tabular-nums sm:text-lg">
              {summary.maxCombo}x
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-[#64748B]">Verilen Hasar</div>
            <div className="mt-0.5 text-base font-black text-[#16A34A] tabular-nums sm:text-lg">
              {Math.round(summary.playerDamageDealt)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-[#64748B]">Alınan Hasar</div>
            <div className="mt-0.5 text-base font-black text-[#0284C7] tabular-nums sm:text-lg">
              {Math.round(summary.playerDamageTaken)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-[#64748B]">Kazanılan Raund</div>
            <div className="mt-0.5 text-base font-black text-[#1E293B] tabular-nums sm:text-lg">
              {summary.playerWins}/{summary.totalRoundsPlayed}
            </div>
          </div>
        </div>

        {/* Used Weapons Row */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-[11px] font-extrabold uppercase text-[#64748B]">
            Kullanılan Silahlar:
          </span>
          {summary.weaponsUsed.map((wId) => {
            const wDef = getWeaponById(wId);
            return (
              <span
                key={wId}
                className="inline-flex items-center gap-1 rounded-xl border border-[#CBD5E1] bg-white px-2 py-0.5 text-xs font-bold text-[#1E293B]"
              >
                <WeaponIcon weaponId={wId} size={14} />
                <span>{wDef.name}</span>
              </span>
            );
          })}
        </div>

        {/* Unlocked Achievements */}
        {summary.achievements.length > 0 && (
          <div className="mt-3 rounded-2xl border-2 border-[#FDE68A] bg-[#FEFCE8] p-2.5 text-left">
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#B45309]">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>KAZANILAN BAŞARILAR</span>
            </div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {summary.achievements.map((ach) => (
                <li
                  key={ach.id}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <span className="font-black text-[#1E293B]">{ach.title}</span>
                  <span className="text-[11px] font-medium text-[#64748B]">
                    {ach.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="min-h-[48px] flex-1 cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#E63946] px-4 py-2.5 text-base font-black text-white shadow-[0_4px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            YENİDEN OYNA
          </button>
          <button
            type="button"
            onClick={onCharacterSelect}
            className="min-h-[48px] flex-1 cursor-pointer rounded-xl border-2 border-[#1E293B] bg-[#FDE68A] px-4 py-2.5 text-base font-black text-[#1E293B] shadow-[0_4px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            KARAKTER SEÇİMİNE DÖN
          </button>
        </div>
      </div>
    </div>
  );
};
