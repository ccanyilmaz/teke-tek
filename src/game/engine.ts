import { createInitialAIState, computeAIIntent } from './ai';
import { getCharacterById } from './characters';
import type {
  ArenaBounds,
  CharacterId,
  FighterState,
  InputIntent,
  MatchState,
} from './types';

export const DEFAULT_ARENA_BOUNDS: ArenaBounds = {
  width: 900,
  height: 520,
  paddingX: 66,
  paddingY: 74,
};

export const PORTRAIT_ARENA_BOUNDS: ArenaBounds = {
  width: 440,
  height: 620,
  paddingX: 34,
  paddingY: 36,
};

export const GAME_CONSTANTS = {
  maxHp: 100,
  moveSpeed: 280,
  acceleration: 19,
  fighterRadius: 26,
  punchWindup: 0.075,
  punchActive: 0.135,
  punchRecovery: 0.17,
  punchCooldown: 0.42,
  punchRange: 86,
  punchDamage: 14,
  knockbackImpulse: 320,
  hitStunDuration: 0.18,
  hitFlashDuration: 0.09,
  hitstopDuration: 0.048,
  koBeatDuration: 0.65,
} as const;

const COMIC_HIT_WORDS = ['PAM!', 'PAT!', 'ŞAK!', 'GÜM!', 'HOP!', 'ÇAT!'] as const;

const VICTORY_TEMPLATES = [
  (name: string) => `ARENA'NIN GALİBİ: ${name}`,
  (name: string) => `BU SEFER KAZANAN: ${name}`,
  (name: string) => `MİNDERİN HAKİMİ: ${name}`,
] as const;

export function createFighter(
  role: 'player' | 'opponent',
  characterId: CharacterId,
  x: number,
  y: number,
  facingAngle: number
): FighterState {
  return {
    role,
    characterId,
    x,
    y,
    vx: 0,
    vy: 0,
    facingAngle,
    hp: GAME_CONSTANTS.maxHp,
    maxHp: GAME_CONSTANTS.maxHp,
    radius: GAME_CONSTANTS.fighterRadius,
    walkPhase: 0,
    punchPhase: 'idle',
    punchTimer: 0,
    punchCooldown: 0,
    punchDidHit: false,
    punchArmSide: 1,
    hitStunTimer: 0,
    hitFlashTimer: 0,
    scaleX: 1,
    scaleY: 1,
    hitsLanded: 0,
    punchBufferTimer: 0,
    wobblePhase: 0,
    victoryBouncePhase: 0,
  };
}

export function createMatchState(
  playerCharacterId: CharacterId,
  opponentCharacterId: CharacterId,
  bounds: ArenaBounds = DEFAULT_ARENA_BOUNDS
): MatchState {
  const isPortrait = bounds.height > bounds.width;
  const playerX = isPortrait ? bounds.width * 0.30 : bounds.width * 0.28;
  const playerY = isPortrait ? bounds.height * 0.68 : bounds.height / 2 + 12;
  const opponentX = isPortrait ? bounds.width * 0.70 : bounds.width * 0.72;
  const opponentY = isPortrait ? bounds.height * 0.32 : bounds.height / 2 + 12;

  return {
    bounds,
    player: createFighter(
      'player',
      playerCharacterId,
      playerX,
      playerY,
      Math.atan2(opponentY - playerY, opponentX - playerX)
    ),
    opponent: createFighter(
      'opponent',
      opponentCharacterId,
      opponentX,
      opponentY,
      Math.atan2(playerY - opponentY, playerX - opponentX)
    ),
    ai: createInitialAIState(),
    elapsedTime: 0,
    hitstopTimer: 0,
    cameraTrauma: 0,
    koFinishTimer: 0,
    winnerRole: null,
    victoryPhrase: '',
    events: [],
    finished: false,
  };
}

export function clampFighterToArena(fighter: FighterState, bounds: ArenaBounds): void {
  const minX = bounds.paddingX + fighter.radius;
  const maxX = bounds.width - bounds.paddingX - fighter.radius;
  const minY = bounds.paddingY + fighter.radius;
  const maxY = bounds.height - bounds.paddingY - fighter.radius;

  if (fighter.x < minX) {
    fighter.x = minX;
    if (fighter.vx < 0) fighter.vx = 0;
  } else if (fighter.x > maxX) {
    fighter.x = maxX;
    if (fighter.vx > 0) fighter.vx = 0;
  }

  if (fighter.y < minY) {
    fighter.y = minY;
    if (fighter.vy < 0) fighter.vy = 0;
  } else if (fighter.y > maxY) {
    fighter.y = maxY;
    if (fighter.vy > 0) fighter.vy = 0;
  }
}

