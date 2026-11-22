import type {
  AchievementBadge,
  MatchSeriesState,
  MatchTitleAward,
  RoundResultRecord,
  WeaponId,
} from './types';

function hasThreeConsecutivePlayerWins(history: readonly RoundResultRecord[]): boolean {
  let streak = 0;
  for (const r of history) {
    if (r.winnerRole === 'player') {
      streak += 1;
      if (streak >= 3) return true;
    } else {
      streak = 0;
    }
  }
  return false;
}

export function evaluateMatchAchievements(series: MatchSeriesState): AchievementBadge[] {
  const badges: AchievementBadge[] = [];

  if (hasThreeConsecutivePlayerWins(series.history)) {
    badges.push({
      id: 'three_streak',
      title: 'Durdurulamaz Seri',
      description: 'Üst üste 3 raund kazandı',
    });
  }

  const wonClutchLowHp = series.history.some(
    (r) => r.winnerRole === 'player' && r.playerHpRemaining > 0 && r.playerHpRemaining <= 20
  );
  if (wonClutchLowHp) {
    badges.push({
      id: 'clutch_low_hp',
      title: 'Kıl Payı Zafer',
      description: '20 ve altı canla raund kazandı',
    });
  }

  if (series.totalSapanHits >= 4) {
    badges.push({
      id: 'sapan_sniper',
      title: 'Keskin Nişancı',
      description: 'Sapanla en az 4 taş isabeti buldu',
    });
  }

  const uniqueWeapons = new Set<WeaponId>(series.weaponsUsed);
  if (uniqueWeapons.size >= 3) {
    badges.push({
      id: 'weapon_collector',
      title: 'Silah Koleksiyoncusu',
      description: 'Maçta 3 farklı silah kullandı',
    });
  }

  const finalRound = series.history[series.history.length - 1];
  if (
    series.winnerRole === 'player' &&
    series.playerWins === 3 &&
    series.opponentWins === 2 &&
    finalRound?.roundNumber === 5
  ) {
    badges.push({
      id: 'decider_hero',
      title: 'Final Kahramanı',
      description: '2-2 eşitlikten son raundu kazandı',
    });
  }

  return badges;
}

export function evaluateMatchTitle(series: MatchSeriesState): MatchTitleAward {
  const playerWonMatch = series.winnerRole === 'player';
  const totalAttempts = Math.max(1, series.totalPlayerAttacks);
  const accuracy = series.totalPlayerHits / totalAttempts;

  const terlikRoundsWon = series.history.filter(
    (r) => r.winnerRole === 'player' && r.playerWeaponId === 'terlik'
  ).length;
  const terlikDamage = series.history
    .filter((r) => r.playerWeaponId === 'terlik')
    .reduce((acc, r) => acc + r.playerDamageDealt, 0);

  const lightsaberRoundsWon = series.history.filter(
    (r) => r.winnerRole === 'player' && r.playerWeaponId === 'isin_kilici'
  ).length;
  const lightsaberDamage = series.history
    .filter((r) => r.playerWeaponId === 'isin_kilici')
    .reduce((acc, r) => acc + r.playerDamageDealt, 0);

  const wonClutchRound = series.history.some(
    (r) => r.winnerRole === 'player' && r.playerHpRemaining > 0 && r.playerHpRemaining <= 20
  );

  // 1. Terlik Ustası
  if (terlikRoundsWon >= 1 && (terlikDamage >= 75 || terlikRoundsWon >= 2)) {
    return {
      title: 'Terlik Ustası',
      reason: 'Terlikle rakiplere unutulmaz şaplaklar indirdi.',
    };
  }

  // 2. Işın Kılıcı Efsanesi
  if (lightsaberRoundsWon >= 1 && (lightsaberDamage >= 85 || lightsaberRoundsWon >= 2)) {
    return {
      title: 'Işın Kılıcı Efsanesi',
      reason: 'Plazma kılıcıyla arenayı aydınlattı.',
    };
  }

  // 3. Son Anda Kurtuldu
  if (
    playerWonMatch &&
    (wonClutchRound || (series.playerWins === 3 && series.opponentWins === 2))
  ) {
    return {
      title: 'Son Anda Kurtuldu',
      reason: 'Nefes kesen anlarda pes etmeyip maçı çevirdi.',
    };
  }

  // 4. Dövüş Makinesi
  if (
    playerWonMatch &&
    (series.opponentWins === 0 || series.maxCombo >= 4 || (accuracy >= 0.55 && series.totalPlayerHits >= 18))
  ) {
    return {
      title: 'Dövüş Makinesi',
      reason: `${series.maxCombo}x kombo ve ${series.totalPlayerHits} isabetle arenayı süpürdü.`,
    };
  }

  // 5. Dayak Uzmanı
  if (!playerWonMatch || series.playerTotalDamageTaken >= 260) {
    return {
      title: 'Dayak Uzmanı',
      reason: `${Math.round(series.playerTotalDamageTaken)} hasara rağmen ayakta kalmayı bildi.`,
    };
  }

  // 6. Şanslı Savaşçı
  return {
    title: 'Şanslı Savaşçı',
    reason: 'Farklı silahlarla akıllıca oynayıp galibiyete ulaştı.',
  };
}
