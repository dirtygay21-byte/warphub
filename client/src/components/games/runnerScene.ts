/**
 * «Зелёный рывок»: мир, физика и отрисовка (без React).
 * Виртуальный экран 200×150, рисуется пикселями и растягивается без размытия.
 */
import { drawPuddle, drawSprite, seeded, type Sprite } from "./pixel/pixel";
import { OBSTACLE_SPRITES } from "./pixel/factions";
import { drawGameImage } from "./pixel/assets";

export const W = 168;
export const H = 126;
export const GROUND = 106;
const HERO_X = 20;
const HERO_H = 26;
const PX_PER_M = 8;
const GRAVITY = 900;
const JUMP_V = -265;
/** Скорость в м/с: старт 10, разгон 0.24 м/с², предел 28 (сервер допускает до 32) */
export const speedAt = (t: number) => Math.min(28, 10 + 0.24 * t);

type ImageObstacleKind = "enemy_marine" | "enemy_eldar" | "enemy_warboss" | "enemy_tyranid" | "enemy_commissar" | "enemy_black_marine";
type ObstacleKind = "trap" | "bags" | "skulls" | "barrel" | "pillar" | "air_bat" | "air_mine" | ImageObstacleKind;
type Obstacle = { x: number; kind: ObstacleKind };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };

export type World = {
  t: number;
  meters: number;
  heroY: number;
  vy: number;
  onGround: boolean;
  jumpBuffer: number;
  obstacles: Obstacle[];
  nextGap: number;
  sinceLast: number;
  scroll: number;
  dead: boolean;
  deadFor: number;
  speedScale: number;
  particles: Particle[];
  rng: () => number;
};

const FEET = GROUND - HERO_H + 1;

export const newWorld = (): World => ({
  t: 0,
  meters: 0,
  heroY: FEET,
  vy: 0,
  onGround: true,
  jumpBuffer: 0,
  obstacles: [],
  nextGap: 150,
  sinceLast: 0,
  scroll: 0,
  dead: false,
  deadFor: 0,
  speedScale: 1,
  particles: [],
  rng: seeded(Date.now()),
});

/**
 * Враги-картинки: исходник 28×30 с прозрачными полями сверху. Рисуем уменьшенными (scale) и
 * считаем столкновение по видимой фигуре (bbox исходника), а не по всему квадрату картинки:
 * раньше невидимый верх делал врага выше, чем он выглядит, и его почти нельзя было перепрыгнуть.
 */
const IMAGE_OBSTACLES: Record<ImageObstacleKind, { src: string; scale: number; bbox: [number, number, number, number] }> = {
  enemy_marine: { src: "/games/runner/space-marine.png", scale: 0.8, bbox: [1, 7, 27, 29] },
  enemy_eldar: { src: "/games/runner/eldar.png", scale: 0.75, bbox: [2, 4, 27, 29] },
  enemy_warboss: { src: "/games/runner/warboss.png", scale: 0.9, bbox: [1, 9, 27, 29] },
  enemy_tyranid: { src: "/games/runner/tyranid.png", scale: 1, bbox: [1, 15, 27, 29] },
  enemy_commissar: { src: "/games/runner/commissar.png", scale: 0.8, bbox: [1, 7, 27, 29] },
  enemy_black_marine: { src: "/games/runner/black-marine.png", scale: 0.75, bbox: [1, 4, 27, 29] },
};
const SRC_W = 28;
const SRC_H = 30;
const isImageObstacle = (kind: ObstacleKind): kind is ImageObstacleKind => kind.startsWith("enemy_");

