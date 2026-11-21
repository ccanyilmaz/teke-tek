export type CharacterId = 'turk' | 'kurt' | 'azeri' | 'ingiliz' | 'fransiz';

export type GameScreenState = 'title' | 'select' | 'playing' | 'paused' | 'gameover';

export type PunchPhase = 'idle' | 'windup' | 'active' | 'recovery';

export type AIBehaviorState = 'APPROACH' | 'ATTACK' | 'RETREAT' | 'WAIT';

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

export interface InputIntent {
  moveX: number; // -1 to 1
  moveY: number; // -1 to 1
  punchPressed: boolean; // edge-triggered or buffered
}

export interface FighterState {
  role: 'player' | 'opponent';
  characterId: CharacterId;
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
  hitStunTimer: number;
  hitFlashTimer: number;
  scaleX: number;
  scaleY: number;
  hitsLanded: number;
  punchBufferTimer: number;
  wobblePhase: number;
  victoryBouncePhase: number;
}

export interface AIControllerState {
  behavior: AIBehaviorState;
  stateTimer: number;
  strafeDir: 1 | -1;
  hesitationCooldown: number;
}

export interface ArenaBounds {
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
}

export interface MatchHitEvent {
  type: 'swing' | 'hit' | 'ko';
  attackerRole: 'player' | 'opponent';
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  comicWord?: string;
}

export interface MatchState {
  bounds: ArenaBounds;
  player: FighterState;
  opponent: FighterState;
  ai: AIControllerState;
  elapsedTime: number;
  hitstopTimer: number;
  cameraTrauma: number;
  koFinishTimer: number; // brief 0.55s beat before modal opens
  winnerRole: 'player' | 'opponent' | null;
  victoryPhrase: string;
  events: MatchHitEvent[];
  finished: boolean;
}

export interface MatchSummary {
  winnerRole: 'player' | 'opponent';
  winnerCharacterId: CharacterId;
  loserCharacterId: CharacterId;
  victoryPhrase: string;
  playerHpRemaining: number;
  opponentHpRemaining: number;
  playerHitsLanded: number;
  durationSeconds: number;
}

export interface LocalStats {
  muted: boolean;
  winsByCharacter: Record<CharacterId, number>;
  totalMatches: number;
}
