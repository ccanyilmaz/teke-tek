import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAIIntent, createInitialAIState } from './ai';
import { ARENA_THEMES, getArenaThemeForRound } from './arenas';
import { evaluateMatchAchievements, evaluateMatchTitle } from './awards';
import { CHARACTERS, pickRandomOpponent } from './characters';
import { computeDamageStage } from './damageVisuals';
import {
  clampFighterToArena,
  createMatchState,
  DEFAULT_ARENA_BOUNDS,
  GAME_CONSTANTS,
  getEffectiveAttackWeapon,
  isPunchInHitRange,
  PORTRAIT_ARENA_BOUNDS,
  stepMatch,
} from './engine';
import {
  applyRoundOutcome,
  createMatchSeries,
  isFinalDeciderRound,
} from './rounds';
import {
  getWeaponById,
  pickDifferentWeapon,
  pickFairRandomWeaponPair,
  WEAPONS,
} from './weapons';

test('there are exactly 5 characters with exact Turkish names', () => {
  assert.deepEqual(
    CHARACTERS.map((c) => c.name),
    ['Türk', 'Kürt', 'Azeri', 'İngiliz', 'Fransız']
  );
});

test('weapon pool excludes havuz_makarnasi, includes baget_ekmek, and all 10 weapons are balanced', () => {
  assert.equal(WEAPONS.length, 10);
  const ids = new Set(WEAPONS.map((w) => w.id));
  assert.equal(ids.size, 10);
  assert.equal((ids as Set<string>).has('havuz_makarnasi'), false);
  assert.equal(ids.has('baget_ekmek'), true);

  for (const w of WEAPONS) {
    const avgDmg = (w.damageMin + w.damageMax) * 0.5;
    const rawDps = avgDmg / w.cooldown;
    assert.ok(avgDmg >= 4.5, `${w.id} avgDmg too low (${avgDmg})`);
    assert.ok(avgDmg <= 13, `${w.id} avgDmg too high (${avgDmg})`);
    assert.ok(rawDps >= 9.5 && rawDps <= 13.5, `${w.id} DPS out of fair band: ${rawDps.toFixed(2)}`);
    assert.ok(w.specialName.length > 0 && w.specialCooldown >= 3.5);
  }
});

test('every weapon in the pool really lands damage on opponent', () => {
  for (const w of WEAPONS) {
    const match = createMatchState('turk', 'fransiz', DEFAULT_ARENA_BOUNDS, {
      playerWeaponId: w.id,
      opponentWeaponId: 'yumruk',
    });
    match.player.x = 350;
    match.player.y = 260;
    match.opponent.x = w.id === 'sapan' ? 520 : 405;
    match.opponent.y = 260;
    match.player.facingAngle = 0;

    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: true }, 0.016, () => 0.2);
    for (let i = 0; i < 40; i++) {
      stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.2);
    }

    assert.ok(
      match.opponent.hp < 100,
      `weapon ${w.id} failed to deal damage (opponent HP=${match.opponent.hp})`
    );
    assert.ok(match.player.damageDealt > 0);
  }
});

