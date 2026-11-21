import type { CharacterId, LocalStats } from './types';

const STORAGE_KEY = 'absurt_arena_stats_v1';

const DEFAULT_STATS: LocalStats = {
  muted: false,
  winsByCharacter: {
    turk: 0,
    kurt: 0,
    azeri: 0,
    ingiliz: 0,
    fransiz: 0,
  },
  totalMatches: 0,
};

export function loadLocalStats(): LocalStats {
  if (typeof window === 'undefined') return { ...DEFAULT_STATS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw) as Partial<LocalStats>;
    return {
      muted: Boolean(parsed.muted),
      totalMatches: typeof parsed.totalMatches === 'number' ? parsed.totalMatches : 0,
      winsByCharacter: {
        ...DEFAULT_STATS.winsByCharacter,
        ...(parsed.winsByCharacter ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function saveLocalStats(stats: LocalStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function recordMatchOutcome(
  stats: LocalStats,
  winnerId: CharacterId,
  playerWon: boolean
): LocalStats {
  const next: LocalStats = {
    muted: stats.muted,
    totalMatches: stats.totalMatches + 1,
    winsByCharacter: {
      ...stats.winsByCharacter,
      [winnerId]: playerWon
        ? (stats.winsByCharacter[winnerId] ?? 0) + 1
        : stats.winsByCharacter[winnerId] ?? 0,
    },
  };
  saveLocalStats(next);
  return next;
}
