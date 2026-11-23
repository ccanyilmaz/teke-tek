export type CharacterId = 'turk' | 'kurt' | 'azeri' | 'ingiliz' | 'fransiz';

export type GameScreenState =
  | 'title'
  | 'select'
  | 'vs'
  | 'weapon-roulette'
  | 'playing'
  | 'paused'
  | 'gameover';

export type WeaponId =
  | 'yumruk'
  | 'sopa'
  | 'bicak'
  | 'isin_kilici'
  | 'sapan'
  | 'kalem'
  | 'terlik'
  | 'kizartma_tavasi'
  | 'cetvel'
  | 'baget_ekmek';

export type DamageStage = 0 | 1 | 2 | 3 | 4;

export type PunchPhase = 'idle' | 'windup' | 'active' | 'recovery';

export type AIBehaviorState = 'APPROACH' | 'ATTACK' | 'RETREAT' | 'WAIT' | 'COLLECT_STONE';

export type ArenaThemeId = 'deniz' | 'buz' | 'col' | 'orman' | 'volkan';

export type SpecialKind =
  | 'heavy_lunge'
  | 'wide_sweep'
  | 'dash_slash'
  | 'plasma_wave'
  | 'triple_shot'
  | 'flurry_poke'
  | 'boomerang_slipper'
  | 'pan_smash'
  | 'elastic_snap'
  | 'crust_whack';

export type ProjectileKind = 'stone' | 'plasma_wave' | 'flying_slipper';

export interface CharacterPalette {
  skin: string;
  hair: string;
  primary: string;
  secondary: string;
  accent: string;
  pants: string;
  glove: string;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  upperName: string;
  tagline: string;
  hairStyle: 'short' | 'wavy' | 'slick' | 'parted' | 'curly';
  outfitStyle: 'jacket' | 'vest' | 'tracksuit' | 'blazer' | 'stripes';
  palette: CharacterPalette;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  upperName: string;
  tagline: string;
  damageMin: number;
  damageMax: number;
  windup: number;
  active: number;
  recovery: number;
  cooldown: number;
  range: number;
  knockback: number;
  maxAmmo: number | null;
  projectileSpeed?: number;
  specialName: string;
  specialDesc: string;
  specialKind: SpecialKind;
  specialCooldown: number;
  hitWords: readonly string[];
  color: string;
  accentColor: string;
}

export interface InputIntent {
  moveX: number; // -1 to 1
  moveY: number; // -1 to 1
  punchPressed: boolean;
  specialPressed?: boolean;
  dodgePressed?: boolean;
  blockHeld?: boolean;
}

export interface FighterState {
  role: 'player' | 'opponent';
  nickname?: string;
  characterId: CharacterId;
  weaponId: WeaponId;
  ammo: number; // Used by sapan (0..5)
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingAngle: number; // radians
  hp: number;
  maxHp: number;
  radius: number;
  walkPhase: number;
  punchPhase: PunchPhase;
  punchTimer: number;
  punchCooldown: number;
  punchDidHit: boolean;
  punchArmSide: 1 | -1;
  activeSwingWeaponId: WeaponId;
  activeAttackIsSpecial: boolean;
  rapidSwingTimer: number;
  swingIsRapidChain: boolean;
  specialCooldown: number;
  dodgeTimer: number;
  dodgeCooldown: number;
  dodgeDirX: number;
  dodgeDirY: number;
  isBlocking: boolean;
  blockHoldTime: number;
  blockCooldown: number;
  comboCount: number;
  comboTimer: number;
  maxCombo: number;
  hitStunTimer: number;
  hitFlashTimer: number;
  scaleX: number;
  scaleY: number;
  attacksAttempted: number;
  hitsLanded: number;
  damageDealt: number;
  sapanHits: number;
  punchBufferTimer: number;
  specialBufferTimer: number;
  wobblePhase: number;
  victoryBouncePhase: number;
  totalDamageTaken: number;
  damageStage: DamageStage;
}

