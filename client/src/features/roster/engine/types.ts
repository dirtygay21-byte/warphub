// Типы данных, которые генерирует scripts/import-wahapedia.mjs

export interface SizeOption {
  label: string;
  models: number;
  cost: number;
}
export interface PricedItem {
  label: string;
  cost: number;
  /** цены нет в текущем источнике — оставлено прежнее значение, не проверено (в интерфейсе: «не проверено») */
  unverified?: boolean;
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
  /** текст неполный в выгрузке (заглушка таблицы/схемы) */
  incomplete?: 'truncated' | 'table';
}
export interface WargearOption {
  star: boolean;
  text: string;
  /** откуда текст, если не из инфолиста: whrules-roster — формулировка конструктора ростеров wh-rules.ru (в тексте инфолиста вариантов нет) */
  source?: string;
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
  /**
   * Цены орденов: дополнительные таблицы цен (в выгрузке без подписи ордена). chapter — орден армии,
   * для которого действует таблица (tools/roster-data/40k/curated.json); null — не установлен, не применяется.
   */
  costVariants?: { chapter: string | null; costs: CostBand[] }[];
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
  /** стандартные платные предметы (costs[].wargear) тоже платные — как у конструктора ростеров wh-rules.ru (dw); иначе платят только сверх стандартного */
  paidDefaults?: boolean;
  options: WargearOption[];
  /** id стратагем, доступных юниту (core + детачментов) */
  stratagems: string[];
  /** id правил детачментов (DetachmentAbility.id), которые действуют на юнит */
  detachmentAbilities: string[];
  enhancements: string[];
  group: UnitGroup;
  /**
   * Инфолист не обновлён по текущему источнику (его нет в собранном снимке wh-rules.ru): данные старые.
   * Значение — пояснение для игрока; в списках к названию добавляется «*» (engine/source.ts).
   */
  outdated?: string;
}
/** Описание набора юнитов: по названию (UPPER) или по набору ключевых слов (все из набора), минус исключения. */
export interface UnitMatcher {
  names: string[];
  keywords: string[][];
  exclude: string[];
}
export interface DetachmentGrant extends UnitMatcher {
  /** лимит очков [Incursion, Strike Force, Onslaught] */
  caps: number[] | null;
  /** модели с этим ключевым словом не могут быть Warlord */
  noWarlord: string | null;
  /** Warlord должен иметь это ключевое слово */
  warlordMust: string | null;
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
  /** первая (или единственная) Force Disposition — для старых данных и подписи */
  forceDisposition: string | null;
  /** все Force Disposition, которые даёт детачмент (новые данные); пусто/нет — только forceDisposition */
  forceDispositions?: string[];
  chapterDp: Record<string, number>;
  tag: string | null;
  chapter: string | null;
  battleline: string[];
  /** юниты, которые разрешает детачмент (с лимитом очков и ограничениями на Warlord) */
  grants: DetachmentGrant[];
  /** юниты, которые нельзя брать с этим детачментом */
  forbid: UnitMatcher | null;
  /** обязательные юниты: не меньше min; warlord — Warlord должен быть одним из них */
  requires: { matcher: UnitMatcher; min: number; warlord: boolean }[];
  /** повышенный лимит копий для перечисленных моделей */
  limitOverride: { names: string[]; max: number } | null;
  /** название правила армии, которое детачмент отключает (Corsairs and Travelling Players) */
  disablesArmyRule: string | null;
  abilities: DetachmentAbility[];
  /** детачмента нет в текущем источнике: сохранён для открытых ростеров, для новых недоступен (пояснение) */
  outdated?: string;
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
  incomplete?: 'truncated' | 'table';
  /** нет в текущем источнике: остаётся у ростеров, где уже выбрано; новым юнитам не предлагается */
  outdated?: string;
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
  /** стратагема правил армии (не детачмента) — показывается как общая для фракции */
  army?: boolean;
  incomplete?: 'truncated' | 'table';
  /** нет в текущем источнике: показывается только у устаревшего детачмента, выбранного в ростере */
  outdated?: string;
}
export interface FactionData {
  id: string;
  name: string;
  allegiance: 'Imperium' | 'Chaos' | 'Xenos';
  primaryKeyword: string | null;
  /** ключевые слова фракции, с которыми юнит доступен без особых правил */
  armyKeywords: string[];
  chapters: string[];
  armyRules: string[];
  rules: Record<string, { name: string; text: string }>;
  datasheets: Datasheet[];
  detachments: Detachment[];
  stratagems: Stratagem[];
  enhancements: Enhancement[];
  allies: AllyGroup[];
  /**
   * замены id после обновления данных: сохранённые ростеры переводятся на новые записи (engine/migrate.ts).
   * Несколько обновлений одного файла — список (по порядку применения); каждое со своим source применяется к ростеру
   * один раз (переводы вариантов снаряжения) — прежняя запись одним объектом тоже поддерживается.
   */
  migrations?: DataMigrations | DataMigrations[];
  /** источник данных фракции, если он не основная выгрузка (для подписи «Данные: …») */
  source?: DataSource;
}
export interface DataSource {
  site: string;
  dataVersion: number | string;
  mfm?: string | null;
  /** дата данных источника, YYYY-MM-DD */
  date: string;
}

