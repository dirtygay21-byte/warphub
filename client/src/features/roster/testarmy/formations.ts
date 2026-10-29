/**
 * Test Army: построения отряда — смещения центров баз от центра отряда (дюймы), отряд смотрит «вверх» (−y),
 * поворот — angle. Три построения: линия, плотная группа (базы вплотную, как можно компактнее), дуга (полукруг).
 * gap — зазор между базами (по умолчанию 0,5″; 0 — вплотную).
 */
import type { Pt } from './geometry';

export type Formation = 'line' | 'tight' | 'arc';

export const FORMATIONS: { id: Formation; label: string }[] = [
  { id: 'line', label: 'Линия' },
  { id: 'tight', label: 'Плотно' },
  { id: 'arc', label: 'Полукруг' },
];

/** Радиус базы для построения: овалы — по длинной полуоси (их длинная ось ставится поперёк линии). */
export type FormationBase = { rx: number; ry: number; rect?: boolean };

const rot = ([x, y]: Pt, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

export function formation(kind: Formation, bases: readonly FormationBase[], gap = 0.5, angle = 0): Pt[] {
  const raw = kind === 'line' ? line(bases, gap) : kind === 'arc' ? arc(bases, gap) : tight(bases, gap);
  // центр отряда — середина охвата
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return raw.map(([x, y]) => rot([x - cx, y - cy], angle));
}

/** Ширина базы поперёк строя (овал стоит длинной стороной вдоль линии). */
const width = (b: FormationBase) => 2 * Math.max(b.rx, b.ry);

function line(bases: readonly FormationBase[], gap: number): Pt[] {
  const out: Pt[] = [];
  let x = 0;
  bases.forEach((b, i) => {
    if (i) x += gap;
    out.push([x + width(b) / 2, 0]);
    x += width(b);
  });
  return out;
}

function arc(bases: readonly FormationBase[], gap: number): Pt[] {
  if (bases.length < 3) return line(bases, gap);
  // соседние базы касаются по хорде (а не по дуге): хорда = полуширины + зазор; радиус подбирается так,
  // чтобы строй занял полукруг (π)
  const chords = bases.slice(1).map((b, i) => width(bases[i]!) / 2 + width(b) / 2 + gap);
  const total = (R: number) => chords.reduce((s, c) => s + 2 * Math.asin(Math.min(1, c / (2 * R))), 0);
  let lo = Math.max(...chords) / 2;
  let hi = chords.reduce((s, c) => s + c, 0);
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (total(mid) > Math.PI) lo = mid;
    else hi = mid;
  }
  const R = hi;
  const out: Pt[] = [];
  let t = Math.PI - (Math.PI - total(R)) / 2; // слева направо по верхней дуге
  bases.forEach((_, i) => {
    if (i) t -= 2 * Math.asin(Math.min(1, chords[i - 1]! / (2 * R)));
    out.push([R * Math.cos(t), -R * Math.sin(t)]);
  });
  return out;
}

/**
 * Плотная группа: жадная упаковка кругов — сначала крупные; каждая следующая база ставится в ближайшее к центру
 * место, где она касается двух уже поставленных (или одной) и ни с кем не пересекается.
 */
function tight(bases: readonly FormationBase[], gap: number): Pt[] {
  // квадрат в любом повороте помещается в описанный круг
  const order = bases.map((b, i) => ({ r: (b.rect ? Math.hypot(b.rx, b.ry) : Math.max(b.rx, b.ry)) + gap / 2, i })).sort((a, b) => b.r - a.r || a.i - b.i);
  const placed: { x: number; y: number; r: number; i: number }[] = [];
  const free = (x: number, y: number, r: number) => placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r - 1e-6);
  for (const { r, i } of order) {
    if (!placed.length) {
      placed.push({ x: 0, y: 0, r, i });
      continue;
    }
    const cands: Pt[] = [];
    for (const p of placed) for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2;
      cands.push([p.x + (p.r + r) * Math.cos(t), p.y + (p.r + r) * Math.sin(t)]);
    }
    for (let a = 0; a < placed.length; a++)
      for (let b = a + 1; b < placed.length; b++) for (const c of tangent(placed[a]!, placed[b]!, r)) cands.push(c);
    const cx = placed.reduce((s, p) => s + p.x, 0) / placed.length;
    const cy = placed.reduce((s, p) => s + p.y, 0) / placed.length;
    let best: Pt | null = null;
    let bd = Infinity;
    for (const c of cands) {
      if (!free(c[0], c[1], r)) continue;
      const d = Math.hypot(c[0] - cx, c[1] - cy);
      if (d < bd - 1e-9) {
        bd = d;
        best = c;
      }
    }
    placed.push({ x: best![0], y: best![1], r, i });
  }
  const out: Pt[] = new Array(bases.length);
  for (const p of placed) out[p.i] = [p.x, p.y];
  return out;
}

/** Центры круга радиуса r, касающегося двух кругов. */
function tangent(a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }, r: number): Pt[] {
  const ra = a.r + r;
  const rb = b.r + r;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d > ra + rb || d < Math.abs(ra - rb) || d === 0) return [];
  const l = (ra * ra - rb * rb + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - l * l));
  const mx = a.x + (l * (b.x - a.x)) / d;
  const my = a.y + (l * (b.y - a.y)) / d;
  return [
    [mx + (h * (b.y - a.y)) / d, my - (h * (b.x - a.x)) / d],
    [mx - (h * (b.y - a.y)) / d, my + (h * (b.x - a.x)) / d],
  ];
}
