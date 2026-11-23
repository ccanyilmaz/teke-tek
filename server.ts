import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import { GameRoomCore } from './src/multiplayer/gameRoomCore';
import { MatchmakingCore } from './src/multiplayer/matchmakingCore';
import {
  generateOpaqueId,
  isValidOpaqueId,
  ONLINE_CONSTANTS,
  parseMatchmakingClientMessage,
  type MatchmakingServerMessage,
  type RoomServerMessage,
} from './src/multiplayer/protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  const matchmaking = new MatchmakingCore();
  const matchmakingClients = new Map<
    string,
    { ws: WebSocket; colo: string; joinedAt: number }
  >();

  const rooms = new Map<
    string,
    {
      core: GameRoomCore;
      sockets: Map<string, WebSocket>;
      finishedAtMs: number | null;
    }
  >();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, queueSize: matchmaking.size, activeRooms: rooms.size });
  });

  app.post('/api/online/session', (_req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.json({
      sessionId: `sess_${generateOpaqueId(16)}`,
      colo: 'LOCAL',
    });
  });

  if (isProd) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: ONLINE_CONSTANTS.maxWsMessageBytes,
  });

  function tryPairMatchmaking(): void {
    let pairing = matchmaking.popMatch();
    while (pairing) {
      const c1 = matchmakingClients.get(pairing.player1.sessionId);
      const c2 = matchmakingClients.get(pairing.player2.sessionId);

      if (!c1 || !c2) {
        if (c1) {
          matchmaking.enqueue(
            pairing.player1.sessionId,
            pairing.player1.colo,
            Date.now(),
            pairing.player1.nickname
          );
        }
        if (c2) {
          matchmaking.enqueue(
            pairing.player2.sessionId,
            pairing.player2.colo,
            Date.now(),
            pairing.player2.nickname
          );
        }
        pairing = matchmaking.popMatch();
        continue;
      }

      const sockets = new Map<string, WebSocket>();
      const roomCore = new GameRoomCore(
        pairing.roomId,
        {
          sessionId: pairing.player1.sessionId,
          token: pairing.player1.token,
          nickname: pairing.player1.nickname,
        },
        {
          sessionId: pairing.player2.sessionId,
          token: pairing.player2.token,
          nickname: pairing.player2.nickname,
        },
        {
          sendToConn: (connId, msg: RoomServerMessage) => {
            const ws = sockets.get(connId);
            if (ws) sendJson(ws, msg);
          },
          broadcast: (msg: RoomServerMessage) => {
            for (const ws of sockets.values()) {
              sendJson(ws, msg);
            }
          },
        },
        Date.now()
      );

      rooms.set(pairing.roomId, {
        core: roomCore,
        sockets,
        finishedAtMs: null,
      });

      sendJson(c1.ws, {
        type: 'MATCH_FOUND',
        roomId: pairing.roomId,
        role: 'player',
        token: pairing.player1.token,
        colo: c1.colo,
      } satisfies MatchmakingServerMessage);

      sendJson(c2.ws, {
        type: 'MATCH_FOUND',
        roomId: pairing.roomId,
        role: 'opponent',
        token: pairing.player2.token,
        colo: c2.colo,
      } satisfies MatchmakingServerMessage);

      matchmakingClients.delete(pairing.player1.sessionId);
      matchmakingClients.delete(pairing.player2.sessionId);
      pairing = matchmaking.popMatch();
    }
  }

  // Unified 60Hz authoritative room simulation & queue status ticker
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, entry] of rooms.entries()) {
      entry.core.tick(now);
      if (entry.core.isFinished()) {
        if (entry.finishedAtMs === null) {
          entry.finishedAtMs = now;
        } else if (now - entry.finishedAtMs > 60_000 && entry.sockets.size === 0) {
          rooms.delete(roomId);
        }
      }
    }
  }, 16);

  setInterval(() => {
    if (matchmaking.size === 0) return;
    const now = Date.now();
    for (const q of matchmaking.getAllSessions()) {
      const client = matchmakingClients.get(q.sessionId);
      if (client) {
        sendJson(client.ws, {
          type: 'QUEUE_STATUS',
          status: 'searching',
          queueSize: matchmaking.size,
          waitedMs: Math.max(0, now - q.joinedAtMs),
        } satisfies MatchmakingServerMessage);
      }
    }
  }, 1000);

  server.on('upgrade', (req, socket, head) => {
    const rawUrl = req.url ?? '/';
    const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/ws/matchmaking') {
      const sessionId = url.searchParams.get('sessionId');
      const colo = url.searchParams.get('colo') || 'LOCAL';
      if (!isValidOpaqueId(sessionId)) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const prev = matchmakingClients.get(sessionId);
        if (prev) {
          matchmaking.disconnect(sessionId);
          prev.ws.close(1000, 'Replaced by newer matchmaking socket');
        }
        matchmakingClients.set(sessionId, {
          ws,
          colo,
          joinedAt: Date.now(),
        });

        sendJson(ws, {
          type: 'QUEUE_STATUS',
          status: 'idle',
          queueSize: matchmaking.size,
          waitedMs: 0,
        } satisfies MatchmakingServerMessage);

        ws.on('message', (data) => {
          const msg = parseMatchmakingClientMessage(data.toString());
          if (!msg) {
            sendJson(ws, {
              type: 'ERROR',
              code: 'INVALID_MESSAGE',
              message: 'Geçersiz eşleşme komutu.',
            } satisfies MatchmakingServerMessage);
            return;
          }
          if (msg.type === 'PING') {
            sendJson(ws, {
              type: 'PONG',
              ts: msg.ts,
              serverNowMs: Date.now(),
            } satisfies MatchmakingServerMessage);
            return;
          }
          if (msg.type === 'FIND_MATCH') {
            matchmaking.enqueue(sessionId, colo, Date.now(), msg.nickname ?? '');
            sendJson(ws, {
              type: 'QUEUE_STATUS',
              status: 'searching',
              queueSize: matchmaking.size,
              waitedMs: 0,
            } satisfies MatchmakingServerMessage);
            tryPairMatchmaking();
            return;
          }
          if (msg.type === 'CANCEL_MATCH') {
            matchmaking.cancel(sessionId);
            sendJson(ws, {
              type: 'QUEUE_STATUS',
              status: 'cancelled',
              queueSize: matchmaking.size,
              waitedMs: 0,
            } satisfies MatchmakingServerMessage);
          }
        });

        const cleanup = () => {
          const curr = matchmakingClients.get(sessionId);
          if (curr && curr.ws === ws) {
            matchmakingClients.delete(sessionId);
            matchmaking.disconnect(sessionId);
          }
        };
        ws.on('close', cleanup);
        ws.on('error', cleanup);
      });
      return;
    }

    if (url.pathname.startsWith('/ws/room/')) {
      const roomId = url.pathname.slice('/ws/room/'.length).split('/')[0];
      const roomEntry = isValidOpaqueId(roomId) ? rooms.get(roomId) : undefined;
      if (!roomEntry) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const connId = generateOpaqueId(12);
        roomEntry.sockets.set(connId, ws);

        const sessionId = url.searchParams.get('sessionId');
        const token = url.searchParams.get('token');
        if (isValidOpaqueId(sessionId) && isValidOpaqueId(token)) {
          const joined = roomEntry.core.join(connId, sessionId, token, Date.now());
          if (!joined.ok) {
            ws.close(4001, joined.code);
            roomEntry.sockets.delete(connId);
            return;
          }
        }

        ws.on('message', (data) => {
          roomEntry.core.handleRawMessage(connId, data.toString(), Date.now());
          roomEntry.core.tick(Date.now());
        });

        const cleanup = () => {
          roomEntry.sockets.delete(connId);
          roomEntry.core.disconnect(connId, Date.now());
        };
        ws.on('close', cleanup);
        ws.on('error', cleanup);
      });
      return;
    }

    // Leave unhandled upgrades (e.g. Vite HMR if ever enabled) alone
    socket.destroy();
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TEKE TEK server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