test('pickRandomOpponent never picks the player character and pickDifferentWeapon avoids excluded weapon', () => {
  for (const ch of CHARACTERS) {
    for (let r = 0; r < 10; r++) {
      const opp = pickRandomOpponent(ch.id, () => r / 10);
      assert.notEqual(opp.id, ch.id);
    }
  }
  for (const w of WEAPONS) {
    const alt = pickDifferentWeapon(w.id, () => 0.35);
    assert.notEqual(alt.id, w.id);
  }
  const pair = pickFairRandomWeaponPair(() => 0.4);
  assert.ok(getWeaponById(pair.player));
  assert.ok(getWeaponById(pair.opponent));
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

test('punch misses when opponent is out of range and tracks missed attempt', () => {
  const match = createMatchState('azeri', 'turk');
  assert.equal(isPunchInHitRange(match.player, match.opponent), false);

  stepMatch(match, { moveX: 0, moveY: 0, punchPressed: true }, 0.016);
  for (let i = 0; i < 18; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.016);
  }
  assert.equal(match.opponent.hp, 100);
  assert.equal(match.player.attacksAttempted, 1);
  assert.equal(match.player.hitsLanded, 0);
  assert.equal(match.player.punchPhase, 'idle');
});

test('block reduces incoming damage and dodge evades attacks during i-frames', () => {
  // Block test: AI holds block pulse while player attacks
  const blockMatch = createMatchState('turk', 'fransiz', DEFAULT_ARENA_BOUNDS, {
    playerWeaponId: 'sopa',
    opponentWeaponId: 'sopa',
  });
  blockMatch.player.x = 400;
  blockMatch.player.y = 260;
  blockMatch.opponent.x = 460;
  blockMatch.opponent.y = 260;
  blockMatch.player.facingAngle = 0;
  blockMatch.ai.blockPulseTimer = 0.45;
  blockMatch.opponent.isBlocking = true;
  blockMatch.opponent.blockHoldTime = 0.35; // standard block

  stepMatch(blockMatch, { moveX: 0, moveY: 0, punchPressed: true }, 0.016, () => 0.85);
  for (let i = 0; i < 18; i++) {
    stepMatch(blockMatch, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.85);
  }
  // 10 raw dmg blocked at 65% reduction -> ~4 dmg taken
  assert.ok(
    blockMatch.opponent.hp >= 94 && blockMatch.opponent.hp < 100,
    `expected blocked HP ~96, got ${blockMatch.opponent.hp}`
  );

  // Dodge action + i-frame evade test
  const dodgeMatch = createMatchState('turk', 'fransiz', DEFAULT_ARENA_BOUNDS, {
    playerWeaponId: 'sopa',
    opponentWeaponId: 'yumruk',
  });
  const startX = dodgeMatch.player.x;
  stepMatch(dodgeMatch, { moveX: 1, moveY: 0, punchPressed: false, dodgePressed: true }, 0.016, () => 0.85);
  assert.ok(dodgeMatch.player.dodgeTimer > GAME_CONSTANTS.dodgeIframeWindow);
  assert.ok(dodgeMatch.player.dodgeCooldown > 0.5);
  assert.ok(dodgeMatch.player.x > startX + 4, 'dodge should propel fighter quickly');

  // Clear dodge cooldown/timer and test evading an opponent-hit across entire active swing
  dodgeMatch.player.dodgeTimer = 0;
  dodgeMatch.player.dodgeCooldown = 0;
  dodgeMatch.player.punchCooldown = 0;
  dodgeMatch.player.x = 400;
  dodgeMatch.player.y = 260;
  dodgeMatch.opponent.x = 455;
  dodgeMatch.opponent.y = 260;
  dodgeMatch.player.facingAngle = 0;

  stepMatch(dodgeMatch, { moveX: 0, moveY: 0, punchPressed: true }, 0.016, () => 0.85);
  // Advance until sopa windup finishes (0.095s)
  for (let i = 0; i < 5; i++) {
    stepMatch(dodgeMatch, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.85);
  }
  // Opponent triggers i-frame dodge right as active swing arrives
  dodgeMatch.opponent.dodgeTimer = GAME_CONSTANTS.dodgeDuration;
  for (let i = 0; i < 10; i++) {
    stepMatch(dodgeMatch, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.85);
  }
  assert.equal(dodgeMatch.opponent.hp, 100, 'dodging opponent should evade damage during i-frames');
});

test('special attacks work for projectiles and melee specials and respect cooldown', () => {
  // Terlik flying slipper special
  const terlikMatch = createMatchState('turk', 'ingiliz', DEFAULT_ARENA_BOUNDS, {
    playerWeaponId: 'terlik',
    opponentWeaponId: 'yumruk',
  });
  terlikMatch.player.x = 260;
  terlikMatch.player.y = 260;
  terlikMatch.opponent.x = 450;
  terlikMatch.opponent.y = 260;
  terlikMatch.player.facingAngle = 0;

  stepMatch(terlikMatch, { moveX: 0, moveY: 0, punchPressed: false, specialPressed: true }, 0.016, () => 0.1);
  assert.ok(terlikMatch.player.specialCooldown > 3);
  for (let i = 0; i < 45; i++) {
    stepMatch(terlikMatch, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.1);
  }
  assert.ok(terlikMatch.opponent.hp < 100, 'flying slipper special should hit at mid-range');

  // Lightsaber plasma wave special
  const saberMatch = createMatchState('azeri', 'kurt', DEFAULT_ARENA_BOUNDS, {
    playerWeaponId: 'isin_kilici',
    opponentWeaponId: 'yumruk',
  });
  saberMatch.player.x = 260;
  saberMatch.player.y = 260;
  saberMatch.opponent.x = 430;
  saberMatch.opponent.y = 260;
  saberMatch.player.facingAngle = 0;

  stepMatch(saberMatch, { moveX: 0, moveY: 0, punchPressed: false, specialPressed: true }, 0.016, () => 0.1);
  for (let i = 0; i < 45; i++) {
    stepMatch(saberMatch, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.1);
  }
  assert.ok(saberMatch.opponent.hp < 100, 'plasma wave special should hit at mid-range');
});

test('combo increments on consecutive hits and tracks maxCombo', () => {
  const match = createMatchState('turk', 'fransiz', DEFAULT_ARENA_BOUNDS, {
    playerWeaponId: 'kalem',
    opponentWeaponId: 'yumruk',
  });
  match.player.x = 400;
  match.player.y = 260;
  match.opponent.x = 445;
  match.opponent.y = 260;
  match.player.facingAngle = 0;

  for (let hit = 0; hit < 3; hit++) {
    match.player.x = 400;
    match.player.y = 260;
    match.player.facingAngle = 0;
    match.opponent.x = 445;
    match.opponent.y = 260;
    match.opponent.vx = 0;
    match.opponent.vy = 0;
    match.opponent.punchCooldown = 5;
    match.opponent.dodgeCooldown = 5;
    match.opponent.blockCooldown = 5;
    match.opponent.dodgeTimer = 0;
    match.opponent.isBlocking = false;
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: true }, 0.016, () => 0.85);
    for (let i = 0; i < 38; i++) {
      match.opponent.punchCooldown = 5;
      match.opponent.dodgeCooldown = 5;
      match.opponent.blockCooldown = 5;
      stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.85);
    }
  }

  assert.equal(match.player.hitsLanded, 3);
  assert.equal(match.player.maxCombo, 3);
  assert.ok(match.player.damageDealt >= 14);
});

