import type { CharacterDef, CharacterId } from './types';

export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'turk',
    name: 'Türk',
    upperName: 'TÜRK',
    tagline: 'Auuu',
    hairStyle: 'short',
    outfitStyle: 'jacket',
    palette: {
      skin: '#D99B72',
      hair: '#1E293B',
      primary: '#DC2626',
      secondary: '#FFFFFF',
      accent: '#F59E0B',
      pants: '#1E293B',
      glove: '#EF4444',
    },
  },
  {
    id: 'kurt',
    name: 'Kürt',
    upperName: 'KÜRT',
    tagline: 'Mala minê',
    hairStyle: 'wavy',
    outfitStyle: 'vest',
    palette: {
      skin: '#E5B896',
      hair: '#1C1917',
      primary: '#15803D',
      secondary: '#881337',
      accent: '#FACC15',
      pants: '#292524',
      glove: '#16A34A',
    },
  },
  {
    id: 'azeri',
    name: 'Azeri',
    upperName: 'AZERİ',
    tagline: 'Yaxşı gündə yar yaxşıdır, yaman gündə yetiş qardaş',
    hairStyle: 'slick',
    outfitStyle: 'tracksuit',
    palette: {
      skin: '#E2AE86',
      hair: '#0F172A',
      primary: '#0284C7',
      secondary: '#DC2626',
      accent: '#16A34A',
      pants: '#0F172A',
      glove: '#0EA5E9',
    },
  },
  {
    id: 'ingiliz',
    name: 'İngiliz',
    upperName: 'İNGİLİZ',
    tagline: 'Winter is coming',
    hairStyle: 'parted',
    outfitStyle: 'blazer',
    palette: {
      skin: '#F5CBB2',
      hair: '#EAB308',
      primary: '#1E3A8A',
      secondary: '#64748B',
      accent: '#E11D48',
      pants: '#334155',
      glove: '#2563EB',
    },
  },
  {
    id: 'fransiz',
    name: 'Fransız',
    upperName: 'FRANSIZ',
    tagline: 'mbappe',
    hairStyle: 'short',
    outfitStyle: 'stripes',
    palette: {
      skin: '#AE7248',
      hair: '#292524',
      primary: '#1E3A8A',
      secondary: '#FFFFFF',
      accent: '#E11D48',
      pants: '#1E293B',
      glove: '#E11D48',
    },
  },
] as const;

export function getCharacterById(id: CharacterId): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export function pickRandomOpponent(
  playerCharacterId: CharacterId,
  rng: () => number = Math.random
): CharacterDef {
  const pool = CHARACTERS.filter((c) => c.id !== playerCharacterId);
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index];
}
