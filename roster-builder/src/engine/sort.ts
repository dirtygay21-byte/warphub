import type { Datasheet } from './types';

/**
 * Порядок юнитов: от самых важных к остальным — Epic Hero, персонажи, Battleline,
 * выделенный транспорт, затем по типу (пехота → кавалерия → шагоходы → техника → монстры → авиация → титаны → укрепления).
 */
export const UNIT_TYPES = [
  { key: 'epic', label: 'Эпические герои' },
  { key: 'character', label: 'Персонажи' },
  { key: 'battleline', label: 'Боевая линия' },
  { key: 'transport', label: 'Выделенный транспорт' },
  { key: 'infantry', label: 'Пехота' },
  { key: 'mounted', label: 'Кавалерия и звери' },
  { key: 'walker', label: 'Шагоходы' },
  { key: 'vehicle', label: 'Техника' },
  { key: 'monster', label: 'Монстры' },
  { key: 'aircraft', label: 'Авиация' },
  { key: 'titanic', label: 'Титаны' },
  { key: 'fortification', label: 'Укрепления' },
  { key: 'other', label: 'Прочие' },
] as const;
export type UnitType = (typeof UNIT_TYPES)[number]['key'];

export function unitType(ds: Datasheet, battleline: boolean): UnitType {
  const kw = new Set(ds.keywords.map((k) => k.toUpperCase()));
  if (ds.epicHero) return 'epic';
  if (ds.character) return 'character';
  if (battleline) return 'battleline';
  if (ds.dedicatedTransport) return 'transport';
  if (kw.has('FORTIFICATION')) return 'fortification';
  if (kw.has('TITANIC')) return 'titanic';
  if (kw.has('AIRCRAFT')) return 'aircraft';
  if (kw.has('MONSTER')) return 'monster';
  if (kw.has('WALKER')) return 'walker';
  if (kw.has('VEHICLE')) return 'vehicle';
  if (kw.has('MOUNTED') || kw.has('BEAST') || kw.has('SWARM') || kw.has('CAVALRY')) return 'mounted';
  if (kw.has('INFANTRY')) return 'infantry';
  return 'other';
}

export const typeRank = (t: UnitType) => UNIT_TYPES.findIndex((x) => x.key === t);
export const typeLabel = (t: UnitType) => UNIT_TYPES.find((x) => x.key === t)?.label ?? '';

/** Сравнение для сортировки: тип → название. */
export function compareUnits(a: Datasheet, b: Datasheet, blA: boolean, blB: boolean): number {
  return typeRank(unitType(a, blA)) - typeRank(unitType(b, blB)) || a.name.localeCompare(b.name);
}

/** Сортировка юнитов ростера: тип → название → порядок добавления (копии одного инфолиста идут подряд). */
export function sortRosterUnits<T extends { ds?: Datasheet; isBattleline: boolean; copy: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (!a.ds || !b.ds) return a.ds ? -1 : b.ds ? 1 : 0;
    return compareUnits(a.ds, b.ds, a.isBattleline, b.isBattleline) || a.copy - b.copy;
  });
}