test('match concludes with winnerRole and finished=true when opponent HP reaches 0', () => {
  const match = createMatchState('ingiliz', 'kurt');
  match.player.x = 400;
  match.player.y = 260;
  match.opponent.x = 450;
  match.opponent.y = 260;
  match.opponent.hp = GAME_CONSTANTS.punchDamage;
  match.player.facingAngle = 0;

  stepMatch(match, { moveX: 0, moveY: 0, punchPressed: true }, 0.016, () => 0.85);
  for (let i = 0; i < 70; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.02, () => 0.85);
  }

  assert.equal(match.opponent.hp, 0);
  assert.equal(match.winnerRole, 'player');
  assert.equal(match.finished, true);
  assert.ok(match.victoryPhrase.includes('İNGİLİZ'));
});

test('opponent AI approaches idle player, adapts tactics, and lands hits', () => {
  const match = createMatchState('turk', 'ingiliz');
  for (let i = 0; i < 380; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.02, () => 0.25);
  }
  assert.ok(match.player.hp < 100, `expected player HP < 100, got ${match.player.hp}`);
  assert.ok(match.opponent.hitsLanded >= 1);
});

test('portrait arena spawns fighters diagonally inside bounds and supports combat', () => {
  const match = createMatchState('turk', 'ingiliz', PORTRAIT_ARENA_BOUNDS);
  assert.equal(match.bounds, PORTRAIT_ARENA_BOUNDS);
  assert.ok(match.player.y > match.opponent.y);

  for (let i = 0; i < 380; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.02, () => 0.25);
  }
  assert.ok(match.player.hp < 100);
});

test('sapan consumes stones, drops them on arena floor, allows automatic pickup, and falls back to yumruk at 0 stones', () => {
  const match = createMatchState('turk', 'fransiz', DEFAULT_ARENA_BOUNDS, {
    playerWeaponId: 'sapan',
    opponentWeaponId: 'kalem',
  });
  assert.equal(match.player.ammo, 5);
  assert.equal(getEffectiveAttackWeapon(match.player).id, 'sapan');

  match.player.x = 200;
  match.player.y = 260;
  match.opponent.x = 460;
  match.opponent.y = 260;
  match.player.facingAngle = 0;

  stepMatch(match, { moveX: 0, moveY: 0, punchPressed: true }, 0.02, () => 0.5);
  for (let i = 0; i < 40; i++) {
    stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.02, () => 0.5);
  }

  assert.equal(match.player.ammo, 4);
  assert.ok(match.floorStones.length >= 1);

  const stone = match.floorStones[0];
  stone.settleTimer = 0;
  match.player.x = stone.x;
  match.player.y = stone.y;
  stepMatch(match, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.5);
  assert.equal(match.player.ammo, 5);

  match.player.ammo = 0;
  assert.equal(getEffectiveAttackWeapon(match.player).id, 'yumruk');
});

