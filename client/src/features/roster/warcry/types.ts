// Warcry (W4 30.10.2026): данные из krisling049/warcry_data → backend/roster-data/warcry (tools/roster-data/scripts/import-warcry.mjs).
// Тексты правил — английский оригинал источника; id — _id из warcry_data.

export type WarcryAlliance = 'chaos' | 'death' | 'destruction' | 'order';
export type WarcryCost = 'battletrait' | 'passive' | 'reaction' | 'double' | 'triple' | 'quad';

export interface WarcryAbility {
  id: string;
  name: string;
  cost: WarcryCost;
  text: string;
  /** рунмарки, нужные бойцу для способности (без рунмарки фракции) */
  runemarks: string[];
  /** способность подфракции (bladeborn-варбанды) — её рунмарка */
  subfaction?: string;
  /** способность конкретного монстра (общие файлы альянсов) */
  monster?: string;
}

export interface WarcryWeapon {
  runemark: string;
  minRange: number;
  maxRange: number;
  attacks: number;
  strength: number;
  dmgHit: number;
  dmgCrit: number;
}

export interface WarcryFighter {
  id: string;
  name: string;
  /** '' — основная фракция, иначе рунмарка подфракции */
  subfaction: string;
  movement: number;
  toughness: number;
  wounds: number;
  points: number;
  /** hero, ally, thrall, monster… (без рунмарки фракции) */
  runemarks: string[];
  weapons: WarcryWeapon[];
  /** база из варскролла AoS 4 с тем же названием (tools/roster-data/warcry/bases.json); нет — «нет данных» */
  base?: string;
  /** название варскролла AoS, из которого взята база */
  baseFrom?: string;
}

export interface WarcrySubfaction {
  name: string;
  bladeborn: boolean;
  heroesAll: boolean;
  singleton: boolean;
}

export interface WarcryFaction {
  system: 'warcry';
  id: string;
  name: string;
  grandAlliance: WarcryAlliance;
  /** общий файл альянса: союзники, траллы и монстры */
  generic: boolean;
  bladeborn: boolean;
  heroesAll: boolean;
  singleton: boolean;
  subfactions: WarcrySubfaction[];
  fighters: WarcryFighter[];
  abilities: WarcryAbility[];
}

export interface WarcryIndex {
  system: 'warcry';
  edition: string;
  source: { name: string; url: string; folder: string; commit: string; date: string; license: string };
  grandAlliances: WarcryAlliance[];
  factions: { id: string; name: string; grandAlliance: WarcryAlliance; generic: boolean; subfactions: string[]; fighters: number }[];
  /** универсальные способности (Rush, Onslaught…) */
  universal: WarcryAbility[];
}
