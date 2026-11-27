/**
 * Симулятор боя S2 (08.11.2026): данные ростера → вход движка (testarmy/combat.ts). Оружие атакующего отряда — выбранное
 * снаряжение с числом моделей (и присоединённых персонажей), цель — основной профиль отряда, ключевые слова, InSv и
 * Feel No Pain. Дистанция — ближайшие базы на столе (как инструмент «Отряды»).
 */
import type { ComputedRoster, ComputedUnit } from '../engine/compute';
import type { Datasheet, WeaponProfile } from '../engine/types';
import type { Target, WeaponInput } from './combat';
import { shootProfile, type ShootProfile } from './shooting40k';

export type AttackRow = {
  id: string;
  /** инфолист, чьё это оружие (персонаж или отряд) */
  unit: string;
  weapon: string;
  profile: WeaponProfile;
  /** у скольких моделей это оружие */
  count: number;
  melee: boolean;
  /** дальность в дюймах; null — нет числа (Melee) */
  range: number | null;
  /** первый профиль оружия с несколькими профилями (стандарт / перегрузка) — выбран по умолчанию, остальные — нет */
  primary: boolean;
};

const num = (s: string) => {
  const n = Number(String(s).replace(/["″+\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Части отряда в ростере: сам отряд и присоединённые к нему персонажи. */
export function unitParts(cr: ComputedRoster, uid: string): ComputedUnit[] {
  const main = cr.byUid.get(uid);
  if (!main) return [];
  return [main, ...main.attached.map((u) => cr.byUid.get(u.uid)).filter((x): x is ComputedUnit => !!x?.ds)].filter((x) => !!x.ds);
}

/** Строки оружия для атаки: из снаряжения ростера (оружие → число моделей), дальнобойное или ближнего боя. */
export function attackRows(cr: ComputedRoster, uid: string, melee: boolean): AttackRow[] {
  const rows: AttackRow[] = [];
  for (const c of unitParts(cr, uid)) {
    const ds = c.ds!;
    const counts = new Map(Object.entries(c.loadout).map(([k, v]) => [k.toLowerCase(), v]));
    for (const w of ds.weapons) {
      const count = counts.get(w.name.toLowerCase()) ?? 0;
      if (!count) continue;
      const profiles = w.profiles.filter((p) => (p.type === 'Melee') === melee);
      profiles.forEach((p, i) => rows.push({ id: `${c.unit.uid}|${w.name}|${p.name}`, unit: ds.name, weapon: w.name, profile: p, count, melee, range: melee ? null : num(p.range), primary: i === 0 }));
    }
  }
  return rows;
}

/** Оружие достаёт: дальнобойное — дальность не меньше дистанции (нет дистанции — считаем, что достаёт); ближний бой — всегда. */
export const inRange = (r: AttackRow, distance: number | null) => r.melee || distance == null || r.range == null || r.range >= distance;
/** Половина дальности (RAPID FIRE, MELTA): дистанция известна и не больше половины. */
export const inHalfRange = (r: AttackRow, distance: number | null) => !r.melee && distance != null && r.range != null && distance <= r.range / 2;

export const toWeaponInput = (r: AttackRow, distance: number | null = null, hitMod = 0): WeaponInput => ({
  name: r.profile.name || r.weapon,
  melee: r.melee,
  A: r.profile.A,
  skill: r.profile.skill,
  S: r.profile.S,
  AP: r.profile.AP,
  D: r.profile.D,
  keywords: r.profile.keywords,
  count: r.count,
  halfRange: inHalfRange(r, distance),
  ...(hitMod ? { hitMod } : {}),
});

/** Профиль стрельбы отряда (40K, shooting40k.ts): дальнобойное снаряжение, ключевые слова и способности отряда и лидеров. */
export function shootProfileOf(cr: ComputedRoster, uid: string): ShootProfile | null {
  const [main, ...leaders] = unitParts(cr, uid);
  if (!main?.ds) return null;
  return shootProfile(
    [{ ds: main.ds, leader: false }, ...leaders.map((l) => ({ ds: l.ds!, leader: true }))],
    attackRows(cr, uid, false).map((r) => r.profile.keywords),
  );
}

const fnpOf = (ds: Datasheet) => {
  const a = ds.abilities.find((x) => x.type === 'core' && x.name.toLowerCase() === 'feel no pain');
  return a ? num(a.param) : null;
};

/**
 * Цель — одна группа одинаковых моделей (движок S1): основной профиль отряда (первый профиль инфолиста), его модели;
 * присоединённые персонажи не считаются — notes говорит об этом.
 */
export function targetFrom(cr: ComputedRoster, uid: string): { target: Target; notes: string[]; stealth: boolean } | null {
  const [main, ...leaders] = unitParts(cr, uid);
  const ds = main?.ds;
  const st = ds?.stats[0];
  if (!main || !ds || !st) return null;
  const T = num(st.T);
  const Sv = num(st.Sv);
  const W = num(st.W);
  if (T == null || Sv == null || W == null) return null;
  const notes: string[] = [];
  if (leaders.length) notes.push(`персонажи ${leaders.map((l) => l.ds!.name).join(', ')} не учитываются — считается отряд ${ds.name}`);
  if (ds.stats.length > 1) notes.push(`у отряда несколько профилей — взят «${st.name}»`);
  // Stealth (24): если способность есть у каждой модели отряда, отряд получает преимущество укрытия против дальнобойных атак
  const stealth = [main, ...leaders].every((c) => c.ds!.abilities.some((a) => a.type === 'core' && a.name.toLowerCase() === 'stealth'));
  if (stealth) notes.push('Stealth: цель считается в укрытии против стрельбы');
  return { target: { models: Math.max(1, main.models), T, Sv, inv: st.inv ? num(st.inv) : null, W, fnp: fnpOf(ds), keywords: [...ds.keywords, ...ds.factionKeywords] }, notes, stealth };
}
