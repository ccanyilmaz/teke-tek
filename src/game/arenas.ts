import type { ArenaThemeId } from './types';

export interface ArenaThemeDef {
  id: ArenaThemeId;
  roundNumber: 1 | 2 | 3 | 4 | 5;
  name: string;
  subtitle: string;
  badgeBg: string;
  badgeText: string;
  outerCanvasBg: string;
}

export const ARENA_THEMES: readonly ArenaThemeDef[] = [
  {
    id: 'deniz',
    roundNumber: 1,
    name: 'Açık Deniz Salı',
    subtitle: 'Dalgaların ortasında kapışma',
    badgeBg: '#E0F2FE',
    badgeText: '#0369A1',
    outerCanvasBg: '#0369A1',
  },
  {
    id: 'buz',
    roundNumber: 2,
    name: 'Buzullar Diyarı',
    subtitle: 'Ayaz ve buz kütlesi',
    badgeBg: '#DBEAFE',
    badgeText: '#1D4ED8',
    outerCanvasBg: '#7DD3FC',
  },
  {
    id: 'col',
    roundNumber: 3,
    name: 'Kızgın Çöl',
    subtitle: 'Kumlu vaha meydanı',
    badgeBg: '#FEF3C7',
    badgeText: '#B45309',
    outerCanvasBg: '#F59E0B',
  },
  {
    id: 'orman',
    roundNumber: 4,
    name: 'Kadim Orman',
    subtitle: 'Zümrüt ağaçların gölgesi',
    badgeBg: '#DCFCE7',
    badgeText: '#15803D',
    outerCanvasBg: '#166534',
  },
  {
    id: 'volkan',
    roundNumber: 5,
    name: 'Alevli Yanardağ',
    subtitle: 'FİNAL KRATERİ',
    badgeBg: '#FEE2E2',
    badgeText: '#B91C1C',
    outerCanvasBg: '#1C1917',
  },
] as const;

export function getArenaThemeForRound(roundNumber: number): ArenaThemeDef {
  const clamped = Math.max(1, Math.min(5, Math.floor(roundNumber)));
  return ARENA_THEMES[clamped - 1] ?? ARENA_THEMES[0];
}
