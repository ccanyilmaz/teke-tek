import { computeDamageStage } from './damageVisuals';
import type {
  CharacterId,
  MatchSeriesState,
  WeaponId,
} from './types';
import { pickFairRandomWeaponPair } from './weapons';

export const ROUNDS_TO_WIN = 3;
export const MAX_ROUNDS = 5;

export function createMatchSeries(
  playerCharacterId: CharacterId,
  opponentCharacterId: CharacterId,
  playerWeaponId: WeaponId = 'yumruk',
  opponentWeaponId: WeaponId = 'yumruk'
): MatchSeriesState {
  return {
    playerCharacterId,
    opponentCharacterId,
    playerWins: 0,
    opponentWins: 0,
    currentRound: 1,
    playerWeaponId,
    opponentWeaponId,
    rerollUsed: false,
    playerTotalDamageTaken: 0,
    opponentTotalDamageTaken: 0,
    playerDamageStage: 0,
    opponentDamageStage: 0,
    totalPlayerHits: 0,
    totalPlayerAttacks: 0,
    totalPlayerDamageDealt: 0,
    totalSapanHits: 0,
    maxCombo: 0,
    weaponsUsed: [playerWeaponId],
    totalDurationSeconds: 0,
    history: [],
    winnerRole: null,
  };
}

export function isFinalDeciderRound(
  series: Pick<MatchSeriesState, 'playerWins' | 'opponentWins'>
): boolean {
  return (
    series.playerWins === ROUNDS_TO_WIN - 1 &&
    series.opponentWins === ROUNDS_TO_WIN - 1
  );
}

export function applyRoundOutcome(
  series: MatchSeriesState,
  roundNumber: number,
  winnerRole: 'player' | 'opponent',
  stats: {
    playerTotalDamageTaken: number;
    opponentTotalDamageTaken: number;
    playerHpRemaining?: number;
    playerHitsLanded: number;
    playerAttacksAttempted?: number;
    playerDamageDealt?: number;
    playerSapanHits?: number;
    playerMaxCombo?: number;
    durationSeconds: number;
  },
  rng: () => number = Math.random
): MatchSeriesState {
  // Guard against double-recording the same round
  if (
    series.winnerRole !== null ||
    series.history.some((r) => r.roundNumber === roundNumber)
  ) {
    return series;
  }

  const nextPlayerWins =
    winnerRole === 'player' ? series.playerWins + 1 : series.playerWins;
  const nextOpponentWins =
    winnerRole === 'opponent' ? series.opponentWins + 1 : series.opponentWins;

  const seriesWinner: 'player' | 'opponent' | null =
    nextPlayerWins >= ROUNDS_TO_WIN
      ? 'player'
      : nextOpponentWins >= ROUNDS_TO_WIN
      ? 'opponent'
      : null;

  const nextPlayerDamage = Math.max(
    series.playerTotalDamageTaken,
    stats.playerTotalDamageTaken
  );
  const nextOpponentDamage = Math.max(
    series.opponentTotalDamageTaken,
    stats.opponentTotalDamageTaken
  );

  const playerDamageInRound = Math.max(
    0,
    nextPlayerDamage - series.playerTotalDamageTaken
  );

  // Assign independent fair random weapons for the upcoming round if match continues
  const nextPair =
    seriesWinner === null
      ? pickFairRandomWeaponPair(rng, true)
      : { player: series.playerWeaponId, opponent: series.opponentWeaponId };

  const updatedWeaponsUsed = series.weaponsUsed.includes(series.playerWeaponId)
    ? series.weaponsUsed
    : [...series.weaponsUsed, series.playerWeaponId];

  const nextWeaponsUsed =
    seriesWinner === null && !updatedWeaponsUsed.includes(nextPair.player)
      ? [...updatedWeaponsUsed, nextPair.player]
      : updatedWeaponsUsed;

  const attacksAttempted =
    stats.playerAttacksAttempted ?? stats.playerHitsLanded;
  const damageDealt = stats.playerDamageDealt ?? 0;
  const sapanHits = stats.playerSapanHits ?? 0;
  const roundMaxCombo = stats.playerMaxCombo ?? 0;
  const playerHpRemaining =
    stats.playerHpRemaining ?? (winnerRole === 'player' ? 50 : 0);

  return {
    ...series,
    playerWins: nextPlayerWins,
    opponentWins: nextOpponentWins,
    currentRound:
      seriesWinner === null
        ? Math.min(MAX_ROUNDS, series.currentRound + 1)
        : series.currentRound,
    playerWeaponId: nextPair.player,
    opponentWeaponId: nextPair.opponent,
    playerTotalDamageTaken: nextPlayerDamage,
    opponentTotalDamageTaken: nextOpponentDamage,
    playerDamageStage: computeDamageStage(nextPlayerDamage),
    opponentDamageStage: computeDamageStage(nextOpponentDamage),
    totalPlayerHits: series.totalPlayerHits + stats.playerHitsLanded,
    totalPlayerAttacks: series.totalPlayerAttacks + attacksAttempted,
    totalPlayerDamageDealt: series.totalPlayerDamageDealt + damageDealt,
    totalSapanHits: series.totalSapanHits + sapanHits,
    maxCombo: Math.max(series.maxCombo, roundMaxCombo),
    weaponsUsed: nextWeaponsUsed,
    totalDurationSeconds: series.totalDurationSeconds + stats.durationSeconds,
    history: [
      ...series.history,
      {
        roundNumber,
        winnerRole,
        playerWeaponId: series.playerWeaponId,
        opponentWeaponId: series.opponentWeaponId,
        playerHpRemaining,
        playerHitsLanded: stats.playerHitsLanded,
        playerAttacksAttempted: attacksAttempted,
        playerDamageDealt: damageDealt,
        playerDamageTakenInRound: playerDamageInRound,
        playerSapanHits: sapanHits,
        playerMaxCombo: roundMaxCombo,
        durationSeconds: stats.durationSeconds,
      },
    ],
    winnerRole: seriesWinner,
  };
}
