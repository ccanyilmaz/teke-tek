import type { DamageStage } from './types';

/**
 * Computes progressive cartoon wear stage (0..4) from cumulative match damage.
 * Stage 0: clean (Round 1 start)
 * Stage 1: light bruise & small dirt smudge
 * Stage 2: noticeable bruises & small outfit tears
 * Stage 3: more dirt, cartoon red splatters & wider tears
 * Stage 4: heavy comic wear, battered band-aid vibe & tattered outfit (still recognizable)
 */
export function computeDamageStage(totalDamageTaken: number): DamageStage {
  if (totalDamageTaken >= 270) return 4;
  if (totalDamageTaken >= 180) return 3;
  if (totalDamageTaken >= 100) return 2;
  if (totalDamageTaken >= 35) return 1;
  return 0;
}

export function getDamageStageLabel(stage: DamageStage): string {
  switch (stage) {
    case 0:
      return 'Tertemiz';
    case 1:
      return 'Hafif Çizik';
    case 2:
      return 'Morluklu';
    case 3:
      return 'Hırpalanmış';
    case 4:
      return 'Perişan';
  }
}