/** w/h — размер отрисовки; hit — прямоугольник столкновения относительно левого верхнего угла */
type ObstacleVisual = { sprite: Sprite | null; image: string | null; w: number; h: number; hit: { l: number; t: number; r: number; b: number } };
export const obstacleVisual = (o: Obstacle, t: number): ObstacleVisual => {
  if (isImageObstacle(o.kind)) {
    const image = IMAGE_OBSTACLES[o.kind];
    const k = image.scale;
    const [l, top, r, b] = image.bbox;
    return {
      sprite: null, image: image.src, w: Math.round(SRC_W * k), h: Math.round(SRC_H * k),
      hit: { l: l * k + 2, t: top * k, r: r * k - 2, b: b * k },
    };
  }
  const sprite = o.kind === "barrel" ? OBSTACLE_SPRITES.barrel[Math.floor(t * 8) % 2]! : OBSTACLE_SPRITES[o.kind];
  return { sprite, image: null, w: sprite.w, h: sprite.h, hit: { l: 2, t: o.kind === "barrel" ? 4 : 0, r: sprite.w - 2, b: sprite.h } };
};

/**
 * Промежуток до следующего препятствия (в пикселях): то плотно, то обычно, то передышка.
 * Нижняя граница — время полного прыжка (≈0,59 с) с запасом, чтобы любая серия проходилась.
 */
export function nextGapPx(speedPx: number, roll: number, roll2: number) {
  const factor = roll < 0.25 ? 0.7 + roll2 * 0.15 : roll < 0.8 ? 0.9 + roll2 * 0.6 : 1.7 + roll2 * 1.0;
  return speedPx * factor + 46;
}

const obstacleY = (o: Obstacle, visual: ObstacleVisual) =>
  o.kind === "air_bat" ? GROUND - 26 : o.kind === "air_mine" ? GROUND - 62 : GROUND - visual.h + 1;

function dust(world: World, x: number, y: number, n: number, color = "#3a342b") {
  for (let i = 0; i < n; i++) {
    world.particles.push({
      x, y,
      vx: (world.rng() - 0.7) * 60,
      vy: -world.rng() * 30,
      life: 0.4 + world.rng() * 0.3, max: 0.7, color, size: 1,
    });
  }
}

