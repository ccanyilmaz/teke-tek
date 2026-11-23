import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoomCore, type GameRoomTransport } from './gameRoomCore';
import { MatchmakingCore } from './matchmakingCore';
import {
  isValidNickname,
  ONLINE_CONSTANTS,
  parseMatchmakingClientMessage,
  parseRoomClientMessage,
  sanitizeNickname,
  type RoomServerMessage,
} from './protocol';

function createMockTransport() {
  const perConn = new Map<string, RoomServerMessage[]>();
  const broadcasts: RoomServerMessage[] = [];

  const transport: GameRoomTransport = {
    sendToConn(connId, msg) {
      const list = perConn.get(connId) ?? [];
      list.push(msg);
      perConn.set(connId, list);
    },
    broadcast(msg) {
      broadcasts.push(msg);
    },
  };

  return { perConn, broadcasts, transport };
}

test('MatchmakingCore pairs two distinct real players, prevents duplicates/self-match, supports real cancel, and never creates bots', () => {
  const mm = new MatchmakingCore();

  assert.equal(mm.enqueue('session_A_1234', 'IST', 100), true);
  assert.equal(mm.enqueue('session_A_1234', 'IST', 120), false); // duplicate blocked
  assert.equal(mm.size, 1);
  assert.equal(mm.popMatch(), null); // never pairs solo player with a bot or itself

  // Cancel removes from queue cleanly
  assert.equal(mm.cancel('session_A_1234'), true);
  assert.equal(mm.size, 0);
  assert.equal(mm.popMatch(), null);

  // Colo affinity preference + cross-colo fallback
  mm.enqueue('session_1_aaaa', 'FRA', 200);
  mm.enqueue('session_2_bbbb', 'IST', 210);
  mm.enqueue('session_3_cccc', 'FRA', 220);

  const firstPair = mm.popMatch();
  assert.ok(firstPair);
  assert.equal(firstPair.player1.sessionId, 'session_1_aaaa');
  assert.equal(firstPair.player2.sessionId, 'session_3_cccc'); // matched same FRA colo first
  assert.equal(mm.size, 1);
  assert.equal(mm.hasSession('session_2_bbbb'), true);

  // Remaining lone player waits without bots until second player arrives
  assert.equal(mm.popMatch(), null);
  mm.enqueue('session_4_dddd', 'LHR', 250);
  const secondPair = mm.popMatch();
  assert.ok(secondPair);
  assert.equal(secondPair.player1.sessionId, 'session_2_bbbb');
  assert.equal(secondPair.player2.sessionId, 'session_4_dddd');
  assert.equal(mm.size, 0);
});

test('protocol validators reject malformed JSON, oversized payloads, invalid characters, and non-monotonic shapes', () => {
  assert.equal(parseMatchmakingClientMessage('not-json'), null);
  assert.equal(parseMatchmakingClientMessage('x'.repeat(5000)), null);
  assert.equal(parseMatchmakingClientMessage(JSON.stringify({ type: 'BOT_SPAWN' })), null);
  assert.deepEqual(parseMatchmakingClientMessage(JSON.stringify({ type: 'FIND_MATCH' })), {
    type: 'FIND_MATCH',
  });

  assert.equal(
    parseRoomClientMessage(
      JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'hacker_char' })
    ),
    null
  );
  assert.equal(
    parseRoomClientMessage(
      JSON.stringify({ type: 'JOIN_ROOM', sessionId: 'short', token: 'short' })
    ),
    null
  );
  const clamped = parseRoomClientMessage(
    JSON.stringify({
      type: 'INPUT',
      seq: 5,
      intent: { moveX: 99, moveY: 99, punchPressed: true },
    })
  );
  assert.ok(clamped && clamped.type === 'INPUT');
  assert.ok(Math.hypot(clamped.intent.moveX, clamped.intent.moveY) <= 1.0001);
});

