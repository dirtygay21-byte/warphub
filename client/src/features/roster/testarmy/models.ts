/**
 * Test Army: модели юнита ростера — сколько моделей какого профиля и на какой базе.
 * Число моделей — из размера отряда в ростере (computeRoster → models), разбивка по типам — modelGroups (как в снаряжении),
 * профиль типа — по названию (ед./мн. число, регистр), запасной — «OTHER MODELS»/единственный профиль.
 */
import type { Datasheet } from '../engine/types';
import { modelGroups } from '../engine/wargear';
import { parseBase, type BaseInfo } from './bases';

export type ModelSpec = {
  /** название профиля (ModelStats.name) */
  profile: string;
  base: BaseInfo;
};

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/[’']/g, '')
    .replace(/[^A-ZА-Я0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const singular = (s: string) => s.replace(/MEN\b/g, 'MAN').replace(/IES\b/g, 'Y').replace(/(?<!S)S\b/g, '');

/** Профиль с наибольшим числом общих слов (не меньше одного значимого). */
function byWords(stats: Datasheet['stats'], g: string): Datasheet['stats'][number] | undefined {
  const words = new Set(g.split(' ').filter((w) => w.length > 2));
  let best: Datasheet['stats'][number] | undefined;
  let score = 0;
  for (const s of stats) {
    const n = singular(norm(s.name))
      .split(' ')
      .filter((w) => words.has(w)).length;
    if (n > score) {
      score = n;
      best = s;
    }
  }
  return best;
}

/** Профиль для типа модели из состава. */
export function profileFor(ds: Pick<Datasheet, 'stats'>, groupName: string): Datasheet['stats'][number] | undefined {
  const g = singular(norm(groupName));
  const stats = ds.stats;
  return (
    stats.find((s) => singular(norm(s.name)) === g) ??
    stats.find((s) => singular(norm(s.name)).split('/').some((p) => p.trim() === g)) ??
    stats.find((s) => g.includes(singular(norm(s.name))) || singular(norm(s.name)).includes(g)) ??
    byWords(stats, g) ??
    stats.find((s) => /OTHER MODELS?/i.test(s.name)) ??
    (stats.length === 1 ? stats[0] : undefined)
  );
}

/** Модели юнита при выбранном числе моделей (порядок: по типам из состава). */
export function unitModels(ds: Pick<Datasheet, 'composition' | 'stats'>, models: number): ModelSpec[] {
  const count = Math.max(1, models || 1);
  const groups = modelGroups(ds, count);
  const out: ModelSpec[] = [];
  for (const g of groups) {
    const p = profileFor(ds, g.name) ?? ds.stats[0];
    for (let i = 0; i < g.count; i++) out.push({ profile: p?.name ?? g.name, base: parseBase(p?.base) });
  }
  // состав не разобрался или сумма не сошлась — остаток первым профилем
  const p0 = ds.stats[0];
  while (out.length < count) out.push({ profile: p0?.name ?? '—', base: parseBase(p0?.base) });
  return out.slice(0, count);
}