export function isPunchInHitRange(attacker: FighterState, defender: FighterState): boolean {
  const dx = defender.x - attacker.x;
  const dy = defender.y - attacker.y;
  const dist = Math.hypot(dx, dy);

  if (dist > GAME_CONSTANTS.punchRange) {
    return false;
  }
  if (dist < 1) {
    return true;
  }

  const aimX = Math.cos(attacker.facingAngle);
  const aimY = Math.sin(attacker.facingAngle);
  const dot = (dx / dist) * aimX + (dy / dist) * aimY;
  // Generous front arc (~125 degrees total cone) so close brawls feel responsive
  return dot >= 0.45;
}

function updateFighterAction(
  fighter: FighterState,
  other: FighterState,
  intent: InputIntent,
  dt: number,
  match: MatchState,
  rng: () => number
): void {
  fighter.punchCooldown = Math.max(0, fighter.punchCooldown - dt);
  fighter.hitStunTimer = Math.max(0, fighter.hitStunTimer - dt);
  fighter.hitFlashTimer = Math.max(0, fighter.hitFlashTimer - dt);
  fighter.punchBufferTimer = Math.max(0, fighter.punchBufferTimer - dt);

  if (intent.punchPressed) {
    fighter.punchBufferTimer = 0.12;
  }

  // Smooth squash & stretch damping back to (1, 1)
  const damp = 1 - Math.exp(-16 * dt);
  fighter.scaleX += (1 - fighter.scaleX) * damp;
  fighter.scaleY += (1 - fighter.scaleY) * damp;

  if (fighter.hitStunTimer > 0) {
    fighter.wobblePhase += dt * 42;
  } else {
    fighter.wobblePhase = 0;
  }

  // Start punch if buffered, idle, off cooldown, and not stunned
  if (
    fighter.punchBufferTimer > 0 &&
    fighter.punchPhase === 'idle' &&
    fighter.punchCooldown <= 0 &&
    fighter.hitStunTimer <= 0
  ) {
    fighter.punchBufferTimer = 0;
    fighter.punchPhase = 'windup';
    fighter.punchTimer = GAME_CONSTANTS.punchWindup;
    fighter.punchCooldown = GAME_CONSTANTS.punchCooldown;
    fighter.punchDidHit = false;
    fighter.punchArmSide = (fighter.punchArmSide * -1) as 1 | -1;
    fighter.scaleX = 0.88;
    fighter.scaleY = 1.12;

    match.events.push({
      type: 'swing',
      attackerRole: fighter.role,
      x: fighter.x,
      y: fighter.y,
      dirX: Math.cos(fighter.facingAngle),
      dirY: Math.sin(fighter.facingAngle),
    });
  }

  // Advance punch state machine
  if (fighter.punchPhase !== 'idle') {
    fighter.punchTimer -= dt;
    if (fighter.punchPhase === 'windup' && fighter.punchTimer <= 0) {
      fighter.punchPhase = 'active';
      fighter.punchTimer = GAME_CONSTANTS.punchActive;
      // Forward punch lunge + comic stretch
      fighter.vx += Math.cos(fighter.facingAngle) * 115;
      fighter.vy += Math.sin(fighter.facingAngle) * 115;
      fighter.scaleX = 1.18;
      fighter.scaleY = 0.88;
    } else if (fighter.punchPhase === 'active') {
      if (!fighter.punchDidHit && isPunchInHitRange(fighter, other)) {
        fighter.punchDidHit = true;
        fighter.hitsLanded += 1;

        const dx = other.x - fighter.x;
        const dy = other.y - fighter.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const nx = dx / dist;
        const ny = dy / dist;

        other.hp = Math.max(0, other.hp - GAME_CONSTANTS.punchDamage);
        other.vx = nx * GAME_CONSTANTS.knockbackImpulse;
        other.vy = ny * GAME_CONSTANTS.knockbackImpulse;
        other.hitStunTimer = GAME_CONSTANTS.hitStunDuration;
        other.hitFlashTimer = GAME_CONSTANTS.hitFlashDuration;
        if (other.punchPhase === 'windup') {
          other.punchPhase = 'idle';
          other.punchTimer = 0;
        }
        other.scaleX = 0.78;
        other.scaleY = 1.24;

        match.hitstopTimer = GAME_CONSTANTS.hitstopDuration;
        match.cameraTrauma = Math.min(1, match.cameraTrauma + 0.46);

        const word =
          COMIC_HIT_WORDS[Math.floor(rng() * COMIC_HIT_WORDS.length) % COMIC_HIT_WORDS.length];

        match.events.push({
          type: other.hp <= 0 ? 'ko' : 'hit',
          attackerRole: fighter.role,
          x: (fighter.x + other.x) * 0.5,
          y: (fighter.y + other.y) * 0.5 - 16,
          dirX: nx,
          dirY: ny,
          comicWord: word,
        });

        if (other.hp <= 0) {
          match.winnerRole = fighter.role;
          match.koFinishTimer = GAME_CONSTANTS.koBeatDuration;
          match.cameraTrauma = 0.85;
          const winnerDef = getCharacterById(fighter.characterId);
          const tmpl =
            VICTORY_TEMPLATES[
              Math.floor(rng() * VICTORY_TEMPLATES.length) % VICTORY_TEMPLATES.length
            ];
          match.victoryPhrase = tmpl(winnerDef.upperName);
        }
      }

      if (fighter.punchTimer <= 0) {
        fighter.punchPhase = 'recovery';
        fighter.punchTimer = GAME_CONSTANTS.punchRecovery;
      }
    } else if (fighter.punchPhase === 'recovery' && fighter.punchTimer <= 0) {
      fighter.punchPhase = 'idle';
      fighter.punchTimer = 0;
    }
  }

  // Movement velocity integration
  const canMove = fighter.hitStunTimer <= 0;
  let targetVx = 0;
  let targetVy = 0;

  if (canMove) {
    let mx = intent.moveX;
    let my = intent.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    const speedFactor = fighter.punchPhase !== 'idle' ? 0.45 : 1;
    targetVx = mx * GAME_CONSTANTS.moveSpeed * speedFactor;
    targetVy = my * GAME_CONSTANTS.moveSpeed * speedFactor;
  }

  const blend = 1 - Math.exp(-(canMove ? GAME_CONSTANTS.acceleration : 10) * dt);
  fighter.vx += (targetVx - fighter.vx) * blend;
  fighter.vy += (targetVy - fighter.vy) * blend;

  const prevX = fighter.x;
  const prevY = fighter.y;
  fighter.x += fighter.vx * dt;
  fighter.y += fighter.vy * dt;

  // Distance-synced walk animation (no skating!)
  const movedDist = Math.hypot(fighter.x - prevX, fighter.y - prevY);
  if (movedDist > 0.2 && canMove) {
    fighter.walkPhase += movedDist * 0.14;
  }

  // Always face opponent smoothly so recovery punches stay aligned
  const faceDx = other.x - fighter.x;
  const faceDy = other.y - fighter.y;
  if (Math.hypot(faceDx, faceDy) > 1) {
    fighter.facingAngle = Math.atan2(faceDy, faceDx);
  }
}

