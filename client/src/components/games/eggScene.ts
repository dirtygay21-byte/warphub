/**
 * «Рой: инкубатор»: кладка в живом улье. Яйцо рисуется кистью Painter,
 * трещины и жилы светятся сильнее с каждым уровнем (на высшем — лаймом варпа).
 */
import { Painter } from "./pixel/paint";
import { drawSprite, seeded, type Sprite } from "./pixel/pixel";
import { drawGameImage } from "./pixel/assets";

export type EggCreatureVisual = { kind: "sprite"; sprite: Sprite } | { kind: "image"; src: string };

export const EW = 100;
export const EH = 100;
const FLOOR = 84;

/** Уровни яйца по числу нажатий (совпадают с редкостью существ) */
export const EGG_TIERS = [0, 10, 25, 50, 100, 250, 500];
export const eggTier = (taps: number) => {
  let tier = 0;
  EGG_TIERS.forEach((min, i) => {
    if (taps >= min) tier = i;
  });
  return tier;
};

export const TIER_GLOW = ["#7a2a48", "#a3186a", "#ff3d9a", "#ff3d9a", "#ff6fb3", "#ffc4e1", "#ecfe46"];

const CRACKS: Array<Array<[number, number]>> = [
  [[22, 8], [24, 12], [21, 15], [24, 19]],
  [[10, 22], [13, 24], [11, 28], [15, 30]],
  [[33, 20], [30, 25], [33, 28], [29, 33]],
  [[17, 38], [20, 42], [17, 46]],
  [[27, 6], [30, 10], [28, 13]],
  [[8, 34], [12, 37], [9, 42]],
  [[30, 38], [34, 41], [31, 46]],
];

const eggCache = new Map<string, Sprite>();

export function eggSprite(tier: number, pulse: 0 | 1, hatched = false): Sprite {
  const key = `${tier}:${pulse}:${hatched}`;
  const cached = eggCache.get(key);
  if (cached) return cached;
  const p = new Painter(44, 56);
  const cx = 21.5;
  const cy = 30;
  const rx = 17;
  const ry = 24;
  const glow = tier >= 6 ? "lime" : "bio";
  for (let y = 0; y < 56; y++) {
    const t = (y - cy) / ry;
    if (Math.abs(t) > 1) continue;
    const wf = t < 0 ? Math.sqrt(1 - t * t) * (0.78 + 0.22 * (1 + t)) : Math.sqrt(1 - t * t);
    const half = wf * rx;
    for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) {
      // хитиновые рёбра поперёк кожистой оболочки
      const band = (y + Math.round(((x - cx) * (x - cx)) / 40)) % 9;
      p.px(x, y, band < 2 && y > 6 ? "chitin" : "flesh", band === 2 ? 2 : 1);
    }
  }
  // костяные шипы у основания
  for (const [x, dir] of [[6, -1], [37, 1], [11, -1], [32, 1]] as const) {
    p.line(x, 46, x + dir * 4, 52, "bone", 2);
  }
  // жилы — пульсируют
  const veins: Array<Array<[number, number]>> = [
    [[14, 50], [13, 42], [15, 34], [13, 26]],
    [[29, 50], [30, 41], [28, 33], [30, 24]],
    [[21, 52], [22, 44], [20, 37]],
  ];
  veins.slice(0, 1 + Math.min(2, tier)).forEach((v) => {
    for (let i = 0; i + 1 < v.length; i++) p.line(v[i]![0], v[i]![1], v[i + 1]![0], v[i + 1]![1], glow, pulse ? 2 : 1);
  });
  // трещины
  if (!hatched) {
    CRACKS.slice(0, tier).forEach((c) => {
      for (let i = 0; i + 1 < c.length; i++) p.line(c[i]![0], c[i]![1], c[i + 1]![0], c[i + 1]![1], glow, 3);
    });
  } else {
    // верх сорван: остаётся рваная чаша, внутри слизь
    for (let y = 0; y < 30; y++) for (let x = 0; x < 44; x++) {
      const edge = 26 + ((x * 7) % 5) - 2;
      if (y < edge) p.erase(x, y);
    }
    p.ellipse(cx, 28, 12, 2, glow, 1);
  }
  const s = p.finish({ outline: "#050505" });
  eggCache.set(key, s);
  return s;
}

// ---------------------------------------------------------------------------
// Фон: камера улья
// ---------------------------------------------------------------------------

const PUSTULES = (() => {
  const r = seeded(3);
  return Array.from({ length: 9 }, () => ({ x: Math.floor(r() * EW), y: 20 + Math.floor(r() * 60), s: 1 + Math.floor(r() * 2), ph: r() * 6 }));
})();

