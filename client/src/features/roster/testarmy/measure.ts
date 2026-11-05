/**
 * Test Army: измерения на столе. Правила 11-й редакции (Rules Appendix, 14.01.01 «Objectives Not Within A Terrain Area»):
 * маркер цели — круглый, 40 мм; модель в пределах дальности цели, если она в пределах 3″ по горизонтали (и 5″ по вертикали)
 * от маркера; расстояния — до ближайшей точки маркера и от ближайшей точки базы. Для целей в участке террейна правило
 * отдельное — здесь не применяется. Высоты (вертикаль) на плоской карте нет.
 */
import { MM_PER_INCH } from './bases';
import { baseToBase, baseToZone, closestPoints, dist, nearestOnBase, snap, type Placed, type Pt } from './geometry';

export const OBJECTIVE_MARKER_MM = 40;
export const OBJECTIVE_RANGE = 3;
export const OBJECTIVE_RULE_SOURCE = 'Rules Appendix 11-й ред., 14.01.01: в пределах 3″ по горизонтали от маркера 40 мм';
export const objectiveRadius = OBJECTIVE_MARKER_MM / 2 / MM_PER_INCH;

/** Маркер цели как база (для расстояний «до ближайшей точки маркера»). */
export const objectiveBase = (o: { x: number; y: number }): Placed => ({ x: o.x, y: o.y, rx: objectiveRadius, ry: objectiveRadius, angle: 0 });

/** Конец линейки: точка стола или край базы модели (тогда точка пересчитывается к другому концу). */
export type RulerEnd = { kind: 'pt'; at: Pt } | { kind: 'base'; modelId: string };

/** Точки линейки и длина; базы ищутся по id модели (null — модель убрана со стола). */
export function resolveRuler(a: RulerEnd, b: RulerEnd, baseOf: (modelId: string) => Placed | null): { from: Pt; to: Pt; d: number } | null {
  const ba = a.kind === 'base' ? baseOf(a.modelId) : null;
  const bb = b.kind === 'base' ? baseOf(b.modelId) : null;
  if ((a.kind === 'base' && !ba) || (b.kind === 'base' && !bb)) return null;
  if (ba && bb) {
    const [from, to] = closestPoints(ba, bb);
    return { from, to, d: baseToBase(ba, bb) };
  }
  const pa = a.kind === 'pt' ? a.at : null;
  const pb = b.kind === 'pt' ? b.at : null;
  const from = pa ?? nearestOnBase(pb!, ba!);
  const to = pb ?? nearestOnBase(pa!, bb!);
  return { from, to, d: dist(from, to) };
}

/** Привязка точки линейки: база под пальцем (или рядом, до tol) — к базе; иначе к цели/углу террейна. */
export function snapEnd(p: Pt, bases: readonly { modelId: string; base: Placed }[], points: readonly Pt[], tol = 0.4): RulerEnd {
  let best: { modelId: string; d: number } | null = null;
  for (const { modelId, base } of bases) {
    const d = Math.max(0, dist(p, [base.x, base.y]) - Math.max(base.rx, base.ry));
    if (d <= tol && (!best || d < best.d)) best = { modelId, d };
  }
  if (best) return { kind: 'base', modelId: best.modelId };
  return { kind: 'pt', at: snap(p, points, tol).at };
}

/** До ближайшей цели от отряда: расстояние (край базы — край маркера), какие точки, в пределах ли дальности. */
export function nearestObjective(bases: readonly Placed[], objectives: readonly { x: number; y: number; role: string | null }[], range = OBJECTIVE_RANGE) {
  let best: { d: number; from: Pt; to: Pt; index: number } | null = null;
  objectives.forEach((o, index) => {
    const ob = objectiveBase(o);
    for (const b of bases) {
      const d = baseToBase(b, ob);
      if (!best || d < best.d) {
        const [from, to] = closestPoints(b, ob);
        best = { d, from, to, index };
      }
    }
  });
  const r = best as { d: number; from: Pt; to: Pt; index: number } | null;
  return r ? { ...r, inRange: r.d <= range } : null;
}

/** До зоны деплоя от отряда: 0 — хотя бы одна база касается зоны или в ней; точки для линии. */
export function unitToZone(bases: readonly Placed[], poly: readonly Pt[]): { d: number; from: Pt; to: Pt } | null {
  let best: { d: number; from: Pt; to: Pt } | null = null;
  for (const b of bases) {
    const z = baseToZone(b, poly as Pt[]);
    if (!best || z.d < best.d) best = { d: z.d, from: nearestOnBase(z.at, b), to: z.at };
  }
  return best;
}

/** До зоны из нескольких частей (территории AoS): ближайшая часть. */
export function unitToZones(bases: readonly Placed[], polys: readonly (readonly Pt[])[]): { d: number; from: Pt; to: Pt } | null {
  let best: { d: number; from: Pt; to: Pt } | null = null;
  for (const p of polys) {
    const r = unitToZone(bases, p);
    if (r && (!best || r.d < best.d)) best = r;
  }
  return best;
}

/** «12,4″» */
export const fmtInches = (d: number) => `${(Math.round(d * 10) / 10).toFixed(1).replace('.', ',')}″`;

/** До ближайшего отряда другой армии: от края базы до края базы; точки для линии; null — врагов на столе нет. */
export function nearestEnemy(bases: readonly Placed[], enemies: readonly { uid: string; base: Placed }[]): { d: number; from: Pt; to: Pt; uid: string } | null {
  let best: { d: number; from: Pt; to: Pt; uid: string } | null = null;
  for (const b of bases)
    for (const e of enemies) {
      const d = baseToBase(b, e.base);
      if (!best || d < best.d) {
        const [from, to] = closestPoints(b, e.base);
        best = { d, from, to, uid: e.uid };
      }
    }
  return best;
}
