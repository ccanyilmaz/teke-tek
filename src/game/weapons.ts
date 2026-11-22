import type { WeaponDef, WeaponId } from './types';

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'yumruk',
    name: 'Yumruk',
    upperName: 'YUMRUK',
    tagline: 'Hızlı, dengeli klasik',
    damageMin: 6,
    damageMax: 7,
    windup: 0.045,
    active: 0.095,
    recovery: 0.13,
    cooldown: 0.56,
    range: 82,
    knockback: 180,
    maxAmmo: null,
    specialName: 'Süper Kroşe',
    specialDesc: 'Öne atılarak blok kıran sert kroşe',
    specialKind: 'heavy_lunge',
    specialCooldown: 4.2,
    hitWords: ['PAM!', 'TOK!', 'GÜM!'],
    color: '#EF4444',
    accentColor: '#FCA5A5',
  },
  {
    id: 'sopa',
    name: 'Sopa',
    upperName: 'SOPA',
    tagline: 'Uzun menzil, güçlü itiş',
    damageMin: 8,
    damageMax: 9,
    windup: 0.095,
    active: 0.12,
    recovery: 0.18,
    cooldown: 0.80,
    range: 102,
    knockback: 245,
    maxAmmo: null,
    specialName: 'Geniş Savurma',
    specialDesc: 'Geniş açılı savurma ile uzağa fırlatır',
    specialKind: 'wide_sweep',
    specialCooldown: 4.5,
    hitWords: ['KÜT!', 'TAK!', 'PAT!'],
    color: '#B45309',
    accentColor: '#FDE68A',
  },
  {
    id: 'bicak',
    name: 'Bıçak',
    upperName: 'BIÇAK',
    tagline: 'Seri kesik, yakın baskı',
    damageMin: 6,
    damageMax: 7,
    windup: 0.045,
    active: 0.09,
    recovery: 0.135,
    cooldown: 0.62,
    range: 78,
    knockback: 150,
    maxAmmo: null,
    specialName: 'Hızlı Hamle',
    specialDesc: 'Ani ileri sıçrayışla çift kıvılcımlı vuruş',
    specialKind: 'dash_slash',
    specialCooldown: 4.2,
    hitWords: ['ŞİNK!', 'FİŞ!', 'ÇİZ!'],
    color: '#64748B',
    accentColor: '#E2E8F0',
  },
  {
    id: 'isin_kilici',
    name: 'Işın Kılıcı',
    upperName: 'IŞIN KILICI',
    tagline: 'Yüksek vuruş, ağır tempo',
    damageMin: 10,
    damageMax: 11,
    windup: 0.14,
    active: 0.13,
    recovery: 0.24,
    cooldown: 1.02,
    range: 106,
    knockback: 265,
    maxAmmo: null,
    specialName: 'Plazma Dalgası',
    specialDesc: 'Orta menzilli enerji dalgası fırlatır',
    specialKind: 'plasma_wave',
    specialCooldown: 4.8,
    hitWords: ['VZZT!', 'ZAP!', 'BZZZ!'],
    color: '#06B6D4',
    accentColor: '#A5F3FC',
  },
  {
    id: 'sapan',
    name: 'Sapan',
    upperName: 'SAPAN',
    tagline: '5 taşlı uzak atış',
    damageMin: 7,
    damageMax: 8,
    windup: 0.08,
    active: 0.09,
    recovery: 0.145,
    cooldown: 0.70,
    range: 345,
    knockback: 195,
    maxAmmo: 5,
    projectileSpeed: 520,
    specialName: 'Üçlü Saçma',
    specialDesc: 'Üç taşlık yelpaze atışı yapar',
    specialKind: 'triple_shot',
    specialCooldown: 4.6,
    hitWords: ['TAK!', 'ÇAT!', 'PIŞ!'],
    color: '#92400E',
    accentColor: '#F59E0B',
  },
  {
    id: 'kalem',
    name: 'Kalem',
    upperName: 'KALEM',
    tagline: 'Ultra seri kombo dürtüşü',
    damageMin: 5,
    damageMax: 5,
    windup: 0.035,
    active: 0.075,
    recovery: 0.10,
    cooldown: 0.50,
    range: 82,
    knockback: 115,
    maxAmmo: null,
    specialName: 'Kalem Fırtınası',
    specialDesc: 'Hızlı sıçrama ile kombo yükselten seri vuruş',
    specialKind: 'flurry_poke',
    specialCooldown: 3.6,
    hitWords: ['TIK!', 'CİZ!', 'DÜRT!'],
    color: '#FACC15',
    accentColor: '#F472B6',
  },
  {
    id: 'terlik',
    name: 'Terlik',
    upperName: 'TERLİK',
    tagline: 'Çevik şaplak, fırlatma özel',
    damageMin: 7,
    damageMax: 8,
    windup: 0.055,
    active: 0.10,
    recovery: 0.15,
    cooldown: 0.70,
    range: 88,
    knockback: 220,
    maxAmmo: null,
    specialName: 'Uçan Terlik',
    specialDesc: 'Uzak mesafeye dönen terlik fırlatır',
    specialKind: 'boomerang_slipper',
    specialCooldown: 4.6,
    hitWords: ['ŞLAK!', 'ŞAP!', 'PAT!'],
    color: '#EC4899',
    accentColor: '#FBCFE8',
  },
  {
    id: 'kizartma_tavasi',
    name: 'Kızartma Tavası',
    upperName: 'KIZARTMA TAVASI',
    tagline: 'Ağır darbe, dev savurma',
    damageMin: 11,
    damageMax: 12,
    windup: 0.13,
    active: 0.13,
    recovery: 0.23,
    cooldown: 1.00,
    range: 100,
    knockback: 315,
    maxAmmo: null,
    specialName: 'Tava Balyozu',
    specialDesc: 'Bloku sarsan ağır çınlama darbesi',
    specialKind: 'pan_smash',
    specialCooldown: 4.8,
    hitWords: ['DANG!', 'ÇANG!', 'GÜM!'],
    color: '#334155',
    accentColor: '#94A3B8',
  },
  {
    id: 'cetvel',
    name: 'Cetvel',
    upperName: 'CETVEL',
    tagline: 'Uzun şaklama, seri tempo',
    damageMin: 5,
    damageMax: 6,
    windup: 0.05,
    active: 0.085,
    recovery: 0.12,
    cooldown: 0.53,
    range: 95,
    knockback: 150,
    maxAmmo: null,
    specialName: 'Esnek Uzama',
    specialDesc: 'Ekstra uzun menzilli yaylı şaklama',
    specialKind: 'elastic_snap',
    specialCooldown: 4.2,
    hitWords: ['PIRR!', 'ŞAK!', 'TINK!'],
    color: '#F59E0B',
    accentColor: '#FEF3C7',
  },
  {
    id: 'baget_ekmek',
    name: 'Baget Ekmek',
    upperName: 'BAGET EKMEK',
    tagline: 'Çıtır kabuk, tok savurma',
    damageMin: 8,
    damageMax: 10,
    windup: 0.08,
    active: 0.115,
    recovery: 0.16,
    cooldown: 0.74,
    range: 100,
    knockback: 260,
    maxAmmo: null,
    specialName: 'Çıtır Darbe',
    specialDesc: 'Döner kabuk savurması ile güçlü itiş',
    specialKind: 'crust_whack',
    specialCooldown: 4.3,
    hitWords: ['KITIR!', 'HOP!', 'TOK!'],
    color: '#D97706',
    accentColor: '#FDE68A',
  },
] as const;