export function drawHive(ctx: CanvasRenderingContext2D, t: number, glow: string) {
  const bands = ["#070506", "#0b0709", "#10090d", "#140b10", "#190c13", "#1d0d15", "#160b11"];
  bands.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * 14, EW, 14);
  });
  // рёбра-арки улья
  ctx.fillStyle = "#1f353c";
  for (const x0 of [6, 30, 62, 88]) {
    for (let i = 0; i < 26; i++) {
      const y = 70 - Math.round(Math.sin((i / 26) * Math.PI) * 52);
      ctx.fillRect(x0 + i - 13, y, 2, 2);
    }
  }
  ctx.fillStyle = "#0f1a1d";
  for (const x0 of [6, 30, 62, 88]) {
    for (let i = 0; i < 26; i++) {
      const y = 70 - Math.round(Math.sin((i / 26) * Math.PI) * 52);
      ctx.fillRect(x0 + i - 13, y + 2, 2, 1);
    }
  }
  // светящиеся наросты
  for (const p of PUSTULES) {
    const a = 0.45 + Math.sin(t * 2 + p.ph) * 0.3;
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = "#ff3d9a";
    ctx.fillRect(p.x - 2, p.y - 2, p.s + 4, p.s + 4);
    ctx.globalAlpha = a;
    ctx.fillRect(p.x, p.y, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  // пол: живая мембрана
  ctx.fillStyle = "#2e0f1b";
  ctx.fillRect(0, FLOOR, EW, EH - FLOOR);
  ctx.fillStyle = "#521a31";
  ctx.fillRect(0, FLOOR, EW, 1);
  ctx.fillStyle = "#1f353c";
  for (let x = 0; x < EW; x += 7) ctx.fillRect(x + ((x / 7) % 2) * 3, FLOOR + 5 + ((x / 7) % 3), 4, 1);
  // гнездо из щупалец
  ctx.fillStyle = "#34545d";
  for (let i = 0; i < 9; i++) {
    const x = 28 + i * 5;
    const h = 4 + ((i * 3) % 5);
    ctx.fillRect(x, FLOOR - h, 2, h);
    ctx.fillRect(x + (i % 2 ? 1 : -1), FLOOR - h - 1, 2, 1);
  }
  // свечение кладки на полу
  ctx.globalAlpha = 0.18 + Math.sin(t * 3) * 0.05;
  ctx.fillStyle = glow;
  ctx.fillRect(24, FLOOR - 2, 52, 4);
  ctx.globalAlpha = 1;
  // туман
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = "#a64366";
  for (let i = 0; i < 4; i++) {
    const x = ((i * 31 + t * 4) % (EW + 30)) - 15;
    ctx.fillRect(Math.round(x), FLOOR - 6 - i, 26, 3);
  }
  ctx.globalAlpha = 1;
}

export function drawEggScene(
  ctx: CanvasRenderingContext2D,
  state: {
    t: number;
    taps: number;
    wobble: number;
    hatched: boolean;
    creature: EggCreatureVisual | null;
    rise: number;
    flash: number;
  },
) {
  const tier = eggTier(state.taps);
  const glow = TIER_GLOW[tier]!;
  drawHive(ctx, state.t, glow);
  const pulse = (Math.sin(state.t * (3 + tier)) > 0 ? 1 : 0) as 0 | 1;
  const egg = eggSprite(tier, pulse, state.hatched);
  const shake = Math.round(Math.sin(state.t * 60) * state.wobble * 3);
  const ex = Math.round(EW / 2 - egg.w / 2) + shake;
  const ey = FLOOR - egg.h + 4;
  // ореол
  // мягкое свечение-эллипс вокруг кладки
  ctx.fillStyle = glow;
  const gcx = ex + egg.w / 2;
  const gcy = ey + egg.h / 2 + 2;
  for (let r = 0; r < 4; r++) {
    ctx.globalAlpha = (0.035 + tier * 0.012 + (pulse ? 0.015 : 0)) * (4 - r) * 0.5;
    const rx = egg.w / 2 + 10 - r * 3;
    const ry = egg.h / 2 + 8 - r * 3;
    for (let y = -ry; y <= ry; y++) {
      const half = Math.round(rx * Math.sqrt(1 - (y / ry) ** 2));
      ctx.fillRect(Math.round(gcx - half), Math.round(gcy + y), half * 2, 1);
    }
  }
  ctx.globalAlpha = 1;
  drawSprite(ctx, egg, ex, ey, { glowAlpha: 0.35 });
  if (state.creature && state.hatched) {
    const c = state.creature;
    const cy = ey + 18 - Math.round(state.rise * 24);
    if (c.kind === "image") {
      // контур цвета свечения кладки (14.11.2026): тёмные существа не сливаются с тёмным гнездом
      const cx = Math.round(EW / 2 - 22);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) drawGameImage(ctx, c.src, cx + dx, cy + dy, { width: 44, height: 56, tint: glow });
      drawGameImage(ctx, c.src, cx, cy, { width: 44, height: 56 });
    }
    else drawSprite(ctx, c.sprite, Math.round(EW / 2 - c.sprite.w / 2), cy, { glowAlpha: 0.35 });
  }
  if (state.flash > 0) {
    ctx.globalAlpha = state.flash;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, EW, EH);
    ctx.globalAlpha = 1;
  }
}