test('progressive visual damage scales across 4 stages and persists between rounds', () => {
  assert.equal(computeDamageStage(0), 0);
  assert.equal(computeDamageStage(50), 1);
  assert.equal(computeDamageStage(120), 2);
  assert.equal(computeDamageStage(200), 3);
  assert.equal(computeDamageStage(290), 4);

  const matchR2 = createMatchState('turk', 'ingiliz', DEFAULT_ARENA_BOUNDS, {
    playerTotalDamageTaken: 130,
    opponentTotalDamageTaken: 45,
  });
  assert.equal(matchR2.player.hp, 100);
  assert.equal(matchR2.opponent.hp, 100);
  assert.equal(matchR2.player.damageStage, 2);
  assert.equal(matchR2.opponent.damageStage, 1);
});

test('round series, merit-based titles, and all 5 achievements evaluate accurately from real stats', () => {
  // 3-0 sweep with Terlik + 3-weapon collector + low HP clutch + sapan sniper
  let s = createMatchSeries('turk', 'kurt', 'terlik', 'sopa');
  s = applyRoundOutcome(s, 1, 'player', {
    playerTotalDamageTaken: 85,
    opponentTotalDamageTaken: 100,
    playerHpRemaining: 15,
    playerHitsLanded: 11,
    playerAttacksAttempted: 14,
    playerDamageDealt: 100,
    playerSapanHits: 0,
    playerMaxCombo: 4,
    durationSeconds: 16,
  }, () => 0.45); // picks sapan
  s = applyRoundOutcome(s, 2, 'player', {
    playerTotalDamageTaken: 125,
    opponentTotalDamageTaken: 200,
    playerHpRemaining: 60,
    playerHitsLanded: 12,
    playerAttacksAttempted: 16,
    playerDamageDealt: 100,
    playerSapanHits: 5,
    playerMaxCombo: 3,
    durationSeconds: 17,
  }, () => 0.92); // picks baget_ekmek
  s = applyRoundOutcome(s, 3, 'player', {
    playerTotalDamageTaken: 155,
    opponentTotalDamageTaken: 300,
    playerHpRemaining: 70,
    playerHitsLanded: 10,
    playerAttacksAttempted: 14,
    playerDamageDealt: 100,
    playerSapanHits: 0,
    playerMaxCombo: 4,
    durationSeconds: 15,
  });

  assert.equal(s.winnerRole, 'player');
  assert.equal(s.totalPlayerHits, 33);
  assert.equal(s.totalPlayerAttacks, 44);
  assert.equal(s.totalPlayerDamageDealt, 300);

  const title = evaluateMatchTitle(s);
  assert.equal(title.title, 'Terlik Ustası');

  const badges = evaluateMatchAchievements(s).map((b) => b.id);
  assert.ok(badges.includes('three_streak'));
  assert.ok(badges.includes('clutch_low_hp'));
  assert.ok(badges.includes('sapan_sniper'));
  assert.ok(badges.includes('weapon_collector'));

  // 2-2 comeback decider scenario
  let s32 = createMatchSeries('azeri', 'fransiz', 'isin_kilici', 'cetvel');
  s32 = applyRoundOutcome(s32, 1, 'player', {
    playerTotalDamageTaken: 40,
    opponentTotalDamageTaken: 100,
    playerHpRemaining: 60,
    playerHitsLanded: 9,
    playerAttacksAttempted: 13,
    playerDamageDealt: 100,
    durationSeconds: 16,
  });
  s32 = applyRoundOutcome(s32, 2, 'opponent', {
    playerTotalDamageTaken: 140,
    opponentTotalDamageTaken: 160,
    playerHpRemaining: 0,
    playerHitsLanded: 6,
    playerAttacksAttempted: 12,
    playerDamageDealt: 60,
    durationSeconds: 17,
  });
  s32 = applyRoundOutcome(s32, 3, 'player', {
    playerTotalDamageTaken: 180,
    opponentTotalDamageTaken: 260,
    playerHpRemaining: 60,
    playerHitsLanded: 8,
    playerAttacksAttempted: 11,
    playerDamageDealt: 100,
    durationSeconds: 15,
  });
  s32 = applyRoundOutcome(s32, 4, 'opponent', {
    playerTotalDamageTaken: 280,
    opponentTotalDamageTaken: 310,
    playerHpRemaining: 0,
    playerHitsLanded: 5,
    playerAttacksAttempted: 10,
    playerDamageDealt: 50,
    durationSeconds: 18,
  });
  assert.equal(isFinalDeciderRound(s32), true);
  s32 = applyRoundOutcome(s32, 5, 'player', {
    playerTotalDamageTaken: 330,
    opponentTotalDamageTaken: 410,
    playerHpRemaining: 50,
    playerHitsLanded: 9,
    playerAttacksAttempted: 13,
    playerDamageDealt: 100,
    durationSeconds: 17,
  });

  const deciderBadges = evaluateMatchAchievements(s32).map((b) => b.id);
  assert.ok(deciderBadges.includes('decider_hero'));
});

