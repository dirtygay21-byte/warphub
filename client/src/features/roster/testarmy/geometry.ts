/**
 * Test Army: геометрия на столе в дюймах (координаты поля боя 60×44, как в battlefield.json).
 * Расстояния в 40K меряются между ближайшими точками баз: для кругов — точно, для овалов — по точкам контура
 * (72 точки, погрешность < 0,01″ для баз до 170 мм).
 */
export type Pt = [number, number];

/** База на столе: центр, полуоси (дюймы), поворот длинной оси (радианы); rect — прямоугольная (rx, ry — половины сторон). */
export type Placed = { x: number; y: number; rx: number; ry: number; angle: number; rect?: boolean };

const STEPS = 72;

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const isCircle = (b: Placed) => !b.rect && Math.abs(b.rx - b.ry) < 1e-6;

/** Точки контура базы. */
export function outline(b: Placed, steps = STEPS): Pt[] {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  const out: Pt[] = [];
  if (b.rect) {
    // по периметру прямоугольника, равномерно
    const per = steps / 4;
    const corners: Pt[] = [
      [-b.rx, -b.ry],
      [b.rx, -b.ry],
      [b.rx, b.ry],
      [-b.rx, b.ry],
    ];
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = corners[k]!;
      const [bx, by] = corners[(k + 1) % 4]!;
      for (let i = 0; i < per; i++) {
        const t = i / per;
        const ex = ax + (bx - ax) * t;
        const ey = ay + (by - ay) * t;
        out.push([b.x + ex * c - ey * s, b.y + ex * s + ey * c]);
      }
    }
    return out;
  }
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const ex = b.rx * Math.cos(t);
    const ey = b.ry * Math.sin(t);
    out.push([b.x + ex * c - ey * s, b.y + ex * s + ey * c]);
  }
  return out;
}

/** Точка внутри базы. */
export function insideBase(p: Pt, b: Placed): boolean {
  const dx = p[0] - b.x;
  const dy = p[1] - b.y;
  const c = Math.cos(-b.angle);
  const s = Math.sin(-b.angle);
  const u = dx * c - dy * s;
  const v = dx * s + dy * c;
  if (b.rect) return Math.abs(u) <= b.rx + 1e-9 && Math.abs(v) <= b.ry + 1e-9;
  return (u * u) / (b.rx * b.rx) + (v * v) / (b.ry * b.ry) <= 1 + 1e-9;
}

/** От точки до края базы (0 — точка на базе или внутри). */
export function pointToBase(p: Pt, b: Placed): number {
  if (insideBase(p, b)) return 0;
  if (isCircle(b)) return Math.max(0, dist(p, [b.x, b.y]) - b.rx);
  return Math.min(...outline(b).map((q) => dist(p, q)));
}

/** Между ближайшими точками двух баз (0 — касаются или перекрываются). */
export function baseToBase(a: Placed, b: Placed): number {
  if (isCircle(a) && isCircle(b)) return Math.max(0, dist([a.x, a.y], [b.x, b.y]) - a.rx - b.rx);
  if (isCircle(b)) return Math.max(0, Math.min(...outline(a).map((p) => dist(p, [b.x, b.y]))) - b.rx);
  if (isCircle(a)) return baseToBase(b, a);
  const pa = outline(a);
  const pb = outline(b);
  if (pa.some((p) => insideBase(p, b)) || pb.some((p) => insideBase(p, a))) return 0;
  let m = Infinity;
  for (const p of pa) for (const q of pb) m = Math.min(m, dist(p, q));
  return m;
}

/** Между двумя отрядами — ближайшие базы; пары индексов моделей. */
export function unitToUnit(a: Placed[], b: Placed[]): { d: number; i: number; j: number } {
  let best = { d: Infinity, i: -1, j: -1 };
  a.forEach((p, i) =>
    b.forEach((q, j) => {
      const d = baseToBase(p, q);
      if (d < best.d) best = { d, i, j };
    }),
  );
  return best;
}

/** Точка внутри многоугольника (чётность пересечений). */
export function insidePoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** От точки до отрезка и ближайшая точка на нём. */
export function pointToSegment(p: Pt, a: Pt, b: Pt): { d: number; at: Pt } {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2)) : 0;
  const at: Pt = [a[0] + t * vx, a[1] + t * vy];
  return { d: dist(p, at), at };
}