export function getWeaponById(id: WeaponId): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}

export function pickRandomWeapon(rng: () => number = Math.random): WeaponDef {
  const index = Math.min(WEAPONS.length - 1, Math.floor(rng() * WEAPONS.length));
  return WEAPONS[index];
}

export function pickDifferentWeapon(
  excludeId: WeaponId,
  rng: () => number = Math.random
): WeaponDef {
  const pool = WEAPONS.filter((w) => w.id !== excludeId);
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index] ?? WEAPONS[0];
}

/**
 * Estimates sustained DPS + utility score to verify matchup fairness.
 */
export function getWeaponPowerScore(weapon: WeaponDef): number {
  const avgDmg = (weapon.damageMin + weapon.damageMax) * 0.5;
  const dps = avgDmg / weapon.cooldown;
  const rangeFactor = weapon.id === 'sapan' ? 1.05 : Math.min(1.12, weapon.range / 90);
  return dps * 0.8 + rangeFactor * 2.5;
}

/**
 * Picks two independent random weapons while preventing extreme repeated lopsidedness.
 */
export function pickFairRandomWeaponPair(
  rng: () => number = Math.random,
  preferAvoidRangedMirror = false
): { player: WeaponId; opponent: WeaponId } {
  const playerW = pickRandomWeapon(rng);
  let opponentW = pickRandomWeapon(rng);

  if (preferAvoidRangedMirror && playerW.id === 'sapan' && opponentW.id === 'sapan' && rng() < 0.5) {
    opponentW = pickRandomWeapon(rng);
  }

  return {
    player: playerW.id,
    opponent: opponentW.id,
  };
}

export function rollWeaponDamage(
  weapon: WeaponDef,
  rng: () => number = Math.random
): number {
  if (weapon.damageMin === weapon.damageMax) {
    return weapon.damageMin;
  }
  const span = weapon.damageMax - weapon.damageMin + 1;
  return weapon.damageMin + Math.min(span - 1, Math.floor(rng() * span));
}
