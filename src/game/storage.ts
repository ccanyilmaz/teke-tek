const AUDIO_STORAGE_KEY = 'teke_tek_audio_v1';
const LEGACY_STORAGE_KEY = 'absurt_arena_stats_v1';

export function loadMutedPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(AUDIO_STORAGE_KEY);
    if (raw !== null) {
      return raw === '1';
    }
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as { muted?: unknown };
      const muted = Boolean(parsed.muted);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.localStorage.setItem(AUDIO_STORAGE_KEY, muted ? '1' : '0');
      return muted;
    }
    return false;
  } catch {
    return false;
  }
}

export function saveMutedPreference(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUDIO_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage quota or private browsing errors
  }
}
