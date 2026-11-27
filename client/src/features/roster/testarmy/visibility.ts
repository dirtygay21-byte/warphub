/**
 * Test Army, 40K 11-я ред. (27.11.2026): видимость, укрытие и скрытность по террейну карты (основные правила wh-rules.ru,
 * данные 995, выдержки — tools/roster-data/40k/whrules-995-core-rules-excerpt.json):
 *  13.10 Загораживание: области укрытий с лёгкими / надёжными элементами — загораживающие; если каждая линия обзора
 *        между двумя моделями пересекает такие области (кроме тех, внутри которых одна или обе модели) — не видят;
 *  13.11 Сплошное: надёжные элементы — линию обзора нельзя провести сквозь их стены на высоте до 3″ (на плоской
 *        карте — стены первого этажа);
 *  13.08 Преимущество укрытия: каждая модель цели — INFANTRY/BEASTS/SWARM в области укрытия или не полностью видна
 *        атакующей модели из-за промежуточных элементов / загораживающих областей;
 *  13.09 Скрытность: INFANTRY/BEASTS/SWARM в области укрытия (все области карты — с лёгкими / надёжными элементами),
 *        юнит не стрелял в этом и предыдущем ходу — видна только врагам в пределах 15″ (радиус обнаружения);
 *  13.11.01 Залегание: скрытная модель, не полностью видимая из-за надёжных элементов, — радиус обнаружения −3″;
 *  24.24 Lone Operative X″ (по умолчанию 12″): если отряд не объединённый — не виден врагам дальше X″.
 * Карта плоская: высоты, окна и этажи не учитываются; линии обзора — между 9 точками каждой базы (центр и 8 по краю).
 */
import { baseToBase, insidePoly, type Placed, type Pt } from './geometry';

export type TerrainMap = {
  /** области укрытий (многоугольники); у карт 40K — участки и отдельные элементы */
  areas: Pt[][];
  /** элементы укрытий: стены (линии) или контур; dense — надёжный; floor — стены выше первого этажа */
  features: { dense: boolean; floor?: boolean; walls: Pt[][] }[];
};

/** Террейн раскладки 40K (battlefield.json): области — участки; элемент вне участков — сам себе область. */
export function terrainOf(pieces: readonly { kind: 'area' | 'feature'; cat: 'dense' | 'light' | null; floor?: number; poly: Pt[]; walls?: Pt[][] }[]): TerrainMap {
  const areas = pieces.filter((p) => p.kind === 'area').map((p) => p.poly);
  const features: TerrainMap['features'] = [];
  for (const p of pieces) {
    if (p.kind !== 'feature') continue;
    const c = centroid(p.poly);
    if (!areas.some((a) => insidePoly(c, a))) areas.push(p.poly);
    features.push({ dense: p.cat === 'dense', ...(p.floor ? { floor: true } : {}), walls: p.walls?.length ? p.walls : [[...p.poly, p.poly[0]!]] });
  }
  return { areas, features };
}

const centroid = (poly: readonly Pt[]): Pt => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

/** Точки базы для линий обзора: центр и 8 по краю. */
export function basePoints(b: Placed): Pt[] {
  const out: Pt[] = [[b.x, b.y]];
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  const local: [number, number][] = b.rect
    ? [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
    : Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)] as [number, number]);
  // чуть внутрь края — точка на самом краю «касается» соседней стены
  for (const [cu, cv] of local) {
    const u = 0.98 * b.rx * cu;
    const v = 0.98 * b.ry * cv;
    out.push([b.x + u * c - v * s, b.y + u * s + v * c]);
  }
  return out;
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
/** Отрезки пересекаются (собственно, без касания концами). */
export function segmentsCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12));
}
/** Отрезок проходит по области: пересекает её край или лежит внутри. */
export function segmentInPoly(a: Pt, b: Pt, poly: readonly Pt[]): boolean {
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (insidePoly(mid, [...poly])) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (segmentsCross(a, b, poly[j]!, poly[i]!)) return true;
  return false;
}
const crossesWalls = (a: Pt, b: Pt, walls: readonly Pt[][]) => walls.some((w) => w.some((q, i) => i > 0 && segmentsCross(a, b, w[i - 1]!, q)));