export interface ProjectileState {
  id: number;
  ownerRole: 'player' | 'opponent';
  kind: ProjectileKind;
  weaponId: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  traveled: number;
  maxDistance: number;
  damage: number;
  knockback: number;
  radius: number;
  spinAngle: number;
  active: boolean;
  volleyGroupId?: number;
}

export interface FloorStoneState {
  id: number;
  x: number;
  y: number;
  settleTimer: number;
  bobPhase: number;
  active: boolean;
}

export interface AIControllerState {
  behavior: AIBehaviorState;
  stateTimer: number;
  strafeDir: 1 | -1;
  hesitationCooldown: number;
  blockPulseTimer: number;
  reactionCooldown: number;
}

export interface ArenaBounds {
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
}

export interface MatchHitEvent {
  type:
    | 'swing'
    | 'special'
    | 'hit'
    | 'blocked'
    | 'dodge'
    | 'evaded'
    | 'ko'
    | 'stone-shoot'
    | 'stone-drop'
    | 'stone-pickup';
  attackerRole: 'player' | 'opponent';
  targetRole?: 'player' | 'opponent';
  targetRemainingHp?: number;
  damageAmount?: number;
  weaponId?: WeaponId;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  comicWord?: string;
  isHeavy?: boolean;
}

export interface MatchState {
  bounds: ArenaBounds;
  roundNumber: number;
  arenaTheme: ArenaThemeId;
  player: FighterState;
  opponent: FighterState;
  projectiles: ProjectileState[];
  floorStones: FloorStoneState[];
  nextStoneId: number;
  ai: AIControllerState;
  elapsedTime: number;
  hitstopTimer: number;
  cameraTrauma: number;
  koFinishTimer: number;
  winnerRole: 'player' | 'opponent' | null;
  victoryPhrase: string;
  events: MatchHitEvent[];
  finished: boolean;
}

export interface RoundResultRecord {
  roundNumber: number;
  winnerRole: 'player' | 'opponent';
  playerWeaponId: WeaponId;
  opponentWeaponId: WeaponId;
  playerHpRemaining: number;
  playerHitsLanded: number;
  playerAttacksAttempted: number;
  playerDamageDealt: number;
  playerDamageTakenInRound: number;
  playerSapanHits: number;
  playerMaxCombo: number;
  durationSeconds: number;
}

export interface MatchSeriesState {
  playerCharacterId: CharacterId;
  opponentCharacterId: CharacterId;
  playerWins: number;
  opponentWins: number;
  currentRound: number;
  playerWeaponId: WeaponId;
  opponentWeaponId: WeaponId;
  rerollUsed: boolean;
  playerTotalDamageTaken: number;
  opponentTotalDamageTaken: number;
  playerDamageStage: DamageStage;
  opponentDamageStage: DamageStage;
  totalPlayerHits: number;
  totalPlayerAttacks: number;
  totalPlayerDamageDealt: number;
  totalSapanHits: number;
  maxCombo: number;
  weaponsUsed: WeaponId[];
  totalDurationSeconds: number;
  history: RoundResultRecord[];
  winnerRole: 'player' | 'opponent' | null;
}

export interface AchievementBadge {
  id: string;
  title: string;
  description: string;
}

export interface MatchTitleAward {
  title: string;
  reason: string;
}

export interface MatchSummary {
  winnerRole: 'player' | 'opponent';
  winnerCharacterId: CharacterId;
  loserCharacterId: CharacterId;
  playerCharacterId: CharacterId;
  opponentCharacterId: CharacterId;
  playerWins: number;
  opponentWins: number;
  totalRoundsPlayed: number;
  playerDamageStage: DamageStage;
  opponentDamageStage: DamageStage;
  victoryPhrase: string;
  playerHitsLanded: number;
  playerAttacksMissed: number;
  playerDamageDealt: number;
  playerDamageTaken: number;
  weaponsUsed: WeaponId[];
  maxCombo: number;
  durationSeconds: number;
  titleAward: MatchTitleAward;
  achievements: AchievementBadge[];
}