test('GameRoomCore blocks unauthorized/duplicate joins and enforces sliding-window rate limits', () => {
  const { perConn, transport } = createMockTransport();
  const room = new GameRoomCore(
    'room_test_1',
    { sessionId: 'sess_p1_123456', token: 'tok_p1_1234567890' },
    { sessionId: 'sess_p2_123456', token: 'tok_p2_1234567890' },
    transport,
    1000
  );

  // Wrong token rejected
  const bad = room.join('c_bad', 'sess_p1_123456', 'wrong_token_1234', 1000);
  assert.equal(bad.ok, false);
  assert.equal(perConn.get('c_bad')?.[0]?.type, 'ERROR');

  // Unjoined connection sending SELECT_CHARACTER rejected
  room.handleRawMessage(
    'c_stranger',
    JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'turk' }),
    1005
  );
  assert.equal(perConn.get('c_stranger')?.[0]?.type, 'ERROR');

  // Valid join succeeds, concurrent duplicate active connection for same sessionId blocked
  const ok1 = room.join('c_p1_a', 'sess_p1_123456', 'tok_p1_1234567890', 1010);
  assert.equal(ok1.ok, true);
  const dup = room.join('c_p1_b', 'sess_p1_123456', 'tok_p1_1234567890', 1015);
  assert.equal(dup.ok, false);
  assert.equal(dup.ok === false && dup.code, 'DUPLICATE_SESSION');

  // Rate limit triggers when > rateLimitPerSec within 1s
  for (let i = 0; i < ONLINE_CONSTANTS.rateLimitPerSec + 5; i++) {
    room.handleRawMessage('c_p1_a', JSON.stringify({ type: 'PING', ts: i }), 1020);
  }
  const p1Msgs = perConn.get('c_p1_a') ?? [];
  assert.ok(p1Msgs.some((m) => m.type === 'ERROR' && m.code === 'RATE_LIMITED'));
});

test('GameRoomCore runs concurrent same-character select, synced VS, synced weapon roulette + 1x reroll, and live 2-player combat KO', () => {
  const { broadcasts, transport } = createMockTransport();
  let t = 10_000;
  const room = new GameRoomCore(
    'room_combat_1',
    { sessionId: 'sess_p1_abcdef', token: 'tok_p1_abcdefghij' },
    { sessionId: 'sess_p2_abcdef', token: 'tok_p2_abcdefghij' },
    transport,
    t,
    () => 0.42
  );

  room.join('c1', 'sess_p1_abcdef', 'tok_p1_abcdefghij', t);
  room.join('c2', 'sess_p2_abcdef', 'tok_p2_abcdefghij', t);

  // Both pick the exact same character ('turk') — allowed in Online 1v1!
  room.handleRawMessage(
    'c1',
    JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'turk' }),
    t
  );
  room.handleRawMessage(
    'c2',
    JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'turk' }),
    t + 10
  );
  assert.equal(room.getPhase(), 'vs');

  // Advance past VS reveal -> weapon-roulette
  t += ONLINE_CONSTANTS.vsRevealMs + 20;
  room.tick(t);
  assert.equal(room.getPhase(), 'weapon-roulette');

  // Spin weapons once
  room.handleRawMessage('c1', JSON.stringify({ type: 'SPIN_WEAPONS' }), t);
  const startMsg = broadcasts.find((m) => m.type === 'WEAPON_ROULETTE_START');
  assert.ok(startMsg && startMsg.type === 'WEAPON_ROULETTE_START');

  // Wait for reel lock, then P1 uses its 1x reroll; second reroll is ignored
  t += ONLINE_CONSTANTS.rouletteSpinLockMs + 30;
  room.handleRawMessage('c1', JSON.stringify({ type: 'WEAPON_REROLL' }), t);
  const rerollMsgsAfterFirst = broadcasts.filter((m) => m.type === 'WEAPON_REROLLED');
  assert.equal(rerollMsgsAfterFirst.length, 1);

  room.handleRawMessage('c1', JSON.stringify({ type: 'WEAPON_REROLL' }), t + 20);
  assert.equal(broadcasts.filter((m) => m.type === 'WEAPON_REROLLED').length, 1);

  // Both click ROULETTE_READY -> ROUND_START immediately
  room.handleRawMessage('c1', JSON.stringify({ type: 'ROULETTE_READY' }), t + 30);
  room.handleRawMessage('c2', JSON.stringify({ type: 'ROULETTE_READY' }), t + 40);
  assert.equal(room.getPhase(), 'playing');

  // Walk P1 right and P2 left while P1 attacks -> damage & round progression happen authoritatively
  let seq1 = 1;
  let seq2 = 1;
  let roundOverSeen = false;
  for (let step = 0; step < 900 && !roundOverSeen; step++) {
    t += 17;
    if (step % 2 === 0) {
      room.handleRawMessage(
        'c1',
        JSON.stringify({
          type: 'INPUT',
          seq: seq1++,
          intent: { moveX: 1, moveY: 0, punchPressed: step % 12 === 0 },
        }),
        t
      );
      room.handleRawMessage(
        'c2',
        JSON.stringify({
          type: 'INPUT',
          seq: seq2++,
          intent: { moveX: -1, moveY: 0, punchPressed: false },
        }),
        t
      );
    }
    room.tick(t);
    if (broadcasts.some((m) => m.type === 'ROUND_OVER')) {
      roundOverSeen = true;
    }
  }

  assert.equal(roundOverSeen, true, 'server-authoritative combat must finish round on KO');
  const snap = room.getSnapshot(t);
  assert.equal(snap.player1.wins, 1);
  assert.equal(snap.roundNumber, 2);
});