function resolveFighterSeparation(a: FighterState, b: FighterState): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.radius + b.radius - 4;
  if (dist < minDist) {
    const nx = dist > 0.001 ? dx / dist : 1;
    const ny = dist > 0.001 ? dy / dist : 0;
    const overlap = (minDist - dist) * 0.5;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;
  }
}

/**
 * Advances the simulation by one clamped frame (`dt <= 0.05s`).
 */
export function stepMatch(
  match: MatchState,
  playerIntent: InputIntent,
  rawDt: number,
  rng: () => number = Math.random
): void {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  match.events.length = 0;

  // Decay camera trauma in real time
  match.cameraTrauma = Math.max(0, match.cameraTrauma - dt * 2.4);

  // Brief hitstop freeze for crunchy impact while hit flash ticks
  if (match.hitstopTimer > 0) {
    match.hitstopTimer = Math.max(0, match.hitstopTimer - dt);
    match.player.hitFlashTimer = Math.max(0, match.player.hitFlashTimer - dt);
    match.opponent.hitFlashTimer = Math.max(0, match.opponent.hitFlashTimer - dt);
    return;
  }

  // KO celebratory beat before presenting outcome modal
  if (match.winnerRole !== null) {
    match.koFinishTimer = Math.max(0, match.koFinishTimer - dt);
    const winner = match.winnerRole === 'player' ? match.player : match.opponent;
    const loser = match.winnerRole === 'player' ? match.opponent : match.player;

    winner.victoryBouncePhase += dt * 11;
    loser.wobblePhase += dt * 8;
    loser.vx *= Math.exp(-8 * dt);
    loser.vy *= Math.exp(-8 * dt);
    loser.x += loser.vx * dt;
    loser.y += loser.vy * dt;
    clampFighterToArena(loser, match.bounds);

    if (match.koFinishTimer <= 0) {
      match.finished = true;
    }
    return;
  }

  match.elapsedTime += dt;

  const aiIntent = computeAIIntent(
    match.ai,
    match.opponent,
    match.player,
    match.bounds,
    dt,
    rng
  );

  updateFighterAction(match.player, match.opponent, playerIntent, dt, match, rng);
  if (match.winnerRole === null) {
    updateFighterAction(match.opponent, match.player, aiIntent, dt, match, rng);
  }

  resolveFighterSeparation(match.player, match.opponent);
  clampFighterToArena(match.player, match.bounds);
  clampFighterToArena(match.opponent, match.bounds);
}
