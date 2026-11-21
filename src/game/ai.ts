import type {
  AIControllerState,
  ArenaBounds,
  FighterState,
  InputIntent,
} from './types';

export function createInitialAIState(): AIControllerState {
  return {
    behavior: 'APPROACH',
    stateTimer: 0.7,
    strafeDir: 1,
    hesitationCooldown: 0.35,
  };
}

/**
 * Pure state-machine AI controller:
 * Transitions naturally between APPROACH, ATTACK, RETREAT, and WAIT,
 * keeps a fair learning pace for new players, and steers away from arena walls.
 */
export function computeAIIntent(
  ai: AIControllerState,
  self: FighterState,
  target: FighterState,
  bounds: ArenaBounds,
  dt: number,
  rng: () => number = Math.random
): InputIntent {
  ai.stateTimer -= dt;
  ai.hesitationCooldown = Math.max(0, ai.hesitationCooldown - dt);

  const dx = target.x - self.x;
  const dy = target.y - self.y;
  const dist = Math.hypot(dx, dy);
  const dirX = dist > 0.001 ? dx / dist : -1;
  const dirY = dist > 0.001 ? dy / dist : 0;

  const idealAttackRange = 78;
  const tooCloseDist = 48;

  // Recovering from hitstun motivates a quick counter-approach
  if (self.hitStunTimer > 0 && ai.behavior === 'WAIT') {
    ai.behavior = 'APPROACH';
    ai.stateTimer = 0.45;
  }

  // Transition state when timer expires or spatial triggers fire
  if (ai.stateTimer <= 0) {
    if (dist > idealAttackRange + 22) {
      ai.behavior = 'APPROACH';
      ai.stateTimer = 0.5 + rng() * 0.45;
      ai.strafeDir = rng() > 0.5 ? 1 : -1;
    } else if (dist <= idealAttackRange + 4 && self.punchCooldown <= 0.05) {
      // Decide between attacking, brief waiting, or tactical retreat
      const roll = rng();
      if (roll < 0.68) {
        ai.behavior = 'ATTACK';
        ai.stateTimer = 0.35 + rng() * 0.25;
      } else if (roll < 0.86) {
        ai.behavior = 'WAIT';
        ai.stateTimer = 0.26 + rng() * 0.3;
      } else {
        ai.behavior = 'RETREAT';
        ai.stateTimer = 0.36 + rng() * 0.28;
        ai.strafeDir = rng() > 0.5 ? 1 : -1;
      }
    } else {
      const roll = rng();
      if (roll < 0.52) {
        ai.behavior = 'APPROACH';
        ai.stateTimer = 0.42 + rng() * 0.35;
      } else if (roll < 0.76) {
        ai.behavior = 'RETREAT';
        ai.stateTimer = 0.34 + rng() * 0.28;
      } else {
        ai.behavior = 'WAIT';
        ai.stateTimer = 0.26 + rng() * 0.3;
      }
    }
  }

  // Reactive retreat if player swings close
  if (
    ai.behavior === 'APPROACH' &&
    target.punchPhase === 'windup' &&
    dist < 90 &&
    rng() < 0.08
  ) {
    ai.behavior = 'RETREAT';
    ai.stateTimer = 0.34;
    ai.strafeDir = rng() > 0.5 ? 1 : -1;
  }

  let moveX = 0;
  let moveY = 0;
  let punchPressed = false;

  if (ai.behavior === 'APPROACH') {
    // Approach with gentle lateral strafe so AI looks lively
    const perpX = -dirY * ai.strafeDir * 0.32;
    const perpY = dirX * ai.strafeDir * 0.32;
    moveX = dirX + perpX;
    moveY = dirY + perpY;

    if (dist <= idealAttackRange && self.punchCooldown <= 0 && ai.hesitationCooldown <= 0) {
      ai.behavior = 'ATTACK';
      ai.stateTimer = 0.32;
    }
  } else if (ai.behavior === 'ATTACK') {
    if (dist > idealAttackRange - 8) {
      moveX = dirX * 0.65;
      moveY = dirY * 0.65;
    } else if (dist < tooCloseDist) {
      moveX = -dirX * 0.4;
      moveY = -dirY * 0.4;
    }
    if (dist <= idealAttackRange + 6 && self.punchCooldown <= 0 && self.punchPhase === 'idle') {
      punchPressed = true;
      ai.hesitationCooldown = 0.38 + rng() * 0.32;
      // After punching, sometimes step back or pause briefly
      if (rng() < 0.45) {
        ai.behavior = 'RETREAT';
        ai.stateTimer = 0.42;
      } else {
        ai.behavior = 'WAIT';
        ai.stateTimer = 0.32;
      }
    }
  } else if (ai.behavior === 'RETREAT') {
    const perpX = -dirY * ai.strafeDir * 0.55;
    const perpY = dirX * ai.strafeDir * 0.55;
    moveX = -dirX * 0.85 + perpX;
    moveY = -dirY * 0.85 + perpY;
  } else {
    // WAIT: slight idle weave
    moveX = -dirY * ai.strafeDir * 0.22;
    moveY = dirX * ai.strafeDir * 0.22;
  }

  // Arena wall avoidance steering so AI bounces inward cleanly
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

  return { moveX, moveY, punchPressed };
}
