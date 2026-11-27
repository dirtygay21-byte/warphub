/**
 * Test Army, вариант A (27.11.2026): проверка строя отряда (coherency) и «Поставить всех в зону».
 * Правила строя — из источников, ничего не додумываем:
 *  - 40K 11-я ред. (wh-rules.ru, глоссарий приложения, Unit Coherency): каждая модель в пределах 2″ хотя бы от одной
 *    другой модели отряда и в пределах 9″ от каждой; вертикаль (5″) на плоском столе не проверяется;
 *  - AoS 4 (Wahapedia, Core Rules 15.1): coherency range у большинства отрядов 1/2″ (у некоторых — больше по варскроллу),
 *    при 7+ моделях каждая — в пределах range хотя бы от 2 других.
 * Kill Team и Warcry — отряд из одной модели, строя нет.
 */
import { baseToBase, baseToZone, insidePoly, type Placed, type Pt } from './geometry';
import { placeUnit, placedBases, type TAUnit } from './state';

export type CoherencyRule = {
  /** ″ — до ближайшей другой модели */
  range: number;
  /** ″ — до каждой другой модели (40K: 9″) */
  all?: number;
  /** при стольких моделях и больше — нужно 2 соседа (AoS: 7) */
  twoFrom?: number;
  /** отряд — одна группа: модели связаны цепочкой соседей в пределах range (AoS 15.1) */
  group?: boolean;
  source: string;
};

export const COHERENCY_40K: CoherencyRule = {
  range: 2,
  all: 9,
  source: 'wh-rules.ru (11-я ред.), Unit Coherency: 2″ до хотя бы одной модели, 9″ до каждой',
};
export const COHERENCY_AOS: CoherencyRule = {
  range: 0.5,
  twoFrom: 7,
  group: true,
  source: 'Wahapedia AoS 4, Core Rules 15.1: одна группа, coherency range 1/2″ (у некоторых отрядов больше — см. варскролл), при 7+ моделях — 2 соседа',
};

const EPS = 1e-6;

/** Строй отряда: ok, индексы моделей вне строя и самая большая «дыра» (″) до нужного соседа. */
export function coherency(bases: readonly (Placed | null)[], rule: CoherencyRule): { ok: boolean; bad: number[]; worst: number } {
  const on = bases.map((b, i) => ({ b, i })).filter((x): x is { b: Placed; i: number } => !!x.b);
  if (on.length < 2) return { ok: true, bad: [], worst: 0 };
  const need = rule.twoFrom != null && on.length >= rule.twoFrom ? 2 : 1;
  const bad: number[] = [];
  let worst = 0;
  for (const a of on) {
    const ds = on.filter((x) => x.i !== a.i).map((x) => baseToBase(a.b, x.b)).sort((p, q) => p - q);
    const nth = ds[need - 1] ?? Infinity;
    const far = rule.all != null && ds[ds.length - 1]! > rule.all + EPS;
    if (nth > rule.range + EPS || far) {
      bad.push(a.i);
      worst = Math.max(worst, nth - rule.range);
    }
  }
  // одна группа (AoS 15.1): модели вне самой большой связной группы — вне строя
  if (rule.group) {
    const near = (a: Placed, b: Placed) => baseToBase(a, b) <= rule.range + EPS;
    const left = new Set(on.map((x) => x.i));
    let best: number[] = [];
    while (left.size) {
      const start = [...left][0]!;
      const comp = [start];
      left.delete(start);
      for (let k = 0; k < comp.length; k++) {
        const a = on.find((x) => x.i === comp[k])!;
        for (const b of on) if (left.has(b.i) && near(a.b, b.b)) (left.delete(b.i), comp.push(b.i));
      }
      if (comp.length > best.length) best = comp;
    }
    for (const x of on) if (!best.includes(x.i) && !bad.includes(x.i)) bad.push(x.i);
    bad.sort((a, b) => a - b);
  }
  return { ok: bad.length === 0, bad, worst };
}

/**
 * Поставить все невыставленные отряды в зону: по сетке точек зоны (шаг 0,5″, рядами от дальнего от центра стола края),
 * текущим построением и поворотом отряда, база целиком в зоне, без наложения на другие базы (зазор 0,5″).
 * Не поместился — остаётся вне стола (в результате — его uid).
 */
export function autoDeploy(
  units: readonly TAUnit[],
  zone: readonly (readonly Pt[])[],
  others: readonly Placed[],
  width = 60,
  height = 44,
): { units: TAUnit[]; placed: string[]; failed: string[] } {
  const polys = zone.map((p) => [...p] as Pt[]);
  const points: Pt[] = [];
  for (let x = 0.5; x < width; x += 0.5) for (let y = 0.5; y < height; y += 0.5) if (polys.some((p) => insidePoly([x, y], p))) points.push([x, y]);
  if (!points.length) return { units: [...units], placed: [], failed: units.filter((u) => !u.placed).map((u) => u.uid) };
  // направление «назад» — от центра стола к центру зоны: ряды от дальнего края, в ряду — слева направо
  const zc: Pt = [points.reduce((t, p) => t + p[0], 0) / points.length, points.reduce((t, p) => t + p[1], 0) / points.length];
  let [bx, by] = [zc[0] - width / 2, zc[1] - height / 2];
  const len = Math.hypot(bx, by) || 1;
  [bx, by] = [bx / len, by / len];
  if (Math.hypot(zc[0] - width / 2, zc[1] - height / 2) < 1e-6) [bx, by] = [0, 1];
  const back = (p: Pt) => p[0] * bx + p[1] * by;
  const side = (p: Pt) => -p[0] * by + p[1] * bx;
  points.sort((a, b) => Math.round(back(b) * 2) - Math.round(back(a) * 2) || side(a) - side(b));
  // наложение — по описанным кругам баз (с запасом, без наложения овалов) и зазору 0,5″
  const R = (b: Placed) => Math.max(b.rx, b.ry);
  const taken: Placed[] = [...others];
  const placed: string[] = [];
  const failed: string[] = [];
  const out = units.map((u) => {
    if (u.placed) return u;
    // построение считается один раз, дальше — сдвиг
    const at0 = placeUnit(u, [0, 0]);
    const b0 = placedBases(at0).filter((b): b is Placed => !!b);
    for (const p of points) {
      const bs = b0.map((b) => ({ ...b, x: b.x + p[0], y: b.y + p[1] }));
      if (!bs.every((b) => b.x - R(b) >= 0 && b.y - R(b) >= 0 && b.x + R(b) <= width && b.y + R(b) <= height)) continue;
      if (bs.some((b) => taken.some((o) => Math.hypot(o.x - b.x, o.y - b.y) < R(o) + R(b) + 0.5))) continue;
      if (!bs.every((b) => polys.some((poly) => insidePoly([b.x, b.y], poly) && baseToZone(b, poly).whollyInside))) continue;
      taken.push(...bs);
      placed.push(u.uid);
      return { ...at0, models: at0.models.map((m) => (m.at ? { ...m, at: [m.at[0] + p[0], m.at[1] + p[1]] as Pt } : m)) };
    }
    failed.push(u.uid);
    return u;
  });
  return { units: out, placed, failed };
}
