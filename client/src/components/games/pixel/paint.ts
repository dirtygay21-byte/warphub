/**
 * «Кисть» для пиксель-арта: рисуем материалами (не цветами), а затенение,
 * контур и свечение считаются автоматически. Так все персонажи выглядят
 * в одном стиле: свет сверху-слева, тёмный контур, светящиеся «варп»-детали.
 */
import type { Sprite } from "./pixel";

/** Палитра материалов: 4 оттенка от тёмного к светлому */
export const MATERIALS = {
  // ---- общее / WarpHub
  lime: ["#7d8c12", "#b9cc28", "#ecfe46", "#fbffc4"], // акцент WarpHub — энергия варпа
  ink: ["#070707", "#0e0e0d", "#151514", "#1d1d1b"],
  steel: ["#262b31", "#48525c", "#76838f", "#b4c1cb"],
  gunmetal: ["#16191c", "#2a2f34", "#3f464d", "#5a636b"],
  bone: ["#4f4639", "#8c7f68", "#c4b797", "#ebe2c8"],
  crimson: ["#2e0b0f", "#5c161d", "#8e2430", "#bf3a47"],
  brass: ["#3e2c0d", "#6f5019", "#a9832f", "#ddbd58"],
  leather: ["#22170f", "#3f2b1c", "#62442d", "#856041"],
  fire: ["#7a1f05", "#d14a0c", "#ff8a1f", "#ffd27a"],
  smoke: ["#141413", "#1f1e1c", "#2b2a27", "#3a3935"],
  // ---- Ржавая Орда
  skin: ["#202b16", "#374a23", "#506b31", "#759448"],
  rust: ["#331709", "#5e2c12", "#8f481c", "#c27536"],
  amber: ["#4d3a07", "#8f6c10", "#c99a1c", "#ecc650"],
  ember: ["#4a0606", "#951414", "#ff3b2a", "#ffb3a6"],
  // ---- Рой
  chitin: ["#0f1a1d", "#1f353c", "#34545d", "#517a84"],
  flesh: ["#2e0f1b", "#521a31", "#7a2a48", "#a64366"],
  bio: ["#5a0d36", "#a3186a", "#ff3d9a", "#ffc4e1"],
  // ---- фэнтези-набор «Легенды Warp Hub»
  gold: ["#5a3d0c", "#a8781c", "#e8b33a", "#ffe48a"],
  azure: ["#0f2340", "#1d4473", "#2f6bb0", "#5b9be0"],
  leaf: ["#16301a", "#275a2c", "#3f8a3c", "#6dbb55"],
  bark: ["#2a1b10", "#4a3220", "#6b4a2e", "#8c6640"],
  stone: ["#2a2a2e", "#45454c", "#66666f", "#8d8d96"],
  purple: ["#26123a", "#43215f", "#673590", "#9356c4"],
  ash: ["#1b1919", "#2f2b2a", "#4a4441", "#6b6360"],
  swamp: ["#1d2414", "#33401f", "#4f5f2c", "#6f8340"],
  tan: ["#4a2e1c", "#7a5134", "#a8754c", "#cf9e6e"],
  ghost: ["#1d5c55", "#3fa597", "#7af0dc", "#d6fff7"],
  holy: ["#6b4a0a", "#c48a14", "#ffcf4a", "#fff2b8"],
} as const;

export type Mat = keyof typeof MATERIALS;
const MAT_KEYS = Object.keys(MATERIALS) as Mat[];
/** Эти материалы светятся (не затеняются и дают ореол) */
const EMISSIVE = new Set<Mat>(["lime", "fire", "ember", "bio", "ghost", "holy"]);

