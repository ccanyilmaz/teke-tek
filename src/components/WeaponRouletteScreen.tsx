import React, { useEffect, useState } from 'react';
import { RefreshCw, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../game/audio';
import { getCharacterById } from '../game/characters';
import type { CharacterId, WeaponId } from '../game/types';
import {
  getWeaponById,
  pickDifferentWeapon,
  pickFairRandomWeaponPair,
  WEAPONS,
} from '../game/weapons';
import { CharacterPortrait } from './CharacterPortrait';
import { WeaponIcon } from './WeaponIcon';

interface WeaponRouletteScreenProps {
  playerCharacterId: CharacterId;
  opponentCharacterId: CharacterId;
  playerWins: number;
  opponentWins: number;
  currentRound: number;
  isFinalRound: boolean;
  rerollAvailable: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onUseReroll: () => void;
  onComplete: (playerWeaponId: WeaponId, opponentWeaponId: WeaponId) => void;
}

export const WeaponRouletteScreen: React.FC<WeaponRouletteScreenProps> = ({
  playerCharacterId,
  opponentCharacterId,
  playerWins,
  opponentWins,
  currentRound,
  isFinalRound,
  rerollAvailable,
  muted,
  onToggleMute,
  onUseReroll,
  onComplete,
}) => {
  const playerDef = getCharacterById(playerCharacterId);
  const opponentDef = getCharacterById(opponentCharacterId);

  const [phase, setPhase] = useState<'ready' | 'spinning' | 'rerolling' | 'locked'>('ready');
  const [playerDisplayWeapon, setPlayerDisplayWeapon] = useState<WeaponId>('yumruk');
  const [opponentDisplayWeapon, setOpponentDisplayWeapon] = useState<WeaponId>('sopa');
  const [playerLocked, setPlayerLocked] = useState(false);
  const [opponentLocked, setOpponentLocked] = useState(false);
  const [rerollUsedNow, setRerollUsedNow] = useState(false);
  const [finalPair, setFinalPair] = useState<{
    player: WeaponId;
    opponent: WeaponId;
  } | null>(null);

  const startSpin = () => {
    if (phase !== 'ready') return;
    soundEngine.playClick();
    const pair = pickFairRandomWeaponPair(Math.random, true);
    setFinalPair(pair);
    setPlayerLocked(false);
    setOpponentLocked(false);
    setPhase('spinning');
  };

  const handleRerollPlayerWeapon = () => {
    if (phase !== 'locked' || !finalPair || !rerollAvailable || rerollUsedNow) return;
    soundEngine.playClick();
    onUseReroll();
    setRerollUsedNow(true);
    const nextPlayerWeapon = pickDifferentWeapon(finalPair.player).id;
    setFinalPair({ player: nextPlayerWeapon, opponent: finalPair.opponent });
    setPlayerLocked(false);
    setPhase('rerolling');
  };

  // Initial dual-reel spin
  useEffect(() => {
    if (phase !== 'spinning' || !finalPair) return;
    let cancelled = false;
    let pTimer = 0;
    let oTimer = 0;

    let pDone = false;
    let oDone = false;

    const pTotal = isFinalRound ? 18 : 14;
    const oTotal = isFinalRound ? 22 : 17;

    let pStep = 0;
    const tickPlayer = () => {
      if (cancelled) return;
      pStep += 1;
      if (pStep >= pTotal) {
        setPlayerDisplayWeapon(finalPair.player);
        setPlayerLocked(true);
        pDone = true;
        soundEngine.playRouletteLock();
        if (pDone && oDone) setPhase('locked');
        return;
      }
      const w = WEAPONS[(pStep * 3) % WEAPONS.length];
      setPlayerDisplayWeapon(w.id);
      const prog = pStep / pTotal;
      soundEngine.playRouletteTick(1 - prog * 0.5);
      pTimer = window.setTimeout(tickPlayer, Math.round(50 + prog * prog * 195));
    };

    let oStep = 0;
    const tickOpponent = () => {
      if (cancelled) return;
      oStep += 1;
      if (oStep >= oTotal) {
        setOpponentDisplayWeapon(finalPair.opponent);
        setOpponentLocked(true);
        oDone = true;
        soundEngine.playRouletteLock();
        if (pDone && oDone) setPhase('locked');
        return;
      }
      const w = WEAPONS[(oStep * 7 + 2) % WEAPONS.length];
      setOpponentDisplayWeapon(w.id);
      const prog = oStep / oTotal;
      oTimer = window.setTimeout(tickOpponent, Math.round(55 + prog * prog * 210));
    };

    pTimer = window.setTimeout(tickPlayer, 60);
    oTimer = window.setTimeout(tickOpponent, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(pTimer);
      window.clearTimeout(oTimer);
    };
  }, [phase, finalPair, isFinalRound]);

  // Fast 0.65s player-only reroll spin
  useEffect(() => {
    if (phase !== 'rerolling' || !finalPair) return;
    let cancelled = false;
    let step = 0;
    const total = 9;
    let timerId = 0;

    const tick = () => {
      if (cancelled) return;
      step += 1;
      if (step >= total) {
        setPlayerDisplayWeapon(finalPair.player);
        setPlayerLocked(true);
        soundEngine.playRouletteLock();
        setPhase('locked');
        return;
      }
      const w = WEAPONS[(step * 5 + 1) % WEAPONS.length];
      setPlayerDisplayWeapon(w.id);
      soundEngine.playRouletteTick(0.75 - (step / total) * 0.4);
      timerId = window.setTimeout(tick, 55 + step * 10);
    };

    timerId = window.setTimeout(tick, 45);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [phase, finalPair]);

  // Auto-advance cleanly after lock (gives 4.5s if reroll is still available, fast 0.9s otherwise)
  useEffect(() => {
    if (phase !== 'locked' || !finalPair) return;
    const delay = rerollAvailable && !rerollUsedNow ? 4500 : 900;
    const id = window.setTimeout(() => {
      onComplete(finalPair.player, finalPair.opponent);
    }, delay);
    return () => window.clearTimeout(id);
  }, [phase, finalPair, rerollAvailable, rerollUsedNow, onComplete]);

  const pWeapon = getWeaponById(playerDisplayWeapon);
  const oWeapon = getWeaponById(opponentDisplayWeapon);

  return (
    <div className="relative z-20 flex h-dvh w-full flex-col justify-between overflow-y-auto bg-[#FBF7EE] px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
      {/* Top Bar */}
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
        <div className="rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-2.5 py-1 text-xs font-black text-[#1E293B] shadow-[0_3px_0_#1E293B] tabular-nums sm:px-3 sm:py-1.5 sm:text-sm">
          RAUND {currentRound} · {playerWins} - {opponentWins}
        </div>

        <h1 className="text-center text-lg font-black tracking-tight text-[#1E293B] sm:text-3xl">
          SİLAH RULETİ
        </h1>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_3px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:h-11 sm:w-11"
        >
          {muted ? (
            <VolumeX className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Volume2 className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Final Round Dramatic Banner */}
      {isFinalRound && (
        <div className="mx-auto mt-1 rounded-2xl border-[3px] border-[#1E293B] bg-[#FACC15] px-4 py-1 text-center shadow-[0_3px_0_#1E293B] sm:mt-2 sm:py-2">
          <p className="text-xs font-black tracking-wide text-[#1E293B] sm:text-base">
            SON RAUND – KAZANAN BELLİ OLACAK!
          </p>
        </div>
      )}

      {/* Dual Independent Weapon Reels (always 2 columns in landscape) */}
      <div className="mx-auto my-auto grid w-full max-w-4xl grid-cols-2 gap-3 py-1.5 sm:gap-6 sm:py-4">
        {/* Player Weapon Reel */}
        <div
          className={`flex flex-col items-center rounded-3xl border-[3px] p-2.5 text-center transition-colors sm:p-5 ${
            playerLocked
              ? 'border-[#1E293B] bg-[#FEF3C7] shadow-[0_5px_0_#1E293B]'
              : 'border-[#1E293B] bg-[#FFFDF7] shadow-[0_5px_0_#1E293B]'
          }`}
        >
          <div className="flex items-center gap-2">
            <CharacterPortrait characterId={playerDef.id} size={36} className="h-8 w-8 sm:h-10 sm:w-10" />
            <div className="text-left">
              <div className="text-[10px] font-black uppercase tracking-wider text-[#E63946] sm:text-[11px]">
                SENİN SİLAHIN
              </div>
              <div className="text-sm font-black text-[#1E293B] sm:text-base">
                {playerDef.upperName}
              </div>
            </div>
          </div>

          <div className="mt-2 flex min-h-[82px] w-full flex-col items-center justify-center rounded-2xl border-2 border-[#1E293B] bg-[#FFFDF7] px-2.5 py-1.5 shadow-inner sm:mt-3.5 sm:min-h-[122px] sm:px-3 sm:py-2.5">
            <WeaponIcon weaponId={pWeapon.id} size={40} className="h-9 w-9 sm:h-11 sm:w-11" />
            <div className="mt-0.5 text-sm font-black text-[#1E293B] sm:mt-1 sm:text-lg">
              {phase === 'ready' ? '???' : pWeapon.upperName}
            </div>
            <div className="text-[10px] font-bold text-[#64748B] sm:text-xs">
              {phase === 'ready'
                ? 'Rulet bekleniyor'
                : `${pWeapon.tagline} · Hasar: ${
                    pWeapon.damageMin === pWeapon.damageMax
                      ? pWeapon.damageMin
                      : `${pWeapon.damageMin}-${pWeapon.damageMax}`
                  }`}
            </div>
            {phase !== 'ready' && (
              <div className="mt-0.5 text-[10px] font-extrabold text-[#B45309] sm:mt-1 sm:text-[11px]">
                Özel: {pWeapon.specialName}
              </div>
            )}
          </div>
        </div>

        {/* Opponent Weapon Reel */}
        <div
          className={`flex flex-col items-center rounded-3xl border-[3px] p-2.5 text-center transition-colors sm:p-5 ${
            opponentLocked
              ? 'border-[#1E293B] bg-[#E0F2FE] shadow-[0_5px_0_#1E293B]'
              : 'border-[#1E293B] bg-[#FFFDF7] shadow-[0_5px_0_#1E293B]'
          }`}
        >
          <div className="flex items-center gap-2">
            <CharacterPortrait characterId={opponentDef.id} size={36} className="h-8 w-8 sm:h-10 sm:w-10" />
            <div className="text-left">
              <div className="text-[10px] font-black uppercase tracking-wider text-[#0284C7] sm:text-[11px]">
                RAKİP SİLAHI
              </div>
              <div className="text-sm font-black text-[#1E293B] sm:text-base">
                {opponentDef.upperName}
              </div>
            </div>
          </div>

          <div className="mt-2 flex min-h-[82px] w-full flex-col items-center justify-center rounded-2xl border-2 border-[#1E293B] bg-[#FFFDF7] px-2.5 py-1.5 shadow-inner sm:mt-3.5 sm:min-h-[122px] sm:px-3 sm:py-2.5">
            <WeaponIcon weaponId={oWeapon.id} size={40} className="h-9 w-9 sm:h-11 sm:w-11" />
            <div className="mt-0.5 text-sm font-black text-[#1E293B] sm:mt-1 sm:text-lg">
              {phase === 'ready' ? '???' : oWeapon.upperName}
            </div>
            <div className="text-[10px] font-bold text-[#64748B] sm:text-xs">
              {phase === 'ready'
                ? 'Rulet bekleniyor'
                : `${oWeapon.tagline} · Hasar: ${
                    oWeapon.damageMin === oWeapon.damageMax
                      ? oWeapon.damageMin
                      : `${oWeapon.damageMin}-${oWeapon.damageMax}`
                  }`}
            </div>
            {phase !== 'ready' && (
              <div className="mt-0.5 text-[10px] font-extrabold text-[#0369A1] sm:mt-1 sm:text-[11px]">
                Özel: {oWeapon.specialName}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action CTA */}
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-2 pb-1">
        {phase === 'ready' && (
          <button
            type="button"
            data-start="true"
            onClick={startSpin}
            className="min-h-[46px] w-full max-w-sm cursor-pointer rounded-2xl border-[3px] border-[#1E293B] bg-[#E63946] px-6 py-2.5 text-base font-black tracking-wide text-white shadow-[0_5px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1E293B] sm:min-h-[54px] sm:py-3.5 sm:text-lg"
          >
            SİLAHLARI BELİRLE
          </button>
        )}
        {(phase === 'spinning' || phase === 'rerolling') && (
          <p className="py-2 text-sm font-black text-[#1E293B] sm:py-3 sm:text-base">
            {phase === 'rerolling' ? 'Yeni silahın dönüyor...' : 'Silahlar rastgele dönüyor...'}
          </p>
        )}
        {phase === 'locked' && finalPair && (
          <div className="flex w-full flex-row gap-2.5">
            {rerollAvailable && !rerollUsedNow && (
              <button
                type="button"
                onClick={handleRerollPlayerWeapon}
                className="inline-flex min-h-[46px] flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-2xl border-[3px] border-[#1E293B] bg-[#FACC15] px-4 py-2 text-xs font-black tracking-wide text-[#1E293B] shadow-[0_4px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:min-h-[50px] sm:px-5 sm:py-3 sm:text-base"
              >
                <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>SİLAH DEĞİŞTİR (1 HAK)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onComplete(finalPair.player, finalPair.opponent)}
              className="min-h-[46px] flex-1 cursor-pointer rounded-2xl border-[3px] border-[#1E293B] bg-[#16A34A] px-5 py-2 text-sm font-black tracking-wide text-white shadow-[0_4px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:min-h-[50px] sm:px-6 sm:py-3 sm:text-base"
            >
              DÖVÜŞ BAŞLIYOR!
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