/** Модель «в пределах» области — любая часть базы внутри. */
export const baseInArea = (b: Placed, poly: readonly Pt[]) => basePoints(b).some((p) => insidePoly(p, [...poly]));

export type ModelSight = {
  /** видна хотя бы по одной линии (13.10, 13.11) */
  visible: boolean;
  /** видна полностью — ни одна линия не пересекает элементы и загораживающие области (13.08) */
  full: boolean;
  /** не полностью видна из-за надёжных элементов (залегание, 13.11.01) */
  denseHidden: boolean;
};

/** Видит ли модель a модель b. */
export function sightBetween(a: Placed, b: Placed, t: TerrainMap): ModelSight {
  const areas = t.areas.filter((poly) => !baseInArea(a, poly) && !baseInArea(b, poly));
  const solid = t.features.filter((f) => f.dense && !f.floor);
  let visible = false;
  let full = true;
  let denseHidden = false;
  for (const p of basePoints(a))
    for (const q of basePoints(b)) {
      const byArea = areas.some((poly) => segmentInPoly(p, q, poly));
      const bySolid = solid.some((f) => crossesWalls(p, q, f.walls));
      if (!byArea && !bySolid) visible = true;
      if (byArea || t.features.some((f) => !f.floor && crossesWalls(p, q, f.walls))) full = false;
      if (bySolid) denseHidden = true;
    }
  return { visible, full: visible && full, denseHidden };
}

export type TargetSight = {
  /** цель видна хотя бы одной модели атакующего с учётом скрытности и Lone Operative */
  visible: boolean;
  /** преимущество укрытия (13.08) — у каждой модели цели */
  cover: boolean;
  /** почему не видна / откуда укрытие — для подписи */
  notes: string[];
  /** не видна из-за Lone Operative (тогда и [INDIRECT FIRE] не может) */
  lone: boolean;
};

/**
 * Видимость отряда-цели для атакующего отряда. ibs — у моделей цели ключевое слово INFANTRY/BEASTS/SWARM;
 * hiddenOk — отряд цели не стрелял в этом и предыдущем ходу; loneOperative — X″ или null.
 */
export function targetSight(attacker: readonly Placed[], target: readonly Placed[], t: TerrainMap, o: { ibs: boolean; hiddenOk: boolean; loneOperative: number | null; detection?: number }): TargetSight {
  const notes: string[] = [];
  const detection = o.detection ?? 15;
  let anyVisible = false;
  let cover = target.length > 0;
  let hiddenSomewhere = false;
  let loneBlocked = false;
  for (const b of target) {
    const inArea = t.areas.some((poly) => baseInArea(b, poly));
    const hidden = o.ibs && o.hiddenOk && inArea;
    let seen = false;
    let fully = false;
    for (const a of attacker) {
      const d = baseToBase(a, b);
      if (o.loneOperative != null && d > o.loneOperative + 1e-6) {
        loneBlocked = true;
        continue;
      }
      const s = sightBetween(a, b, t);
      if (!s.visible) continue;
      // скрытность: видна только в пределах радиуса обнаружения (залегла — на 3″ меньше)
      if (hidden && d > (s.denseHidden ? detection - 3 : detection) + 1e-6) {
        hiddenSomewhere = true;
        continue;
      }
      seen = true;
      if (s.full) fully = true;
    }
    if (seen) anyVisible = true;
    // укрытие: INFANTRY/BEASTS/SWARM в области или ни одна модель атакующего не видит её полностью
    if (!((o.ibs && inArea) || !fully)) cover = false;
  }
  if (!anyVisible) {
    if (loneBlocked) notes.push(`Lone Operative: виден только в пределах ${o.loneOperative}″ (24.24)`);
    if (hiddenSomewhere) notes.push(`скрытность: видна только в пределах ${detection}″ (13.09)`);
    if (!loneBlocked && !hiddenSomewhere) notes.push('линии обзора перекрыты укрытиями (13.10, 13.11)');
  } else if (cover) notes.push(o.ibs && target.every((b) => t.areas.some((poly) => baseInArea(b, poly))) ? 'укрытие: все модели в области укрытия (13.08)' : 'укрытие: цель видна не полностью (13.08)');
  return { visible: anyVisible, cover: anyVisible && cover, notes, lone: !anyVisible && loneBlocked };
}
