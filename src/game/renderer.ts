import { getArenaThemeForRound } from './arenas';
import { getCharacterById } from './characters';
import { getWeaponById } from './weapons';
import type {
  ArenaBounds,
  ArenaThemeId,
  CharacterDef,
  DamageStage,
  FighterState,
  MatchState,
  WeaponId,
} from './types';

function getWeaponMotionStyle(
  weaponId: WeaponId
): 'overhead' | 'slash' | 'thrust' | 'slingshot' {
  if (
    weaponId === 'kizartma_tavasi' ||
    weaponId === 'sopa' ||
    weaponId === 'baget_ekmek' ||
    weaponId === 'terlik'
  ) {
    return 'overhead';
  }
  if (weaponId === 'isin_kilici' || weaponId === 'cetvel') {
    return 'slash';
  }
  if (weaponId === 'sapan') {
    return 'slingshot';
  }
  return 'thrust';
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  kind: 'star' | 'spark' | 'dust' | 'blood';
  rot: number;
  vRot: number;
}

interface BloodPuddle {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  color: string;
  alpha: number;
}

const MAX_PARTICLES = 128;
const MAX_BLOOD_PUDDLES = 220;

export class ArenaRenderer {
  private particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravity: 0,
    size: 6,
    life: 0,
    maxLife: 1,
    color: '#F59E0B',
    kind: 'star',
    rot: 0,
    vRot: 0,
  }));
  private particleCursor = 0;
  private bloodPuddles: BloodPuddle[] = [];

  private floorCacheCanvas: HTMLCanvasElement | null = null;
  private floorCacheKey = '';

  resetEffects(clearBlood = true): void {
    for (const p of this.particles) p.active = false;
    if (clearBlood) {
      this.bloodPuddles = [];
    }
  }

  spawnHitBurst(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    _comicWord?: string,
    isKO = false,
    weaponId: WeaponId = 'yumruk',
    targetRemainingHpRatio = 0.75,
    damageAmount = 8
  ): void {
    // Minimal crisp impact sparks (no floating BAM/GÜM text)
    const count = isKO ? 14 : 7;
    let colors = ['#FACC15', '#FB923C', '#FFFFFF', '#E63946'];
    if (weaponId === 'isin_kilici') {
      colors = ['#06B6D4', '#A5F3FC', '#FFFFFF', '#38BDF8'];
    } else if (weaponId === 'baget_ekmek') {
      colors = ['#FDE68A', '#D97706', '#FFFFFF', '#F59E0B'];
    } else if (weaponId === 'kalem') {
      colors = ['#FACC15', '#F472B6', '#FFFFFF', '#1E293B'];
    }

    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

      const spread = (Math.random() - 0.5) * 2.1;
      const baseAngle = Math.atan2(dirY, dirX) + spread;
      const speed = (isKO ? 150 : 105) + Math.random() * 145;

      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(baseAngle) * speed;
      p.vy = Math.sin(baseAngle) * speed - 25;
      p.gravity = 0;
      p.size = i % 3 === 0 ? 5.5 + Math.random() * 2.5 : 3 + Math.random() * 2.5;
      p.maxLife = (isKO ? 0.34 : 0.22) + Math.random() * 0.1;
      p.life = p.maxLife;
      p.color = colors[i % colors.length];
      p.kind = 'spark';
      p.rot = Math.random() * Math.PI * 2;
      p.vRot = (Math.random() - 0.5) * 12;
    }

    this.spawnBloodSplatter(
      x,
      y,
      dirX,
      dirY,
      targetRemainingHpRatio,
      damageAmount,
      isKO
    );
  }

  spawnBloodSplatter(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    remainingHpRatio: number,
    damageAmount: number,
    isKO = false
  ): void {
    const missingHp = Math.max(0, Math.min(1, 1 - remainingHpRatio));
    // Scales smoothly upward as fighter HP decreases: subtle early, dramatic puddles late round
    const severity = Math.min(
      1,
      0.16 + missingHp * 0.72 + Math.min(0.22, damageAmount * 0.015) + (isKO ? 0.32 : 0)
    );

    const dropCount = isKO ? 18 : Math.round(4 + severity * 11);
    const bloodPalette = ['#B91C1C', '#DC2626', '#991B1B', '#7F1D1D'];
    const baseAngle = Math.atan2(dirY || 0.2, dirX || 1);

    for (let i = 0; i < dropCount; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

      const spread = (Math.random() - 0.5) * 1.95;
      const angle = baseAngle + spread;
      const speed = (65 + severity * 145) * (0.65 + Math.random() * 0.75);

      p.active = true;
      p.x = x + (Math.random() - 0.5) * 8;
      p.y = y + (Math.random() - 0.5) * 6;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - (50 + Math.random() * 65);
      p.gravity = 420;
      p.size = 2.4 + Math.random() * (2.6 + severity * 2.4);
      p.maxLife = 0.32 + Math.random() * 0.22;
      p.life = p.maxLife;
      p.color = bloodPalette[i % bloodPalette.length];
      p.kind = 'blood';
      p.rot = 0;
      p.vRot = 0;
    }

    // Stamp persistent round-long floor blood decals & crimson puddles
    const floorSpots = isKO ? 7 : Math.max(1, Math.round(1 + severity * 4));
    for (let i = 0; i < floorSpots; i++) {
      const distAhead = (10 + Math.random() * (28 + severity * 34)) * (i === 0 ? 0.55 : 1);
      const lateralJitter = (Math.random() - 0.5) * (20 + severity * 24);
      const px = x + dirX * distAhead - dirY * lateralJitter;
      const py = y + 16 + dirY * distAhead + dirX * lateralJitter * 0.65;
      const baseR = (3.4 + severity * 7.8) * (i === 0 ? 1.25 : 0.65 + Math.random() * 0.6);

      if (this.bloodPuddles.length >= MAX_BLOOD_PUDDLES) {
        // Merge/overwrite oldest tiny droplet while keeping main puddles dense
        this.bloodPuddles.shift();
      }
      this.bloodPuddles.push({
        x: px,
        y: py,
        rx: baseR * (1.05 + Math.random() * 0.45),
        ry: baseR * (0.58 + Math.random() * 0.28),
        rot: Math.random() * Math.PI,
        color: i % 2 === 0 ? '#991B1B' : '#B91C1C',
        alpha: 0.52 + severity * 0.28,
      });
    }

    // At critical HP or KO, add an unmistakable glossy crimson puddle core
    if (remainingHpRatio <= 0.42 || isKO) {
      if (this.bloodPuddles.length >= MAX_BLOOD_PUDDLES) {
        this.bloodPuddles.shift();
      }
      const coreR = isKO ? 19 + Math.random() * 6 : 9 + severity * 9;
      this.bloodPuddles.push({
        x: x + dirX * (isKO ? 14 : 18),
        y: y + 18 + dirY * 12,
        rx: coreR * 1.32,
        ry: coreR * 0.72,
        rot: (Math.random() - 0.5) * 0.6,
        color: '#7F1D1D',
        alpha: isKO ? 0.82 : 0.68,
      });
    }
  }

  spawnPickupBurst(x: number, y: number, _comicWord?: string): void {
    const colors = ['#FACC15', '#16A34A', '#FFFFFF'];
    for (let i = 0; i < 6; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const angle = (i / 6) * Math.PI * 2;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * 65;
      p.vy = Math.sin(angle) * 65 - 25;
      p.gravity = 0;
      p.size = 4;
      p.maxLife = 0.28;
      p.life = p.maxLife;
      p.color = colors[i % colors.length];
      p.kind = 'spark';
      p.rot = angle;
      p.vRot = 6;
    }
  }

  spawnBlockBurst(x: number, y: number, comicWord = 'BLOK!'): void {
    const isPerfect = comicWord.includes('TAM');
    const colors = isPerfect
      ? ['#FACC15', '#38BDF8', '#FFFFFF', '#0284C7']
      : ['#38BDF8', '#E0F2FE', '#FFFFFF'];
    const count = isPerfect ? 10 : 5;
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const angle = (i / count) * Math.PI * 2;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * (isPerfect ? 120 : 80);
      p.vy = Math.sin(angle) * (isPerfect ? 120 : 80) - 18;
      p.gravity = 0;
      p.size = isPerfect ? 5.2 : 3.8;
      p.maxLife = isPerfect ? 0.28 : 0.2;
      p.life = p.maxLife;
      p.color = colors[i % colors.length];
      p.kind = 'spark';
      p.rot = angle;
      p.vRot = 8;
    }
  }

  spawnEvadeCue(x: number, y: number, _comicWord?: string): void {
    for (let i = 0; i < 4; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const angle = (i / 4) * Math.PI * 2;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * 55;
      p.vy = Math.sin(angle) * 55;
      p.gravity = 0;
      p.size = 4.2;
      p.maxLife = 0.2;
      p.life = p.maxLife;
      p.color = 'rgba(56, 189, 248, 0.7)';
      p.kind = 'dust';
      p.rot = 0;
      p.vRot = 0;
    }
  }

  spawnDodgeCue(x: number, y: number, dirX: number, dirY: number): void {
    for (let i = 0; i < 5; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      p.active = true;
      p.x = x - dirX * (i * 5);
      p.y = y - dirY * (i * 5) + 6;
      p.vx = -dirX * 35 + (Math.random() - 0.5) * 20;
      p.vy = -dirY * 35 + (Math.random() - 0.5) * 20;
      p.gravity = 0;
      p.size = 6;
      p.maxLife = 0.24;
      p.life = p.maxLife;
      p.color = 'rgba(56, 189, 248, 0.55)';
      p.kind = 'dust';
      p.rot = 0;
      p.vRot = 0;
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
    p.gravity = 0;
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
      if (p.gravity !== 0) {
        p.vy += p.gravity * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = p.kind === 'blood' ? Math.exp(-2.6 * dt) : Math.exp(-5 * dt);
      p.vx *= drag;
      if (p.gravity === 0) {
        p.vy *= drag;
      }
      p.rot += p.vRot * dt;
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    match: MatchState,
    timeSeconds: number,
    isTitleBackdrop = false,
    localRole: 'player' | 'opponent' = 'player'
  ): void {
    ctx.save();
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const theme: ArenaThemeId = isTitleBackdrop
      ? 'deniz'
      : match.arenaTheme ?? getArenaThemeForRound(match.roundNumber ?? 1).id;

    const bounds = match.bounds;
    const fitFactor = isTitleBackdrop ? 1 : 0.94;
    const scale = Math.min(canvasWidth / bounds.width, canvasHeight / bounds.height) * fitFactor;
    const offsetX = (canvasWidth - bounds.width * scale) * 0.5;
    const offsetY = (canvasHeight - bounds.height * scale) * 0.5;

    const rimPad = 13;
    const matScreen = {
      left: offsetX + (bounds.paddingX - rimPad) * scale,
      top: offsetY + (bounds.paddingY - rimPad) * scale,
      right: offsetX + (bounds.width - (bounds.paddingX - rimPad)) * scale,
      bottom: offsetY + (bounds.height - (bounds.paddingY - rimPad)) * scale,
      scale,
    };

    if (isTitleBackdrop) {
      ctx.fillStyle = '#FBF7EE';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else {
      this.drawOuterCanvasBackdrop(ctx, canvasWidth, canvasHeight, theme, timeSeconds, matScreen);
    }

    const shakeMag = match.cameraTrauma * match.cameraTrauma * 14;
    const shakeX = shakeMag > 0.1 ? (Math.random() - 0.5) * 2 * shakeMag : 0;
    const shakeY = shakeMag > 0.1 ? (Math.random() - 0.5) * 2 * shakeMag : 0;

    const titlePanX = isTitleBackdrop ? Math.sin(timeSeconds * 0.55) * 14 : 0;
    const titlePanY = isTitleBackdrop ? Math.cos(timeSeconds * 0.42) * 8 : 0;

    ctx.translate(offsetX + shakeX + titlePanX, offsetY + shakeY + titlePanY);
    ctx.scale(scale, scale);

    this.drawArenaSurroundings(ctx, bounds, theme, timeSeconds, isTitleBackdrop);
    this.drawCachedArenaFloor(ctx, bounds, theme);
    this.drawFloorDetailsAnimated(ctx, bounds, theme, timeSeconds);
    if (!isTitleBackdrop) {
      this.drawBloodPuddles(ctx, bounds);
    }

    // Draw dropped collectible stones on the mat
    this.drawFloorStones(ctx, match, timeSeconds);

    // Sort fighters by Y for 2.5D depth
    const fighters: FighterState[] =
      match.player.y <= match.opponent.y
        ? [match.player, match.opponent]
        : [match.opponent, match.player];

    for (const fighter of fighters) {
      const isLoser =
        match.winnerRole !== null && match.winnerRole !== fighter.role;
      const isWinner =
        match.winnerRole !== null && match.winnerRole === fighter.role;
      this.drawFighter(
        ctx,
        fighter,
        timeSeconds,
        isWinner,
        isLoser,
        fighter.role === localRole
      );
    }

    // Draw flying slingshot projectiles
    this.drawProjectiles(ctx, match);

    this.drawParticles(ctx);
    this.drawForegroundAmbience(ctx, bounds, theme, timeSeconds);

    if (!isTitleBackdrop) {
      for (const fighter of fighters) {
        if (!fighter.nickname) continue;
        const isLoser =
          match.winnerRole !== null && match.winnerRole !== fighter.role;
        const isWinner =
          match.winnerRole !== null && match.winnerRole === fighter.role;
        this.drawFighterNickname(
          ctx,
          fighter,
          bounds,
          isWinner,
          isLoser,
          fighter.role === localRole
        );
      }
    }

    ctx.restore();
  }

  private drawOuterCanvasBackdrop(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    theme: ArenaThemeId,
    timeSeconds: number,
    mat: { left: number; top: number; right: number; bottom: number; scale: number }
  ): void {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (theme === 'deniz') {
      grad.addColorStop(0, '#0EA5E9');
      grad.addColorStop(0.5, '#0284C7');
      grad.addColorStop(1, '#075985');
    } else if (theme === 'buz') {
      grad.addColorStop(0, '#E0F2FE');
      grad.addColorStop(0.5, '#7DD3FC');
      grad.addColorStop(1, '#0EA5E9');
    } else if (theme === 'col') {
      grad.addColorStop(0, '#FDE68A');
      grad.addColorStop(0.45, '#F59E0B');
      grad.addColorStop(1, '#B45309');
    } else if (theme === 'orman') {
      grad.addColorStop(0, '#15803D');
      grad.addColorStop(0.5, '#166534');
      grad.addColorStop(1, '#052E16');
    } else {
      // Round 5: Dramatic obsidian & volcanic caldera glow
      grad.addColorStop(0, '#140A08');
      grad.addColorStop(0.45, '#2A1109');
      grad.addColorStop(1, '#581C0C');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const isPortraitViewport = h > w;

    if (theme === 'deniz') {
      // Rolling ocean waves across full screen
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.28)';
      ctx.lineWidth = 2.5;
      for (let row = 0; row < 8; row++) {
        const y = (h / 8) * (row + 0.45);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 26) {
          const wy = y + Math.sin(x * 0.032 + timeSeconds * 2.2 + row * 1.1) * 4.5;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
      // Little buoy / seagull silhouettes in the outer sea area
      const buoyX = isPortraitViewport ? w * 0.16 : Math.max(48, mat.left * 0.5);
      const buoyY = isPortraitViewport ? Math.max(24, mat.top * 0.55) : h * 0.28;
      const bob = Math.sin(timeSeconds * 2.8) * 3;
      ctx.save();
      ctx.translate(buoyX, buoyY + bob);
      ctx.fillStyle = '#EF4444';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Distant sailboat silhouette on upper right water
      const boatX = isPortraitViewport ? w * 0.84 : Math.min(w - 52, mat.right + (w - mat.right) * 0.5);
      const boatY = isPortraitViewport ? Math.max(28, mat.top * 0.55) : h * 0.24;
      ctx.save();
      ctx.translate(boatX, boatY - bob * 0.7);
      ctx.fillStyle = '#FFFDF7';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2, -16);
      ctx.lineTo(12, 2);
      ctx.lineTo(-2, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#92400E';
      ctx.beginPath();
      ctx.moveTo(-12, 4);
      ctx.lineTo(14, 4);
      ctx.lineTo(9, 10);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (theme === 'buz') {
      // Shimmering polar aurora band across top sky
      const aurora = ctx.createLinearGradient(0, 0, w, 0);
      aurora.addColorStop(0, 'rgba(56, 189, 248, 0.05)');
      aurora.addColorStop(0.5, 'rgba(110, 231, 183, 0.26)');
      aurora.addColorStop(1, 'rgba(167, 139, 250, 0.14)');
      ctx.fillStyle = aurora;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, Math.max(40, mat.top));
      ctx.quadraticCurveTo(w * 0.5, Math.max(22, mat.top * 0.6) + Math.sin(timeSeconds) * 8, 0, Math.max(40, mat.top));
      ctx.closePath();
      ctx.fill();

      // Layered cartoon glacier peaks framing top/sides without clipping
      const peaks = isPortraitViewport
        ? [
            [w * 0.14, Math.max(36, mat.top + 8), 32, 30],
            [w * 0.86, Math.max(36, mat.top + 8), 34, 32],
          ]
        : [
            [Math.max(54, mat.left * 0.45), h * 0.42, 46, 70],
            [Math.min(w - 54, mat.right + (w - mat.right) * 0.55), h * 0.38, 48, 74],
          ];
      for (const [px, py, pw, ph] of peaks) {
        ctx.fillStyle = '#E0F2FE';
        ctx.strokeStyle = '#0369A1';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(px - pw, py);
        ctx.lineTo(px - pw * 0.18, py - ph);
        ctx.lineTo(px + pw * 0.22, py - ph * 0.65);
        ctx.lineTo(px + pw, py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#BAE6FD';
        ctx.beginPath();
        ctx.moveTo(px - pw * 0.18, py - ph);
        ctx.lineTo(px + pw * 0.15, py);
        ctx.lineTo(px + pw, py);
        ctx.lineTo(px + pw * 0.22, py - ph * 0.65);
        ctx.closePath();
        ctx.fill();
      }
    } else if (theme === 'col') {
      // Blazing desert sun + rolling horizon dunes + distant pyramid
      const sunX = isPortraitViewport ? w * 0.82 : Math.min(w - 64, mat.right + (w - mat.right) * 0.5);
      const sunY = isPortraitViewport ? Math.max(28, mat.top * 0.52) : h * 0.22;
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(sunX, sunY, isPortraitViewport ? 18 : 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.38)';
      ctx.lineWidth = 6;
      ctx.stroke();

      // Distant desert pyramid
      const pyrX = isPortraitViewport ? w * 0.18 : Math.max(66, mat.left * 0.5);
      const pyrY = isPortraitViewport ? Math.max(38, mat.top + 6) : h * 0.44;
      const pyrS = isPortraitViewport ? 24 : 42;
      ctx.fillStyle = '#D97706';
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pyrX - pyrS, pyrY);
      ctx.lineTo(pyrX, pyrY - pyrS * 0.95);
      ctx.lineTo(pyrX + pyrS, pyrY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#B45309';
      ctx.beginPath();
      ctx.moveTo(pyrX, pyrY - pyrS * 0.95);
      ctx.lineTo(pyrX + pyrS, pyrY);
      ctx.lineTo(pyrX + pyrS * 0.15, pyrY);
      ctx.closePath();
      ctx.fill();

      // Sand dune waves
      ctx.fillStyle = 'rgba(180, 83, 9, 0.24)';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.72);
      ctx.quadraticCurveTo(w * 0.3, h * 0.62, w * 0.65, h * 0.74);
      ctx.quadraticCurveTo(w * 0.85, h * 0.8, w, h * 0.68);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    } else if (theme === 'orman') {
      // Warm forest sunbeams & layered pine/canopy silhouettes
      ctx.save();
      ctx.fillStyle = 'rgba(254, 249, 195, 0.12)';
      ctx.beginPath();
      ctx.moveTo(w * 0.15, 0);
      ctx.lineTo(w * 0.35, 0);
      ctx.lineTo(w * 0.6, h);
      ctx.lineTo(w * 0.35, h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Stylized woodland trees in visible outer margins
      const trees = isPortraitViewport
        ? [
            [w * 0.12, Math.max(38, mat.top + 6), 18],
            [w * 0.88, Math.max(38, mat.top + 6), 18],
          ]
        : [
            [Math.max(48, mat.left * 0.45), h * 0.36, 30],
            [Math.max(64, mat.left * 0.55), h * 0.66, 26],
            [Math.min(w - 48, mat.right + (w - mat.right) * 0.55), h * 0.34, 30],
            [Math.min(w - 64, mat.right + (w - mat.right) * 0.45), h * 0.68, 26],
          ];
      for (const [tx, ty, tr] of trees) {
        ctx.fillStyle = '#14532D';
        ctx.strokeStyle = '#052E16';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(tx, ty - tr * 0.35, tr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#22C55E';
        ctx.beginPath();
        ctx.arc(tx - tr * 0.2, ty - tr * 0.55, tr * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Round 5: GRAND VOLCANIC CALDERA SPECTACLE!
      const pulse = 0.26 + Math.sin(timeSeconds * 3.1) * 0.09;
      const rad = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.68);
      rad.addColorStop(0, `rgba(249, 115, 22, ${pulse + 0.2})`);
      rad.addColorStop(0.55, `rgba(220, 38, 38, ${pulse * 0.55})`);
      rad.addColorStop(1, 'rgba(20, 10, 8, 0)');
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, w, h);

      // Glowing molten lava streams snaking through outer obsidian floor
      ctx.save();
      ctx.strokeStyle = `rgba(249, 115, 22, ${0.55 + Math.sin(timeSeconds * 4) * 0.2})`;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.25);
      ctx.quadraticCurveTo(w * 0.15, h * 0.36, Math.max(10, mat.left), h * 0.42);
      ctx.moveTo(w, h * 0.72);
      ctx.quadraticCurveTo(w * 0.85, h * 0.64, Math.min(w - 10, mat.right), h * 0.58);
      ctx.stroke();
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Towering twin erupting volcanoes framed clearly in visible outer space!
      const volcanoPositions = isPortraitViewport
        ? [
            [w * 0.15, Math.max(44, mat.top + 8), 32, 34],
            [w * 0.85, Math.max(44, mat.top + 8), 32, 34],
          ]
        : [
            [Math.max(58, mat.left * 0.5), h * 0.38, 52, 68],
            [Math.min(w - 58, mat.right + (w - mat.right) * 0.5), h * 0.38, 52, 68],
          ];
      for (let idx = 0; idx < volcanoPositions.length; idx++) {
        const [vx, vy, vw, vh] = volcanoPositions[idx];
        // Smoke plume
        const puffLift = Math.sin(timeSeconds * 2.5 + idx) * 4;
        ctx.fillStyle = 'rgba(120, 113, 108, 0.38)';
        ctx.beginPath();
        ctx.arc(vx - 4, vy - vh - 12 + puffLift, 11, 0, Math.PI * 2);
        ctx.arc(vx + 7, vy - vh - 20 - puffLift * 0.5, 8, 0, Math.PI * 2);
        ctx.fill();

        // Obsidian cone
        ctx.fillStyle = '#292524';
        ctx.strokeStyle = '#09090B';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(vx - vw, vy);
        ctx.lineTo(vx - vw * 0.28, vy - vh);
        ctx.lineTo(vx + vw * 0.28, vy - vh);
        ctx.lineTo(vx + vw, vy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Lava trickle down the cone
        ctx.strokeStyle = '#F97316';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(vx, vy - vh + 2);
        ctx.quadraticCurveTo(vx + (idx === 0 ? 8 : -8), vy - vh * 0.45, vx + (idx === 0 ? 4 : -4), vy - 2);
        ctx.stroke();

        // Glowing crater rim
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.ellipse(vx, vy - vh, vw * 0.28, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawArenaSurroundings(
    ctx: CanvasRenderingContext2D,
    bounds: ArenaBounds,
    theme: ArenaThemeId,
    timeSeconds: number,
    isTitleBackdrop: boolean
  ): void {
    const rimPad = 13;
    const left = bounds.paddingX - rimPad;
    const top = bounds.paddingY - rimPad;
    const right = bounds.width - (bounds.paddingX - rimPad);
    const bottom = bounds.height - (bounds.paddingY - rimPad);

    if (theme === 'deniz' && !isTitleBackdrop) {
      // Shimmering white sea-foam halo hugging the floating wooden raft
      const bob = Math.sin(timeSeconds * 2.4) * 2.2;
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.7)';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -timeSeconds * 16;
      this.roundRectPath(ctx, left - 8 - bob * 0.4, top - 7, right - left + 16 + bob * 0.8, bottom - top + 20, 32);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (theme === 'buz') {
      // Frozen ice crystal sparkles around platform rim
      const crystals = [
        [left - 2, top + 22, -9, -11],
        [right + 2, top + 22, 9, -11],
        [left - 2, bottom - 18, -9, 11],
        [right + 2, bottom - 18, 9, 11],
      ];
      for (const [sx, sy, dx, dy] of crystals) {
        ctx.fillStyle = '#E0F2FE';
        ctx.strokeStyle = '#0284C7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + dx, sy + dy);
        ctx.lineTo(sx + dx * 0.25, sy - dy * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (theme === 'col') {
      // Warm sandstone pebbles around desert rim
      ctx.fillStyle = '#92400E';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2;
      for (const [rx, ry] of [
        [left - 3, top + 18],
        [right + 3, bottom - 14],
      ]) {
        ctx.beginPath();
        ctx.ellipse(rx, ry, 7, 5, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (theme === 'orman') {
      // Mossy foliage tufts clinging to the arena edges
      const tufts = [
        [left - 2, top + 16, '#15803D'],
        [right + 2, top + 18, '#16A34A'],
        [left - 2, bottom - 12, '#16A34A'],
        [right + 2, bottom - 12, '#15803D'],
      ] as const;
      for (const [tx, ty, col] of tufts) {
        ctx.fillStyle = col;
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (theme === 'volkan') {
      // Grand pulsing lava moat surrounding the obsidian battle platform!
      const lavaPulse = 0.78 + Math.sin(timeSeconds * 3.6) * 0.16;
      ctx.save();
      ctx.strokeStyle = `rgba(249, 115, 22, ${lavaPulse})`;
      ctx.lineWidth = 10;
      this.roundRectPath(ctx, left - 6, top - 5, right - left + 12, bottom - top + 18, 30);
      ctx.stroke();

      ctx.strokeStyle = `rgba(250, 204, 21, ${0.65 + Math.sin(timeSeconds * 4.8) * 0.25})`;
      ctx.lineWidth = 3.5;
      ctx.setLineDash([16, 12]);
      ctx.lineDashOffset = -timeSeconds * 28;
      this.roundRectPath(ctx, left - 6, top - 5, right - left + 12, bottom - top + 18, 30);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  private drawCachedArenaFloor(
    ctx: CanvasRenderingContext2D,
    bounds: ArenaBounds,
    theme: ArenaThemeId
  ): void {
    const key = `${theme}:${bounds.width}x${bounds.height}:${bounds.paddingX}x${bounds.paddingY}`;
    if (typeof document !== 'undefined') {
      if (!this.floorCacheCanvas || this.floorCacheKey !== key) {
        this.floorCacheCanvas = document.createElement('canvas');
        this.floorCacheCanvas.width = bounds.width;
        this.floorCacheCanvas.height = bounds.height;
        this.floorCacheKey = key;
        const offCtx = this.floorCacheCanvas.getContext('2d');
        if (offCtx) {
          this.drawArenaFloor(offCtx, bounds, theme);
        }
      }
      ctx.drawImage(this.floorCacheCanvas, 0, 0);
      return;
    }
    this.drawArenaFloor(ctx, bounds, theme);
  }

  private drawArenaFloor(
    ctx: CanvasRenderingContext2D,
    bounds: ArenaBounds,
    theme: ArenaThemeId
  ): void {
    const rimPad = 13;
    const left = bounds.paddingX - rimPad;
    const top = bounds.paddingY - rimPad;
    const width = bounds.width - (bounds.paddingX - rimPad) * 2;
    const height = bounds.height - (bounds.paddingY - rimPad) * 2;
    const radius = 24;

    const paletteMap: Record<
      ArenaThemeId,
      {
        sideDepth: string;
        rim: string;
        surfaceBase: string;
        surfaceAlt: string;
        centerFill: string;
        ringStroke: string;
        divider: string;
        cornerA: string;
        cornerB: string;
      }
    > = {
      deniz: {
        sideDepth: '#78350F',
        rim: '#D97706',
        surfaceBase: '#F6E6C9',
        surfaceAlt: '#EAD2A8',
        centerFill: '#E0F2FE',
        ringStroke: '#0284C7',
        divider: '#C8AA7E',
        cornerA: '#E63946',
        cornerB: '#0284C7',
      },
      buz: {
        sideDepth: '#0369A1',
        rim: '#BAE6FD',
        surfaceBase: '#F0F9FF',
        surfaceAlt: '#DBEAFE',
        centerFill: '#E0F2FE',
        ringStroke: '#0284C7',
        divider: '#93C5FD',
        cornerA: '#0284C7',
        cornerB: '#38BDF8',
      },
      col: {
        sideDepth: '#B45309',
        rim: '#FCD34D',
        surfaceBase: '#FEF3C7',
        surfaceAlt: '#FDE68A',
        centerFill: '#FFEDD5',
        ringStroke: '#EA580C',
        divider: '#F59E0B',
        cornerA: '#EA580C',
        cornerB: '#B45309',
      },
      orman: {
        sideDepth: '#713F12',
        rim: '#65A30D',
        surfaceBase: '#ECFCCB',
        surfaceAlt: '#D9F99D',
        centerFill: '#DCFCE7',
        ringStroke: '#15803D',
        divider: '#84CC16',
        cornerA: '#16A34A',
        cornerB: '#CA8A04',
      },
      volkan: {
        sideDepth: '#09090B',
        rim: '#EA580C',
        surfaceBase: '#D6D3D1',
        surfaceAlt: '#B8B2AC',
        centerFill: '#FED7AA',
        ringStroke: '#DC2626',
        divider: '#F97316',
        cornerA: '#EF4444',
        cornerB: '#FACC15',
      },
    };
    const p = paletteMap[theme];

    // Drop shadow (kept neatly within bounds)
    ctx.fillStyle = theme === 'volkan' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(30, 41, 59, 0.18)';
    this.roundRectPath(ctx, left + 2, top + 12, width, height, radius);
    ctx.fill();

    // 3D platform bevel side
    ctx.fillStyle = p.sideDepth;
    this.roundRectPath(ctx, left, top + 8, width, height, radius);
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#1E293B';
    ctx.stroke();

    // Platform top rim
    ctx.fillStyle = p.rim;
    this.roundRectPath(ctx, left, top, width, height, radius);
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#1E293B';
    ctx.stroke();

    const matLeft = bounds.paddingX;
    const matTop = bounds.paddingY;
    const matWidth = bounds.width - bounds.paddingX * 2;
    const matHeight = bounds.height - bounds.paddingY * 2;

    ctx.fillStyle = p.surfaceBase;
    this.roundRectPath(ctx, matLeft, matTop, matWidth, matHeight, 18);
    ctx.fill();

    ctx.save();
    this.roundRectPath(ctx, matLeft, matTop, matWidth, matHeight, 18);
    ctx.clip();

    // Theme-specific floor surface patterns
    if (theme === 'deniz') {
      // Wooden ship/raft planks + rope nail rivets
      const plankH = matHeight / 7;
      ctx.fillStyle = p.surfaceAlt;
      for (let i = 0; i < 7; i++) {
        if (i % 2 === 1) ctx.fillRect(matLeft, matTop + i * plankH, matWidth, plankH);
        ctx.strokeStyle = p.divider;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(matLeft, matTop + i * plankH);
        ctx.lineTo(matLeft + matWidth, matTop + i * plankH);
        ctx.stroke();
      }
      ctx.fillStyle = '#92400E';
      for (let i = 0; i < 7; i++) {
        const py = matTop + i * plankH + plankH * 0.5;
        ctx.beginPath();
        ctx.arc(matLeft + 18, py, 2.5, 0, Math.PI * 2);
        ctx.arc(matLeft + matWidth - 18, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'buz') {
      // Diagonal ice sheen stripes + crisp ice cracks
      ctx.fillStyle = p.surfaceAlt;
      for (let i = -2; i < 8; i++) {
        ctx.beginPath();
        const x = matLeft + i * (matWidth / 5);
        ctx.moveTo(x, matTop);
        ctx.lineTo(x + 42, matTop);
        ctx.lineTo(x - 38, matTop + matHeight);
        ctx.lineTo(x - 80, matTop + matHeight);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = '#7DD3FC';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(matLeft + 34, matTop + 36);
      ctx.lineTo(matLeft + 74, matTop + 62);
      ctx.lineTo(matLeft + 62, matTop + 98);
      ctx.moveTo(matLeft + matWidth - 40, matTop + matHeight - 36);
      ctx.lineTo(matLeft + matWidth - 88, matTop + matHeight - 66);
      ctx.stroke();
    } else if (theme === 'col') {
      // Rippled desert dunes across courtyard
      ctx.fillStyle = p.surfaceAlt;
      for (let i = 0; i < 6; i++) {
        const y = matTop + i * (matHeight / 6);
        ctx.beginPath();
        ctx.moveTo(matLeft, y + 18);
        ctx.quadraticCurveTo(matLeft + matWidth * 0.5, y - 10, matLeft + matWidth, y + 18);
        ctx.lineTo(matLeft + matWidth, y + matHeight / 6);
        ctx.lineTo(matLeft, y + matHeight / 6);
        ctx.closePath();
        ctx.fill();
      }
    } else if (theme === 'orman') {
      // Sun-dappled emerald meadow tiles + sun spots
      const tileW = matWidth / 6;
      ctx.fillStyle = p.surfaceAlt;
      for (let i = 0; i < 6; i++) {
        if (i % 2 === 0) ctx.fillRect(matLeft + i * tileW, matTop, tileW, matHeight);
      }
      ctx.fillStyle = 'rgba(254, 249, 195, 0.45)';
      ctx.beginPath();
      ctx.arc(matLeft + matWidth * 0.28, matTop + matHeight * 0.3, 44, 0, Math.PI * 2);
      ctx.arc(matLeft + matWidth * 0.74, matTop + matHeight * 0.72, 52, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Volkan: Sculpted basalt stone slabs + glowing magma fissure cracks near edges!
      const tileW = matWidth / 5;
      const tileH = matHeight / 5;
      ctx.fillStyle = p.surfaceAlt;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if ((r + c) % 2 === 0) {
            ctx.fillRect(matLeft + c * tileW, matTop + r * tileH, tileW, tileH);
          }
        }
      }
      ctx.strokeStyle = 'rgba(87, 83, 78, 0.38)';
      ctx.lineWidth = 2;
      for (let r = 1; r < 5; r++) {
        ctx.beginPath();
        ctx.moveTo(matLeft, matTop + r * tileH);
        ctx.lineTo(matLeft + matWidth, matTop + r * tileH);
        ctx.stroke();
      }
      // Glowing edge lava cracks
      ctx.strokeStyle = '#EA580C';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(matLeft + 18, matTop + 16);
      ctx.lineTo(matLeft + 52, matTop + 42);
      ctx.lineTo(matLeft + 44, matTop + 68);
      ctx.moveTo(matLeft + matWidth - 20, matTop + 22);
      ctx.lineTo(matLeft + matWidth - 58, matTop + 50);
      ctx.moveTo(matLeft + 22, matTop + matHeight - 18);
      ctx.lineTo(matLeft + 64, matTop + matHeight - 48);
      ctx.moveTo(matLeft + matWidth - 22, matTop + matHeight - 18);
      ctx.lineTo(matLeft + matWidth - 56, matTop + matHeight - 52);
      ctx.stroke();
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    const cx = bounds.width / 2;
    const cy = bounds.height / 2 + 2;

    // Center divider
    ctx.strokeStyle = p.divider;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, matTop);
    ctx.lineTo(cx, matTop + matHeight);
    ctx.stroke();

    // Center Emblem Ring
    ctx.fillStyle = p.centerFill;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 86, 62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.ringStroke;
    ctx.lineWidth = theme === 'volkan' ? 4 : 3;
    ctx.setLineDash([10, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (theme === 'volkan') {
      // Grand second inner golden rune ring for the rare Round 5 Final!
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 62, 43, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Central molten star mark
      this.drawStar(ctx, cx, cy, 15, '#F97316', '#1E293B');
    } else if (theme === 'buz') {
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2;
      for (let a = 0; a < 3; a++) {
        const ang = (a * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(ang) * 20, cy - Math.sin(ang) * 20);
        ctx.lineTo(cx + Math.cos(ang) * 20, cy + Math.sin(ang) * 20);
        ctx.stroke();
      }
    } else if (theme === 'deniz') {
      // Anchor/compass circle cue at center
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.stroke();
    } else if (theme === 'col') {
      // Sun burst center mark
      ctx.strokeStyle = '#EA580C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawCornerPad(ctx, matLeft + 6, matTop + 6, p.cornerA);
    this.drawCornerPad(ctx, matLeft + matWidth - 6, matTop + 6, p.cornerB);
    this.drawCornerPad(ctx, matLeft + 6, matTop + matHeight - 6, p.cornerB);
    this.drawCornerPad(ctx, matLeft + matWidth - 6, matTop + matHeight - 6, p.cornerA);

    ctx.restore();

    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 3.5;
    this.roundRectPath(ctx, matLeft, matTop, matWidth, matHeight, 18);
    ctx.stroke();
  }

  private drawFloorDetailsAnimated(
    ctx: CanvasRenderingContext2D,
    bounds: ArenaBounds,
    theme: ArenaThemeId,
    timeSeconds: number
  ): void {
    if (theme !== 'volkan') return;
    // Animated pulsing molten core glow on Round 5 center ring
    const cx = bounds.width / 2;
    const cy = bounds.height / 2 + 2;
    const alpha = 0.16 + Math.sin(timeSeconds * 4.2) * 0.09;
    ctx.save();
    ctx.fillStyle = `rgba(249, 115, 22, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 74, 52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawForegroundAmbience(
    ctx: CanvasRenderingContext2D,
    bounds: ArenaBounds,
    theme: ArenaThemeId,
    timeSeconds: number
  ): void {
    const matLeft = bounds.paddingX;
    const matTop = bounds.paddingY;
    const matWidth = bounds.width - bounds.paddingX * 2;
    const matHeight = bounds.height - bounds.paddingY * 2;

    ctx.save();
    if (theme === 'buz') {
      // Gentle drifting arctic snowflakes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      for (let i = 0; i < 16; i++) {
        const x = matLeft + ((i * 73 + timeSeconds * 24 + Math.sin(timeSeconds + i) * 14) % matWidth);
        const y = matTop + ((i * 59 + timeSeconds * 34) % matHeight);
        ctx.beginPath();
        ctx.arc(x, y, 2.3 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'col') {
      // Wind-swept golden desert dust streaks
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.36)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x = matLeft + ((i * 110 + timeSeconds * 85) % matWidth);
        const y = matTop + ((i * 83 + timeSeconds * 16) % matHeight);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 20, y + 3);
        ctx.stroke();
      }
    } else if (theme === 'orman') {
      // Glowing emerald/golden forest fireflies
      for (let i = 0; i < 12; i++) {
        const x = matLeft + ((i * 89 + Math.sin(timeSeconds * 1.4 + i) * 28 + matWidth) % matWidth);
        const y = matTop + ((i * 67 + Math.cos(timeSeconds * 1.1 + i * 2) * 22 + matHeight) % matHeight);
        const glow = 0.45 + Math.sin(timeSeconds * 4 + i) * 0.35;
        ctx.fillStyle = `rgba(250, 204, 21, ${glow})`;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'volkan') {
      // 4 Live Flaming Corner Braziers + Rising Glowing Embers!
      const corners = [
        [matLeft + 6, matTop + 6],
        [matLeft + matWidth - 6, matTop + 6],
        [matLeft + 6, matTop + matHeight - 6],
        [matLeft + matWidth - 6, matTop + matHeight - 6],
      ];
      for (let i = 0; i < corners.length; i++) {
        const [bx, by] = corners[i];
        const flicker = Math.sin(timeSeconds * 14 + i * 2.1) * 3.2;
        // Warm glow halo behind flame
        ctx.fillStyle = 'rgba(249, 115, 22, 0.25)';
        ctx.beginPath();
        ctx.arc(bx, by - 6, 18 + flicker * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Outer orange flame
        ctx.fillStyle = 'rgba(249, 115, 22, 0.94)';
        ctx.beginPath();
        ctx.moveTo(bx - 9, by);
        ctx.quadraticCurveTo(bx - 6, by - 18 - flicker, bx + flicker * 0.4, by - 27 - flicker);
        ctx.quadraticCurveTo(bx + 7, by - 16, bx + 9, by);
        ctx.closePath();
        ctx.fill();
        // Inner bright gold core
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.moveTo(bx - 4.5, by);
        ctx.quadraticCurveTo(bx, by - 14 - flicker * 0.5, bx + 4.5, by);
        ctx.closePath();
        ctx.fill();
      }

      // Rising volcanic embers across the arena
      for (let i = 0; i < 22; i++) {
        const x = matLeft + ((i * 67 + Math.sin(timeSeconds * 2 + i) * 18 + matWidth) % matWidth);
        const rawY = matHeight - ((i * 43 + timeSeconds * 48) % matHeight);
        const y = matTop + rawY;
        const alpha = 0.5 + Math.sin(timeSeconds * 6 + i) * 0.35;
        ctx.fillStyle = i % 2 === 0 ? `rgba(250, 204, 21, ${alpha})` : `rgba(249, 115, 22, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, 2.3 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
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

  private drawFloorStones(
    ctx: CanvasRenderingContext2D,
    match: MatchState,
    timeSeconds: number
  ): void {
    for (const stone of match.floorStones) {
      if (!stone.active) continue;
      const pulse = 1 + Math.sin(timeSeconds * 6 + stone.bobPhase) * 0.14;
      const bobY = Math.sin(stone.bobPhase) * 1.8;

      ctx.save();
      ctx.translate(stone.x, stone.y);

      // Golden pickup cue ring when ready to pick up
      if (stone.settleTimer <= 0) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.72)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.ellipse(0, 3, 13 * pulse, 7 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ground shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cartoon stone
      ctx.fillStyle = '#94A3B8';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, bobY - 1, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.arc(-2, bobY - 3, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, match: MatchState): void {
    for (const proj of match.projectiles) {
      if (!proj.active) continue;
      const angle = Math.atan2(proj.vy, proj.vx);

      ctx.save();
      ctx.translate(proj.x, proj.y);

      // Ground shadow below projectile
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 18, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (proj.kind === 'plasma_wave') {
        ctx.rotate(angle);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(-4, 0, 18, -0.85, 0.85);
        ctx.stroke();

        ctx.strokeStyle = '#06B6D4';
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.arc(-4, 0, 18, -0.85, 0.85);
        ctx.stroke();

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(-4, 0, 18, -0.75, 0.75);
        ctx.stroke();
      } else if (proj.kind === 'flying_slipper') {
        ctx.rotate(proj.spinAngle);
        ctx.fillStyle = '#EC4899';
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 13, 6.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#FBCFE8';
        ctx.beginPath();
        ctx.ellipse(-3, 0, 4.5, 5.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // Motion streak
        ctx.rotate(angle);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-22, 0);
        ctx.lineTo(-4, 0);
        ctx.stroke();

        // Flying stone
        ctx.fillStyle = '#64748B';
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath();
        ctx.arc(-2, -2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawFighter(
    ctx: CanvasRenderingContext2D,
    f: FighterState,
    timeSeconds: number,
    isWinner: boolean,
    isLoser: boolean,
    isLocalFighter = f.role === 'player'
  ): void {
    const def = getCharacterById(f.characterId);
    const cos = Math.cos(f.facingAngle);
    const sin = Math.sin(f.facingAngle);
    const facingRight = cos >= 0;

    ctx.save();
    ctx.translate(f.x, f.y + 18);

    ctx.strokeStyle = isLocalFighter
      ? 'rgba(230, 57, 70, 0.72)'
      : 'rgba(2, 132, 199, 0.5)';
    ctx.lineWidth = isLocalFighter ? 3 : 2.5;
    ctx.setLineDash(isLocalFighter ? [] : [5, 4]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

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

    const heldWeaponId: WeaponId =
      f.punchPhase === 'idle'
        ? f.weaponId === 'sapan' && f.ammo <= 0
          ? 'yumruk'
          : f.weaponId
        : f.activeSwingWeaponId;
    const motionStyle = getWeaponMotionStyle(heldWeaponId);
    const swingDef = getWeaponById(heldWeaponId);

    let phaseT = 0;
    if (f.punchPhase === 'windup') {
      const denom = f.activeAttackIsSpecial
        ? Math.max(0.06, swingDef.windup * 1.1)
        : f.swingIsRapidChain
        ? Math.min(0.036, swingDef.windup * 0.55)
        : swingDef.windup;
      phaseT = Math.max(0, Math.min(1, 1 - f.punchTimer / Math.max(0.02, denom)));
    } else if (f.punchPhase === 'active') {
      const denom = f.activeAttackIsSpecial
        ? swingDef.active * 1.25
        : f.swingIsRapidChain
        ? Math.min(0.07, swingDef.active * 0.75)
        : swingDef.active;
      phaseT = Math.max(0, Math.min(1, 1 - f.punchTimer / Math.max(0.02, denom)));
    } else if (f.punchPhase === 'recovery') {
      const denom = f.swingIsRapidChain
        ? Math.min(0.055, swingDef.recovery * 0.45)
        : swingDef.recovery;
      phaseT = Math.max(0, Math.min(1, 1 - f.punchTimer / Math.max(0.02, denom)));
    }

    let leanOffset = 0;
    if (f.punchPhase === 'windup') {
      leanOffset = -6 * phaseT;
    } else if (f.punchPhase === 'active') {
      leanOffset = 9 * Math.sin(phaseT * Math.PI * 0.65);
    } else if (f.punchPhase === 'recovery') {
      leanOffset = 4 * (1 - phaseT);
    }

    ctx.save();
    if (f.dodgeTimer > 0) {
      ctx.globalAlpha = 0.72;
    }
    ctx.translate(
      f.x + cos * leanOffset + wobbleX,
      f.y - walkBob - victoryHop + defeatSink
    );
    ctx.rotate(wobbleTilt);
    ctx.scale(f.scaleX, f.scaleY);

    const isFlashing = f.hitFlashTimer > 0;

    // Legs / Shoes
    const stride = Math.sin(f.walkPhase) * 6;
    ctx.fillStyle = isFlashing ? '#FFFFFF' : def.palette.pants;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.6;

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

    // Back arm
    const perpX = -sin;
    const perpY = cos;
    const backSide = -f.punchArmSide;
    const backHandX = perpX * backSide * 19 + cos * 8;
    const backHandY =
      perpY * backSide * 11 +
      sin * 6 -
      4 -
      (isWinner ? Math.abs(Math.sin(f.victoryBouncePhase)) * 18 : 0);

    this.drawGlove(ctx, backHandX, backHandY, 8.2, isFlashing ? '#FFFFFF' : def.palette.glove);

    // Torso with progressive wear
    this.drawTorso(
      ctx,
      def,
      isFlashing,
      timeSeconds,
      Math.hypot(f.vx, f.vy),
      f.damageStage
    );

    // Head + Hair + Face + progressive bruises/band-aid
    const headBob = f.hitStunTimer > 0 ? Math.sin(f.wobblePhase * 1.3) * 3 : 0;
    this.drawHead(
      ctx,
      def,
      cos,
      sin,
      facingRight,
      isFlashing,
      isLoser,
      isWinner,
      headBob,
      f.hitStunTimer > 0,
      f.damageStage
    );

    // Front Attack Arm + Weapon-Specific Motion & Arc
    const frontSide = f.punchArmSide;
    const upSign = facingRight ? -1 : 1;
    const restX = perpX * frontSide * 19 + cos * 11;
    const restY = perpY * frontSide * 11 + sin * 8 - 4;

    let handX = restX;
    let handY = restY;
    let weaponSwingOffset = 0;

    if (isWinner) {
      handX = cos * 18 + perpX * frontSide * 8;
      handY = sin * 18 + perpY * frontSide * 6 - 22 - Math.abs(Math.sin(f.victoryBouncePhase)) * 12;
    } else if (f.punchPhase !== 'idle') {
      if (motionStyle === 'overhead') {
        if (f.punchPhase === 'windup') {
          const ease = phaseT;
          handX = restX * (1 - 0.45 * ease) - cos * 6 * ease;
          handY = restY - 26 * ease;
          weaponSwingOffset = upSign * (0.3 + 1.3 * ease);
        } else if (f.punchPhase === 'active') {
          const ease = Math.sin(phaseT * Math.PI * 0.5);
          const arcLift = -26 * (1 - ease) + 10 * ease;
          const arcForward = 8 + 26 * Math.sin(phaseT * Math.PI * 0.65);
          handX = cos * arcForward + perpX * frontSide * (12 * (1 - phaseT * 0.6));
          handY = sin * arcForward + perpY * frontSide * (8 * (1 - phaseT * 0.6)) + arcLift;
          weaponSwingOffset = upSign * (1.6 - 2.38 * ease);
        } else {
          const back = 1 - phaseT;
          handX = restX + cos * 14 * back;
          handY = restY + 10 * back;
          weaponSwingOffset = upSign * (-0.78 * back);
        }
      } else if (motionStyle === 'slash') {
        if (f.punchPhase === 'windup') {
          const ease = phaseT;
          handX = restX + perpX * frontSide * 12 * ease - cos * 7 * ease;
          handY = restY + perpY * frontSide * 9 * ease - sin * 7 * ease;
          weaponSwingOffset = -1.35 * frontSide * ease;
        } else if (f.punchPhase === 'active') {
          const ease = 1 - (1 - phaseT) * (1 - phaseT);
          const sweepAngle = (-1.15 + 2.3 * ease) * frontSide;
          handX = Math.cos(f.facingAngle + sweepAngle * 0.48) * 32;
          handY = Math.sin(f.facingAngle + sweepAngle * 0.48) * 25 - 4;
          weaponSwingOffset = sweepAngle * 1.12;
        } else {
          const back = 1 - phaseT;
          handX = restX + (Math.cos(f.facingAngle + frontSide * 0.55) * 24 - restX) * back;
          handY = restY + (Math.sin(f.facingAngle + frontSide * 0.55) * 18 - 4 - restY) * back;
          weaponSwingOffset = 1.15 * frontSide * back;
        }
      } else if (motionStyle === 'slingshot') {
        const reach =
          f.punchPhase === 'windup'
            ? 14
            : f.punchPhase === 'active'
            ? 24
            : 18;
        handX = cos * reach + perpX * frontSide * 8;
        handY = sin * reach + perpY * frontSide * 6 - 4;
        weaponSwingOffset = 0;
      } else {
        // Thrust / Jab (Yumruk, Bıçak, Kalem)
        const reach =
          f.punchPhase === 'windup'
            ? -10 * phaseT
            : f.punchPhase === 'active'
            ? 36 * Math.sin(phaseT * Math.PI * 0.6)
            : 14 * (1 - phaseT);
        handX = cos * (18 + reach) + perpX * frontSide * 7;
        handY = sin * (18 + reach) + perpY * frontSide * 5 - 4;
        weaponSwingOffset =
          f.punchPhase === 'windup'
            ? -0.25 * frontSide * phaseT
            : f.punchPhase === 'active'
            ? 0.16 * frontSide
            : 0;
      }
    }

    // Weapon-specific swing/smash arc trail on active swings
    if (f.punchPhase === 'active' && heldWeaponId !== 'sapan') {
      ctx.save();
      ctx.strokeStyle = f.activeAttackIsSpecial
        ? 'rgba(250, 204, 21, 0.92)'
        : heldWeaponId === 'isin_kilici'
        ? 'rgba(34, 211, 238, 0.88)'
        : motionStyle === 'overhead'
        ? 'rgba(253, 224, 71, 0.82)'
        : 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = f.activeAttackIsSpecial
        ? 8
        : heldWeaponId === 'isin_kilici'
        ? 6.5
        : motionStyle === 'overhead'
        ? 5.5
        : 4;
      ctx.lineCap = 'round';

      if (motionStyle === 'overhead') {
        const tipAngle = f.facingAngle + weaponSwingOffset;
        const tipX = handX + Math.cos(tipAngle) * 24;
        const tipY = handY + Math.sin(tipAngle) * 24;
        const topX = cos * 12;
        const topY = sin * 12 - 34;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(cos * 36, sin * 28 - 22, tipX, tipY);
        ctx.stroke();
      } else if (motionStyle === 'slash') {
        const r = heldWeaponId === 'isin_kilici' ? 46 : 40;
        const aStart = f.facingAngle - frontSide * 1.15;
        const aEnd = f.facingAngle + frontSide * (-1.15 + 2.3 * Math.min(1, phaseT + 0.15));
        ctx.beginPath();
        ctx.arc(cos * 6, sin * 6 - 4, r, aStart, aEnd, frontSide < 0);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(restX, restY);
        ctx.lineTo(handX - cos * 4, handY - sin * 4);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Arm sleeve connector
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(perpX * frontSide * 14, -4);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    ctx.strokeStyle = isFlashing ? '#FFFFFF' : def.palette.primary;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(perpX * frontSide * 14, -4);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    this.drawEquippedWeapon(
      ctx,
      f,
      heldWeaponId,
      handX,
      handY,
      weaponSwingOffset,
      def.palette.glove,
      isFlashing,
      timeSeconds
    );

    // Block Guard Shield Arc
    if (f.isBlocking) {
      const isPerfectWindow = f.blockHoldTime <= 0.18;
      ctx.save();
      ctx.strokeStyle = isPerfectWindow
        ? 'rgba(250, 204, 21, 0.9)'
        : 'rgba(56, 189, 248, 0.85)';
      ctx.fillStyle = isPerfectWindow
        ? 'rgba(250, 204, 21, 0.22)'
        : 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = isPerfectWindow ? 4.5 : 3.5;
      ctx.beginPath();
      ctx.arc(cos * 6, sin * 6 - 4, 29, f.facingAngle - 1.15, f.facingAngle + 1.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cos * 6, sin * 6 - 4, 28, f.facingAngle - 1.05, f.facingAngle + 1.05);
      ctx.fill();
      ctx.restore();
    }

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

  private drawFighterNickname(
    ctx: CanvasRenderingContext2D,
    f: FighterState,
    bounds: ArenaBounds,
    isWinner: boolean,
    isLoser: boolean,
    isLocalFighter: boolean
  ): void {
    const label = f.nickname?.trim();
    if (!label) return;

    const walkBob = Math.abs(Math.sin(f.walkPhase)) * 3.5;
    const victoryHop = isWinner ? Math.abs(Math.sin(f.victoryBouncePhase)) * 18 : 0;
    const defeatSink = isLoser ? 11 : 0;

    ctx.save();
    ctx.font = '800 10.5px "Plus Jakarta Sans", "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textWidth = ctx.measureText(label).width;
    const pillW = Math.ceil(textWidth) + 12;
    const pillH = 16;

    const minX = pillW / 2 + 8;
    const maxX = bounds.width - pillW / 2 - 8;
    const drawX = Math.max(minX, Math.min(maxX, f.x));
    const rawY = f.y - walkBob - victoryHop + defeatSink - (isLoser ? 58 : 51);
    const drawY = Math.max(14, rawY);

    ctx.fillStyle = isLocalFighter
      ? 'rgba(15, 23, 42, 0.82)'
      : 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = isLocalFighter ? '#FACC15' : '#38BDF8';
    ctx.lineWidth = 1.4;
    this.roundRectPath(ctx, drawX - pillW / 2, drawY - pillH / 2, pillW, pillH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isLocalFighter ? '#FEF9C3' : '#F8FAFC';
    ctx.fillText(label, drawX, drawY + 0.5);
    ctx.restore();
  }

  private drawEquippedWeapon(
    ctx: CanvasRenderingContext2D,
    f: FighterState,
    weaponId: WeaponId,
    handX: number,
    handY: number,
    weaponSwingOffset: number,
    gloveColor: string,
    isFlashing: boolean,
    timeSeconds: number
  ): void {
    if (weaponId === 'yumruk') {
      this.drawGlove(
        ctx,
        handX,
        handY,
        f.punchPhase === 'active' ? 11.5 : 9.2,
        isFlashing ? '#FFFFFF' : gloveColor
      );
      return;
    }

    // Small hand grip behind weapon
    this.drawGlove(ctx, handX, handY, 6.2, isFlashing ? '#FFFFFF' : gloveColor);

    const angle =
      weaponId === 'sapan'
        ? f.facingAngle
        : f.facingAngle + weaponSwingOffset;

    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(angle);

    if (weaponId === 'sopa') {
      ctx.fillStyle = '#B45309';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.4;
      this.roundRectPath(ctx, -2, -4, 34, 8, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FDE68A';
      ctx.fillRect(4, -2.5, 6, 5);
    } else if (weaponId === 'bicak') {
      // Handle
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(-2, -3, 10, 6);
      // Rounded cartoon silver blade
      ctx.fillStyle = '#E2E8F0';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(8, -4.5);
      ctx.lineTo(25, -2.5);
      ctx.quadraticCurveTo(28, 0, 25, 2.5);
      ctx.lineTo(8, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (weaponId === 'isin_kilici') {
      // Hilt
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.2;
      this.roundRectPath(ctx, -3, -3.5, 13, 7, 2);
      ctx.fill();
      ctx.stroke();

      // Glowing plasma aura
      const pulse = 1 + Math.sin(timeSeconds * 18) * 0.15;
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
      ctx.lineWidth = 10 * pulse;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(44, 0);
      ctx.stroke();

      // Core blade
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(44, 0);
      ctx.stroke();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(43, 0);
      ctx.stroke();
    } else if (weaponId === 'sapan') {
      // Y-shaped slingshot
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(9, 0);
      ctx.lineTo(18, -9);
      ctx.moveTo(9, 0);
      ctx.lineTo(18, 9);
      ctx.stroke();

      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(9, 0);
      ctx.lineTo(18, -9);
      ctx.moveTo(9, 0);
      ctx.lineTo(18, 9);
      ctx.stroke();

      // Elastic band (pulls back on windup!)
      const pull = f.punchPhase === 'windup' ? 3 : 15;
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(18, -9);
      ctx.lineTo(pull, 0);
      ctx.lineTo(18, 9);
      ctx.stroke();

      if (f.punchPhase === 'windup' && f.ammo > 0) {
        ctx.fillStyle = '#94A3B8';
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(pull, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (weaponId === 'kalem') {
      // Giant #2 Yellow Pencil
      ctx.fillStyle = '#F472B6';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2;
      ctx.fillRect(-3, -3.5, 6, 7);
      ctx.strokeRect(-3, -3.5, 6, 7);

      ctx.fillStyle = '#FACC15';
      ctx.fillRect(3, -3.5, 19, 7);
      ctx.strokeRect(3, -3.5, 19, 7);

      ctx.fillStyle = '#FDE68A';
      ctx.beginPath();
      ctx.moveTo(22, -3.5);
      ctx.lineTo(30, 0);
      ctx.lineTo(22, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.moveTo(27, -1.3);
      ctx.lineTo(30, 0);
      ctx.lineTo(27, 1.3);
      ctx.closePath();
      ctx.fill();
    } else if (weaponId === 'terlik') {
      // Bright pink cartoon slipper
      ctx.fillStyle = '#EC4899';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.ellipse(15, 0, 14, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FBCFE8';
      ctx.beginPath();
      ctx.ellipse(11, 0, 5, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (weaponId === 'kizartma_tavasi') {
      // Frying pan handle + heavy iron skillet head
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.4;
      this.roundRectPath(ctx, -2, -3, 18, 6, 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.arc(24, 0, 12.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(24, 0, 8.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (weaponId === 'cetvel') {
      // School ruler with tick notches
      ctx.fillStyle = '#F59E0B';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.1;
      ctx.fillRect(0, -4, 32, 8);
      ctx.strokeRect(0, -4, 32, 8);
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.5;
      for (let rx = 5; rx <= 28; rx += 5) {
        ctx.beginPath();
        ctx.moveTo(rx, -4);
        ctx.lineTo(rx, -0.5);
        ctx.stroke();
      }
    } else if (weaponId === 'baget_ekmek') {
      // Golden crusty French baguette loaf
      ctx.fillStyle = '#D97706';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.4;
      this.roundRectPath(ctx, -2, -5.5, 36, 11, 5.5);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#FEF3C7';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let sx = 6; sx <= 24; sx += 8) {
        ctx.beginPath();
        ctx.moveTo(sx, -3.5);
        ctx.lineTo(sx + 3.5, 3.5);
        ctx.stroke();
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
    speed: number,
    damageStage: DamageStage
  ): void {
    ctx.save();
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
        ctx.fillStyle = def.palette.secondary;
        ctx.fillRect(-3.5, -14, 7, 27);
        ctx.fillRect(-17, -14, 34, 5);
      } else if (def.outfitStyle === 'vest') {
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
        ctx.fillStyle = def.palette.secondary;
        ctx.fillRect(-17, -3, 34, 6);
        ctx.fillStyle = def.palette.accent;
        ctx.fillRect(-17, 3, 34, 6);
      } else if (def.outfitStyle === 'blazer') {
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
        ctx.fillStyle = def.palette.secondary;
        for (let y = -11; y < 14; y += 8) {
          ctx.fillRect(-17, y, 34, 4);
        }
      }

      // Progressive cumulative outfit dirt, tears, and cartoon splatters
      if (damageStage >= 1) {
        ctx.fillStyle = 'rgba(101, 86, 69, 0.36)';
        ctx.beginPath();
        ctx.ellipse(-9, 6, 5, 3, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (damageStage >= 2) {
        // Small jagged cloth tear revealing inner skin/lining
        ctx.fillStyle = def.palette.skin;
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(7, 1);
        ctx.lineTo(14, -2);
        ctx.lineTo(12, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      if (damageStage >= 3) {
        ctx.fillStyle = 'rgba(101, 86, 69, 0.45)';
        ctx.beginPath();
        ctx.ellipse(6, -6, 6, 3.5, -0.4, 0, Math.PI * 2);
        ctx.fill();
        // Cartoon crimson splatter dot
        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.arc(-5, -2, 2.3, 0, Math.PI * 2);
        ctx.arc(-2, 1, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (damageStage >= 4) {
        // Larger tattered shoulder tear & extra comic smudges
        ctx.fillStyle = def.palette.skin;
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-15, -7);
        ctx.lineTo(-7, -3);
        ctx.lineTo(-14, 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.arc(8, 7, 2.6, 0, Math.PI * 2);
        ctx.arc(4, 9, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.8;
    this.roundRectPath(ctx, -17, -14, 34, 27, 12);
    ctx.stroke();

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
    isStunned: boolean,
    damageStage: DamageStage
  ): void {
    ctx.save();
    ctx.translate(headBob, -23);

    ctx.fillStyle = isFlashing ? '#FFFFFF' : def.palette.skin;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(0, 0, 15.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (!isFlashing) {
      // Hair
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

      // Progressive facial bruises & cartoon marks
      if (damageStage >= 1) {
        ctx.fillStyle = 'rgba(109, 40, 217, 0.36)';
        ctx.beginPath();
        ctx.ellipse(-7, 3, 4.2, 2.8, -0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (damageStage >= 2) {
        ctx.fillStyle = 'rgba(91, 33, 182, 0.42)';
        ctx.beginPath();
        ctx.ellipse(6.5, -2.5, 4.2, 3.2, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (damageStage >= 3) {
        // Cartoon crimson scratch/splatter on cheek
        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.arc(7.5, 5, 2, 0, Math.PI * 2);
        ctx.arc(5, 7, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (damageStage >= 4) {
        // Classic cartoon forehead X band-aid
        ctx.save();
        ctx.translate(-5.5, -6.5);
        ctx.rotate(-0.25);
        ctx.fillStyle = '#FFFDF7';
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 1.4;
        ctx.fillRect(-5, -2, 10, 4);
        ctx.strokeRect(-5, -2, 10, 4);
        ctx.restore();
      }

      const lookX = cos * 3.5;
      const lookY = sin * 2.2;
      const eyeLX = -5 + lookX;
      const eyeRX = 5 + lookX;
      const eyeY = -1 + lookY;

      if (isLoser || isStunned) {
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

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(eyeLX - 0.7, eyeY - 0.7, 0.8, 0, Math.PI * 2);
        ctx.arc(eyeRX - 0.7, eyeY - 0.7, 0.8, 0, Math.PI * 2);
        ctx.fill();

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

  private drawBloodPuddles(
    ctx: CanvasRenderingContext2D,
    bounds: ArenaBounds
  ): void {
    if (this.bloodPuddles.length === 0) return;
    const matLeft = bounds.paddingX + 4;
    const matTop = bounds.paddingY + 4;
    const matWidth = bounds.width - bounds.paddingX * 2 - 8;
    const matHeight = bounds.height - bounds.paddingY * 2 - 8;

    ctx.save();
    this.roundRectPath(ctx, matLeft, matTop, matWidth, matHeight, 14);
    ctx.clip();

    for (const b of this.bloodPuddles) {
      ctx.save();
      ctx.globalAlpha = b.alpha;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // Subtle glossy highlight on fresh puddles
      if (b.rx > 9) {
        ctx.globalAlpha = b.alpha * 0.3;
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.ellipse(-b.rx * 0.22, -b.ry * 0.2, b.rx * 0.34, b.ry * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
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
      if (p.kind === 'blood') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.78, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'star') {
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
