import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, pickRandomOpponent } from './characters';
import {
  clampFighterToArena,
  createMatchState,
  DEFAULT_ARENA_BOUNDS,
  GAME_CONSTANTS,
  isPunchInHitRange,
  PORTRAIT_ARENA_BOUNDS,
  stepMatch,
} from './engine';

test('there are exactly 5 characters with exact Turkish names', () => {
  assert.deepEqual(
    CHARACTERS.map((c) => c.name),
    ['Türk', 'Kürt', 'Azeri', 'İngiliz', 'Fransız']
  );
});

test('pickRandomOpponent never picks the player character', () => {
  for (const ch of CHARACTERS) {
    for (let r = 0; r < 10; r++) {
      const opp = pickRandomOpponent(ch.id, () => r / 10);
      assert.notEqual(opp.id, ch.id);
    }
  }
});

test('fighters start at 100 HP facing each other inside arena bounds', () => {
  const match = createMatchState('turk', 'fransiz');
  assert.equal(match.player.hp, 100);
  assert.equal(match.opponent.hp, 100);
  assert.ok(match.player.x < match.opponent.x);
  assert.equal(match.winnerRole, null);
  assert.equal(match.finished, false);
});

test('movement clamps strictly inside arena boundaries', () => {
  const match = createMatchState('kurt', 'ingiliz');
  match.player.x = -500;
  match.player.y = 9999;
  clampFighterToArena(match.player, DEFAULT_ARENA_BOUNDS);
  assert.equal(
    match.player.x,
    DEFAULT_ARENA_BOUNDS.paddingX + match.player.radius
  );
  assert.equal(
    match.player.y,
    DEFAULT_ARENA_BOUNDS.height -
      DEFAULT_ARENA_BOUNDS.paddingY -
      match.player.radius
  );
});

test('punch misses when opponent is out of range', () => {
  const match = createMatchState('azeri', 'turk');
  // Initial distance is ~396px, well outside punchRange (84px)
  assert.equal(isPunchInHitRange(match.player, match.opponent), false);

  stepMatch(match, { moveX: 0, moveY: 0, punchPressed: true }, 0.016);
  for (let i = 0; i < 15; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.016);
  }
  assert.equal(match.opponent.hp, 100);
});

test('punch hits when opponent is in range and triggers knockback + cooldown', () => {
  const match = createMatchState('turk', 'fransiz');
  match.player.x = 400;
  match.player.y = 260;
  match.opponent.x = 458;
  match.opponent.y = 260;
  match.player.facingAngle = 0;

  assert.equal(isPunchInHitRange(match.player, match.opponent), true);

  // Trigger punch
  stepMatch(match, { moveX: 0, moveY: 0, punchPressed: true }, 0.016, () => 0.1);
  assert.equal(match.player.punchPhase, 'windup');
  assert.ok(match.player.punchCooldown > 0);

  // Advance past windup into active frames
  for (let i = 0; i < 10; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.1);
  }

  assert.equal(match.opponent.hp, 100 - GAME_CONSTANTS.punchDamage);
  assert.equal(match.player.hitsLanded, 1);
  assert.ok(match.opponent.x > 458, 'opponent should be knocked back');

  // Trying to punch immediately during cooldown should not start another swing
  stepMatch(match, { moveX: 0, moveY: 0, punchPressed: true }, 0.016, () => 0.1);
  assert.notEqual(match.player.punchPhase, 'windup');
});

test('match concludes with winnerRole and finished=true when opponent HP reaches 0', () => {
  const match = createMatchState('ingiliz', 'kurt');
  match.player.x = 400;
  match.player.y = 260;
  match.opponent.x = 450;
  match.opponent.y = 260;
  match.opponent.hp = GAME_CONSTANTS.punchDamage;
  match.player.facingAngle = 0;

  stepMatch(match, { moveX: 0, moveY: 0, punchPressed: true }, 0.016, () => 0);
  // Step through windup + hitstop + KO beat
  for (let i = 0; i < 70; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.02, () => 0);
  }

  assert.equal(match.opponent.hp, 0);
  assert.equal(match.winnerRole, 'player');
  assert.equal(match.finished, true);
  assert.ok(match.victoryPhrase.includes('İNGİLİZ'));
});

test('simulation survives idle input without NaN or out-of-bounds positions', () => {
  const match = createMatchState('fransiz', 'azeri');
  for (let i = 0; i < 300; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.016);
  }
  assert.ok(Number.isFinite(match.player.x) && Number.isFinite(match.player.y));
  assert.ok(Number.isFinite(match.opponent.x) && Number.isFinite(match.opponent.y));
  assert.ok(match.opponent.x >= DEFAULT_ARENA_BOUNDS.paddingX + match.opponent.radius);
  assert.ok(
    match.opponent.x <=
      DEFAULT_ARENA_BOUNDS.width -
        DEFAULT_ARENA_BOUNDS.paddingX -
        match.opponent.radius
  );
});

test('opponent AI approaches idle player and lands punches that reduce player HP', () => {
  const match = createMatchState('turk', 'ingiliz');
  for (let i = 0; i < 240; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.02, () => 0.1);
  }
  assert.ok(match.player.hp < 100, `expected player HP < 100, got ${match.player.hp}`);
  assert.ok(match.opponent.hitsLanded >= 1, 'expected opponent AI to land at least 1 hit');
});

test('active punch frames still resolve cleanly during simultaneous brawl trades', () => {
  const match = createMatchState('azeri', 'kurt');
  match.player.x = 400;
  match.player.y = 260;
  match.opponent.x = 460;
  match.opponent.y = 260;
  match.player.facingAngle = 0;
  match.opponent.facingAngle = Math.PI;
  match.player.punchPhase = 'active';
  match.player.punchTimer = 0.08;
  match.opponent.punchPhase = 'active';
  match.opponent.punchTimer = 0.08;

  stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.02, () => 0.2);
  assert.equal(match.opponent.hp, 100 - GAME_CONSTANTS.punchDamage);
  assert.equal(match.player.hp, 100 - GAME_CONSTANTS.punchDamage);
});

test('portrait arena spawns fighters diagonally inside bounds and supports combat', () => {
  const match = createMatchState('turk', 'ingiliz', PORTRAIT_ARENA_BOUNDS);
  assert.equal(match.bounds, PORTRAIT_ARENA_BOUNDS);
  assert.ok(match.player.y > match.opponent.y, 'player should start in lower half on portrait');
  assert.ok(match.player.x >= PORTRAIT_ARENA_BOUNDS.paddingX + match.player.radius);
  assert.ok(
    match.opponent.x <=
      PORTRAIT_ARENA_BOUNDS.width - PORTRAIT_ARENA_BOUNDS.paddingX - match.opponent.radius
  );

  for (let i = 0; i < 180; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.02, () => 0.1);
  }
  assert.ok(match.player.hp < 100, 'opponent AI should reach and damage idle player in portrait arena');
});

