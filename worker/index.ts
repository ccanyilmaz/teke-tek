import type {
  DurableObjectNamespace,
  DurableObjectState,
  ExecutionContext,
  Fetcher,
  Request as CFRequest,
  Response as CFResponse,
  WebSocket as CFWebSocket,
} from '@cloudflare/workers-types';
import { GameRoomCore } from '../src/multiplayer/gameRoomCore';
import { MatchmakingCore } from '../src/multiplayer/matchmakingCore';
import {
  generateOpaqueId,
  isValidOpaqueId,
  parseMatchmakingClientMessage,
  type MatchmakingServerMessage,
  type RoomServerMessage,
} from '../src/multiplayer/protocol';

declare class WebSocketPair {
  0: CFWebSocket;
  1: CFWebSocket;
}

export interface Env {
  ASSETS: Fetcher;
  MATCHMAKING: DurableObjectNamespace;
  GAME_ROOM: DurableObjectNamespace;
}

interface RoomInitPayload {
  roomId: string;
  player1: { sessionId: string; token: string; nickname?: string };
  player2: { sessionId: string; token: string; nickname?: string };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function safeWsSend(ws: CFWebSocket, payload: unknown): void {
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // Socket already closed
  }
}

export class MatchmakingDO {
  private readonly env: Env;
  private readonly core = new MatchmakingCore();
  private readonly sessions = new Map<
    string,
    { ws: CFWebSocket; colo: string; joinedAt: number }
  >();
  private statusTimer: ReturnType<typeof setInterval> | null = null;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

  private ensureStatusTicker(): void {
    if (this.core.size === 0) {
      if (this.statusTimer) {
        clearInterval(this.statusTimer);
        this.statusTimer = null;
      }
      return;
    }
    if (!this.statusTimer) {
      this.statusTimer = setInterval(() => {
        if (this.core.size === 0) {
          if (this.statusTimer) {
            clearInterval(this.statusTimer);
            this.statusTimer = null;
          }
          return;
        }
        const now = Date.now();
        for (const entry of this.core.getAllSessions()) {
          const client = this.sessions.get(entry.sessionId);
          if (client) {
            safeWsSend(client.ws, {
              type: 'QUEUE_STATUS',
              status: 'searching',
              queueSize: this.core.size,
              waitedMs: Math.max(0, now - entry.joinedAtMs),
            } satisfies MatchmakingServerMessage);
          }
        }
      }, 1000);
    }
  }

  private async tryPairPlayers(): Promise<void> {
    let pairing = this.core.popMatch();
    while (pairing) {
      const c1 = this.sessions.get(pairing.player1.sessionId);
      const c2 = this.sessions.get(pairing.player2.sessionId);
      if (!c1 || !c2) {
        // Re-queue whichever socket is still alive
        if (c1) {
          this.core.enqueue(
            pairing.player1.sessionId,
            pairing.player1.colo,
            Date.now(),
            pairing.player1.nickname
          );
        }
        if (c2) {
          this.core.enqueue(
            pairing.player2.sessionId,
            pairing.player2.colo,
            Date.now(),
            pairing.player2.nickname
          );
        }
        pairing = this.core.popMatch();
        continue;
      }

      const roomStub = this.env.GAME_ROOM.get(
        this.env.GAME_ROOM.idFromName(pairing.roomId)
      );
      await roomStub.fetch('https://internal/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomId: pairing.roomId,
          player1: {
            sessionId: pairing.player1.sessionId,
            token: pairing.player1.token,
            nickname: pairing.player1.nickname,
          },
          player2: {
            sessionId: pairing.player2.sessionId,
            token: pairing.player2.token,
            nickname: pairing.player2.nickname,
          },
        } satisfies RoomInitPayload),
      });

      safeWsSend(c1.ws, {
        type: 'MATCH_FOUND',
        roomId: pairing.roomId,
        role: 'player',
        token: pairing.player1.token,
        colo: c1.colo,
      } satisfies MatchmakingServerMessage);

      safeWsSend(c2.ws, {
        type: 'MATCH_FOUND',
        roomId: pairing.roomId,
        role: 'opponent',
        token: pairing.player2.token,
        colo: c2.colo,
      } satisfies MatchmakingServerMessage);

      this.sessions.delete(pairing.player1.sessionId);
      this.sessions.delete(pairing.player2.sessionId);
      pairing = this.core.popMatch();
    }
    this.ensureStatusTicker();
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return jsonResponse({ queueSize: this.core.size });
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const colo = url.searchParams.get('colo') || 'GLOBAL';

    if (!isValidOpaqueId(sessionId)) {
      return jsonResponse({ error: 'Invalid sessionId' }, 400);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const prev = this.sessions.get(sessionId);
    if (prev) {
      this.core.disconnect(sessionId);
      try {
        prev.ws.close(1000, 'Replaced by newer matchmaking socket');
      } catch {
        // Ignore
      }
    }

    const now = Date.now();
    this.sessions.set(sessionId, { ws: server, colo, joinedAt: now });

    safeWsSend(server, {
      type: 'QUEUE_STATUS',
      status: 'idle',
      queueSize: this.core.size,
      waitedMs: 0,
    } satisfies MatchmakingServerMessage);

    server.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      const msg = parseMatchmakingClientMessage(raw);
      if (!msg) {
        safeWsSend(server, {
          type: 'ERROR',
          code: 'INVALID_MESSAGE',
          message: 'Geçersiz eşleşme komutu.',
        } satisfies MatchmakingServerMessage);
        return;
      }

      if (msg.type === 'PING') {
        safeWsSend(server, {
          type: 'PONG',
          ts: msg.ts,
          serverNowMs: Date.now(),
        } satisfies MatchmakingServerMessage);
        return;
      }

      if (msg.type === 'FIND_MATCH') {
        this.core.enqueue(sessionId, colo, Date.now(), msg.nickname ?? '');
        safeWsSend(server, {
          type: 'QUEUE_STATUS',
          status: 'searching',
          queueSize: this.core.size,
          waitedMs: 0,
        } satisfies MatchmakingServerMessage);
        this.ensureStatusTicker();
        void this.tryPairPlayers();
        return;
      }

      if (msg.type === 'CANCEL_MATCH') {
        this.core.cancel(sessionId);
        this.ensureStatusTicker();
        safeWsSend(server, {
          type: 'QUEUE_STATUS',
          status: 'cancelled',
          queueSize: this.core.size,
          waitedMs: 0,
        } satisfies MatchmakingServerMessage);
      }
    });

    const cleanup = () => {
      const current = this.sessions.get(sessionId);
      if (current && current.ws === server) {
        this.sessions.delete(sessionId);
        this.core.disconnect(sessionId);
        this.ensureStatusTicker();
      }
    };

    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, {
      status: 101,
      webSocket: client as unknown as WebSocket,
    } as ResponseInit & { webSocket: WebSocket });
  }
}