test('block hold cap and dodge cooldown prevent infinite defensive abuse', () => {
  const m = createMatchState('turk', 'ingiliz', PORTRAIT_ARENA_BOUNDS, {
    playerWeaponId: 'yumruk',
    opponentWeaponId: 'sopa',
  });

  // Holding block past maxBlockHold forces block off and applies cooldown
  m.opponent.punchCooldown = 5;
  for (let i = 0; i < 75; i++) {
    stepMatch(m, { moveX: 0, moveY: 0, punchPressed: false, blockHeld: true }, 0.016, () => 0.9);
  }
  assert.equal(m.player.isBlocking, false, 'holding block past maxBlockHold should expire');
  assert.ok(m.player.blockCooldown > 0.1, 'expired block should enter cooldown');

  // Dodge cannot be spammed consecutively
  stepMatch(m, { moveX: 1, moveY: 0, punchPressed: false, dodgePressed: true }, 0.016, () => 0.9);
  assert.ok(m.player.dodgeCooldown > 1.0);
  assert.ok(m.player.dodgeTimer > GAME_CONSTANTS.dodgeIframeWindow);

  // Advance past dash duration and verify second dodge is blocked by cooldown
  for (let i = 0; i < 15; i++) {
    stepMatch(m, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.9);
  }
  assert.equal(m.player.dodgeTimer, 0);
  stepMatch(m, { moveX: 1, moveY: 0, punchPressed: false, dodgePressed: true }, 0.016, () => 0.9);
  assert.equal(m.player.dodgeTimer, 0, 'dodge must respect dodgeCooldown');
});

test('sapan triple_shot volley cannot shotgun-stack multiple stones on point-blank hit', () => {
  const m = createMatchState('turk', 'fransiz', DEFAULT_ARENA_BOUNDS, {
    playerWeaponId: 'sapan',
    opponentWeaponId: 'yumruk',
  });
  m.player.x = 360;
  m.player.y = 260;
  m.opponent.x = 415;
  m.opponent.y = 260;
  m.player.facingAngle = 0;

  stepMatch(m, { moveX: 0, moveY: 0, punchPressed: false, specialPressed: true }, 0.016, () => 0.9);
  for (let i = 0; i < 20; i++) {
    stepMatch(m, { moveX: 0, moveY: 0, punchPressed: false }, 0.016, () => 0.9);
  }
  assert.ok(m.opponent.hp >= 88 && m.opponent.hp < 100, `expected capped volley hit, got HP ${m.opponent.hp}`);
});

