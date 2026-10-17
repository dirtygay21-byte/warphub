// Типы данных и ростера Age of Sigmar 4. Данные — из tools/roster-data/scripts/import-wahapedia-aos.mjs.

export type GrandAlliance = 'ORDER' | 'CHAOS' | 'DEATH' | 'DESTRUCTION';
/** 'standard' — правила батлтома; иначе ключ сезона из AOS_SEASONS (aos/rules.ts), например 'aqshy'. */
export type Season = string | null;

export interface AosRule {
  name: string;
  text: string;
  timing?: string;
  type?: string;
  keywords?: string;
  /** «Spell 7», «Prayer 4», «Command 1» */
  value?: string;
  reaction?: boolean;
  /** текст в выгрузке неполный: обрезан лимитом 1024 символа или без невыгруженной таблицы (см. tools/roster-data README) */
  incomplete?: 'truncated' | 'table';
}

export interface AosWeapon {
  name: string;
  type: 'melee' | 'ranged';
  range: string;
  attacks: string;
  hit: string;
  wound: string;
  rend: string;
  damage: string;
  abilities: string;
}

/** Вариант полка героя: «Any X», «0-1 X», «X (required)», «0-1 A или B». */
export interface AosOption {
  q: 'any' | 'max1' | `max${number}`;
  required: boolean;
  label: string;
  kind: 'tag' | 'unit' | 'keyword' | 'mixed';
  /** подходящие варскроллы фракции */
  ids: string[];
}

export interface AosWarscroll {
  id: string;
  faction: string;
  name: string;
  /** имя без «Scourge of Aqshy» — версии одного юнита */
  baseName: string;
  role: string;
  kind: 'unit' | 'manifestation' | 'terrain';
  hero: boolean;
  unitSize: number;
  /** очки из Battle Profiles; null — юнита нет в Battle Profiles */
  cost: number | null;
  reinforceable: boolean;
  unique: boolean;
  warmaster: boolean;
  keywords: string[];
  factionKeywords: string[];
  regimentKeywords: string[];
  wizard: number | null;
  priest: number | null;
  params: Record<string, string>;
  stats: { move: string; save: string; control: string; health: string; ward: string };
  weapons: AosWeapon[];
  abilities: AosRule[];
  bases: string;
  composition: { unit: string; size: string }[];
  legends: boolean;
  legendsDate: string | null;
  season: Season;
  notes: string;
  link: string;
  source: string | null;
  options: AosOption[];
  /** метки «может присоединиться к полку как …» */
  joinAs: string[];
  /** герой может присоединиться к полку этих героев */
  joinLeaderIds: string[];
  /** юнит можно взять только в полк этих героев */
  onlyInIds: string[];
  /** «1 отряд на каждый X в армии» */
  perUnitOf: { per: number; ids: string[]; label: string } | null;
  /** «не больше N … в полку героя без ключевого слова KW» */
  regimentCap: { max: number; phrase: string; unlessLeader: string; ids: string[] } | null;
  /** «только в полку, где есть X и нет другого Y» */
  requiresInRegiment: { ids: string[]; noOtherIds: string[]; text: string } | null;
  exclusiveWithIds: string[];
  exclusiveWithRorIds: string[];
  /** только в Army of Renown — в обычной армии нельзя */
  aorOnly: string | null;
  /** не занимает место в полку */
  freeSlot: boolean;
  /** в армии с этим юнитом не может быть других UNIQUE */
  noOtherUnique: boolean;
}

export interface AosRorUnit {
  id: string;
  count: number;
  models: number;
  /** собираемый полк: юнит берётся по желанию */
  optional: boolean;
  /** очки юнита в собираемом полку */
  points: number | null;
}

export interface AosRor {
  id: string;
  name: string;
  owner: string;
  /** фиксированная цена; у собираемого полка — null (сумма выбранных юнитов) */
  cost: number | null;
  built: boolean;
  units: AosRorUnit[];
  abilities: AosRule[];
  notes: string;
  /** фракции, в которые можно взять */
  allowed: string[];
  link: string;
  source: string | null;
  /** дата перехода в Warhammer Legends (YYYY-MM-DD) по официальным Battle Profiles */
  legendsDate?: string | null;
  /** полк уже в Warhammer Legends — для обычных игр недоступен */
  legends?: boolean;
}

