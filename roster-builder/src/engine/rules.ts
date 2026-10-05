import type { BattleSize } from './types';

/**
 * Правила формирования армии, 11-я редакция (октябрь 2026).
 * Всё, что помечено «≈», взято из вторичных источников и может поменяться —
 * поэтому значения вынесены в конфиг, а не зашиты в код проверок.
 */
export interface BattleSizeRules {
  label: string;
  points: number;
  /** бюджет Detachment Points */
  dp: number;
  /** в Incursion можно взять один детачмент за 3 DP как единственный */
  singleOverBudget: number | null;
  enhancements: number;
  /** лимит копий одного инфолиста */
  unitLimit: number;
}

export const BATTLE_SIZES: Record<BattleSize, BattleSizeRules> = {
  incursion: { label: 'Incursion', points: 1000, dp: 2, singleOverBudget: 3, enhancements: 2, unitLimit: 2 },
  strike: { label: 'Strike Force', points: 2000, dp: 3, singleOverBudget: null, enhancements: 4, unitLimit: 3 },
  // ≈ бюджет DP для Onslaught официально не подтверждён
  onslaught: { label: 'Onslaught', points: 3000, dp: 3, singleOverBudget: null, enhancements: 4, unitLimit: 3 },
};

export const BATTLE_SIZE_ORDER: BattleSize[] = ['incursion', 'strike', 'onslaught'];
const idx = (s: BattleSize) => BATTLE_SIZE_ORDER.indexOf(s);

export const LIMITS = {
  battlelineMultiplier: 2,
  /** ≈ выделенный транспорт: до 6 копий в Strike Force */
  dedicatedTransportMultiplier: 2,
  epicHero: 1,
  upgradeTargets: 3,
};

export const FORCE_DISPOSITIONS = ['Take and Hold', 'Disruption', 'Purge the Foe', 'Priority Assets', 'Reconnaissance'];

/** Лимиты союзников [Incursion, Strike Force, Onslaught] — по тексту правил из Abilities.csv. */
export const ALLY_RULES = {
  // Assigned Agents: RETINUE / CHARACTER / REQUISITIONED; DEDICATED TRANSPORT — без лимита
  agents: { retinue: [1, 2, 3], character: [1, 2, 3], requisitioned: [1, 1, 2] },
  knights: { titanic: 1, small: 3 }, // Freeblades / Dreadblades: 1 TITANIC или до 3 малых
  titanicus: 1, // Titanic Support: 1 модель ADEPTUS TITANICUS
  daemonsPoints: [250, 500, 750], // Daemonic Pact
  daemonGods: ['KHORNE', 'TZEENTCH', 'NURGLE', 'SLAANESH'],
};

/**
 * ≈ Лимиты очков для юнитов «чужих» ключевых слов, разрешённых детачментом
 * (Blood Legions у World Eaters, Harlequins у Drukhari и т.д.).
 */
export function grantedPointsCap(factionId: string, size: BattleSize, detachmentNames: string[]): number {
  if (factionId === 'DRU') {
    return detachmentNames.includes('Reaper’s Wager') ? [500, 1000, 1500][idx(size)] : [250, 500, 750][idx(size)];
  }
  return [500, 1000, 1500][idx(size)];
}

export const sizeIndex = idx;