test('all 5 core weapon matchups stay competitive with balanced ~15-20s round pacing on mobile portrait arena', () => {
  const makeRng = (seed: number) => {
    let a = seed;
    return () => {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const pairs = [
    ['kalem', 'isin_kilici'],
    ['cetvel', 'kizartma_tavasi'],
    ['sapan', 'bicak'],
    ['yumruk', 'sopa'],
    ['terlik', 'baget_ekmek'],
  ] as const;

  let grandTotalDuration = 0;
  let totalMatches = 0;

  for (const [w1, w2] of pairs) {
    let w1Wins = 0;
    const trials = 16;
    for (let i = 0; i < trials; i++) {
      const rng = makeRng(2026 + i * 97 + w1.length * 13);
      const m = createMatchState('turk', 'fransiz', PORTRAIT_ARENA_BOUNDS, {
        playerWeaponId: w1,
        opponentWeaponId: w2,
      });
      const pAi = createInitialAIState();
      let steps = 0;
      while (!m.finished && steps < 60 * 50) {
        const pIntent = computeAIIntent(
          pAi,
          m.player,
          m.opponent,
          PORTRAIT_ARENA_BOUNDS,
          1 / 60,
          rng,
          m.floorStones
        );
        stepMatch(m, pIntent, 1 / 60, rng);
        steps++;
      }
      assert.equal(m.finished, true, `${w1} vs ${w2} must finish without stalemate`);
      if (m.winnerRole === 'player') w1Wins++;
      grandTotalDuration += m.elapsedTime;
      totalMatches++;
    }
    assert.ok(
      w1Wins >= 2 && w1Wins <= trials - 2,
      `${w1} vs ${w2} too lopsided (${w1Wins}/${trials})`
    );
  }

  const avgDuration = grandTotalDuration / totalMatches;
  assert.ok(
    avgDuration >= 11 && avgDuration <= 22,
    `expected avg round duration near 15-20s, got ${avgDuration.toFixed(2)}s`
  );
});

test('rapid 5 taps per second triggers 5 distinct swings and lands hits even with heavy weapons', () => {
  for (const weaponId of ['kizartma_tavasi', 'isin_kilici', 'kalem'] as const) {
    const m = createMatchState('turk', 'fransiz', DEFAULT_ARENA_BOUNDS, {
      playerWeaponId: weaponId,
      opponentWeaponId: 'yumruk',
    });

    for (let tap = 0; tap < 5; tap++) {
      m.player.x = 400;
      m.player.y = 260;
      m.player.facingAngle = 0;
      m.opponent.x = 450;
      m.opponent.y = 260;
      m.opponent.vx = 0;
      m.opponent.vy = 0;
      m.opponent.punchCooldown = 5;
      m.opponent.dodgeCooldown = 5;
      m.opponent.blockCooldown = 5;
      m.opponent.dodgeTimer = 0;
      m.opponent.isBlocking = false;

      stepMatch(m, { moveX: 0, moveY: 0, punchPressed: true }, 1 / 60, () => 0.85);
      // 11 more frames -> 12 frames total = 0.20s per tap (5 taps/sec)
      for (let f = 0; f < 11; f++) {
        m.opponent.x = 450;
        m.opponent.y = 260;
        m.opponent.punchCooldown = 5;
        m.opponent.dodgeCooldown = 5;
        m.opponent.blockCooldown = 5;
        stepMatch(m, { moveX: 0, moveY: 0, punchPressed: false }, 1 / 60, () => 0.85);
      }
    }
    // Let final swing finish active frames
    for (let f = 0; f < 10; f++) {
      m.opponent.x = 450;
      m.opponent.y = 260;
      stepMatch(m, { moveX: 0, moveY: 0, punchPressed: false }, 1 / 60, () => 0.85);
    }

    assert.equal(
      m.player.attacksAttempted,
      5,
      `${weaponId} should allow 5 swings in 1 second`
    );
    assert.equal(
      m.player.hitsLanded,
      5,
      `${weaponId} should land all 5 rapid swings when in range`
    );
    assert.ok(m.opponent.hp < 100);
  }
});

test('all 5 rounds map to distinct arena themes in exact requested order', () => {
  const expected = [
    { round: 1, id: 'deniz' },
    { round: 2, id: 'buz' },
    { round: 3, id: 'col' },
    { round: 4, id: 'orman' },
    { round: 5, id: 'volkan' },
  ] as const;

  assert.equal(Object.keys(ARENA_THEMES).length, 5);
  for (const { round, id } of expected) {
    const theme = getArenaThemeForRound(round);
    assert.equal(theme.id, id);
    const match = createMatchState('turk', 'fransiz', DEFAULT_ARENA_BOUNDS, {
      roundNumber: round,
    });
    assert.equal(match.roundNumber, round);
    assert.equal(match.arenaTheme, id);
  }

  // Out-of-range round numbers clamp cleanly
  assert.equal(getArenaThemeForRound(0).id, 'deniz');
  assert.equal(getArenaThemeForRound(9).id, 'volkan');
});