test('GameRoomCore pauses on disconnect, supports seamless reconnect within 20s, and awards win after 20s timeout or LEAVE_MATCH', () => {
  const { broadcasts, transport } = createMockTransport();
  let t = 50_000;
  const room = new GameRoomCore(
    'room_dc_1',
    { sessionId: 'sess_p1_dc1234', token: 'tok_p1_dc123456789' },
    { sessionId: 'sess_p2_dc1234', token: 'tok_p2_dc123456789' },
    transport,
    t
  );

  room.join('c1', 'sess_p1_dc1234', 'tok_p1_dc123456789', t);
  room.join('c2', 'sess_p2_dc1234', 'tok_p2_dc123456789', t);
  room.handleRawMessage(
    'c1',
    JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'turk' }),
    t
  );
  room.handleRawMessage(
    'c2',
    JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'ingiliz' }),
    t + 10
  );
  t += ONLINE_CONSTANTS.vsRevealMs + 10;
  room.tick(t);
  room.handleRawMessage('c1', JSON.stringify({ type: 'SPIN_WEAPONS' }), t);
  t += ONLINE_CONSTANTS.rouletteSpinLockMs + 10;
  room.handleRawMessage('c1', JSON.stringify({ type: 'ROULETTE_READY' }), t);
  room.handleRawMessage('c2', JSON.stringify({ type: 'ROULETTE_READY' }), t);
  assert.equal(room.getPhase(), 'playing');

  // P2 disconnects -> room pauses and broadcasts PLAYER_DISCONNECTED
  room.disconnect('c2', t);
  assert.ok(broadcasts.some((m) => m.type === 'PLAYER_DISCONNECTED' && m.role === 'opponent'));
  assert.equal(room.getSnapshot(t).disconnectedRole, 'opponent');

  // P2 reconnects after 5s -> ROOM resumes seamlessly with PLAYER_RECONNECTED
  t += 5_000;
  const rejoin = room.join('c2_rejoin', 'sess_p2_dc1234', 'tok_p2_dc123456789', t);
  assert.equal(rejoin.ok, true);
  assert.equal(room.getSnapshot(t).disconnectedRole, null);
  assert.ok(broadcasts.some((m) => m.type === 'PLAYER_RECONNECTED' && m.role === 'opponent'));

  // P2 disconnects again and does NOT return for 20s -> P1 wins by disconnect_timeout with perspective summaries
  room.disconnect('c2_rejoin', t);
  t += ONLINE_CONSTANTS.reconnectGraceMs + 50;
  room.tick(t);

  assert.equal(room.getPhase(), 'gameover');
  const finalSnap = room.getSnapshot(t);
  assert.equal(finalSnap.matchOverReason, 'disconnect_timeout');
  assert.equal(finalSnap.matchWinnerRole, 'player');
  assert.equal(finalSnap.summaryForPlayer1?.winnerRole, 'player');
  assert.equal(finalSnap.summaryForPlayer2?.winnerRole, 'opponent');

  // Separate room: LEAVE_MATCH awards instant win to other player
  const t2 = createMockTransport();
  const room2 = new GameRoomCore(
    'room_leave_1',
    { sessionId: 'sess_p1_lv1234', token: 'tok_p1_lv123456789' },
    { sessionId: 'sess_p2_lv1234', token: 'tok_p2_lv123456789' },
    t2.transport,
    1000
  );
  room2.join('c1', 'sess_p1_lv1234', 'tok_p1_lv123456789', 1000);
  room2.join('c2', 'sess_p2_lv1234', 'tok_p2_lv123456789', 1000);
  room2.handleRawMessage('c1', JSON.stringify({ type: 'LEAVE_MATCH' }), 1100);
  assert.equal(room2.getPhase(), 'gameover');
  assert.equal(room2.getSnapshot(1100).matchOverReason, 'opponent_left');
  assert.equal(room2.getSnapshot(1100).matchWinnerRole, 'opponent');

  // Separate room: 30s character selection timeout where only P1 picked awards P1 win
  const t3 = createMockTransport();
  const room3 = new GameRoomCore(
    'room_timeout_1',
    { sessionId: 'sess_p1_to1234', token: 'tok_p1_to123456789' },
    { sessionId: 'sess_p2_to1234', token: 'tok_p2_to123456789' },
    t3.transport,
    1000
  );
  room3.join('c1', 'sess_p1_to1234', 'tok_p1_to123456789', 1000);
  room3.join('c2', 'sess_p2_to1234', 'tok_p2_to123456789', 1000);
  room3.handleRawMessage(
    'c1',
    JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'azeri' }),
    1200
  );
  room3.tick(1000 + ONLINE_CONSTANTS.selectionTimeoutMs + 10);
  assert.equal(room3.getPhase(), 'gameover');
  assert.equal(room3.getSnapshot().matchOverReason, 'selection_timeout');
  assert.equal(room3.getSnapshot().matchWinnerRole, 'player');
});

