import { createInitialAIState, computeAIIntent } from './ai';
import { getArenaThemeForRound } from './arenas';
import { getCharacterById } from './characters';
import { computeDamageStage } from './damageVisuals';
import type {
  ArenaBounds,
  CharacterId,
  FighterState,
  InputIntent,
  MatchState,
  WeaponDef,
  WeaponId,
} from './types';
import { getWeaponById, rollWeaponDamage } from './weapons';

export const DEFAULT_ARENA_BOUNDS: ArenaBounds = {
  width: 900,
  height: 520,
  paddingX: 66,
  paddingY: 74,
};

export const PORTRAIT_ARENA_BOUNDS: ArenaBounds = {
  width: 410,
  height: 500,
  paddingX: 28,
  paddingY: 28,
};

export const GAME_CONSTANTS = {
  maxHp: 100,
  moveSpeed: 282,
  acceleration: 20,
  fighterRadius: 26,
  punchWindup: 0.055,
  punchActive: 0.095,
  punchRecovery: 0.13,
  punchCooldown: 0.54,
  punchRange: 78,
  punchDamage: 7,
  knockbackImpulse: 185,
  hitStunDuration: 0.145,
  hitFlashDuration: 0.085,
  hitstopDuration: 0.036,
  koBeatDuration: 0.65,
  dodgeDuration: 0.18,
  dodgeIframeWindow: 0.06, // i-frames active for 0.12s (dodgeTimer > 0.06), 0.06s punishable tail
  dodgeCooldown: 1.35,
  dodgeSpeed: 585,
  maxBlockHold: 1.1,
  blockCooldown: 0.55,
  perfectBlockWindow: 0.18,
  comboWindow: 2.35,
} as const;

const VICTORY_TEMPLATES = [
  (name: string) => `RAUND GALİBİ: ${name}`,
  (name: string) => `BU RAUNDUN HAKİMİ: ${name}`,
  (name: string) => `MİNDERİN KAZANANI: ${name}`,
] as const;

export interface CreateMatchOptions {
  playerWeaponId?: WeaponId;
  opponentWeaponId?: WeaponId;
  playerTotalDamageTaken?: number;
  opponentTotalDamageTaken?: number;
  roundNumber?: number;
}

export function getEffectiveAttackWeapon(fighter: FighterState): WeaponDef {
  if (fighter.weaponId === 'sapan' && fighter.ammo <= 0) {
    return getWeaponById('yumruk');
  }
  return getWeaponById(fighter.weaponId);
}

export function createFighter(
  role: 'player' | 'opponent',
  characterId: CharacterId,
  x: number,
  y: number,
  facingAngle: number,
  weaponId: WeaponId = 'yumruk',
  totalDamageTaken = 0
): FighterState {
  const weapon = getWeaponById(weaponId);
  return {
    role,
    characterId,
    weaponId,
    ammo: weapon.maxAmmo ?? 0,
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
    activeSwingWeaponId: weaponId,
    activeAttackIsSpecial: false,
    rapidSwingTimer: 0,
    swingIsRapidChain: false,
    specialCooldown: 0,
    dodgeTimer: 0,
    dodgeCooldown: 0,
    dodgeDirX: 0,
    dodgeDirY: 0,
    isBlocking: false,
    blockHoldTime: 0,
    blockCooldown: 0,
    comboCount: 0,
    comboTimer: 0,
    maxCombo: 0,
    hitStunTimer: 0,
    hitFlashTimer: 0,
    scaleX: 1,
    scaleY: 1,
    attacksAttempted: 0,
    hitsLanded: 0,
    damageDealt: 0,
    sapanHits: 0,
    punchBufferTimer: 0,
    specialBufferTimer: 0,
    wobblePhase: 0,
    victoryBouncePhase: 0,
    totalDamageTaken,
    damageStage: computeDamageStage(totalDamageTaken),
  };
}

