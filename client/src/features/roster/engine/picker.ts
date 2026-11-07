/**
 * Выбор юнита для ростера 40K (Добавить юнит, 07.11.2026): поиск, «Помещается», сортировка и цены размеров.
 * Чистые функции — их проверяют tests/unit-picker.test.ts; интерфейс — ui/UnitPicker.tsx.
 */
import { bandFor } from './compute';
import type { Datasheet } from './types';
import type { RuOverlay } from '../ru';

export type PickerSort = 'type' | 'az' | 'points';
export const PICKER_SORTS: { key: PickerSort; label: string }[] = [
  { key: 'type', label: 'По типу' },
  { key: 'az', label: 'А–Я' },
  { key: 'points', label: 'По очкам' },
];

const low = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'");

/**
 * Совпадение с поиском: часть названия, часть ключевого слова (FLY, Terminator), часть названия способности —
 * английского и русского (оверлей wh-rules / перевод WarpHub). Пустой поиск — всё.
 */
export function pickerMatch(ds: Datasheet, query: string, ru: RuOverlay | null = null): boolean {
  const q = low(query.trim());
  if (!q) return true;
  if (low(ds.name).includes(q)) return true;
  if (ds.keywords.some((k) => low(k).includes(q)) || ds.factionKeywords.some((k) => low(k).includes(q))) return true;
  if (ds.abilities.some((a) => low(a.name).includes(q))) return true;
  const ruAb = ru?.datasheets?.[ds.id]?.abilities;
  return !!ruAb && Object.values(ruAb).some((a) => !!a?.name && low(a.name).includes(q));
}

/** Размеры и цены следующей копии (ступень цены за копии — как при добавлении). */
export function nextPrices(ds: Datasheet, count: number, chapter: string | null) {
  return bandFor(ds, count + 1, chapter)?.options ?? [];
}

/** Самая низкая цена следующей копии; нет цены — null. */
export function cheapest(ds: Datasheet, count: number, chapter: string | null): number | null {
  const c = nextPrices(ds, count, chapter).map((o) => o.cost);
  return c.length ? Math.min(...c) : null;
}

/** «Помещается»: самый дешёвый размер следующей копии не больше оставшихся очков. */
export function fitsPoints(ds: Datasheet, count: number, chapter: string | null, remaining: number): boolean {
  const c = cheapest(ds, count, chapter);
  return c != null && c <= remaining;
}

/**
 * Цены размеров для строки списка: «5: 65 · 10: 130». Если у размера нет числа моделей (подписи сайта
 * «1 Sword Brother, 4 Neophytes, 5 Initiates») — только очки: «160 · 305». Один размер — пусто (цена справа).
 */
export function sizePriceLine(ds: Datasheet, count: number, chapter: string | null): string {
  const opts = nextPrices(ds, count, chapter);
  if (opts.length < 2) return '';
  const withModels = opts.every((o) => o.models != null);
  return opts.map((o) => (withModels ? `${o.models}: ${o.cost}` : String(o.cost))).join(' · ');
}

/** Сортировка плоского списка: А–Я или по очкам (дешевле — выше; без цены — в конце), затем по названию. */
export function sortPicker(list: Datasheet[], sort: Exclude<PickerSort, 'type'>, priceOf: (ds: Datasheet) => number | null): Datasheet[] {
  const byName = (a: Datasheet, b: Datasheet) => a.name.localeCompare(b.name);
  if (sort === 'az') return [...list].sort(byName);
  return [...list].sort((a, b) => {
    const pa = priceOf(a);
    const pb = priceOf(b);
    if (pa == null || pb == null) return pa == null && pb == null ? byName(a, b) : pa == null ? 1 : -1;
    return pa - pb || byName(a, b);
  });
}
