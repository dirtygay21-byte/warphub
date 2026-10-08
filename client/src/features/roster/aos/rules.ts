import type { AosPointsLimit, LoreKind } from './types';

/**
 * Правила формирования армии Age of Sigmar 4, General’s Handbook 2026-27 (matched play).
 * Источники: Army Composition 2026-27 (Wahapedia: General’s Handbook 2025-26 / 2026-27),
 * GW Rules Updates и Battle Profiles, июль 2026. Значения вынесены сюда, чтобы их можно было поправить,
 * не трогая проверки.
 */
export const AOS_RULES = {
  /** 1.2: лимит очков — 1000 или 2000 */
  pointsLimits: [1000, 2000] as AosPointsLimit[],
  /** 1.2: на один юнит можно потратить не больше половины лимита */
  maxShareOfOneUnit: 0.5,
  /** 3.1: полков в армии — от 1 до 5 */
  minRegiments: 1,
  maxRegiments: 5,
  /** 3.1: в полку 1 HERO и 0–3 не-HERO юнита (0–4 у генерала) */
  regimentSize: 3,
  generalRegimentSize: 4,
  /** 3.5: не больше 1 полка славы — сверх 5 полков */
  maxRegimentsOfRenown: 1,
  /** 3.6: каждый вспомогательный юнит после первого — накопительная доплата 20 очков (+20, +40, +60 …) */
  auxiliarySurcharge: 20,
  /** 3.7: не больше 1 террейна фракции */
  maxFactionTerrain: 1,
  /** 3.3: усиленный юнит — вдвое больше моделей и вдвое дороже, усилить можно один раз */
  reinforceMultiplier: 2,
};

export const POINTS_LIMIT_LABEL: Record<AosPointsLimit, string> = {
  1000: '1000 очков',
  2000: '2000 очков',
};

/** Доплата за вспомогательные юниты: 0, 20, 60, 120 … (20 × (n−1) × n / 2). */
export function auxiliarySurcharge(count: number): number {
  return count < 2 ? 0 : (AOS_RULES.auxiliarySurcharge * (count - 1) * count) / 2;
}

/** Доплата за следующий (n+1-й) вспомогательный юнит. */
export function nextAuxiliarySurcharge(count: number): number {
  return AOS_RULES.auxiliarySurcharge * count;
}

export const LORE_LABEL: Record<LoreKind, string> = { spell: 'Заклинания', prayer: 'Молитвы', manifestation: 'Манифестации' };