export function createMatchState(
  playerCharacterId: CharacterId,
  opponentCharacterId: CharacterId,
  bounds: ArenaBounds = DEFAULT_ARENA_BOUNDS,
  options: CreateMatchOptions = {}
): MatchState {
  const isPortrait = bounds.height > bounds.width;
  const playerX = isPortrait ? bounds.width * 0.30 : bounds.width * 0.28;
  const playerY = isPortrait ? bounds.height * 0.68 : bounds.height / 2 + 12;
  const opponentX = isPortrait ? bounds.width * 0.70 : bounds.width * 0.72;
  const opponentY = isPortrait ? bounds.height * 0.32 : bounds.height / 2 + 12;

  const playerWeaponId = options.playerWeaponId ?? 'yumruk';
  const opponentWeaponId = options.opponentWeaponId ?? 'yumruk';
  const playerDamage = options.playerTotalDamageTaken ?? 0;
  const opponentDamage = options.opponentTotalDamageTaken ?? 0;
  const roundNumber = Math.max(1, Math.min(5, Math.floor(options.roundNumber ?? 1)));
  const arenaTheme = getArenaThemeForRound(roundNumber).id;

  return {
    bounds,
    roundNumber,
    arenaTheme,
    player: createFighter(
      'player',
      playerCharacterId,
      playerX,
      playerY,
      Math.atan2(opponentY - playerY, opponentX - playerX),
      playerWeaponId,
      playerDamage
    ),
    opponent: createFighter(
      'opponent',
      opponentCharacterId,
      opponentX,
      opponentY,
      Math.atan2(playerY - opponentY, playerX - opponentX),
      opponentWeaponId,
      opponentDamage
    ),
    projectiles: [],
    floorStones: [],
    nextStoneId: 1,
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

function clampPointToMat(
  x: number,
  y: number,
  bounds: ArenaBounds,
  margin = 16
): { x: number; y: number } {
  const minX = bounds.paddingX + margin;
  const maxX = bounds.width - bounds.paddingX - margin;
  const minY = bounds.paddingY + margin;
  const maxY = bounds.height - bounds.paddingY - margin;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

export function isPunchInHitRange(
  attacker: FighterState,
  defender: FighterState,
  customRange?: number,
  minDot = 0.45
): boolean {
  const dx = defender.x - attacker.x;
  const dy = defender.y - attacker.y;
  const dist = Math.hypot(dx, dy);
  const range = customRange ?? getEffectiveAttackWeapon(attacker).range;

  if (dist > range) {
    return false;
  }
  if (dist < 1) {
    return true;
  }

  const aimX = Math.cos(attacker.facingAngle);
  const aimY = Math.sin(attacker.facingAngle);
  const dot = (dx / dist) * aimX + (dy / dist) * aimY;
  return dot >= minDot;
}

function getSpecialMeleeProfile(weapon: WeaponDef): {
  rangeBonus: number;
  damageMultiplier: number;
  knockbackMultiplier: number;
  lungeSpeed: number;
  minDot: number;
  extraHitStun: number;
  guardPierce: boolean;
} {
  switch (weapon.specialKind) {
    case 'heavy_lunge':
      return {
        rangeBonus: 16,
        damageMultiplier: 1.8,
        knockbackMultiplier: 1.55,
        lungeSpeed: 245,
        minDot: 0.35,
        extraHitStun: 0.06,
        guardPierce: true,
      };
    case 'wide_sweep':
      return {
        rangeBonus: 24,
        damageMultiplier: 1.55,
        knockbackMultiplier: 1.45,
        lungeSpeed: 95,
        minDot: -0.25, // wide sweep hits flanking opponents
        extraHitStun: 0.04,
        guardPierce: false,
      };
    case 'dash_slash':
      return {
        rangeBonus: 18,
        damageMultiplier: 1.7,
        knockbackMultiplier: 1.25,
        lungeSpeed: 310,
        minDot: 0.35,
        extraHitStun: 0.04,
        guardPierce: false,
      };
    case 'flurry_poke':
      return {
        rangeBonus: 14,
        damageMultiplier: 2.3,
        knockbackMultiplier: 1.35,
        lungeSpeed: 215,
        minDot: 0.4,
        extraHitStun: 0.05,
        guardPierce: false,
      };
    case 'pan_smash':
      return {
        rangeBonus: 12,
        damageMultiplier: 1.45,
        knockbackMultiplier: 1.35,
        lungeSpeed: 130,
        minDot: 0.35,
        extraHitStun: 0.14,
        guardPierce: true,
      };
    case 'elastic_snap':
      return {
        rangeBonus: 46,
        damageMultiplier: 1.85,
        knockbackMultiplier: 1.25,
        lungeSpeed: 85,
        minDot: 0.42,
        extraHitStun: 0.06,
        guardPierce: false,
      };
    case 'crust_whack':
      return {
        rangeBonus: 18,
        damageMultiplier: 1.7,
        knockbackMultiplier: 1.4,
        lungeSpeed: 180,
        minDot: 0.25,
        extraHitStun: 0.07,
        guardPierce: false,
      };
    default:
      return {
        rangeBonus: 12,
        damageMultiplier: 1.5,
        knockbackMultiplier: 1.25,
        lungeSpeed: 140,
        minDot: 0.4,
        extraHitStun: 0.04,
        guardPierce: false,
      };
  }
}

function applyDamageHit(
  attacker: FighterState,
  defender: FighterState,
  weapon: WeaponDef,
  rawDamage: number,
  knockback: number,
  dirX: number,
  dirY: number,
  hitX: number,
  hitY: number,
  match: MatchState,
  rng: () => number,
  options: {
    isSpecial?: boolean;
    extraHitStun?: number;
    guardPierce?: boolean;
    isRapidChain?: boolean;
  } = {}
): void {
  // Evade check: active dodge grants clean dodge
  if (defender.dodgeTimer > GAME_CONSTANTS.dodgeIframeWindow) {
    return;
  }

  // Check if defender is actively blocking
  if (defender.isBlocking) {
    const isPerfect = defender.blockHoldTime <= GAME_CONSTANTS.perfectBlockWindow;
    const blockRetention = isPerfect
      ? options.guardPierce
        ? 0.24
        : 0.15
      : options.guardPierce
      ? 0.52
      : 0.35;
    const blockedDamage = Math.max(1, Math.round(rawDamage * blockRetention));
    const blockedKnockback = knockback * (isPerfect ? 0.25 : 0.42);

    defender.hp = Math.max(0, defender.hp - blockedDamage);
    defender.totalDamageTaken += blockedDamage;
    defender.damageStage = computeDamageStage(defender.totalDamageTaken);
    defender.vx = dirX * blockedKnockback;
    defender.vy = dirY * blockedKnockback;
    defender.hitStunTimer = isPerfect ? 0.04 : 0.08;
    defender.hitFlashTimer = 0.05;
    defender.scaleX = 0.92;
    defender.scaleY = 1.08;

    attacker.hitsLanded += 1;
    attacker.damageDealt += blockedDamage;
    if (weapon.id === 'sapan') attacker.sapanHits += 1;

    // Perfect block briefly staggers a melee attacker and opens immediate counter window
    if (isPerfect) {
      if (options.isSpecial !== true) {
        attacker.hitStunTimer = Math.max(attacker.hitStunTimer, 0.28);
      }
      defender.punchCooldown = 0;
      defender.specialCooldown = Math.max(0, defender.specialCooldown - 0.45);
    }

    match.hitstopTimer = isPerfect ? 0.036 : 0.022;
    match.cameraTrauma = Math.min(1, match.cameraTrauma + (isPerfect ? 0.22 : 0.14));

    match.events.push({
      type: defender.hp <= 0 ? 'ko' : 'blocked',
      attackerRole: attacker.role,
      targetRole: defender.role,
      targetRemainingHp: defender.hp,
      damageAmount: blockedDamage,
      weaponId: weapon.id,
      x: hitX,
      y: hitY,
      dirX,
      dirY,
      comicWord: isPerfect ? 'TAM BLOK!' : 'BLOK!',
      isHeavy: isPerfect,
    });

    if (defender.hp <= 0 && match.winnerRole === null) {
      concludeRoundKO(attacker, match, rng);
    }
    return;
  }

  // Clean unblocked hit! Increment combo and calculate proportional fair combo bonus
  const comboGain =
    options.isSpecial && weapon.specialKind === 'flurry_poke' ? 2 : 1;
  attacker.comboCount += comboGain;
  attacker.comboTimer = GAME_CONSTANTS.comboWindow;
  if (attacker.comboCount > attacker.maxCombo) {
    attacker.maxCombo = attacker.comboCount;
  }

  let comboBonus = 0;
  if (options.isRapidChain) {
    comboBonus = attacker.comboCount >= 4 ? 1 : 0;
  } else if (attacker.comboCount >= 5) {
    comboBonus = Math.max(2, Math.round(rawDamage * 0.24));
  } else if (attacker.comboCount >= 4) {
    comboBonus = Math.max(1, Math.round(rawDamage * 0.22));
  } else if (attacker.comboCount >= 2) {
    comboBonus = Math.max(1, Math.round(rawDamage * 0.12));
  }
  const finalDamage = rawDamage + comboBonus;

  attacker.hitsLanded += 1;
  attacker.damageDealt += finalDamage;
  if (weapon.id === 'sapan') {
    attacker.sapanHits += 1;
  }

  // Getting cleanly hit breaks defender's combo
  defender.comboCount = 0;
  defender.comboTimer = 0;
  defender.hp = Math.max(0, defender.hp - finalDamage);
  defender.totalDamageTaken += finalDamage;
  defender.damageStage = computeDamageStage(defender.totalDamageTaken);
  defender.vx = dirX * knockback;
  defender.vy = dirY * knockback;

  const isHeavyHit = Boolean(!options.isRapidChain && (options.isSpecial || finalDamage >= 12));
  const isLightHit = Boolean(options.isRapidChain || (!options.isSpecial && finalDamage < 9));
  defender.hitStunTimer =
    (options.isRapidChain
      ? 0.085
      : isHeavyHit
      ? 0.21
      : isLightHit
      ? 0.105
      : GAME_CONSTANTS.hitStunDuration) +
    (options.extraHitStun ?? 0);
  defender.hitFlashTimer = options.isRapidChain
    ? 0.055
    : isLightHit
    ? 0.065
    : GAME_CONSTANTS.hitFlashDuration;

  // Heavy hits interrupt any windup; light hits only respect late-windup poise (<= 55% remaining)
  const defenderSwingWeapon = getWeaponById(defender.activeSwingWeaponId);
  const defenderInLatePoise =
    defender.activeAttackIsSpecial ||
    ((defender.activeSwingWeaponId === 'kizartma_tavasi' ||
      defender.activeSwingWeaponId === 'isin_kilici' ||
      defender.activeSwingWeaponId === 'baget_ekmek' ||
      defender.activeSwingWeaponId === 'sopa') &&
      defender.punchTimer <= defenderSwingWeapon.windup * 0.58);

  if (defender.punchPhase === 'windup' && (isHeavyHit || !defenderInLatePoise)) {
    defender.punchPhase = 'idle';
    defender.punchTimer = 0;
    defender.activeAttackIsSpecial = false;
    defender.swingIsRapidChain = false;
  }

  defender.scaleX = isHeavyHit ? 0.72 : isLightHit ? 0.84 : 0.78;
  defender.scaleY = isHeavyHit ? 1.3 : isLightHit ? 1.18 : 1.24;

  match.hitstopTimer = options.isRapidChain
    ? GAME_CONSTANTS.hitstopDuration * 0.52
    : isHeavyHit
    ? GAME_CONSTANTS.hitstopDuration * 1.55
    : isLightHit
    ? GAME_CONSTANTS.hitstopDuration * 0.65
    : GAME_CONSTANTS.hitstopDuration;
  match.cameraTrauma = Math.min(
    1,
    match.cameraTrauma +
      (options.isRapidChain
        ? 0.08
        : Math.min(0.72, (isLightHit ? 0.14 : 0.22) + finalDamage * 0.022))
  );

  const words = weapon.hitWords;
  const baseWord = words[Math.floor(rng() * words.length) % words.length];
  const word =
    attacker.comboCount >= 3 ? `${attacker.comboCount}x ${baseWord}` : baseWord;

  match.events.push({
    type: defender.hp <= 0 ? 'ko' : 'hit',
    attackerRole: attacker.role,
    targetRole: defender.role,
    targetRemainingHp: defender.hp,
    damageAmount: finalDamage,
    weaponId: weapon.id,
    x: hitX,
    y: hitY,
    dirX,
    dirY,
    comicWord: word,
    isHeavy: isHeavyHit,
  });

  if (defender.hp <= 0 && match.winnerRole === null) {
    concludeRoundKO(attacker, match, rng);
  }
}

function concludeRoundKO(
  attacker: FighterState,
  match: MatchState,
  rng: () => number
): void {
  match.winnerRole = attacker.role;
  match.koFinishTimer = GAME_CONSTANTS.koBeatDuration;
  match.cameraTrauma = 0.85;
  const winnerDef = getCharacterById(attacker.characterId);
  const tmpl =
    VICTORY_TEMPLATES[
      Math.floor(rng() * VICTORY_TEMPLATES.length) % VICTORY_TEMPLATES.length
    ];
  match.victoryPhrase = tmpl(winnerDef.upperName);
}

function spawnFloorStone(
  match: MatchState,
  x: number,
  y: number,
  settleTimer = 0.35
): void {
  const clamped = clampPointToMat(x, y, match.bounds, 16);
  match.floorStones.push({
    id: match.nextStoneId++,
    x: clamped.x,
    y: clamped.y,
    settleTimer,
    bobPhase: 0,
    active: true,
  });
}

function updateFighterAction(
  fighter: FighterState,
  other: FighterState,
  intent: InputIntent,
  dt: number,
  match: MatchState,
  rng: () => number
): void {
  const lowHpAdrenalin = fighter.hp > 0 && fighter.hp <= 35;
  const cooldownTick = lowHpAdrenalin ? dt * 1.12 : dt;

  fighter.punchCooldown = Math.max(0, fighter.punchCooldown - dt);
  fighter.rapidSwingTimer = Math.max(0, fighter.rapidSwingTimer - dt);
  fighter.specialCooldown = Math.max(0, fighter.specialCooldown - cooldownTick);
  fighter.dodgeCooldown = Math.max(0, fighter.dodgeCooldown - dt);
  fighter.dodgeTimer = Math.max(0, fighter.dodgeTimer - dt);
  fighter.blockCooldown = Math.max(0, fighter.blockCooldown - dt);
  fighter.hitStunTimer = Math.max(0, fighter.hitStunTimer - dt);
  fighter.hitFlashTimer = Math.max(0, fighter.hitFlashTimer - dt);
  fighter.punchBufferTimer = Math.max(0, fighter.punchBufferTimer - dt);
  fighter.specialBufferTimer = Math.max(0, fighter.specialBufferTimer - dt);

  if (fighter.comboTimer > 0) {
    fighter.comboTimer = Math.max(0, fighter.comboTimer - dt);
    if (fighter.comboTimer === 0) {
      fighter.comboCount = 0;
    }
  }

  if (intent.punchPressed) {
    fighter.punchBufferTimer = 0.14;
  }
  if (intent.specialPressed) {
    fighter.specialBufferTimer = 0.14;
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

  // Dodge action (instant evasion dash)
  if (
    intent.dodgePressed &&
    fighter.dodgeCooldown <= 0 &&
    fighter.dodgeTimer <= 0 &&
    fighter.punchPhase === 'idle' &&
    fighter.hitStunTimer <= 0
  ) {
    fighter.isBlocking = false;
    fighter.blockHoldTime = 0;
    fighter.dodgeTimer = GAME_CONSTANTS.dodgeDuration;
    fighter.dodgeCooldown = GAME_CONSTANTS.dodgeCooldown;

    let dx = intent.moveX;
    let dy = intent.moveY;
    const mag = Math.hypot(dx, dy);
    if (mag > 0.15) {
      dx /= mag;
      dy /= mag;
    } else {
      // Neutral dodge sidesteps diagonally backward away from opponent
      const awayX = -Math.cos(fighter.facingAngle);
      const awayY = -Math.sin(fighter.facingAngle);
      const perpX = -awayY * fighter.punchArmSide;
      const perpY = awayX * fighter.punchArmSide;
      dx = awayX * 0.65 + perpX * 0.76;
      dy = awayY * 0.65 + perpY * 0.76;
      const nMag = Math.max(1, Math.hypot(dx, dy));
      dx /= nMag;
      dy /= nMag;
    }

    fighter.dodgeDirX = dx;
    fighter.dodgeDirY = dy;
    fighter.vx = dx * GAME_CONSTANTS.dodgeSpeed;
    fighter.vy = dy * GAME_CONSTANTS.dodgeSpeed;
    fighter.scaleX = 1.24;
    fighter.scaleY = 0.78;

    match.events.push({
      type: 'dodge',
      attackerRole: fighter.role,
      x: fighter.x,
      y: fighter.y,
      dirX: dx,
      dirY: dy,
      comicWord: 'VIJT!',
    });
  }

  // Block stance management
  const wantsBlock = Boolean(intent.blockHeld);
  if (
    wantsBlock &&
    fighter.punchPhase === 'idle' &&
    fighter.dodgeTimer <= 0 &&
    fighter.hitStunTimer <= 0 &&
    fighter.blockCooldown <= 0
  ) {
    fighter.isBlocking = true;
    fighter.blockHoldTime += dt;
    if (fighter.blockHoldTime >= GAME_CONSTANTS.maxBlockHold) {
      fighter.isBlocking = false;
      fighter.blockHoldTime = 0;
      fighter.blockCooldown = GAME_CONSTANTS.blockCooldown;
    }
  } else {
    if (fighter.isBlocking) {
      fighter.blockCooldown = Math.max(fighter.blockCooldown, 0.28);
    }
    fighter.isBlocking = false;
    fighter.blockHoldTime = 0;
  }

  // Start special attack or rapid/standard attack without locking out fast player taps (supports 5+ swings/sec)
  const canStartAttack =
    fighter.punchPhase === 'idle' &&
    fighter.dodgeTimer <= 0 &&
    fighter.hitStunTimer <= 0;
  const currentSwingDef = getWeaponById(fighter.activeSwingWeaponId);
  const canCancelForRapidSwing =
    !fighter.activeAttackIsSpecial &&
    fighter.rapidSwingTimer <= 0 &&
    fighter.dodgeTimer <= 0 &&
    fighter.hitStunTimer <= 0 &&
    (fighter.punchPhase === 'recovery' ||
      (fighter.punchPhase === 'active' &&
        (fighter.punchDidHit ||
          fighter.punchTimer <= currentSwingDef.active * 0.72)));

  if (canStartAttack && fighter.specialBufferTimer > 0 && fighter.specialCooldown <= 0) {
    const baseWeapon = getWeaponById(fighter.weaponId);
    const activeWeapon =
      baseWeapon.id === 'sapan' ? baseWeapon : getEffectiveAttackWeapon(fighter);
    fighter.specialBufferTimer = 0;
    fighter.punchBufferTimer = 0;
    fighter.isBlocking = false;
    fighter.blockHoldTime = 0;
    fighter.activeSwingWeaponId = activeWeapon.id;
    fighter.activeAttackIsSpecial = true;
    fighter.swingIsRapidChain = false;
    fighter.rapidSwingTimer = 0.18;
    fighter.punchPhase = 'windup';
    fighter.punchTimer = Math.max(0.06, activeWeapon.windup * 1.1);
    fighter.punchCooldown = Math.max(0.45, activeWeapon.cooldown * 0.85);
    fighter.specialCooldown = activeWeapon.specialCooldown;
    fighter.punchDidHit = false;
    fighter.punchArmSide = (fighter.punchArmSide * -1) as 1 | -1;
    fighter.attacksAttempted += 1;
    fighter.scaleX = 0.82;
    fighter.scaleY = 1.2;

    match.events.push({
      type: 'special',
      attackerRole: fighter.role,
      weaponId: activeWeapon.id,
      x: fighter.x,
      y: fighter.y,
      dirX: Math.cos(fighter.facingAngle),
      dirY: Math.sin(fighter.facingAngle),
    });
  } else if (
    (canStartAttack || canCancelForRapidSwing) &&
    fighter.punchBufferTimer > 0 &&
    fighter.rapidSwingTimer <= 0
  ) {
    // If rapid-canceling a melee swing right before its active window finished, perform a final range check first
    if (
      fighter.punchPhase === 'active' &&
      !fighter.punchDidHit &&
      currentSwingDef.id !== 'sapan' &&
      isPunchInHitRange(fighter, other, currentSwingDef.range, 0.45)
    ) {
      fighter.punchDidHit = true;
      if (other.dodgeTimer <= GAME_CONSTANTS.dodgeIframeWindow) {
        const dx = other.x - fighter.x;
        const dy = other.y - fighter.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const baseDmg = rollWeaponDamage(currentSwingDef, rng);
        const dmg = fighter.swingIsRapidChain
          ? Math.max(2, Math.round(baseDmg * 0.36))
          : baseDmg;
        const kb = fighter.swingIsRapidChain
          ? Math.round(currentSwingDef.knockback * 0.42)
          : currentSwingDef.knockback;
        applyDamageHit(
          fighter,
          other,
          currentSwingDef,
          dmg,
          kb,
          dx / dist,
          dy / dist,
          (fighter.x + other.x) * 0.5,
          (fighter.y + other.y) * 0.5 - 16,
          match,
          rng,
          { isRapidChain: fighter.swingIsRapidChain }
        );
      }
    }

    const activeWeapon = getEffectiveAttackWeapon(fighter);
    const isRapidChain = fighter.punchCooldown > 0;
    fighter.punchBufferTimer = 0;
    fighter.isBlocking = false;
    fighter.blockHoldTime = 0;
    fighter.activeSwingWeaponId = activeWeapon.id;
    fighter.activeAttackIsSpecial = false;
    fighter.swingIsRapidChain = isRapidChain;
    fighter.rapidSwingTimer = 0.135;
    fighter.punchPhase = 'windup';
    fighter.punchTimer = isRapidChain
      ? Math.min(0.036, activeWeapon.windup * 0.55)
      : activeWeapon.windup;
    if (!isRapidChain) {
      fighter.punchCooldown = activeWeapon.cooldown;
    }
    fighter.punchDidHit = false;
    fighter.punchArmSide = (fighter.punchArmSide * -1) as 1 | -1;
    fighter.attacksAttempted += 1;
    fighter.scaleX = isRapidChain ? 0.92 : 0.88;
    fighter.scaleY = isRapidChain ? 1.08 : 1.12;

    match.events.push({
      type: 'swing',
      attackerRole: fighter.role,
      weaponId: activeWeapon.id,
      x: fighter.x,
      y: fighter.y,
      dirX: Math.cos(fighter.facingAngle),
      dirY: Math.sin(fighter.facingAngle),
    });
  }

  // Advance attack state machine (always completes cleanly even on whiff!)
  if (fighter.punchPhase !== 'idle') {
    const swingWeapon = getWeaponById(fighter.activeSwingWeaponId);
    const isSpecial = fighter.activeAttackIsSpecial;
    fighter.punchTimer -= dt;

    if (fighter.punchPhase === 'windup' && fighter.punchTimer <= 0) {
      fighter.punchPhase = 'active';
      fighter.punchTimer = isSpecial
        ? swingWeapon.active * 1.25
        : fighter.swingIsRapidChain
        ? Math.min(0.07, swingWeapon.active * 0.75)
        : swingWeapon.active;

      const cos = Math.cos(fighter.facingAngle);
      const sin = Math.sin(fighter.facingAngle);

      if (isSpecial && swingWeapon.specialKind === 'triple_shot') {
        // Sapan Special: Fan of 3 stones capped by volleyGroupId against close-range shotgunning
        const hasAmmo = fighter.ammo > 0;
        if (hasAmmo) fighter.ammo = Math.max(0, fighter.ammo - 1);
        const speed = swingWeapon.projectileSpeed ?? 490;
        const volleyId = match.nextStoneId++;
        const angles = hasAmmo ? [-0.28, 0, 0.28] : [0];
        for (const offsetAngle of angles) {
          const a = fighter.facingAngle + offsetAngle;
          const ax = Math.cos(a);
          const ay = Math.sin(a);
          match.projectiles.push({
            id: match.nextStoneId++,
            ownerRole: fighter.role,
            kind: 'stone',
            weaponId: 'sapan',
            x: fighter.x + ax * (fighter.radius + 8),
            y: fighter.y + ay * (fighter.radius + 8),
            vx: ax * speed,
            vy: ay * speed,
            traveled: 0,
            maxDistance: swingWeapon.range,
            damage: 5,
            knockback: 185,
            radius: 10,
            spinAngle: 0,
            active: true,
            volleyGroupId: volleyId,
          });
        }
        fighter.punchDidHit = true;
        fighter.scaleX = 1.18;
        fighter.scaleY = 0.86;
        match.events.push({
          type: 'stone-shoot',
          attackerRole: fighter.role,
          weaponId: 'sapan',
          x: fighter.x + cos * 24,
          y: fighter.y + sin * 24,
          dirX: cos,
          dirY: sin,
        });
      } else if (isSpecial && swingWeapon.specialKind === 'plasma_wave') {
        // Lightsaber Special: Energy Crescent Wave
        match.projectiles.push({
          id: match.nextStoneId++,
          ownerRole: fighter.role,
          kind: 'plasma_wave',
          weaponId: 'isin_kilici',
          x: fighter.x + cos * (fighter.radius + 14),
          y: fighter.y + sin * (fighter.radius + 14),
          vx: cos * 430,
          vy: sin * 430,
          traveled: 0,
          maxDistance: 245,
          damage: 12,
          knockback: 270,
          radius: 17,
          spinAngle: fighter.facingAngle,
          active: true,
        });
        fighter.punchDidHit = true;
        fighter.scaleX = 1.2;
        fighter.scaleY = 0.86;
      } else if (isSpecial && swingWeapon.specialKind === 'boomerang_slipper') {
        // Terlik Special: Flying Spinning Slipper!
        match.projectiles.push({
          id: match.nextStoneId++,
          ownerRole: fighter.role,
          kind: 'flying_slipper',
          weaponId: 'terlik',
          x: fighter.x + cos * (fighter.radius + 12),
          y: fighter.y + sin * (fighter.radius + 12),
          vx: cos * 450,
          vy: sin * 450,
          traveled: 0,
          maxDistance: 275,
          damage: 10,
          knockback: 250,
          radius: 14,
          spinAngle: 0,
          active: true,
        });
        fighter.punchDidHit = true;
        fighter.scaleX = 1.18;
        fighter.scaleY = 0.86;
      } else if (swingWeapon.id === 'sapan' && fighter.ammo > 0) {
        // Standard Sapan Stone Projectile
        fighter.ammo = Math.max(0, fighter.ammo - 1);
        const speed = swingWeapon.projectileSpeed ?? 505;
        const dmg = rollWeaponDamage(swingWeapon, rng);
        match.projectiles.push({
          id: match.nextStoneId++,
          ownerRole: fighter.role,
          kind: 'stone',
          weaponId: 'sapan',
          x: fighter.x + cos * (fighter.radius + 8),
          y: fighter.y + sin * (fighter.radius + 8),
          vx: cos * speed,
          vy: sin * speed,
          traveled: 0,
          maxDistance: swingWeapon.range,
          damage: dmg,
          knockback: swingWeapon.knockback,
          radius: 10,
          spinAngle: 0,
          active: true,
        });
        fighter.punchDidHit = true;
        fighter.scaleX = 1.14;
        fighter.scaleY = 0.9;
        match.events.push({
          type: 'stone-shoot',
          attackerRole: fighter.role,
          weaponId: 'sapan',
          x: fighter.x + cos * 24,
          y: fighter.y + sin * 24,
          dirX: cos,
          dirY: sin,
        });
      } else {
        // Melee forward lunge + comic stretch
        const lungeSpeed = isSpecial
          ? getSpecialMeleeProfile(swingWeapon).lungeSpeed
          : 110;
        fighter.vx += cos * lungeSpeed;
        fighter.vy += sin * lungeSpeed;
        fighter.scaleX = isSpecial ? 1.24 : 1.18;
        fighter.scaleY = isSpecial ? 0.82 : 0.88;
      }
    } else if (fighter.punchPhase === 'active') {
      const isProjectileAttack =
        swingWeapon.id === 'sapan' ||
        (isSpecial &&
          (swingWeapon.specialKind === 'plasma_wave' ||
            swingWeapon.specialKind === 'boomerang_slipper' ||
            swingWeapon.specialKind === 'triple_shot'));

      const profile = isSpecial ? getSpecialMeleeProfile(swingWeapon) : null;
      const effectiveRange = profile
        ? swingWeapon.range + profile.rangeBonus
        : swingWeapon.range;
      const effectiveMinDot = profile ? profile.minDot : 0.45;

      if (
        !isProjectileAttack &&
        !fighter.punchDidHit &&
        isPunchInHitRange(fighter, other, effectiveRange, effectiveMinDot)
      ) {
        if (other.dodgeTimer <= GAME_CONSTANTS.dodgeIframeWindow) {
          fighter.punchDidHit = true;
          const dx = other.x - fighter.x;
          const dy = other.y - fighter.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const nx = dx / dist;
          const ny = dy / dist;
          const baseDmg = rollWeaponDamage(swingWeapon, rng);
          const dmg = profile
            ? Math.round(baseDmg * profile.damageMultiplier)
            : fighter.swingIsRapidChain
            ? Math.max(2, Math.round(baseDmg * 0.36))
            : baseDmg;
          const kb = profile
            ? Math.round(swingWeapon.knockback * profile.knockbackMultiplier)
            : fighter.swingIsRapidChain
            ? Math.round(swingWeapon.knockback * 0.42)
            : swingWeapon.knockback;

          applyDamageHit(
            fighter,
            other,
            swingWeapon,
            dmg,
            kb,
            nx,
            ny,
            (fighter.x + other.x) * 0.5,
            (fighter.y + other.y) * 0.5 - 16,
            match,
            rng,
            {
              isSpecial,
              extraHitStun: profile?.extraHitStun ?? 0,
              guardPierce: profile?.guardPierce ?? false,
              isRapidChain: !isSpecial && fighter.swingIsRapidChain,
            }
          );
        } else {
          fighter.punchDidHit = true;
          match.events.push({
            type: 'evaded',
            attackerRole: other.role,
            weaponId: swingWeapon.id,
            x: other.x,
            y: other.y - 20,
            dirX: 0,
            dirY: -1,
            comicWord: 'SIYRILDI!',
          });
        }
      }

      if (fighter.punchTimer <= 0) {
        fighter.punchPhase = 'recovery';
        fighter.punchTimer = fighter.swingIsRapidChain
          ? Math.min(0.055, swingWeapon.recovery * 0.45)
          : swingWeapon.recovery;
      }
    } else if (fighter.punchPhase === 'recovery' && fighter.punchTimer <= 0) {
      fighter.punchPhase = 'idle';
      fighter.punchTimer = 0;
      fighter.activeAttackIsSpecial = false;
      fighter.swingIsRapidChain = false;
    }
  }

  // Movement velocity integration
  if (fighter.dodgeTimer > 0) {
    fighter.vx = fighter.dodgeDirX * GAME_CONSTANTS.dodgeSpeed;
    fighter.vy = fighter.dodgeDirY * GAME_CONSTANTS.dodgeSpeed;
  } else {
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
      const speedFactor =
        fighter.punchPhase !== 'idle'
          ? 0.5
          : fighter.isBlocking
          ? 0.38
          : lowHpAdrenalin
          ? 1.08
          : 1;
      targetVx = mx * GAME_CONSTANTS.moveSpeed * speedFactor;
      targetVy = my * GAME_CONSTANTS.moveSpeed * speedFactor;
    }

    const blend = 1 - Math.exp(-(canMove ? GAME_CONSTANTS.acceleration : 10) * dt);
    fighter.vx += (targetVx - fighter.vx) * blend;
    fighter.vy += (targetVy - fighter.vy) * blend;
  }

  const prevX = fighter.x;
  const prevY = fighter.y;
  fighter.x += fighter.vx * dt;
  fighter.y += fighter.vy * dt;

  // Distance-synced walk animation (no skating)
  const movedDist = Math.hypot(fighter.x - prevX, fighter.y - prevY);
  if (movedDist > 0.2 && fighter.hitStunTimer <= 0 && fighter.dodgeTimer <= 0) {
    fighter.walkPhase += movedDist * 0.14;
  }

  // Always face opponent smoothly so attacks align naturally
  const faceDx = other.x - fighter.x;
  const faceDy = other.y - fighter.y;
  if (Math.hypot(faceDx, faceDy) > 1 && fighter.dodgeTimer <= 0) {
    fighter.facingAngle = Math.atan2(faceDy, faceDx);
  }
}

function updateProjectilesAndStones(
  match: MatchState,
  dt: number,
  rng: () => number
): void {
  const { bounds, player, opponent } = match;
  const sapanDef = getWeaponById('sapan');

  for (const proj of match.projectiles) {
    if (!proj.active) continue;

    const stepX = proj.vx * dt;
    const stepY = proj.vy * dt;
    proj.x += stepX;
    proj.y += stepY;
    proj.traveled += Math.hypot(stepX, stepY);
    if (proj.kind === 'flying_slipper') {
      proj.spinAngle += dt * 20;
    }

    const attacker = proj.ownerRole === 'player' ? player : opponent;
    const defender = proj.ownerRole === 'player' ? opponent : player;

    const dx = defender.x - proj.x;
    const dy = defender.y - proj.y;
    const dist = Math.hypot(dx, dy);

    if (
      dist <= defender.radius + proj.radius &&
      defender.dodgeTimer <= GAME_CONSTANTS.dodgeIframeWindow
    ) {
      proj.active = false;
      // If part of a multi-stone volley, cancel remaining sibling stones in the same volley
      // so point-blank throws cannot shotgun-stack 3x damage
      if (proj.volleyGroupId !== undefined) {
        for (const sibling of match.projectiles) {
          if (sibling.id !== proj.id && sibling.volleyGroupId === proj.volleyGroupId) {
            sibling.active = false;
          }
        }
      }
      const speedMag = Math.max(1, Math.hypot(proj.vx, proj.vy));
      const nx = proj.vx / speedMag;
      const ny = proj.vy / speedMag;
      const weaponDef = getWeaponById(proj.weaponId);

      applyDamageHit(
        attacker,
        defender,
        weaponDef,
        proj.volleyGroupId !== undefined ? 9 : proj.damage,
        proj.knockback,
        nx,
        ny,
        proj.x,
        proj.y - 10,
        match,
        rng,
        {
          isSpecial: proj.kind !== 'stone',
          guardPierce: proj.kind === 'plasma_wave',
        }
      );

      if (proj.kind === 'stone') {
        spawnFloorStone(match, proj.x - nx * 24, proj.y - ny * 24 + 14, 0.42);
      }
      continue;
    }

    const hitWall =
      proj.x <= bounds.paddingX + 8 ||
      proj.x >= bounds.width - bounds.paddingX - 8 ||
      proj.y <= bounds.paddingY + 8 ||
      proj.y >= bounds.height - bounds.paddingY - 8;

    if (hitWall || proj.traveled >= proj.maxDistance) {
      proj.active = false;
      if (proj.kind === 'stone') {
        spawnFloorStone(match, proj.x, proj.y, 0.3);
        match.events.push({
          type: 'stone-drop',
          attackerRole: proj.ownerRole,
          weaponId: 'sapan',
          x: proj.x,
          y: proj.y,
          dirX: 0,
          dirY: 1,
        });
      }
    }
  }

  if (match.projectiles.some((p) => !p.active)) {
    match.projectiles = match.projectiles.filter((p) => p.active);
  }

  // Update floor stones & automatic pickup when a Sapan fighter walks over them
  const sapanMaxAmmo = sapanDef.maxAmmo ?? 5;
  for (const stone of match.floorStones) {
    if (!stone.active) continue;
    stone.settleTimer = Math.max(0, stone.settleTimer - dt);
    stone.bobPhase += dt * 4.5;

    if (stone.settleTimer > 0 || match.winnerRole !== null) continue;

    for (const fighter of [player, opponent]) {
      if (fighter.weaponId === 'sapan' && fighter.ammo < sapanMaxAmmo) {
        const d = Math.hypot(fighter.x - stone.x, fighter.y - stone.y);
        if (d <= fighter.radius + 22) {
          stone.active = false;
          fighter.ammo += 1;
          match.events.push({
            type: 'stone-pickup',
            attackerRole: fighter.role,
            weaponId: 'sapan',
            x: stone.x,
            y: stone.y - 10,
            dirX: 0,
            dirY: -1,
            comicWord: '+1 TAŞ',
          });
          break;
        }
      }
    }
  }

  if (match.floorStones.some((s) => !s.active)) {
    match.floorStones = match.floorStones.filter((s) => s.active);
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
 * Advances a 2-player authoritative match by one clamped frame (`dt <= 0.05s`).
 * Shared identically by Single Player (AI-controlled opponent) and Server Multiplayer.
 */
export function stepTwoPlayerMatch(
  match: MatchState,
  playerIntent: InputIntent,
  opponentIntent: InputIntent,
  rawDt: number,
  rng: () => number = Math.random
): void {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  match.events.length = 0;

  // Decay camera trauma in real time
  match.cameraTrauma = Math.max(0, match.cameraTrauma - dt * 2.4);

  // Brief hitstop freeze for crunchy impact while hit flash ticks & inputs stay buffered
  if (match.hitstopTimer > 0) {
    if (playerIntent.punchPressed) {
      match.player.punchBufferTimer = 0.16;
    }
    if (playerIntent.specialPressed) {
      match.player.specialBufferTimer = 0.16;
    }
    if (opponentIntent.punchPressed) {
      match.opponent.punchBufferTimer = 0.16;
    }
    if (opponentIntent.specialPressed) {
      match.opponent.specialBufferTimer = 0.16;
    }
    match.hitstopTimer = Math.max(0, match.hitstopTimer - dt);
    match.player.hitFlashTimer = Math.max(0, match.player.hitFlashTimer - dt);
    match.opponent.hitFlashTimer = Math.max(0, match.opponent.hitFlashTimer - dt);
    return;
  }

  // KO celebratory beat before presenting round conclusion
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

  updateFighterAction(match.player, match.opponent, playerIntent, dt, match, rng);
  if (match.winnerRole === null) {
    updateFighterAction(match.opponent, match.player, opponentIntent, dt, match, rng);
  }

  updateProjectilesAndStones(match, dt, rng);

  resolveFighterSeparation(match.player, match.opponent);
  clampFighterToArena(match.player, match.bounds);
  clampFighterToArena(match.opponent, match.bounds);
}

/**
 * Advances the single-player simulation by one clamped frame (`dt <= 0.05s`).
 */
export function stepMatch(
  match: MatchState,
  playerIntent: InputIntent,
  rawDt: number,
  rng: () => number = Math.random
): void {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  const aiIntent =
    match.hitstopTimer > 0 || match.winnerRole !== null
      ? { moveX: 0, moveY: 0, punchPressed: false }
      : computeAIIntent(
          match.ai,
          match.opponent,
          match.player,
          match.bounds,
          dt,
          rng,
          match.floorStones
        );

  stepTwoPlayerMatch(match, playerIntent, aiIntent, dt, rng);
}