export function step(world: World, dt: number) {
  world.t += dt;
  if (world.dead) {
    world.deadFor += dt;
    world.speedScale = Math.max(0, world.speedScale - dt * 2.5);
  }
  const speedM = speedAt(world.t) * world.speedScale;
  const speedPx = speedM * PX_PER_M;
  if (!world.dead) world.meters += speedM * dt;
  world.scroll += speedPx * dt;

  world.jumpBuffer = Math.max(0, world.jumpBuffer - dt);
  if (!world.dead && world.jumpBuffer > 0 && world.onGround) {
    world.vy = JUMP_V;
    world.onGround = false;
    world.jumpBuffer = 0;
    dust(world, HERO_X + 10, GROUND, 6);
  }
  if (!world.onGround) {
    world.vy += GRAVITY * dt;
    world.heroY += world.vy * dt;
    if (world.heroY >= FEET) {
      world.heroY = FEET;
      world.vy = 0;
      world.onGround = true;
      dust(world, HERO_X + 12, GROUND, 8);
    }
  }

  for (const o of world.obstacles) o.x -= speedPx * dt;
  world.obstacles = world.obstacles.filter((o) => o.x > -30);
  world.sinceLast += speedPx * dt;
  if (!world.dead && world.sinceLast >= world.nextGap) {
    const kinds: ObstacleKind[] = world.meters < 150
      ? ["bags", "skulls", "trap"]
      : world.meters < 400
        ? ["trap", "bags", "skulls", "barrel", "pillar", "air_bat", "enemy_marine", "enemy_eldar"]
        : ["trap", "bags", "skulls", "barrel", "pillar", "air_bat", "air_mine", "enemy_marine", "enemy_eldar", "enemy_warboss", "enemy_tyranid", "enemy_commissar", "enemy_black_marine"];
    world.obstacles.push({ x: W + 4, kind: kinds[Math.floor(world.rng() * kinds.length)]! });
    world.sinceLast = 0;
    world.nextGap = nextGapPx(speedPx, world.rng(), world.rng());
  }

  // бег поднимает пыль, в воздухе летят угли
  if (!world.dead && world.onGround && world.rng() < dt * 14) dust(world, HERO_X + 6, GROUND, 1, "#2b2620");
  if (world.rng() < dt * 10) {
    world.particles.push({
      x: world.rng() * W + 20, y: GROUND - world.rng() * 40,
      vx: -20 - world.rng() * 30, vy: -10 - world.rng() * 18,
      life: 2 + world.rng() * 2, max: 4, color: world.rng() < 0.7 ? "#ff8a1f" : "#ecfe46", size: 1,
    });
  }
  for (const p of world.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  world.particles = world.particles.filter((p) => p.life > 0 && p.x > -5);

  if (world.dead) return;
  const hx1 = HERO_X + 7;
  const hx2 = HERO_X + 20;
  const hy2 = world.heroY + HERO_H - 3;
  for (const o of world.obstacles) {
    const visual = obstacleVisual(o, world.t);
    const y = obstacleY(o, visual);
    const top = y + visual.hit.t;
    const bottom = y + visual.hit.b;
    const heroTop = world.heroY + 3;
    if (hx2 > o.x + visual.hit.l && hx1 < o.x + visual.hit.r && hy2 > top && heroTop < bottom) {
      world.dead = true;
      for (let i = 0; i < 18; i++) {
        world.particles.push({
          x: HERO_X + 14, y: world.heroY + 12,
          vx: (world.rng() - 0.3) * 90, vy: -world.rng() * 90,
          life: 0.6 + world.rng() * 0.5, max: 1.1,
          color: i % 3 === 0 ? "#ff3b2a" : i % 3 === 1 ? "#506b31" : "#5a6570", size: 1 + Math.floor(world.rng() * 2),
        });
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Фон: небо с разломом варпа, готические руины в огне, выжженная земля
// ---------------------------------------------------------------------------

const SKY = ["#070706", "#090908", "#0c0b0a", "#0f0e0c", "#13110e", "#171410", "#1c1712", "#221a12", "#2a1d12", "#331f11"];

const RIFT = (() => {
  const r = seeded(77);
  const pts: Array<[number, number]> = [];
  let y = 26;
  for (let x = -20; x <= 420; x += 6 + Math.floor(r() * 6)) {
    y = Math.max(12, Math.min(40, y + (r() - 0.5) * 12));
    pts.push([x, Math.round(y)]);
  }
  return pts;
})();
const RIFT_SPAN = 400;

type Cathedral = { x: number; w: number; h: number; spire: number; windows: number };
const FAR: Cathedral[] = (() => {
  const r = seeded(11);
  const out: Cathedral[] = [];
  let x = 0;
  while (x < 360) {
    const w = 18 + Math.floor(r() * 22);
    out.push({ x, w, h: 26 + Math.floor(r() * 30), spire: 8 + Math.floor(r() * 22), windows: 1 + Math.floor(r() * 3) });
    x += w + 4 + Math.floor(r() * 16);
  }
  return out;
})();
const FAR_SPAN = 360;

type Wall = { x: number; w: number; h: number; arches: number; fire: boolean; broken: number };
const MID: Wall[] = (() => {
  const r = seeded(29);
  const out: Wall[] = [];
  let x = 0;
  while (x < 420) {
    const w = 26 + Math.floor(r() * 30);
    out.push({ x, w, h: 22 + Math.floor(r() * 22), arches: 1 + Math.floor(r() * 2), fire: r() < 0.5, broken: Math.floor(r() * 10) });
    x += w + 18 + Math.floor(r() * 30);
  }
  return out;
})();
const MID_SPAN = 420;

function flame(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, size = 1) {
  const f = Math.sin(t * 13 + x) > 0 ? 1 : 0;
  ctx.fillStyle = "#7a1f05";
  ctx.fillRect(x - 2 * size, y - 2 * size, 5 * size, 2 * size);
  ctx.fillStyle = "#d14a0c";
  ctx.fillRect(x - 1 * size, y - (4 + f) * size, 3 * size, (3 + f) * size);
  ctx.fillStyle = "#ff8a1f";
  ctx.fillRect(x, y - (5 + f) * size, size, 3 * size);
  ctx.fillStyle = "#ffd27a";
  ctx.fillRect(x, y - 2 * size, size, size);
}

export function drawScene(ctx: CanvasRenderingContext2D, world: World) {
  const t = world.t;
  SKY.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * 10, W, 10);
  });
  ctx.fillStyle = "#331f11";
  ctx.fillRect(0, 100, W, GROUND - 100);

  // разлом варпа — лаймовая энергия WarpHub
  const riftOffset = (world.scroll * 0.03) % RIFT_SPAN;
  const flicker = 0.75 + Math.sin(t * 3) * 0.15 + Math.sin(t * 17) * 0.05;
  for (const [width, alpha, color] of [[7, 0.05, "#ecfe46"], [4, 0.1, "#ecfe46"], [2, 0.35, "#b9cc28"], [1, 0.75, "#ecfe46"]] as const) {
    ctx.globalAlpha = alpha * flicker;
    ctx.fillStyle = color;
    for (let i = 0; i + 1 < RIFT.length; i++) {
      const [x0, y0] = RIFT[i]!;
      const [x1, y1] = RIFT[i + 1]!;
      const steps = Math.max(1, x1 - x0);
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x0 + s - riftOffset);
        if (x < -4 || x > W + 4) continue;
        const y = Math.round(y0 + ((y1 - y0) * s) / steps);
        ctx.fillRect(x, y - Math.floor(width / 2), 1, width);
      }
    }
  }
  ctx.globalAlpha = 1;

  // дальние соборы (параллакс 0.12)
  const farOffset = (world.scroll * 0.12) % FAR_SPAN;
  for (const base of [0, FAR_SPAN]) {
    for (const c of FAR) {
      const x = Math.round(c.x - farOffset + base);
      if (x > W || x + c.w < -10) continue;
      const top = GROUND - 6 - c.h;
      ctx.fillStyle = "#100f0d";
      ctx.fillRect(x, top, c.w, c.h + 6);
      // остроконечная крыша и шпиль
      const mid = x + Math.floor(c.w / 2);
      for (let i = 0; i < c.w / 2; i++) ctx.fillRect(x + i, top - Math.floor(i * 0.8), c.w - i * 2, 1);
      ctx.fillRect(mid, top - Math.floor(c.w * 0.4) - c.spire, 1, c.spire + 2);
      ctx.fillRect(mid - 1, top - Math.floor(c.w * 0.4) - Math.floor(c.spire / 2), 3, 1);
      // окна в огне
      for (let wI = 0; wI < c.windows; wI++) {
        const wx = x + 4 + wI * Math.floor((c.w - 8) / Math.max(1, c.windows));
        ctx.fillStyle = Math.sin(t * 5 + wx) > 0.6 ? "#d14a0c" : "#7a1f05";
        ctx.fillRect(wx, top + 6, 2, 4);
        ctx.fillRect(wx, top + 5, 1, 1);
      }
    }
  }

  // дымы
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#3a3935";
  for (let i = 0; i < 5; i++) {
    const sx = ((i * 61 - world.scroll * 0.25) % (W + 60) + W + 60) % (W + 60) - 30;
    for (let k = 0; k < 6; k++) {
      const r = 4 + k * 2;
      const y = 78 - k * 11 - ((t * 6) % 11);
      ctx.fillRect(Math.round(sx + Math.sin(t + k + i) * 3 - r / 2), Math.round(y), r, r - 1);
    }
  }
  ctx.globalAlpha = 1;

  // ближние руины (параллакс 0.4) со стрельчатыми окнами
  const midOffset = (world.scroll * 0.4) % MID_SPAN;
  for (const base of [0, MID_SPAN]) {
    for (const wall of MID) {
      const x = Math.round(wall.x - midOffset + base);
      if (x > W || x + wall.w < -10) continue;
      const top = GROUND - wall.h;
      ctx.fillStyle = "#1b1916";
      ctx.fillRect(x, top, wall.w, wall.h);
      // зубчатый разлом сверху
      ctx.fillStyle = "#1b1916";
      for (let i = 0; i < wall.w; i += 3) ctx.fillRect(x + i, top - ((i + wall.broken) % 7 < 3 ? 3 : 0), 3, 3);
      ctx.fillStyle = "#26231f";
      ctx.fillRect(x, top, wall.w, 1);
      ctx.fillRect(x, top, 1, wall.h);
      // арки
      for (let a = 0; a < wall.arches; a++) {
        const ax = x + 5 + a * Math.floor((wall.w - 6) / wall.arches);
        const aw = 7;
        const ah = Math.min(14, wall.h - 8);
        ctx.fillStyle = wall.fire ? "#2a1508" : "#0e0d0b";
        ctx.fillRect(ax, top + 6, aw, ah);
        ctx.fillRect(ax + 1, top + 5, aw - 2, 1);
        ctx.fillRect(ax + 2, top + 4, aw - 4, 1);
        if (wall.fire) {
          ctx.fillStyle = Math.sin(t * 9 + ax) > 0 ? "#d14a0c" : "#7a1f05";
          ctx.fillRect(ax + 1, top + 6 + ah - 4, aw - 2, 4);
        }
      }
      if (wall.fire) flame(ctx, x + Math.floor(wall.w / 2), top - 1, t);
    }
  }

  // земля: выжженная, в трещинах, с лужами варп-слизи (как на столе клуба)
  ctx.fillStyle = "#16140f";
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = "#2c271f";
  ctx.fillRect(0, GROUND, W, 1);
  ctx.fillStyle = "#1f1b15";
  ctx.fillRect(0, GROUND + 1, W, 2);
  const gOff = Math.floor(world.scroll) % 48;
  for (let x = -gOff; x < W + 48; x += 48) {
    ctx.fillStyle = "#0b0a08";
    ctx.fillRect(x + 4, GROUND + 6, 9, 1);
    ctx.fillRect(x + 12, GROUND + 7, 5, 1);
    ctx.fillRect(x + 28, GROUND + 14, 7, 1);
    ctx.fillRect(x + 34, GROUND + 13, 3, 1);
    ctx.fillStyle = "#2c271f";
    ctx.fillRect(x + 20, GROUND + 4, 2, 1);
    ctx.fillRect(x + 40, GROUND + 18, 2, 1);
  }
  const pOff = Math.floor(world.scroll) % 160;
  for (let x = -pOff; x < W + 160; x += 160) drawPuddle(ctx, x + 60, GROUND + 8, 24, t);

  for (const o of world.obstacles) {
    const visual = obstacleVisual(o, t);
    const y = obstacleY(o, visual);
    if (visual.image) drawGameImage(ctx, visual.image, o.x, y, { width: visual.w, height: visual.h });
    else if (visual.sprite) drawSprite(ctx, visual.sprite, o.x, y, { glowAlpha: 0.3 });
  }

  // герой
  let frame: 0 | 1 | 2 | 3 | "jump" | "dead";
  if (world.dead && world.deadFor > 0.12) frame = "dead";
  else if (!world.onGround) frame = "jump";
  else frame = (Math.floor(world.scroll / 9) % 4) as 0 | 1 | 2 | 3;
  const flash = world.dead && world.deadFor < 0.12;
  // тень
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  ctx.fillRect(HERO_X + 6, GROUND, 16 - Math.round((FEET - world.heroY) / 6), 2);
  ctx.globalAlpha = 1;
  const heroSpriteY = world.dead ? GROUND - 27 : world.heroY + HERO_H - 28 + (frame === 1 || frame === 3 ? -1 : 0);
  drawGameImage(ctx, "/games/ork-runner.png", HERO_X, heroSpriteY, { tint: flash ? "#ffffff" : undefined });

  for (const p of world.particles) {
    ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // виньетка
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, W, 2);
  ctx.fillRect(0, H - 2, W, 2);
}