export class Painter {
  readonly w: number;
  readonly h: number;
  private mat: Int8Array;
  private lvl: Int8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.mat = new Int8Array(w * h).fill(-1);
    this.lvl = new Int8Array(w * h);
  }

  private inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Один пиксель. level: 0 — тень, 1 — основной, 2 — свет, 3 — блик */
  px(x: number, y: number, m: Mat, level = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return this;
    this.mat[y * this.w + x] = MAT_KEYS.indexOf(m);
    this.lvl[y * this.w + x] = level;
    return this;
  }

  erase(x: number, y: number) {
    x = Math.round(x);
    y = Math.round(y);
    if (this.inside(x, y)) this.mat[y * this.w + x] = -1;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, m: Mat, level = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, m, level);
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, m: Mat, level = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.5);
        const dy = (y - cy) / (ry + 0.5);
        if (dx * dx + dy * dy <= 1) this.px(x, y, m, level);
      }
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, m: Mat, level = 1, width = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      if (width <= 1) this.px(x, y, m, level);
      else this.rect(Math.round(x - (width - 1) / 2), Math.round(y - (width - 1) / 2), width, width, m, level);
    }
    return this;
  }

  /** Заливка многоугольника */
  poly(points: Array<[number, number]>, m: Mat, level = 1) {
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i]!;
        const [bx, by] = points[(i + 1) % points.length]!;
        if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) {
          xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]!); x <= Math.round(xs[k + 1]! - 0.01); x++) this.px(x, y, m, level);
      }
    }
    return this;
  }

  /** Перекрасить уже нарисованные пиксели материала в прямоугольнике (детали, полосы) */
  recolor(x: number, y: number, w: number, h: number, from: Mat | null, to: Mat, level?: number) {
    x = Math.round(x);
    y = Math.round(y);
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        if (!this.inside(i, j)) continue;
        const k = j * this.w + i;
        if (this.mat[k] === -1) continue;
        if (from && this.mat[k] !== MAT_KEYS.indexOf(from)) continue;
        this.mat[k] = MAT_KEYS.indexOf(to);
        if (level !== undefined) this.lvl[k] = level;
      }
    return this;
  }

  filled(x: number, y: number) {
    return this.inside(x, y) && this.mat[y * this.w + x] !== -1;
  }

  /**
   * Готовый спрайт: свет сверху-слева, тень снизу-справа,
   * тёмная граница между разными материалами, внешний контур, ореол свечения.
   */
  finish(options: { outline?: string | null; glow?: boolean; flip?: boolean } = {}): Sprite {
    const { w, h } = this;
    const px: (string | null)[] = new Array(w * h).fill(null);
    const glowPx: (string | null)[] = new Array(w * h).fill(null);
    const at = (x: number, y: number) => (this.inside(x, y) ? this.mat[y * w + x]! : -1);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const m = at(x, y);
        if (m === -1) continue;
        const mat = MAT_KEYS[m]!;
        let level = this.lvl[y * w + x]!;
        if (!EMISSIVE.has(mat)) {
          const up = at(x, y - 1);
          const left = at(x - 1, y);
          const down = at(x, y + 1);
          const right = at(x + 1, y);
          if (up === -1 || left === -1) level += 1;
          if (down === -1 || right === -1) level -= 1;
          // стык разных материалов — тёмная линия снизу (глубина)
          if (down !== -1 && down !== m && !EMISSIVE.has(MAT_KEYS[down]!) && level > 0) level -= 1;
        }
        level = Math.max(0, Math.min(3, level));
        px[y * w + x] = MATERIALS[mat][level]!;
      }
    }

    if (options.outline !== null) {
      const outline = options.outline ?? "#060606";
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (at(x, y) !== -1) continue;
          if (at(x - 1, y) !== -1 || at(x + 1, y) !== -1 || at(x, y - 1) !== -1 || at(x, y + 1) !== -1) {
            px[y * w + x] = outline;
          }
        }
    }

    let hasGlow = false;
    if (options.glow !== false) {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const m = at(x, y);
          if (m === -1 || !EMISSIVE.has(MAT_KEYS[m]!)) continue;
          const color = MATERIALS[MAT_KEYS[m]!][2];
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              if (Math.abs(dx) + Math.abs(dy) > 3) continue;
              const gx = x + dx;
              const gy = y + dy;
              if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
              glowPx[gy * w + gx] = color;
              hasGlow = true;
            }
        }
    }

    let sprite: Sprite = { w, h, px, glow: hasGlow ? glowPx : undefined };
    if (options.flip) sprite = flipSprite(sprite);
    return sprite;
  }
}

export function flipSprite(s: Sprite): Sprite {
  const flip = (arr: (string | null)[]) => {
    const out: (string | null)[] = new Array(arr.length);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) out[y * s.w + x] = arr[y * s.w + (s.w - 1 - x)]!;
    return out;
  };
  return { w: s.w, h: s.h, px: flip(s.px), glow: s.glow ? flip(s.glow) : undefined };
}
