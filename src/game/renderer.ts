import { getCharacterById } from './characters';
import type { ArenaBounds, CharacterDef, FighterState, MatchState } from './types';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  kind: 'star' | 'spark' | 'dust';
  rot: number;
  vRot: number;
}

interface ComicPopup {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  tilt: number;
}

const MAX_PARTICLES = 72;
const MAX_POPUPS = 10;

export class ArenaRenderer {
  private particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 6,
    life: 0,
    maxLife: 1,
    color: '#F59E0B',
    kind: 'star',
    rot: 0,
    vRot: 0,
  }));
  private particleCursor = 0;

  private popups: ComicPopup[] = Array.from({ length: MAX_POPUPS }, () => ({
    active: false,
    x: 0,
    y: 0,
    vy: 0,
    text: '',
    life: 0,
    maxLife: 1,
    color: '#E63946',
    tilt: 0,
  }));
  private popupCursor = 0;

  private floorCacheCanvas: HTMLCanvasElement | null = null;
  private floorCacheKey = '';

  resetEffects(): void {
    for (const p of this.particles) p.active = false;
    for (const w of this.popups) w.active = false;
  }

  spawnHitBurst(x: number, y: number, dirX: number, dirY: number, comicWord?: string, isKO = false): void {
    const count = isKO ? 26 : 14;
    const colors = ['#FACC15', '#FB923C', '#E63946', '#FFFFFF', '#38BDF8'];

    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

      const spread = (Math.random() - 0.5) * 2.4;
      const baseAngle = Math.atan2(dirY, dirX) + spread;
      const speed = (isKO ? 170 : 120) + Math.random() * 210;

      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(baseAngle) * speed;
      p.vy = Math.sin(baseAngle) * speed - 40;
      p.size = i % 3 === 0 ? 8 + Math.random() * 5 : 4 + Math.random() * 4;
      p.maxLife = (isKO ? 0.65 : 0.38) + Math.random() * 0.22;
      p.life = p.maxLife;
      p.color = colors[i % colors.length];
      p.kind = i % 2 === 0 ? 'star' : 'spark';
      p.rot = Math.random() * Math.PI * 2;
      p.vRot = (Math.random() - 0.5) * 14;
    }

    if (comicWord) {
      const w = this.popups[this.popupCursor];
      this.popupCursor = (this.popupCursor + 1) % MAX_POPUPS;
      w.active = true;
      w.x = x + (Math.random() - 0.5) * 24;
      w.y = y - 24;
      w.vy = -58;
      w.text = comicWord;
      w.maxLife = isKO ? 0.95 : 0.62;
      w.life = w.maxLife;
      w.color = isKO ? '#E63946' : '#F59E0B';
      w.tilt = (Math.random() - 0.5) * 0.28;
    }
  }

  spawnDust(x: number, y: number): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
    p.active = true;
    p.x = x + (Math.random() - 0.5) * 14;
    p.y = y + 12;
    p.vx = (Math.random() - 0.5) * 26;
    p.vy = -12 - Math.random() * 18;
    p.size = 4 + Math.random() * 4;
    p.maxLife = 0.28;
    p.life = p.maxLife;
    p.color = 'rgba(148, 163, 184, 0.45)';
    p.kind = 'dust';
    p.rot = 0;
    p.vRot = 0;
  }

  updateEffects(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-5 * dt);
      p.vy *= Math.exp(-5 * dt);
      p.rot += p.vRot * dt;
    }

    for (const w of this.popups) {
      if (!w.active) continue;
      w.life -= dt;
      if (w.life <= 0) {
        w.active = false;
        continue;
      }
      w.y += w.vy * dt;
      w.vy *= Math.exp(-4 * dt);
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    match: MatchState,
    timeSeconds: number,
    isTitleBackdrop = false
  ): void {
    ctx.save();
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Warm sunlit background around the ring
    ctx.fillStyle = '#FBF7EE';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const bounds = match.bounds;
    const scale = Math.min(canvasWidth / bounds.width, canvasHeight / bounds.height);
    const offsetX = (canvasWidth - bounds.width * scale) * 0.5;
    const offsetY = (canvasHeight - bounds.height * scale) * 0.5;

    // Decaying camera shake (trauma * trauma)
    const shakeMag = match.cameraTrauma * match.cameraTrauma * 14;
    const shakeX = shakeMag > 0.1 ? (Math.random() - 0.5) * 2 * shakeMag : 0;
    const shakeY = shakeMag > 0.1 ? (Math.random() - 0.5) * 2 * shakeMag : 0;

    // Gentle camera drift on Title Screen
    const titlePanX = isTitleBackdrop ? Math.sin(timeSeconds * 0.55) * 14 : 0;
    const titlePanY = isTitleBackdrop ? Math.cos(timeSeconds * 0.42) * 8 : 0;

    ctx.translate(offsetX + shakeX + titlePanX, offsetY + shakeY + titlePanY);
    ctx.scale(scale, scale);

    this.drawCachedArenaFloor(ctx, bounds);

    // Sort fighters by Y so lower fighter renders in front (2.5D depth)
    const fighters: FighterState[] =
      match.player.y <= match.opponent.y
        ? [match.player, match.opponent]
        : [match.opponent, match.player];

    for (const fighter of fighters) {
      const isLoser =
        match.winnerRole !== null && match.winnerRole !== fighter.role;
      const isWinner =
        match.winnerRole !== null && match.winnerRole === fighter.role;
      this.drawFighter(ctx, fighter, timeSeconds, isWinner, isLoser);
    }

    this.drawParticles(ctx);
    this.drawComicPopups(ctx);

    ctx.restore();
  }

  private drawCachedArenaFloor(ctx: CanvasRenderingContext2D, bounds: ArenaBounds): void {
    const key = `${bounds.width}x${bounds.height}:${bounds.paddingX}x${bounds.paddingY}`;
    if (typeof document !== 'undefined') {
      if (!this.floorCacheCanvas || this.floorCacheKey !== key) {
        this.floorCacheCanvas = document.createElement('canvas');
        this.floorCacheCanvas.width = bounds.width;
        this.floorCacheCanvas.height = bounds.height;
        this.floorCacheKey = key;
        const offCtx = this.floorCacheCanvas.getContext('2d');
        if (offCtx) {
          this.drawArenaFloor(offCtx, bounds);
        }
      }
      ctx.drawImage(this.floorCacheCanvas, 0, 0);
      return;
    }
    this.drawArenaFloor(ctx, bounds);
  }

  private drawArenaFloor(ctx: CanvasRenderingContext2D, bounds: ArenaBounds): void {
    const left = bounds.paddingX - 18;
    const top = bounds.paddingY - 22;
    const width = bounds.width - (bounds.paddingX - 18) * 2;
    const height = bounds.height - (bounds.paddingY - 22) * 2;
    const radius = 28;

    // Outer drop shadow under raised arena platform
    ctx.fillStyle = 'rgba(30, 41, 59, 0.12)';
    this.roundRectPath(ctx, left + 4, top + 20, width, height, radius);
    ctx.fill();

    // 2.5D front bevel skirt of the ring platform
    ctx.fillStyle = '#D97706';
    this.roundRectPath(ctx, left, top + 12, width, height, radius);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1E293B';
    ctx.stroke();

    // Main arena border frame
    ctx.fillStyle = '#FDE68A';
    this.roundRectPath(ctx, left, top, width, height, radius);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1E293B';
    ctx.stroke();

    // Inner playable mat
    const matLeft = bounds.paddingX;
    const matTop = bounds.paddingY;
    const matWidth = bounds.width - bounds.paddingX * 2;
    const matHeight = bounds.height - bounds.paddingY * 2;

    ctx.fillStyle = '#FFFDF7';
    this.roundRectPath(ctx, matLeft, matTop, matWidth, matHeight, 18);
    ctx.fill();

    // Subtle geometric mat stripes & perspective tiles
    ctx.save();
    this.roundRectPath(ctx, matLeft, matTop, matWidth, matHeight, 18);
    ctx.clip();

    ctx.fillStyle = '#F4EFE4';
    const tileW = matWidth / 6;
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(matLeft + i * tileW, matTop, tileW, matHeight);
      }
    }

    // Center court markings
    const cx = bounds.width / 2;
    const cy = bounds.height / 2 + 2;

    ctx.strokeStyle = '#E2D9C5';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, matTop);
    ctx.lineTo(cx, matTop + matHeight);
    ctx.stroke();

    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 86, 62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E63946';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner cushions (red / blue corners)
    this.drawCornerPad(ctx, matLeft + 6, matTop + 6, '#E63946');
    this.drawCornerPad(ctx, matLeft + matWidth - 6, matTop + 6, '#0284C7');
    this.drawCornerPad(ctx, matLeft + 6, matTop + matHeight - 6, '#0284C7');
    this.drawCornerPad(ctx, matLeft + matWidth - 6, matTop + matHeight - 6, '#E63946');

    ctx.restore();

    // Crisp inner boundary outline
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 3.5;
    this.roundRectPath(ctx, matLeft, matTop, matWidth, matHeight, 18);
    ctx.stroke();
  }

  private drawCornerPad(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string
  ): void {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawFighter(
    ctx: CanvasRenderingContext2D,
    f: FighterState,
    timeSeconds: number,
    isWinner: boolean,
    isLoser: boolean
  ): void {
    const def = getCharacterById(f.characterId);
    const cos = Math.cos(f.facingAngle);
    const sin = Math.sin(f.facingAngle);
    const facingRight = cos >= 0;

    // Ground shadow + player/opponent ring cue
    ctx.save();
    ctx.translate(f.x, f.y + 18);

    // Subtle colored ground ring so player is always immediately identifiable
    ctx.strokeStyle =
      f.role === 'player' ? 'rgba(230, 57, 70, 0.55)' : 'rgba(2, 132, 199, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash(f.role === 'player' ? [] : [5, 4]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Compute dynamic posture offsets
    const walkBob = Math.abs(Math.sin(f.walkPhase)) * 3.5;
    const victoryHop = isWinner ? Math.abs(Math.sin(f.victoryBouncePhase)) * 18 : 0;
    const defeatSink = isLoser ? 11 : 0;
    const wobbleX = f.hitStunTimer > 0 ? Math.sin(f.wobblePhase) * 4.5 : 0;
    const wobbleTilt =
      f.hitStunTimer > 0
        ? Math.sin(f.wobblePhase * 0.9) * 0.16
        : isLoser
        ? Math.sin(f.wobblePhase * 0.6) * 0.14 - 0.18
        : 0;

    // Punch lean forward/back
    let leanOffset = 0;
    let punchReach = 0;
    if (f.punchPhase === 'windup') {
      leanOffset = -5;
      punchReach = -8;
    } else if (f.punchPhase === 'active') {
      leanOffset = 9;
      punchReach = 34;
    } else if (f.punchPhase === 'recovery') {
      leanOffset = 3;
      punchReach = 12;
    }

    ctx.save();
    ctx.translate(
      f.x + cos * leanOffset + wobbleX,
      f.y - walkBob - victoryHop + defeatSink
    );
    ctx.rotate(wobbleTilt);
    ctx.scale(f.scaleX, f.scaleY);

    // Hit flash tinting
    const isFlashing = f.hitFlashTimer > 0;

    // Legs / Shoes (animated with distance-synced stride)
    const stride = Math.sin(f.walkPhase) * 6;
    ctx.fillStyle = isFlashing ? '#FFFFFF' : def.palette.pants;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.6;

    // Left & Right feet
    const leftFootY = 14 + stride * 0.45;
    const rightFootY = 14 - stride * 0.45;
    ctx.beginPath();
    ctx.ellipse(-9, leftFootY, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(9, rightFootY, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Back arm (non-punching)
    const perpX = -sin;
    const perpY = cos;
    const backSide = -f.punchArmSide;
    const backHandX =
      perpX * backSide * 19 +
      cos * 8 +
      (isWinner ? 0 : 0);
    const backHandY =
      perpY * backSide * 11 +
      sin * 6 -
      4 -
      (isWinner ? Math.abs(Math.sin(f.victoryBouncePhase)) * 18 : 0);

    this.drawGlove(ctx, backHandX, backHandY, 8.5, isFlashing ? '#FFFFFF' : def.palette.glove);

    // Torso
    this.drawTorso(ctx, def, isFlashing, timeSeconds, Math.hypot(f.vx, f.vy));

    // Head + Hair + Face
    const headBob = f.hitStunTimer > 0 ? Math.sin(f.wobblePhase * 1.3) * 3 : 0;
    this.drawHead(ctx, def, cos, sin, facingRight, isFlashing, isLoser, isWinner, headBob, f.hitStunTimer > 0);

    // Front Punching Arm (extends forward cleanly along facing angle!)
    const frontSide = f.punchArmSide;
    const restX = perpX * frontSide * 19 + cos * 11;
    const restY = perpY * frontSide * 11 + sin * 8 - 4;
    const activeX = cos * (18 + punchReach) + perpX * frontSide * 8;
    const activeY =
      sin * (18 + punchReach) +
      perpY * frontSide * 6 -
      4 -
      (isWinner ? 18 + Math.abs(Math.sin(f.victoryBouncePhase)) * 12 : 0);

    const fistX = f.punchPhase === 'idle' ? restX : activeX;
    const fistY = f.punchPhase === 'idle' ? restY : activeY;

    // Speed motion arc on active punch
    if (f.punchPhase === 'active') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(restX, restY);
      ctx.lineTo(fistX - cos * 6, fistY - sin * 6);
      ctx.stroke();
      ctx.restore();
    }

    // Arm sleeve connector
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(perpX * frontSide * 14, -4);
    ctx.lineTo(fistX, fistY);
    ctx.stroke();

    ctx.strokeStyle = isFlashing ? '#FFFFFF' : def.palette.primary;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(perpX * frontSide * 14, -4);
    ctx.lineTo(fistX, fistY);
    ctx.stroke();

    this.drawGlove(
      ctx,
      fistX,
      fistY,
      f.punchPhase === 'active' ? 11.5 : 9.2,
      isFlashing ? '#FFFFFF' : def.palette.glove
    );

    // Funny spinning stars above head on defeat
    if (isLoser) {
      for (let i = 0; i < 3; i++) {
        const a = timeSeconds * 4.5 + (i * Math.PI * 2) / 3;
        const sx = Math.cos(a) * 18;
        const sy = -42 + Math.sin(a) * 6;
        this.drawStar(ctx, sx, sy, 5, '#FACC15', '#1E293B');
      }
    }

    ctx.restore();
  }

  private drawGlove(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string
  ): void {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Small specular highlight dot on glove
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTorso(
    ctx: CanvasRenderingContext2D,
    def: CharacterDef,
    isFlashing: boolean,
    timeSeconds: number,
    speed: number
  ): void {
    ctx.save();
    // Rounded torso silhouette
    ctx.fillStyle = isFlashing ? '#FFFFFF' : def.palette.primary;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.8;
    this.roundRectPath(ctx, -17, -14, 34, 27, 12);
    ctx.fill();

    if (!isFlashing) {
      ctx.save();
      this.roundRectPath(ctx, -17, -14, 34, 27, 12);
      ctx.clip();

      if (def.outfitStyle === 'jacket') {
        // Türk: Red sports jacket with white zipper stripe & shoulder trim
        ctx.fillStyle = def.palette.secondary;
        ctx.fillRect(-3.5, -14, 7, 27);
        ctx.fillRect(-17, -14, 34, 5);
      } else if (def.outfitStyle === 'vest') {
        // Kürt: Green base + burgundy vest panels + geometric diamond trim
        ctx.fillStyle = def.palette.secondary;
        ctx.fillRect(-17, -14, 11, 27);
        ctx.fillRect(6, -14, 11, 27);
        ctx.fillStyle = def.palette.accent;
        for (let y = -8; y <= 8; y += 8) {
          ctx.beginPath();
          ctx.moveTo(-8, y);
          ctx.lineTo(-5, y - 3);
          ctx.lineTo(-2, y);
          ctx.lineTo(-5, y + 3);
          ctx.closePath();
          ctx.fill();
        }
      } else if (def.outfitStyle === 'tracksuit') {
        // Azeri: Blue, red, green athletic bands
        ctx.fillStyle = def.palette.secondary;
        ctx.fillRect(-17, -3, 34, 6);
        ctx.fillStyle = def.palette.accent;
        ctx.fillRect(-17, 3, 34, 6);
      } else if (def.outfitStyle === 'blazer') {
        // İngiliz: Navy blazer + grey V-collar + cute red bow-tie
        ctx.fillStyle = def.palette.secondary;
        ctx.beginPath();
        ctx.moveTo(-8, -14);
        ctx.lineTo(0, -1);
        ctx.lineTo(8, -14);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = def.palette.accent;
        ctx.beginPath();
        ctx.moveTo(-6, -10);
        ctx.lineTo(0, -7);
        ctx.lineTo(6, -10);
        ctx.lineTo(6, -4);
        ctx.lineTo(0, -7);
        ctx.lineTo(-6, -4);
        ctx.closePath();
        ctx.fill();
      } else if (def.outfitStyle === 'stripes') {
        // Fransız: Navy-white marinière stripes + fluttering red scarf
        ctx.fillStyle = def.palette.secondary;
        for (let y = -11; y < 14; y += 8) {
          ctx.fillRect(-17, y, 34, 4);
        }
      }

      ctx.restore();
    }

    // Crisp outer border
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.8;
    this.roundRectPath(ctx, -17, -14, 34, 27, 12);
    ctx.stroke();

    // Fluttering red scarf for Fransız
    if (def.outfitStyle === 'stripes' && !isFlashing) {
      const flutter = Math.sin(timeSeconds * 8 + speed * 0.03) * 3;
      ctx.fillStyle = def.palette.accent;
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, -11);
      ctx.quadraticCurveTo(0, -6, 10, -11);
      ctx.lineTo(13 + flutter, -3);
      ctx.lineTo(4 + flutter, -1);
      ctx.lineTo(-9, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawHead(
    ctx: CanvasRenderingContext2D,
    def: CharacterDef,
    cos: number,
    sin: number,
    facingRight: boolean,
    isFlashing: boolean,
    isLoser: boolean,
    isWinner: boolean,
    headBob: number,
    isStunned: boolean
  ): void {
    ctx.save();
    ctx.translate(headBob, -23);

    // Head sphere
    ctx.fillStyle = isFlashing ? '#FFFFFF' : def.palette.skin;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(0, 0, 15.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (!isFlashing) {
      // Distinct hair styles
      ctx.fillStyle = def.palette.hair;
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.2;

      if (def.hairStyle === 'short') {
        ctx.beginPath();
        ctx.arc(0, -4, 15.2, Math.PI * 0.95, Math.PI * 2.05);
        ctx.quadraticCurveTo(0, -9, -15, -3);
        ctx.fill();
        ctx.stroke();
      } else if (def.hairStyle === 'wavy') {
        ctx.beginPath();
        ctx.arc(-6, -9, 7, 0, Math.PI * 2);
        ctx.arc(0, -12, 8, 0, Math.PI * 2);
        ctx.arc(7, -9, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -5, 15.4, Math.PI, Math.PI * 2);
        ctx.stroke();
      } else if (def.hairStyle === 'slick') {
        ctx.beginPath();
        ctx.moveTo(-15, -3);
        ctx.quadraticCurveTo(-4, -20, 14, -12);
        ctx.quadraticCurveTo(16, -6, 15, -3);
        ctx.quadraticCurveTo(0, -10, -15, -3);
        ctx.fill();
        ctx.stroke();
      } else if (def.hairStyle === 'parted') {
        ctx.beginPath();
        ctx.arc(0, -4, 15.5, Math.PI * 0.96, Math.PI * 2.04);
        ctx.lineTo(13, -4);
        ctx.quadraticCurveTo(3, -10, -3, -5);
        ctx.quadraticCurveTo(-9, -11, -15, -4);
        ctx.fill();
        ctx.stroke();
      } else if (def.hairStyle === 'curly') {
        ctx.beginPath();
        ctx.arc(-8, -8, 6.5, 0, Math.PI * 2);
        ctx.arc(0, -12, 7.5, 0, Math.PI * 2);
        ctx.arc(8, -8, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1E293B';
        ctx.beginPath();
        ctx.arc(0, -12, 7.5, Math.PI * 0.9, Math.PI * 2.1);
        ctx.stroke();
      }

      // Expressive Eyes looking slightly toward opponent
      const lookX = cos * 3.5;
      const lookY = sin * 2.2;
      const eyeLX = -5 + lookX;
      const eyeRX = 5 + lookX;
      const eyeY = -1 + lookY;

      if (isLoser || isStunned) {
        // Comedic >< dizzy eyes
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(eyeLX - 2.5, eyeY - 2.5);
        ctx.lineTo(eyeLX + 2.5, eyeY + 2.5);
        ctx.moveTo(eyeLX + 2.5, eyeY - 2.5);
        ctx.lineTo(eyeLX - 2.5, eyeY + 2.5);
        ctx.moveTo(eyeRX - 2.5, eyeY - 2.5);
        ctx.lineTo(eyeRX + 2.5, eyeY + 2.5);
        ctx.moveTo(eyeRX + 2.5, eyeY - 2.5);
        ctx.lineTo(eyeRX - 2.5, eyeY + 2.5);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.arc(eyeLX, eyeY, 2.3, 0, Math.PI * 2);
        ctx.arc(eyeRX, eyeY, 2.3, 0, Math.PI * 2);
        ctx.fill();

        // Tiny eye shine
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(eyeLX - 0.7, eyeY - 0.7, 0.8, 0, Math.PI * 2);
        ctx.arc(eyeRX - 0.7, eyeY - 0.7, 0.8, 0, Math.PI * 2);
        ctx.fill();

        // Determined eyebrows
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        const tilt = facingRight ? 1.5 : -1.5;
        ctx.moveTo(eyeLX - 3, eyeY - 4.5);
        ctx.lineTo(eyeLX + 3, eyeY - 4.5 + tilt * 0.5);
        ctx.moveTo(eyeRX - 3, eyeY - 4.5 + tilt * 0.5);
        ctx.lineTo(eyeRX + 3, eyeY - 4.5);
        ctx.stroke();
      }

      // Mouth (happy grin on victory, funny O on hit, confident smirk otherwise)
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (isWinner) {
        ctx.arc(lookX * 0.7, 5 + lookY * 0.5, 4.5, 0, Math.PI);
      } else if (isStunned || isLoser) {
        ctx.arc(lookX * 0.7, 6 + lookY * 0.5, 3, 0, Math.PI * 2);
      } else {
        ctx.moveTo(lookX * 0.7 - 3.5, 6 + lookY * 0.5);
        ctx.quadraticCurveTo(lookX * 0.7, 8 + lookY * 0.5, lookX * 0.7 + 4, 5.5 + lookY * 0.5);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.kind === 'star') {
        this.drawStar(ctx, 0, 0, p.size, p.color, '#1E293B');
      } else if (p.kind === 'spark') {
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-p.size * 0.8, -p.size * 0.3, p.size * 1.6, p.size * 0.6);
        ctx.strokeRect(-p.size * 0.8, -p.size * 0.3, p.size * 1.6, p.size * 0.6);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (1.2 - alpha * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawComicPopups(ctx: CanvasRenderingContext2D): void {
    for (const w of this.popups) {
      if (!w.active) continue;
      const progress = 1 - w.life / w.maxLife;
      const popScale =
        progress < 0.2 ? 0.6 + (progress / 0.2) * 0.65 : 1.25 - progress * 0.25;
      const alpha = w.life < 0.18 ? w.life / 0.18 : 1;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(w.x, w.y);
      ctx.rotate(w.tilt);
      ctx.scale(popScale, popScale);

      ctx.font = '900 24px "Trebuchet MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#1E293B';
      ctx.lineJoin = 'round';
      ctx.strokeText(w.text, 0, 0);
      ctx.fillStyle = w.color;
      ctx.fillText(w.text, 0, 0);
      ctx.restore();
    }
  }

  private drawStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    fill: string,
    stroke: string
  ): void {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const px = x + Math.cos(angle) * rad;
      const py = y + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  private roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
