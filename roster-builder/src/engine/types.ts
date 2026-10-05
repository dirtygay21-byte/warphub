// Типы данных, которые генерирует scripts/import-wahapedia.mjs

export interface SizeOption {
  label: string;
  models: number;
  cost: number;
}
export interface PricedItem {
  label: string;
  cost: number;
}
/** Полоса стоимости: «YOUR 1ST TO 2ND UNITS COST» → from=1, to=2; to=null — без верхней границы. */
export interface CostBand {
  from: number;
  to: number | null;
  options: SizeOption[];
  addons: PricedItem[];
  wargear: PricedItem[];
}
export interface ModelStats {
  name: string;
  M: string;
  T: string;
  Sv: string;
  inv: string;
  W: string;
  Ld: string;
  OC: string;
  base: string;
}
export interface WeaponProfile {
  name: string;
  type: string; // Ranged | Melee
  range: string;
  A: string;
  skill: string; // BS/WS
  S: string;
  AP: string;
  D: string;
  keywords: string;
}
export interface Weapon {
  name: string;
  profiles: WeaponProfile[];
}
/** Правило стандартного снаряжения: кто (все / один / остальные / N) получает предметы. */
export interface LoadoutRule {
  who: 'all' | 'one' | 'rest' | number;
  subject: string;
  items: { weapon: string; qty: number }[];
}
export interface UnitAbility {
  type: 'core' | 'faction' | 'datasheet' | 'wargear';
  name: string;
  param: string;
  text: string;
  /** ссылка на общее правило FactionData.rules */
  ref?: string;
}
export interface WargearOption {
  star: boolean;
  text: string;
}

/** own — своя фракция; det:<id> — разрешён детачментом; ally:<key> — союзники. */
export type UnitGroup = 'own' | `det:${string}` | `ally:${string}`;

export interface Datasheet {
  id: string;
  name: string;
  faction: string;
  role: string;
  keywords: string[];
  factionKeywords: string[];
  support: boolean;
  legends: boolean;
  forgeWorld: boolean;
  source: string;
  link: string;
  character: boolean;
  epicHero: boolean;
  battleline: boolean;
  dedicatedTransport: boolean;
  titanic: boolean;
  costs: CostBand[];
  leads: string[];
  leaderNote: string;
  leaderExtra: boolean;
  composition: string[];
  stats: ModelStats[];
  loadout: string;
  transport: string;
  damaged: { w: string; text: string } | null;
  invulnNote: string;
  abilities: UnitAbility[];
  weapons: Weapon[];
  defaultLoadout: LoadoutRule[];
  options: WargearOption[];
  /** id стратагем, доступных юниту (core + детачментов) */
  stratagems: string[];
  /** id правил детачментов (DetachmentAbility.id), которые действуют на юнит */
  detachmentAbilities: string[];
  enhancements: string[];
  group: UnitGroup;
}
export interface DetachmentAbility {
  id: string;
  name: string;
  text: string;
}
export interface Detachment {
  id: string;
  faction: string;
  name: string;
  type: string;
  dp: number;
  forceDisposition: string | null;
  chapterDp: Record<string, number>;
  tag: string | null;
  chapter: string | null;
  battleline: string[];
  grants: string[];
  abilities: DetachmentAbility[];
}
export interface Enhancement {
  id: string;
  faction: string;
  name: string;
  cost: number;
  detachment: string;
  upgrade: boolean;
  restriction: string;
  text: string;
}
export interface AllyGroup {
  key: string;
  name: string;
  note: string;
  text: string;
}
export interface Stratagem {
  id: string;
  /** '' — основная (Core) стратагема */
  detachment: string;
  name: string;
  cp: string;
  type: string;
  turn: string;
  phase: string;
  text: string;
}
export interface FactionData {
  id: string;
  name: string;
  allegiance: 'Imperium' | 'Chaos' | 'Xenos';
  primaryKeyword: string | null;
  chapters: string[];
  armyRules: string[];
  rules: Record<string, { name: string; text: string }>;
  datasheets: Datasheet[];
  detachments: Detachment[];
  stratagems: Stratagem[];
  enhancements: Enhancement[];
  allies: AllyGroup[];
}
export interface DataIndex {
  edition: string;
  lastUpdate: string | null;
  generatedAt: string;
  credit: string;
  factions: { id: string; name: string; allegiance: string; units: number; detachments: number }[];
}

// ---------- ростер ----------
export type BattleSize = 'incursion' | 'strike' | 'onslaught';

export interface RosterUnit {
  uid: string;
  datasheetId: string;
  /** label выбранного размера (совпадает между полосами стоимости) */
  size: string;
  addons: Record<string, number>;
  wargear: Record<string, number>;
  /** снаряжение вручную: оружие → сколько моделей его несут; null/нет — стандартное по инфолисту */
  weapons?: Record<string, number> | null;
  enhancementId: string | null;
  /** uid юнита-телохранителя, к которому присоединён этот персонаж */
  attachedTo: string | null;
}

export interface Roster {
  id: string;
  name: string;
  factionId: string;
  battleSize: BattleSize;
  detachmentIds: string[];
  forceDisposition: string | null;
  /** орден для Space Marines (ключевое слово фракции) */
  chapter: string | null;
  units: RosterUnit[];
  warlordUid: string | null;
  showLegends: boolean;
  dataVersion: string | null;
  /** кэш для списка ростеров (пересчитывается в редакторе) */
  summary?: { points: number; errors: number; warnings: number };
  createdAt: number;
  updatedAt: number;
}
