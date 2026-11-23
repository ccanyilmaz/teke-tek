import { generateOpaqueId, sanitizeNickname } from './protocol';

export interface QueueEntry {
  sessionId: string;
  colo: string;
  joinedAtMs: number;
  nickname: string;
}

export interface MatchPairingResult {
  roomId: string;
  player1: { sessionId: string; token: string; colo: string; nickname: string };
  player2: { sessionId: string; token: string; colo: string; nickname: string };
}

/**
 * Pure FIFO Matchmaking Queue Core.
 * - Prevents duplicate entries for the same sessionId.
 * - Never matches a session with itself.
 * - Prefers matching players in the same edge region (`colo`) when available,
 *   while falling back immediately to FIFO cross-region pairing so queue times stay fast.
 * - Never creates bot opponents when the queue has fewer than 2 real players.
 */
export class MatchmakingCore {
  private queue: QueueEntry[] = [];

  get size(): number {
    return this.queue.length;
  }

  hasSession(sessionId: string): boolean {
    return this.queue.some((q) => q.sessionId === sessionId);
  }

  getJoinedAt(sessionId: string): number | null {
    const entry = this.queue.find((q) => q.sessionId === sessionId);
    return entry ? entry.joinedAtMs : null;
  }

  getAllSessions(): readonly QueueEntry[] {
    return this.queue;
  }

  enqueue(
    sessionId: string,
    colo = 'GLOBAL',
    nowMs = Date.now(),
    nickname = ''
  ): boolean {
    if (!sessionId) return false;
    const cleanName = sanitizeNickname(nickname, '');
    const existingIdx = this.queue.findIndex((q) => q.sessionId === sessionId);
    if (existingIdx !== -1) {
      // Refresh colo/nickname without creating duplicate entry
      this.queue[existingIdx].colo = colo || this.queue[existingIdx].colo;
      if (cleanName) {
        this.queue[existingIdx].nickname = cleanName;
      }
      return false;
    }
    this.queue.push({
      sessionId,
      colo: colo || 'GLOBAL',
      joinedAtMs: nowMs,
      nickname: cleanName,
    });
    return true;
  }

  cancel(sessionId: string): boolean {
    const before = this.queue.length;
    this.queue = this.queue.filter((q) => q.sessionId !== sessionId);
    return this.queue.length !== before;
  }

  disconnect(sessionId: string): boolean {
    return this.cancel(sessionId);
  }

  /**
   * Attempts to pair the oldest waiting player with the best available partner
   * (same-colo preference first, otherwise earliest waiting distinct session).
   */
  popMatch(): MatchPairingResult | null {
    if (this.queue.length < 2) {
      return null;
    }

    const first = this.queue[0];
    let partnerIndex = -1;

    // Prefer same edge colo when non-generic
    if (first.colo && first.colo !== 'GLOBAL') {
      partnerIndex = this.queue.findIndex(
        (q, idx) => idx > 0 && q.sessionId !== first.sessionId && q.colo === first.colo
      );
    }

    // Fallback to earliest waiting distinct session
    if (partnerIndex === -1) {
      partnerIndex = this.queue.findIndex(
        (q, idx) => idx > 0 && q.sessionId !== first.sessionId
      );
    }

    if (partnerIndex === -1) {
      return null;
    }

    const second = this.queue[partnerIndex];
    this.queue = this.queue.filter(
      (q) => q.sessionId !== first.sessionId && q.sessionId !== second.sessionId
    );

    return {
      roomId: `room_${generateOpaqueId(14)}`,
      player1: {
        sessionId: first.sessionId,
        token: generateOpaqueId(20),
        colo: first.colo,
        nickname: first.nickname || 'Oyuncu 1',
      },
      player2: {
        sessionId: second.sessionId,
        token: generateOpaqueId(20),
        colo: second.colo,
        nickname: second.nickname || 'Oyuncu 2',
      },
    };
  }
}