/**
 * Причина замены: переименование, объединение нескольких инфолистов, общий инфолист вместо копии ордена, замена;
 * options — инфолист тот же, но его варианты снаряжения изменились (OptionRemap);
 * size — инфолист тот же, но сохранённого размера отряда в данных больше нет (кодекс изменил состав).
 */
export type MigrationReason = 'renamed' | 'merged' | 'shared' | 'replaced' | 'options' | 'size';
export interface IdMigration {
  to: string;
  reason: MigrationReason;
  /** пояснение для игрока */
  note: string;
  /**
   * Варианты снаряжения нового инфолиста совпадают с прежними (проверено при сборке данных) — выбранные замены
   * переносятся как есть. Иначе они откладываются в UnitMigration.dropped и показываются игроку.
   */
  keepPicks?: boolean;
}
export interface DataMigrations {
  /** версия источника, к которой относится таблица (например «wh-rules 981») */
  source: string;
  datasheets: Record<string, IdMigration>;
  detachments: Record<string, IdMigration>;
  enhancements: Record<string, IdMigration>;
  /**
   * Инфолисты с тем же id, у которых изменились варианты снаряжения: как перевести сохранённые выборы (picks).
   * Применяется к ростеру один раз (Roster.appliedMigrations хранит source).
   */
  options?: Record<string, OptionRemap>;
}
/**
 * Перевод выборов снаряжения на новые варианты. keys: прежний ключ варианта → новый ключ и номера вариантов
 * (choices[i] — новый номер для прежнего варианта i, -1 — такого нет); null — однозначного соответствия нет.
 * Ключа нет в таблице — прежнего варианта не было (выбор откладывается).
 */
export interface OptionRemap {
  note: string;
  keys: Record<string, { to: string; choices: number[] } | null>;
}
/** Что произошло с юнитом при переводе на новые данные (хранится в ростере, пока игрок не исправит). */
export interface UnitMigration {
  /** прежний id инфолиста */
  from: string;
  reason: MigrationReason;
  note: string;
  /** выборы, которые не подошли к новому инфолисту: сохранены как были, в расчёт не входят */
  dropped: {
    size?: string;
    addons?: Record<string, number>;
    wargear?: Record<string, number>;
    picks?: Record<string, number[]>;
    weapons?: Record<string, number>;
  };
}
export interface DataIndex {
  edition: string;
  lastUpdate: string | null;
  generatedAt: string;
  credit: string;
  factions: { id: string; name: string; allegiance: string; units: number; detachments: number }[];
  /** применённые обновления поверх выгрузки (tools/roster-data/scripts/updates-40k.mjs): какие фракции из какого источника */
  updates?: { id: string; kind: string; scope: string[] | null; note: string | null; source: DataSource & { snapshot?: string; fingerprint?: string } }[];
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
  /** устаревшее: снаряжение, заданное вручную счётчиками (до появления проверки вариантов) */
  weapons?: Record<string, number> | null;
  /** выбранные замены снаряжения: ключ варианта → сколько моделей взяли каждый вариант (см. engine/wargear.ts) */
  picks?: Record<string, number[]> | null;
  enhancementId: string | null;
  /** uid юнита-телохранителя, к которому присоединён этот персонаж */
  attachedTo: string | null;
  /** юнит переведён на другой инфолист при обновлении данных */
  migration?: UnitMigration | null;
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
  /** детачменты и улучшения, заменённые при обновлении данных: прежний id → пояснение (для предупреждений) */
  migrationNotes?: { from: string; to: string | null; kind: 'detachment' | 'enhancement'; note: string }[];
  /** обновления данных (DataMigrations.source), уже применённые к ростеру: перевод выборов снаряжения — только один раз */
  appliedMigrations?: string[];
  /**
   * Устаревшие детачменты и улучшения (outdated), которые уже были в этом ростере: их можно вернуть после случайного
   * удаления. В новых ростерах списка нет — устаревшее там не предлагается.
   */
  legacyKept?: { detachments: string[]; enhancements: string[] };
  /** кэш для списка ростеров (пересчитывается в редакторе) */
  summary?: { points: number; errors: number; warnings: number };
  createdAt: number;
  updatedAt: number;
}