/** От точки до границы многоугольника: расстояние, ближайшая точка границы, внутри ли точка. */
export function pointToPolyEdge(p: Pt, poly: Pt[]): { d: number; at: Pt; inside: boolean } {
  let best = { d: Infinity, at: p as Pt };
  for (let i = 0; i < poly.length; i++) {
    const r = pointToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!);
    if (r.d < best.d) best = r;
  }
  return { ...best, inside: insidePoly(p, poly) };
}

/**
 * От базы до зоны (многоугольника): 0 — база касается зоны или заходит в неё; иначе — до ближайшей точки зоны.
 * whollyInside — база целиком в зоне (для подсветки «модель вне зоны деплоя»).
 */
export function baseToZone(b: Placed, poly: Pt[]): { d: number; at: Pt; whollyInside: boolean } {
  const pts = isCircle(b) ? outline(b, 36) : outline(b);
  const whollyInside = pts.every((p) => insidePoly(p, poly));
  if (pts.some((p) => insidePoly(p, poly)) || insidePoly([b.x, b.y], poly)) {
    const e = pointToPolyEdge([b.x, b.y], poly);
    return { d: 0, at: e.at, whollyInside };
  }
  let best = { d: Infinity, at: [b.x, b.y] as Pt };
  for (const p of pts) {
    const e = pointToPolyEdge(p, poly);
    if (e.d < best.d) best = { d: e.d, at: e.at };
  }
  return { ...best, whollyInside };
}

/** Привязка: ближайшая цель в пределах tol, иначе сама точка. */
export function snap(p: Pt, targets: readonly Pt[], tol = 0.5): { at: Pt; snapped: boolean } {
  let best: Pt | null = null;
  let bd = tol;
  for (const t of targets) {
    const d = dist(p, t);
    if (d <= bd) {
      bd = d;
      best = t;
    }
  }
  return best ? { at: best, snapped: true } : { at: p, snapped: false };
}

/** Ближайшая точка на краю базы к точке p (для привязки линейки к базе). */
export function nearestOnBase(p: Pt, b: Placed): Pt {
  if (isCircle(b)) {
    const d = dist(p, [b.x, b.y]) || 1;
    return [b.x + ((p[0] - b.x) / d) * b.rx, b.y + ((p[1] - b.y) / d) * b.rx];
  }
  return outline(b).reduce((a, q) => (dist(p, q) < dist(p, a) ? q : a));
}

/** Ближайшие точки двух баз (для линии между ними). */
export function closestPoints(a: Placed, b: Placed): [Pt, Pt] {
  if (isCircle(a) && isCircle(b)) return [nearestOnBase([b.x, b.y], a), nearestOnBase([a.x, a.y], b)];
  const pa = isCircle(a) ? null : outline(a);
  const pb = isCircle(b) ? null : outline(b);
  if (!pa) {
    const q = pb!.reduce((m, p) => (dist(p, [a.x, a.y]) < dist(m, [a.x, a.y]) ? p : m));
    return [nearestOnBase(q, a), q];
  }
  if (!pb) {
    const q = pa.reduce((m, p) => (dist(p, [b.x, b.y]) < dist(m, [b.x, b.y]) ? p : m));
    return [q, nearestOnBase(q, b)];
  }
  let best: [Pt, Pt] = [pa[0]!, pb[0]!];
  let bd = Infinity;
  for (const p of pa)
    for (const q of pb) {
      const d = dist(p, q);
      if (d < bd) {
        bd = d;
        best = [p, q];
      }
    }
  return best;
}

/**
 * Какую базу задел палец (29.10.2026): база в пределах tol (дюймы поля — пересчёт из пикселей экрана) от точки нажатия.
 * Сначала — базы отряда prefer (выбранного), затем ближайшая; null — нажатие на пустое поле.
 */
export function pickBase<T extends { uid: string; base: Placed }>(p: Pt, bases: readonly T[], tol: number, prefer?: string | null): T | null {
  let best: { e: T; d: number; pref: boolean } | null = null;
  for (const e of bases) {
    const d = pointToBase(p, e.base);
    if (d > tol) continue;
    const pref = !!prefer && e.uid === prefer;
    if (!best || (pref && !best.pref) || (pref === best.pref && d < best.d)) best = { e, d, pref };
  }
  return best?.e ?? null;
}

/** Допуск нажатия в дюймах поля: px пикселей экрана при ширине карты widthPx (карта — 47 единиц viewBox по ширине). */
export const touchTolerance = (px: number, widthPx: number) => (widthPx > 0 ? (px * 47) / widthPx : 0.5);
