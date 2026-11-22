import type {
  AIControllerState,
  ArenaBounds,
  FighterState,
  FloorStoneState,
  InputIntent,
} from './types';
import { getWeaponById } from './weapons';

export function createInitialAIState(): AIControllerState {
  return {
    behavior: 'APPROACH',
    stateTimer: 0.72,
    strafeDir: 1,
    hesitationCooldown: 0.4,
    blockPulseTimer: 0,
    reactionCooldown: 0,
  };
}

/**
 * Pure tactical AI controller (no input reading):
 * - Ranged weapons kite & collect floor stones
 * - Melee weapons space accurately around weapon reach
 * - Uses Block / Dodge / Special based on visible opponent windup & spacing
 * - Includes natural hesitation & imperfect defense so rounds feel fair and lively (~15-20s)
 */
export function computeAIIntent(
  ai: AIControllerState,
  self: FighterState,
  target: FighterState,
  bounds: ArenaBounds,
  dt: number,
  rng: () => number = Math.random,
  floorStones: readonly FloorStoneState[] = []
): InputIntent {
  ai.stateTimer -= dt;
  ai.hesitationCooldown = Math.max(0, ai.hesitationCooldown - dt);
  ai.blockPulseTimer = Math.max(0, ai.blockPulseTimer - dt);
  ai.reactionCooldown = Math.max(0, ai.reactionCooldown - dt);

  const dx = target.x - self.x;
  const dy = target.y - self.y;
  const dist = Math.hypot(dx, dy);
  const dirX = dist > 0.001 ? dx / dist : -1;
  const dirY = dist > 0.001 ? dy / dist : 0;

  const isUsingSapanRanged = self.weaponId === 'sapan' && self.ammo > 0;
  const effectiveWeapon = isUsingSapanRanged
    ? getWeaponById('sapan')
    : self.weaponId === 'sapan'
    ? getWeaponById('yumruk')
    : getWeaponById(self.weaponId);

  const isPortrait = bounds.height > bounds.width;
  const idealAttackRange = isUsingSapanRanged
    ? isPortrait
      ? 172
      : 200
    : effectiveWeapon.range * 0.88;
  const tooCloseDist = isUsingSapanRanged
    ? isPortrait
      ? 96
      : 112
    : Math.min(48, effectiveWeapon.range * 0.56);

  // Check if AI holds Sapan and should pick up a nearby floor stone
  let nearestStone: FloorStoneState | null = null;
  let nearestStoneDist = Infinity;
  if (self.weaponId === 'sapan' && self.ammo < 5 && floorStones.length > 0) {
    for (const st of floorStones) {
      if (!st.active || st.settleTimer > 0) continue;
      const d = Math.hypot(st.x - self.x, st.y - self.y);
      if (d < nearestStoneDist) {
        nearestStoneDist = d;
        nearestStone = st;
      }
    }
  }

  // Recovering from hitstun motivates repositioning or defensive reaction
  if (self.hitStunTimer > 0 && ai.behavior === 'WAIT') {
    ai.behavior = rng() < 0.5 ? 'RETREAT' : 'APPROACH';
    ai.stateTimer = 0.38;
  }

  let dodgePressed = false;

  // React fairly at most once per visible opponent swing (never per-frame spam or cheating)
  if (
    target.punchPhase === 'windup' &&
    dist < 118 &&
    ai.reactionCooldown <= 0 &&
    ai.blockPulseTimer <= 0 &&
    self.punchPhase === 'idle' &&
    self.hitStunTimer <= 0
  ) {
    ai.reactionCooldown = 0.72;
    const reactRoll = rng();
    if (reactRoll < 0.10 && self.dodgeCooldown <= 0) {
      dodgePressed = true;
      ai.behavior = 'RETREAT';
      ai.stateTimer = 0.36;
      ai.strafeDir = rng() > 0.5 ? 1 : -1;
    } else if (reactRoll < 0.34 && self.blockCooldown <= 0) {
      ai.blockPulseTimer = 0.28 + rng() * 0.16;
    }
  }

  if (
    nearestStone &&
    ((self.ammo === 0 && nearestStoneDist < 280) ||
      (self.ammo <= 2 && nearestStoneDist < 170))
  ) {
    ai.behavior = 'COLLECT_STONE';
    ai.stateTimer = 0.35;
  } else if (ai.stateTimer <= 0) {
    if (dist > idealAttackRange + 24) {
      ai.behavior = 'APPROACH';
      ai.stateTimer = 0.48 + rng() * 0.42;
      ai.strafeDir = rng() > 0.5 ? 1 : -1;
    } else if (isUsingSapanRanged && dist < tooCloseDist) {
      ai.behavior = 'RETREAT';
      ai.stateTimer = 0.42 + rng() * 0.24;
      ai.strafeDir = rng() > 0.5 ? 1 : -1;
      if (dist < 82 && self.dodgeCooldown <= 0 && rng() < 0.35) {
        dodgePressed = true;
      }
    } else if (dist <= idealAttackRange + 10 && self.punchCooldown <= 0.05) {
      const roll = rng();
      if (roll < 0.62) {
        ai.behavior = 'ATTACK';
        ai.stateTimer = 0.34 + rng() * 0.22;
      } else if (roll < 0.82) {
        ai.behavior = 'WAIT';
        ai.stateTimer = 0.28 + rng() * 0.28;
      } else {
        ai.behavior = 'RETREAT';
        ai.stateTimer = 0.38 + rng() * 0.26;
        ai.strafeDir = rng() > 0.5 ? 1 : -1;
      }
    } else {
      const roll = rng();
      if (roll < 0.52) {
        ai.behavior = 'APPROACH';
        ai.stateTimer = 0.4 + rng() * 0.32;
      } else if (roll < 0.78) {
        ai.behavior = 'RETREAT';
        ai.stateTimer = 0.34 + rng() * 0.24;
      } else {
        ai.behavior = 'WAIT';
        ai.stateTimer = 0.28 + rng() * 0.26;
      }
    }
  }

  let moveX = 0;
  let moveY = 0;
  let punchPressed = false;
  let specialPressed = false;
  const blockHeld = ai.blockPulseTimer > 0;

  if (ai.behavior === 'COLLECT_STONE' && nearestStone) {
    const sdx = nearestStone.x - self.x;
    const sdy = nearestStone.y - self.y;
    const sd = Math.max(1, Math.hypot(sdx, sdy));
    moveX = sdx / sd;
    moveY = sdy / sd;
  } else if (ai.behavior === 'APPROACH') {
    const perpX = -dirY * ai.strafeDir * 0.36;
    const perpY = dirX * ai.strafeDir * 0.36;
    moveX = dirX + perpX;
    moveY = dirY + perpY;

    // Occasionally use ranged special (Terlik boomerang / Lightsaber wave) while closing gap
    const hasMidRangeSpecial =
      effectiveWeapon.specialKind === 'plasma_wave' ||
      effectiveWeapon.specialKind === 'boomerang_slipper' ||
      effectiveWeapon.specialKind === 'triple_shot';

    if (
      hasMidRangeSpecial &&
      dist <= 235 &&
      dist >= 110 &&
      self.specialCooldown <= 0 &&
      self.punchPhase === 'idle' &&
      ai.hesitationCooldown <= 0 &&
      rng() < 0.22
    ) {
      specialPressed = true;
      ai.hesitationCooldown = 0.42;
    } else if (
      dist <= idealAttackRange + 8 &&
      self.punchCooldown <= 0 &&
      ai.hesitationCooldown <= 0
    ) {
      ai.behavior = 'ATTACK';
      ai.stateTimer = 0.32;
    }
  } else if (ai.behavior === 'ATTACK') {
    if (dist > idealAttackRange) {
      moveX = dirX * 0.7;
      moveY = dirY * 0.7;
    } else if (dist < tooCloseDist) {
      moveX = -dirX * 0.52;
      moveY = -dirY * 0.52;
    }

    const canFireNow = isUsingSapanRanged
      ? dist <= effectiveWeapon.range * 0.9 && dist >= 55
      : dist <= effectiveWeapon.range * 0.96;

    if (
      canFireNow &&
      !blockHeld &&
      self.punchCooldown <= 0 &&
      self.punchPhase === 'idle' &&
      ai.hesitationCooldown <= 0
    ) {
      if (self.specialCooldown <= 0 && rng() < 0.22) {
        specialPressed = true;
      } else {
        punchPressed = true;
      }

      // Fair pacing so opponent leaves occasional openings and rounds stay 15-20s
      ai.hesitationCooldown = 0.42 + rng() * 0.38;
      if (rng() < 0.42) {
        ai.behavior = 'RETREAT';
        ai.stateTimer = 0.38 + rng() * 0.20;
      } else {
        ai.behavior = 'WAIT';
        ai.stateTimer = 0.30 + rng() * 0.24;
      }
    }
  } else if (ai.behavior === 'RETREAT') {
    const perpX = -dirY * ai.strafeDir * 0.62;
    const perpY = dirX * ai.strafeDir * 0.62;
    moveX = -dirX * 0.78 + perpX;
    moveY = -dirY * 0.78 + perpY;
  } else {
    // WAIT: tactical weave
    moveX = -dirY * ai.strafeDir * 0.32;
    moveY = dirX * ai.strafeDir * 0.32;
  }

  // Arena wall avoidance steering
  const minX = bounds.paddingX + self.radius + 24;
  const maxX = bounds.width - bounds.paddingX - self.radius - 24;
  const minY = bounds.paddingY + self.radius + 24;
  const maxY = bounds.height - bounds.paddingY - self.radius - 24;

  if (self.x < minX) {
    moveX += (minX - self.x) / 24;
    ai.strafeDir = (ai.strafeDir * -1) as 1 | -1;
  } else if (self.x > maxX) {
    moveX -= (self.x - maxX) / 24;
    ai.strafeDir = (ai.strafeDir * -1) as 1 | -1;
  }
  if (self.y < minY) {
    moveY += (minY - self.y) / 24;
  } else if (self.y > maxY) {
    moveY -= (self.y - maxY) / 24;
  }

  const len = Math.hypot(moveX, moveY);
  if (len > 1) {
    moveX /= len;
    moveY /= len;
  }

  return {
    moveX,
    moveY,
    punchPressed,
    specialPressed,
    dodgePressed,
    blockHeld,
  };
}