export class GameRoomDO {
  private readonly state: DurableObjectState;
  private room: GameRoomCore | null = null;
  private readonly sockets = new Map<string, CFWebSocket>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  private startLoop(): void {
    if (!this.tickTimer) {
      this.tickTimer = setInterval(() => {
        if (!this.room) {
          this.stopLoop();
          return;
        }
        this.room.tick(Date.now());
        if (this.room.isFinished()) {
          this.stopLoop();
        }
      }, 16);
    }
    void this.state.storage.setAlarm(Date.now() + 1000);
  }

  private stopLoop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  async alarm(): Promise<void> {
    if (!this.room) return;
    this.room.tick(Date.now());
    if (!this.room.isFinished()) {
      await this.state.storage.setAlarm(Date.now() + 1000);
    } else {
      this.stopLoop();
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      const payload = (await request.json()) as RoomInitPayload;
      this.room = new GameRoomCore(
        payload.roomId,
        payload.player1,
        payload.player2,
        {
          sendToConn: (connId, msg: RoomServerMessage) => {
            const ws = this.sockets.get(connId);
            if (ws) safeWsSend(ws, msg);
          },
          broadcast: (msg: RoomServerMessage) => {
            for (const ws of this.sockets.values()) {
              safeWsSend(ws, msg);
            }
          },
        },
        Date.now()
      );
      this.startLoop();
      return jsonResponse({ ok: true });
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return jsonResponse({
        initialized: Boolean(this.room),
        phase: this.room?.getPhase() ?? null,
      });
    }

    if (!this.room) {
      return jsonResponse({ error: 'Room not found' }, 404);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const connId = generateOpaqueId(12);
    this.sockets.set(connId, server);

    const sessionId = url.searchParams.get('sessionId');
    const token = url.searchParams.get('token');
    if (isValidOpaqueId(sessionId) && isValidOpaqueId(token)) {
      const joined = this.room.join(connId, sessionId, token, Date.now());
      if (!joined.ok) {
        server.close(4001, joined.code);
        this.sockets.delete(connId);
        return new Response(null, {
          status: 101,
          webSocket: client as unknown as WebSocket,
        } as ResponseInit & { webSocket: WebSocket });
      }
    }

    this.startLoop();

    server.addEventListener('message', (event) => {
      if (!this.room) return;
      const raw = typeof event.data === 'string' ? event.data : '';
      this.room.handleRawMessage(connId, raw, Date.now());
      this.room.tick(Date.now());
    });

    const onDisconnect = () => {
      this.sockets.delete(connId);
      if (this.room) {
        this.room.disconnect(connId, Date.now());
      }
    };

    server.addEventListener('close', onDisconnect);
    server.addEventListener('error', onDisconnect);

    return new Response(null, {
      status: 101,
      webSocket: client as unknown as WebSocket,
    } as ResponseInit & { webSocket: WebSocket });
  }
}

export default {
  async fetch(
    request: CFRequest,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<CFResponse> {
    const url = new URL(request.url);

    if (url.pathname === '/api/online/session' && request.method === 'POST') {
      const colo =
        (request.cf as { colo?: string } | undefined)?.colo || 'GLOBAL';
      return jsonResponse({
        sessionId: `sess_${generateOpaqueId(16)}`,
        colo,
      }) as unknown as CFResponse;
    }

    if (url.pathname === '/api/health') {
      return jsonResponse({ ok: true, runtime: 'cloudflare-workers' }) as unknown as CFResponse;
    }

    if (url.pathname === '/ws/matchmaking') {
      const colo =
        (request.cf as { colo?: string } | undefined)?.colo || 'GLOBAL';
      const forwardUrl = new URL(request.url);
      if (!forwardUrl.searchParams.has('colo')) {
        forwardUrl.searchParams.set('colo', colo);
      }
      const stub = env.MATCHMAKING.get(env.MATCHMAKING.idFromName('global'));
      return (await stub.fetch(
        new Request(forwardUrl.toString(), request as unknown as RequestInit) as unknown as CFRequest
      )) as unknown as CFResponse;
    }

    if (url.pathname.startsWith('/ws/room/')) {
      const roomId = url.pathname.slice('/ws/room/'.length).split('/')[0];
      if (!isValidOpaqueId(roomId)) {
        return jsonResponse({ error: 'Invalid roomId' }, 400) as unknown as CFResponse;
      }
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomId));
      return (await stub.fetch(request)) as unknown as CFResponse;
    }

    return env.ASSETS.fetch(request);
  },
};