/** Полк славы, убранный из фракции по официальным документам GW: сохранённый ростер показывает причину. */
export interface AosWithdrawnRor {
  id: string;
  name: string;
  reason: string;
  /** строка плана правок (curated.officialUpdates) */
  ref: string;
}

export interface AosEligibility {
  hero?: boolean;
  all?: string[];
  any?: string[];
  not?: string[];
  names?: string[];
  excludeNames?: string[];
  text: string;
}

export interface AosEnhancement extends AosRule {
  id: string;
  points: number | null;
}

export interface AosEnhancementTable {
  id: string;
  name: string;
  season: Season;
  eligibility: AosEligibility;
  items: AosEnhancement[];
}

export interface AosEnhancementType {
  /** heroic | artefact | monstrous | x:<имя таблицы> */
  key: string;
  name: string;
  tables: AosEnhancementTable[];
}

export type LoreKind = 'spell' | 'prayer' | 'manifestation';

export interface AosLore {
  id: string;
  kind: LoreKind;
  name: string;
  points: number | null;
  universal: boolean;
  season: Season;
  items: AosRule[];
  /** варскроллы манифестаций, которые призывает лор */
  summons: string[];
  /** дата перехода в Warhammer Legends (YYYY-MM-DD) по официальным Battle Profiles */
  legendsDate?: string | null;
  /** лор уже в Warhammer Legends — для обычных игр недоступен */
  legends?: boolean;
}

export interface AosFormation {
  id: string;
  name: string;
  points: number | null;
  /** сезон построения; в старых данных поля нет — значит 'standard' */
  season?: Season;
  rules: AosRule[];
  /** примечание выгрузки (Faction_ability_subtypes.description), например дата перехода в Legends */
  notes?: string | null;
  /** дата перехода в Warhammer Legends (YYYY-MM-DD), если указана в примечании */
  legendsDate?: string | null;
  /** на дату выгрузки построение уже в Legends — для обычных игр недоступно */
  legends?: boolean;
}

export interface AosFactionData {
  system: 'aos';
  id: string;
  name: string;
  grandAlliance: GrandAlliance | null;
  link: string;
  warscrolls: AosWarscroll[];
  /** юниты других фракций, входящие в доступные полки славы */
  rorUnits: AosWarscroll[];
  rors: AosRor[];
  battleTraits: AosRule[];
  formations: AosFormation[];
  enhancementTypes: AosEnhancementType[];
  lores: AosLore[];
  universalManifestations: AosWarscroll[];
  /** правила фракции в выгрузке устарели — предупреждение */
  rulesNotice: string | null;
  /** полки славы, убранные из фракции официальными документами (в старых данных поля нет) */
  withdrawnRors?: AosWithdrawnRor[];
}

export interface AosIndex {
  system: 'aos';
  edition: string;
  lastUpdate: string;
  generatedAt: string;
  credit: string;
  factions: { id: string; name: string; grandAlliance: GrandAlliance | null; units: number; legendsOnly: boolean }[];
}

// ---------- ростер ----------

export type AosPointsLimit = 1000 | 2000;

export interface AosUnit {
  uid: string;
  warscrollId: string;
  reinforced: boolean;
  /** ключ типа улучшения (heroic / artefact / …) → id улучшения */
  enhancements: Record<string, string>;
}

export interface AosRegiment {
  uid: string;
  leader: AosUnit;
  /** юниты полка (в том числе присоединившиеся герои) */
  units: AosUnit[];
}

export interface AosRosterRor {
  id: string;
  /** собираемый полк: выбранные юниты (id варскроллов) */
  picked: string[];
}

export interface AosRoster {
  system: 'aos';
  id: string;
  name: string;
  factionId: string;
  pointsLimit: AosPointsLimit;
  formationId: string | null;
  regiments: AosRegiment[];
  auxiliaries: AosUnit[];
  generalUid: string | null;
  ror: AosRosterRor | null;
  lores: Record<LoreKind, string | null>;
  terrainId: string | null;
  showLegends: boolean;
  dataVersion: string | null;
  summary?: { points: number; errors: number; warnings: number };
  createdAt: number;
  updatedAt: number;
}