test('nicknames are sanitized, preserved in matchmaking, and attached to fighters on ROUND_START', () => {
  assert.equal(sanitizeNickname('  Çelik   Yumruk\n\t '), 'Çelik Yumruk');
  assert.equal(sanitizeNickname('A', 'Fallback'), 'Fallback');
  assert.equal(isValidNickname('Can65'), true);
  assert.equal(isValidNickname(' '), false);
  assert.equal(sanitizeNickname('ÇokUzunBirOyuncuTakmaAdi123').length <= 16, true);

  assert.deepEqual(
    parseMatchmakingClientMessage(
      JSON.stringify({ type: 'FIND_MATCH', nickname: '  Şahin  ' })
    ),
    { type: 'FIND_MATCH', nickname: 'Şahin' }
  );

  const mm = new MatchmakingCore();
  mm.enqueue('sess_nick_111111', 'IST', 100, '  Can65  ');
  mm.enqueue('sess_nick_222222', 'IST', 110, 'Ege99');
  const pair = mm.popMatch();
  assert.ok(pair);
  assert.equal(pair.player1.nickname, 'Can65');
  assert.equal(pair.player2.nickname, 'Ege99');

  const { transport } = createMockTransport();
  let t = 2000;
  const room = new GameRoomCore(
    pair.roomId,
    pair.player1,
    pair.player2,
    transport,
    t
  );
  room.join('c1', pair.player1.sessionId, pair.player1.token, t);
  room.join('c2', pair.player2.sessionId, pair.player2.token, t);
  room.handleRawMessage('c1', JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'turk' }), t);
  room.handleRawMessage('c2', JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'kurt' }), t);
  t += ONLINE_CONSTANTS.vsRevealMs + 10;
  room.tick(t);
  room.handleRawMessage('c1', JSON.stringify({ type: 'SPIN_WEAPONS' }), t);
  t += ONLINE_CONSTANTS.rouletteSpinLockMs + 10;
  room.handleRawMessage('c1', JSON.stringify({ type: 'ROULETTE_READY' }), t);
  room.handleRawMessage('c2', JSON.stringify({ type: 'ROULETTE_READY' }), t);

  const snap = room.getSnapshot(t);
  assert.equal(snap.player1.nickname, 'Can65');
  assert.equal(snap.player2.nickname, 'Ege99');
  assert.equal(snap.match?.player.nickname, 'Can65');
  assert.equal(snap.match?.opponent.nickname, 'Ege99');
});

