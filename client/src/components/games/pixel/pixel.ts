/**
 * Пиксель-арт без картинок: спрайты описаны строками, где каждый символ —
 * цвет из палитры ('.' — прозрачный). Всё оригинальное, нарисовано для клуба.
 */

export const PALETTE: Record<string, string> = {
  k: "#1a1c2c", // контур
  d: "#333c57", // тёмно-серый
  M: "#566c86", // тёмный металл
  m: "#94b0c2", // металл
  w: "#f4f4f4", // белый
  p: "#5d275d", // пурпур
  r: "#b13e53", // красный
  o: "#ef7d57", // оранжевый
  y: "#ffcd75", // жёлтый
  l: "#a7f070", // светло-зелёный
  g: "#38b764", // зелёный
  G: "#257179", // тёмно-зелёный
  n: "#29366f", // тёмно-синий
  B: "#3b5dc9", // синий
  c: "#41a6f6", // голубой
  C: "#73eff7", // бирюзовый
  u: "#7a4e2d", // коричневый
  U: "#a8743f", // светло-коричневый
  s: "#e4a672", // кожа
  a: "#ecfe46", // акцент клуба
};

export type Sprite = {
  w: number;
  h: number;
  /** Цвет каждого пикселя (null — прозрачный), построчно */
  px: (string | null)[];
  /** Ореол вокруг светящихся деталей (рисуется полупрозрачным под спрайтом) */
  glow?: (string | null)[];
};

export function sprite(rows: string[], palette = PALETTE): Sprite {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const px: (string | null)[] = [];
  for (const row of rows) {
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? ".";
      px.push(ch === "." || ch === " " ? null : (palette[ch] ?? null));
    }
  }
  return { w, h, px };
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  options: { scale?: number; flip?: boolean; tint?: string; alpha?: number; glowAlpha?: number } = {},
) {
  const scale = options.scale ?? 1;
  const ox = Math.round(x);
  const oy = Math.round(y);
  const baseAlpha = ctx.globalAlpha;
  const alpha = options.alpha ?? 1;
  const layer = (arr: (string | null)[], a: number, tint?: string) => {
    ctx.globalAlpha = baseAlpha * a;
    for (let j = 0; j < s.h; j++) {
      for (let i = 0; i < s.w; i++) {
        const color = arr[j * s.w + i];
        if (!color) continue;
        const dx = options.flip ? s.w - 1 - i : i;
        ctx.fillStyle = tint ?? color;
        ctx.fillRect(ox + dx * scale, oy + j * scale, scale, scale);
      }
    }
  };
  if (s.glow && !options.tint) layer(s.glow, alpha * (options.glowAlpha ?? 0.22));
  layer(s.px, alpha, options.tint);
  ctx.globalAlpha = baseAlpha;
}

// ---------------------------------------------------------------------------
// Случайности с зерном (одинаковая картинка при каждом открытии)
// ---------------------------------------------------------------------------

export function hashString(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Симметричное существо (классический генератор пиксельных монстров):
 * левая половина случайна, правая — зеркальная, затем контур и глаза.
 */
export function mirroredCreature(
  seedKey: string,
  options: {
    w: number;
    h: number;
    body: string;
    shade: string;
    eye: string;
    density?: number;
    eyeRow?: number;
  },
): Sprite {
  const rng = seeded(hashString(seedKey));
  const { w, h } = options;
  const half = Math.ceil(w / 2);
  const grid: (string | null)[] = new Array(w * h).fill(null);
  const density = options.density ?? 0.55;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < half; x++) {
      // ближе к центру и к середине по высоте — плотнее
      const centerBias = x / half;
      const verticalBias = 1 - Math.abs(y / (h - 1) - 0.5) * 0.9;
      if (rng() < density * (0.45 + centerBias * 0.75) * verticalBias) {
        const color = rng() < 0.25 ? options.shade : options.body;
        grid[y * w + x] = color;
        grid[y * w + (w - 1 - x)] = color;
      }
    }
  }
  // сплошной «позвоночник», чтобы существо не распадалось
  for (let y = 2; y < h - 2; y++) {
    grid[y * w + half - 1] = options.body;
    grid[y * w + (w - half)] = options.body;
  }
  // глаза
  const eyeRow = options.eyeRow ?? Math.floor(h * 0.35);
  const eyeX = Math.max(1, half - 3);
  grid[eyeRow * w + eyeX] = options.eye;
  grid[eyeRow * w + (w - 1 - eyeX)] = options.eye;
  grid[(eyeRow + 1) * w + eyeX] = PALETTE.k!;
  grid[(eyeRow + 1) * w + (w - 1 - eyeX)] = PALETTE.k!;

  // контур
  const out = grid.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x]) continue;
      const near = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(([nx, ny]) => nx! >= 0 && ny! >= 0 && nx! < w && ny! < h && grid[ny! * w + nx!]);
      if (near) out[y * w + x] = PALETTE.k!;
    }
  }
  return { w, h, px: out };
}

/** Наложить пиксели поверх спрайта (корона, оружие и т. п.) */
export function overlay(base: Sprite, rows: string[], dx = 0, dy = 0): Sprite {
  const top = sprite(rows);
  const px = base.px.slice();
  for (let j = 0; j < top.h; j++) {
    for (let i = 0; i < top.w; i++) {
      const color = top.px[j * top.w + i];
      const x = i + dx;
      const y = j + dy;
      if (color && x >= 0 && y >= 0 && x < base.w && y < base.h) px[y * base.w + x] = color;
    }
  }
  return { ...base, px };
}

/** Лужа варп-слизи (как на столах клуба): неровная, светится лаймом */
export function drawPuddle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, t: number) {
  x = Math.round(x);
  ctx.globalAlpha = 0.12 + Math.sin(t * 2 + x) * 0.04;
  ctx.fillStyle = "#ecfe46";
  ctx.fillRect(x + 2, y - 2, w - 4, 1);
  ctx.fillRect(x, y - 1, w, 1);
  ctx.fillRect(x + 1, y + 4, w - 2, 1);
  ctx.globalAlpha = 1;
  const rows: Array<[number, number, string]> = [
    [3, w - 6, "#7d8c12"],
    [1, w - 2, "#b9cc28"],
    [0, w, "#b9cc28"],
    [2, w - 5, "#7d8c12"],
  ];
  rows.forEach(([off, len, color], i) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + off, y + i, Math.max(1, len), 1);
  });
  ctx.fillStyle = "#ecfe46";
  ctx.fillRect(x + 4, y + 1, Math.max(1, Math.floor(w / 3)), 1);
  if (Math.sin(t * 3 + x) > 0.7) ctx.fillRect(x + Math.floor(w * 0.7), y + 2, 1, 1);
  ctx.fillStyle = "#fbffc4";
  ctx.fillRect(x + 5, y + 1, 2, 1);
}
