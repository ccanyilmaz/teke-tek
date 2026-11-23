import { sanitizeNickname, type PlayerSlot } from './protocol';

const SESSION_STORAGE_KEY = 'teketek_online_session_v1';
const ACTIVE_ROOM_STORAGE_KEY = 'teketek_online_active_room_v1';
const NICKNAME_STORAGE_KEY = 'teketek_online_nickname_v1';

export interface OnlineClientSession {
  sessionId: string;
  colo: string;
}

export interface ActiveRoomCredentials {
  roomId: string;
  token: string;
  role: PlayerSlot;
}

export function saveOnlineNickname(raw: string): string {
  const clean = sanitizeNickname(raw, '');
  if (typeof window !== 'undefined' && clean) {
    window.sessionStorage.setItem(NICKNAME_STORAGE_KEY, clean);
  }
  return clean;
}

export function loadOnlineNickname(): string {
  if (typeof window === 'undefined') return '';
  const raw = window.sessionStorage.getItem(NICKNAME_STORAGE_KEY);
  return sanitizeNickname(raw, '');
}

export async function ensureOnlineSession(): Promise<OnlineClientSession> {
  if (typeof window !== 'undefined') {
    const cached = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as OnlineClientSession;
        if (parsed && typeof parsed.sessionId === 'string' && parsed.sessionId.length >= 8) {
          return parsed;
        }
      } catch {
        // Re-fetch session cleanly
      }
    }
  }

  const res = await fetch('/api/online/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Çevrimiçi oturum alınamadı');
  }
  const data = (await res.json()) as OnlineClientSession;
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  }
  return data;
}

export function getCachedOnlineSession(): OnlineClientSession | null {
  if (typeof window === 'undefined') return null;
  const cached = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached) as OnlineClientSession;
    return parsed?.sessionId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveActiveRoomCredentials(creds: ActiveRoomCredentials): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, JSON.stringify(creds));
}

export function loadActiveRoomCredentials(): ActiveRoomCredentials | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(ACTIVE_ROOM_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveRoomCredentials;
    if (
      parsed &&
      typeof parsed.roomId === 'string' &&
      typeof parsed.token === 'string' &&
      (parsed.role === 'player' || parsed.role === 'opponent')
    ) {
      return parsed;
    }
  } catch {
    // Ignore malformed value
  }
  return null;
}

export function clearActiveRoomCredentials(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
}

export function buildWebSocketUrl(pathAndQuery: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${pathAndQuery}`;
}
