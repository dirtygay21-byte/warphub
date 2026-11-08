/**
 * Три оригинальные фракции WarpHub (рисуются кодом, 32×32, лицом вправо):
 *  • Орден Стальной Клятвы — латные воины, кость и багрянец, лаймовая энергия WarpHub;
 *  • Ржавая Орда — оливковые громилы в ржавом ломе, красные глаза;
 *  • Рой — хитиновые твари: чёрно-бирюзовый панцирь, костяные пластины, пурпурное свечение.
 */
import { Painter } from "./paint";
import type { Sprite } from "./pixel";

export type Pose = "idle" | "idle2" | "attack" | "hurt";

const lift = (pose: Pose) => (pose === "idle2" ? 1 : 0);
const lean = (pose: Pose) => (pose === "attack" ? 2 : pose === "hurt" ? -1 : 0);

// ---------------------------------------------------------------------------
// Орден Стальной Клятвы
// ---------------------------------------------------------------------------

type OrderLook = {
  helm: "crest" | "visor" | "lens" | "hood" | "great";
  weapon: "sword" | "rifle" | "hammer" | "cannon" | "staff" | "shield";
  cape?: boolean;
  trim?: "brass" | "bone";
  light?: boolean;
};

/** Знак клуба на доспехе: лаймовая «W» */
function sigil(p: Painter, x: number, y: number) {
  p.px(x, y, "lime").px(x + 1, y + 1, "lime").px(x + 2, y, "lime").px(x + 3, y + 1, "lime").px(x + 4, y, "lime");
}

function orderFighter(look: OrderLook, pose: Pose): Sprite {
  const p = new Painter(36, 32);
  const dy = -lift(pose);
  const dx = lean(pose);
  const armor = look.light ? "gunmetal" : "steel";
  const trim = look.trim ?? "bone";

  // плащ за спиной
  if (look.cape) {
    p.poly([[9 + dx, 11 + dy], [14 + dx, 11 + dy], [12, 28], [5, 29], [6, 20]], "crimson", 1);
    p.line(5, 29, 12, 28, "crimson", 0);
    p.line(7, 22, 6, 28, "crimson", 0);
  }

  if (look.weapon === "staff") {
    // ряса провидицы
    p.poly([[11 + dx, 17 + dy], [21 + dx, 17 + dy], [23, 30], [9, 30]], "crimson", 1);
    p.line(16, 20, 17, 30, "crimson", 0);
    p.rect(9, 29, 15, 1, "bone", 1);
    p.rect(12 + dx, 19 + dy, 9, 2, "leather", 1);
    p.px(16 + dx, 19 + dy, "brass", 2);
  } else {
    // ноги: задняя темнее
    p.rect(12, 21, 4, 4, "gunmetal", 1);
    p.rect(12, 25, 4, 4, armor, 0);
    p.rect(11, 29, 6, 2, "gunmetal", 1);
    const fx = pose === "attack" ? 1 : 0;
    p.rect(17 + fx, 21, 4, 3, armor, 1);
    p.rect(17 + fx, 24, 4, 2, armor, 2);
    p.rect(17 + fx, 26, 4, 3, armor, 1);
    p.rect(17 + fx, 29, 6, 2, "gunmetal", 1);
    // табард: слоновая кость с багряной полосой
    p.rect(14 + dx, 19 + dy, 6, 8, "bone", 1);
    p.rect(16 + dx, 19 + dy, 2, 8, "crimson", 1);
    p.rect(14 + dx, 26 + dy, 6, 1, trim, 0);
    // пояс
    p.rect(11 + dx, 19 + dy, 11, 2, "leather", 1);
    p.rect(16 + dx, 19 + dy, 2, 2, "brass", 2);
  }

  // задний наплечник
  p.ellipse(10.5 + dx, 12 + dy, 3.5, 3, "gunmetal", 1);
  p.line(7 + dx, 14 + dy, 13 + dx, 14 + dy, trim, 1);
  // торс
  p.poly([[11 + dx, 10 + dy], [21 + dx, 10 + dy], [22 + dx, 14 + dy], [21 + dx, 19 + dy], [12 + dx, 19 + dy], [10 + dx, 14 + dy]], armor, 1);
  p.line(12 + dx, 17 + dy, 20 + dx, 17 + dy, armor, 0);
  sigil(p, 14 + dx, 13 + dy);

  // передний наплечник
  p.ellipse(20.5 + dx, 12 + dy, 4.5, 3.5, armor, 1);
  p.line(16 + dx, 15 + dy, 25 + dx, 15 + dy, trim, 2);
  p.line(17 + dx, 14 + dy, 24 + dx, 14 + dy, armor, 0);
  p.px(22 + dx, 11 + dy, "lime");

  // голова
  const hx = 14 + dx;
  const hy = 3 + dy;
  if (look.helm === "hood" || look.weapon === "staff") {
    p.poly([[hx, hy + 1], [hx + 5, hy - 1], [hx + 8, hy + 3], [hx + 7, hy + 8], [hx - 1, hy + 8]], "crimson", 1);
    p.rect(hx + 4, hy + 3, 3, 4, "ink", 0);
    p.px(hx + 5, hy + 4, look.weapon === "staff" ? "fire" : "lime").px(hx + 6, hy + 4, look.weapon === "staff" ? "fire" : "lime");
  } else {
    p.rect(hx + 1, hy + 7, 6, 2, "ink", 1); // горжет
    p.ellipse(hx + 3.5, hy + 3.5, 3.5, 3.5, armor, 1);
    p.rect(hx + 5, hy + 2, 3, 5, armor, 2); // лицевая пластина
    p.line(hx + 1, hy + 1, hx + 1, hy + 6, armor, 0);
    if (look.helm === "lens") {
      p.ellipse(hx + 6, hy + 3.5, 1, 1, "lime");
    } else {
      p.rect(hx + 4, hy + 3, 4, 1, "lime");
    }
    p.px(hx + 7, hy + 5, "gunmetal", 0).px(hx + 6, hy + 6, "gunmetal", 0); // решётка
    if (look.helm === "crest") {
      p.line(hx, hy, hx + 5, hy - 1, "crimson", 2, 2);
      p.line(hx - 1, hy + 1, hx - 3, hy + 4, "crimson", 1, 2);
    }
    if (look.helm === "great") {
      p.rect(hx + 1, hy - 1, 5, 1, trim, 2);
      p.px(hx + 3, hy - 2, trim, 2);
    }
  }

  // рука
  const ax = 20 + dx;
  const ay = 15 + dy;
  p.rect(ax, ay, 3, 3, "gunmetal", 1);
  p.rect(ax, ay + 3, 4, 3, armor, 1);
  const hand = { x: ax + 2, y: ay + 5 };

  switch (look.weapon) {
    case "sword": {
      p.rect(hand.x - 1, hand.y - 1, 1, 3, "brass", 2);
      if (pose === "attack") {
        p.line(hand.x, hand.y - 1, hand.x + 1, hand.y + 3, "brass", 2);
        p.line(hand.x + 1, hand.y, hand.x + 11, hand.y + 5, "lime", 2, 2);
        p.line(hand.x + 2, hand.y, hand.x + 11, hand.y + 4, "lime", 3);
      } else {
        p.line(hand.x - 2, hand.y - 2, hand.x + 2, hand.y - 2, "brass", 2);
        p.line(hand.x, hand.y - 3, hand.x + 6, hand.y - 15, "lime", 2, 2);
        p.line(hand.x + 1, hand.y - 3, hand.x + 6, hand.y - 14, "lime", 3);
      }
      break;
    }
    case "shield": {
      // клинок за щитом
      const up = pose === "attack";
      p.line(hand.x + 1, hand.y - 2, up ? hand.x + 12 : hand.x + 6, up ? hand.y + 2 : hand.y - 14, "lime", 2, 2);
      // ростовой щит
      const sx = 19 + dx + (up ? 1 : 0);
      p.rect(sx, 10 + dy, 7, 16, "steel", 1);
      p.poly([[sx, 26 + dy], [sx + 7, 26 + dy], [sx + 3.5, 29 + dy]], "steel", 1);
      p.rect(sx, 10 + dy, 7, 1, trim, 2);
      p.line(sx + 3, 12 + dy, sx + 3, 26 + dy, "gunmetal", 0);
      sigil(p, sx + 1, 15 + dy);
      p.rect(sx + 1, 20 + dy, 5, 1, "crimson", 1);
      break;
    }
    case "rifle": {
      const r = pose === "attack" ? -1 : 0;
      p.rect(hand.x - 6 + r, hand.y - 3, 4, 2, "leather", 1); // приклад
      p.rect(hand.x - 3 + r, hand.y - 4, 10, 3, "gunmetal", 1);
      p.rect(hand.x + 7 + r, hand.y - 3, 4, 1, armor, 2);
      p.rect(hand.x + r, hand.y - 1, 2, 3, "gunmetal", 0);
      p.px(hand.x + 2 + r, hand.y - 3, "lime").px(hand.x + 3 + r, hand.y - 3, "lime");
      if (pose === "attack") {
        p.px(hand.x + 11, hand.y - 3, "lime").px(hand.x + 12, hand.y - 4, "lime").px(hand.x + 12, hand.y - 2, "lime").px(hand.x + 13, hand.y - 3, "lime");
      }
      break;
    }
    case "hammer": {
      if (pose === "attack") {
        p.line(hand.x, hand.y, hand.x + 8, hand.y + 3, "leather", 1, 2);
        p.rect(hand.x + 8, hand.y - 1, 5, 8, "steel", 1);
        p.line(hand.x + 9, hand.y, hand.x + 11, hand.y + 6, "lime");
      } else {
        p.line(hand.x, hand.y + 1, hand.x + 3, hand.y - 12, "leather", 1, 2);
        p.rect(hand.x - 1, hand.y - 17, 8, 5, "steel", 1);
        p.rect(hand.x - 1, hand.y - 17, 8, 1, trim, 2);
        p.line(hand.x, hand.y - 14, hand.x + 6, hand.y - 15, "lime");
      }
      break;
    }
    case "cannon": {
      p.rect(hand.x - 3, hand.y - 4, 9, 4, "gunmetal", 1);
      p.rect(hand.x + 6, hand.y - 3, 4, 2, armor, 2);
      for (let i = 0; i < 3; i++) p.px(hand.x - 2 + i * 2, hand.y - 4, "lime");
      p.rect(hand.x - 4, hand.y - 6, 3, 2, "brass", 1);
      if (pose === "attack") p.line(hand.x + 10, hand.y - 2, hand.x + 15, hand.y - 2, "lime", 3, 2);
      break;
    }
    case "staff": {
      const tip = pose === "attack" ? { x: hand.x + 6, y: hand.y - 8 } : { x: hand.x + 2, y: hand.y - 13 };
      p.line(hand.x, hand.y + 5, tip.x, tip.y, "leather", 1);
      p.ellipse(tip.x, tip.y - 1, 1.5, 1.5, "brass", 1);
      p.ellipse(tip.x, tip.y - 3, 1.5, 2, "fire", 2);
      p.px(tip.x, tip.y - 6, "fire", 3).px(tip.x + 1, tip.y - 5, "fire", 1);
      if (pose === "attack") {
        p.ellipse(tip.x + 5, tip.y - 1, 2, 1.5, "fire", 2);
        p.px(tip.x + 8, tip.y - 1, "fire", 3);
      }
      break;
    }
  }
  return p.finish();
}

// ---------------------------------------------------------------------------
// Ржавая Орда
// ---------------------------------------------------------------------------

type HordeLook = {
  weapon: "cleaver" | "saw" | "gun";
  boss?: boolean;
  small?: boolean;
};

function hordeFighter(look: HordeLook, pose: Pose): Sprite {
  const p = new Painter(36, 32);
  const dy = -lift(pose);
  const dx = lean(pose);
  const s = look.small ? 2 : 0; // налётчик пониже

  // трофейный штандарт вожака
  if (look.boss) {
    p.line(5, 1 + dy, 5, 20, "leather", 1);
    p.poly([[6, 2 + dy], [12, 3 + dy], [10, 6 + dy], [12, 9 + dy], [6, 9 + dy]], "rust", 1);
    p.line(7, 4 + dy, 10, 7 + dy, "bone", 2);
    p.line(10, 4 + dy, 7, 7 + dy, "bone", 2);
  }
  // ноги: короткие и широкие
  p.rect(9, 24, 5, 4, "leather", 0);
  p.rect(8, 28, 7, 3, "gunmetal", 1);
  p.rect(16, 24, 5, 4, "leather", 1);
  p.rect(16, 28, 7, 3, "gunmetal", 1);
  p.px(22, 28, "steel", 3).px(14, 28, "steel", 2);

  // задняя рука (длинная, до колен)
  p.ellipse(8 + dx, 14 + dy + s, 3, 3, "skin", 0);
  p.line(7 + dx, 16 + dy + s, 6 + dx, 22 + dy, "skin", 0, 4);
  p.ellipse(6 + dx, 24 + dy, 2.5, 2, "skin", 0);
  p.rect(5 + dx, 18 + dy + s, 4, 2, "rust", 0);

  // туловище: сгорбленное, грудь вперёд
  p.ellipse(14 + dx, 18 + dy + s / 2, 7.5, 6.5 - s / 2, "skin", 1);
  p.ellipse(16 + dx, 14 + dy + s, 6, 4, "skin", 2);
  // ржавая пластина на животе, на ремнях
  p.poly([[10 + dx, 17 + dy + s], [18 + dx, 16 + dy + s], [19 + dx, 22 + dy], [11 + dx, 23 + dy]], "rust", 1);
  p.px(11 + dx, 18 + dy + s, "steel", 3).px(17 + dx, 17 + dy + s, "steel", 3).px(12 + dx, 22 + dy, "steel", 3).px(18 + dx, 21 + dy, "steel", 3);
  p.line(12 + dx, 13 + dy + s, 18 + dx, 17 + dy + s, "leather", 1); // ремень через грудь
  p.line(11 + dx, 15 + dy + s, 12 + dx, 17 + dy + s, "skin", 0); // шрам
  p.rect(8 + dx, 23 + dy, 14, 2, "leather", 1);
  p.px(14 + dx, 23 + dy, "brass", 2).px(15 + dx, 23 + dy, "brass", 2);

  // наплечник: за головой, с полосами и шипами
  p.poly([[13 + dx, 9 + dy + s], [20 + dx, 8 + dy + s], [21 + dx, 12 + dy + s], [13 + dx, 13 + dy + s]], "gunmetal", 1);
  p.line(14 + dx, 12 + dy + s, 20 + dx, 11 + dy + s, "rust", 2);
  p.px(14 + dx, 7 + dy + s, "steel", 3).px(17 + dx, 6 + dy + s, "steel", 3).px(19 + dx, 7 + dy + s, "steel", 3);
  p.px(14 + dx, 8 + dy + s, "steel", 1).px(17 + dx, 7 + dy + s, "steel", 1).px(19 + dx, 8 + dy + s, "steel", 1);

  // голова: крупная, выдвинута вперёд, тяжёлая челюсть
  const hx = 23 + dx;
  const hy = 11 + dy + s;
  p.ellipse(hx, hy, 4, 3.5, "skin", 1);
  p.rect(hx - 2, hy - 3, 7, 2, "skin", 2); // надбровье
  p.line(hx - 1, hy - 1, hx + 4, hy - 1, "skin", 0);
  p.px(hx + 2, hy, "ember").px(hx + 3, hy, "ember");
  p.px(hx + 4, hy + 1, "skin", 2); // нос
  // челюсть
  p.rect(hx - 2, hy + 2, 8, 3, "skin", 1);
  p.line(hx - 1, hy + 3, hx + 5, hy + 3, "ink", 0);
  p.px(hx, hy + 3, "bone", 3).px(hx + 2, hy + 3, "bone", 3).px(hx + 4, hy + 3, "bone", 3);
  p.px(hx + 5, hy + 2, "bone", 3).px(hx + 5, hy + 1, "bone", 2).px(hx - 1, hy + 2, "bone", 2); // клыки
  // шлем
  if (look.boss) {
    p.ellipse(hx - 1, hy - 3.5, 4, 2, "rust", 1);
    p.line(hx - 4, hy - 4, hx - 7, hy - 9, "bone", 2);
    p.px(hx - 7, hy - 10, "bone", 3);
    p.line(hx + 2, hy - 5, hx + 3, hy - 9, "bone", 2);
  } else if (!look.small) {
    p.ellipse(hx - 1, hy - 3.5, 3.5, 1.5, "steel", 1);
    p.px(hx - 1, hy - 6, "steel", 3);
  } else {
    p.line(hx - 3, hy - 3, hx + 1, hy - 4, "crimson", 1, 2); // повязка
    p.px(hx - 4, hy - 2, "crimson", 0);
  }

  // передняя рука
  p.ellipse(21 + dx, 15 + dy + s, 3, 3, "skin", 1);
  p.line(22 + dx, 16 + dy + s, 25 + dx, 20 + dy, "skin", 1, 4);
  p.rect(23 + dx, 18 + dy, 4, 2, "rust", 1);
  const fx = 26 + dx;
  const fy = 22 + dy;

  switch (look.weapon) {
    case "cleaver": {
      p.ellipse(fx, fy, 2.5, 2, "skin", 1);
      if (pose === "attack") {
        p.line(fx, fy, fx + 5, fy + 1, "leather", 1);
        p.poly([[fx + 4, fy - 3], [fx + 10, fy - 2], [fx + 10, fy + 6], [fx + 4, fy + 4]], "steel", 1);
        p.line(fx + 10, fy - 2, fx + 10, fy + 6, "steel", 3);
        p.px(fx + 6, fy, "rust", 1).px(fx + 8, fy + 3, "rust", 1);
      } else {
        p.line(fx, fy, fx + 1, fy - 7, "leather", 1);
        p.poly([[fx - 2, fy - 17], [fx + 5, fy - 15], [fx + 5, fy - 7], [fx - 1, fy - 8]], "steel", 1);
        p.line(fx + 5, fy - 15, fx + 5, fy - 7, "steel", 3);
        p.px(fx, fy - 13, "rust", 1).px(fx + 2, fy - 10, "rust", 1).px(fx - 1, fy - 16, "rust", 0);
      }
      break;
    }
    case "saw": {
      const cx = fx + 3 + (pose === "attack" ? 2 : 0);
      const cy = fy - 3;
      p.rect(fx - 2, fy - 5, 4, 5, "gunmetal", 1);
      p.rect(fx - 1, fy - 1, 2, 2, "amber", 2);
      p.ellipse(cx, cy, 4.5, 4.5, "steel", 1);
      p.ellipse(cx, cy, 1.5, 1.5, "rust", 1);
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2 + (pose === "attack" ? 0.26 : 0);
        p.px(cx + Math.cos(ang) * 5.5, cy + Math.sin(ang) * 5.5, "steel", 3);
      }
      if (pose === "attack") p.px(cx + 6, cy - 3, "fire").px(cx + 7, cy - 1, "fire").px(cx + 6, cy + 2, "fire");
      break;
    }
    case "gun": {
      p.ellipse(fx, fy, 2.5, 2, "skin", 1);
      p.rect(fx - 5, fy - 5, 12, 4, "gunmetal", 1);
      p.rect(fx + 7, fy - 5, 3, 1, "steel", 2);
      p.rect(fx + 7, fy - 3, 3, 1, "steel", 2);
      p.ellipse(fx - 2, fy - 1, 2, 2, "rust", 1);
      p.px(fx + 1, fy - 5, "amber", 2).px(fx + 3, fy - 5, "amber", 2);
      if (pose === "attack") {
        p.ellipse(fx + 12, fy - 4, 2, 1.5, "fire", 2);
        p.px(fx + 14, fy - 4, "fire", 3);
      }
      break;
    }
  }
  return p.finish();
}

// ---------------------------------------------------------------------------
// Рой
// ---------------------------------------------------------------------------

type SwarmLook = {
  kind: "reaper" | "guard" | "titan";
};

function swarmFighter(look: SwarmLook, pose: Pose): Sprite {
  const p = new Painter(36, 32);
  const dy = -lift(pose);
  const dx = lean(pose);
  const atk = pose === "attack";

  if (look.kind === "titan") {
    // массивная тварь на четырёх лапах
    p.line(6, 20, 3, 30, "chitin", 0, 3);
    p.line(12, 21, 11, 30, "chitin", 1, 3);
    p.line(20, 21, 22, 30, "chitin", 1, 3);
    p.ellipse(14 + dx, 16 + dy, 11, 8, "chitin", 1);
    for (const [cx, cy, rx] of [[8, 10, 4], [14, 9, 4.5], [20, 10, 4]] as const) p.ellipse(cx + dx, cy + dy, rx, 2.5, "bone", 1);
    for (const x of [7, 11, 15, 19]) p.line(x + dx, 8 + dy, x - 1 + dx, 5 + dy, "bone", 2);
    p.line(8 + dx, 17 + dy, 11 + dx, 20 + dy, "bio", 1).line(14 + dx, 18 + dy, 16 + dx, 21 + dy, "bio", 1).line(19 + dx, 17 + dy, 18 + dx, 20 + dy, "bio", 1);
    p.ellipse(25 + dx, 17 + dy, 4, 3.5, "chitin", 1);
    p.rect(23 + dx, 14 + dy, 6, 2, "bone", 2);
    p.px(27 + dx, 17 + dy, "bio").px(26 + dx, 18 + dy, "bio");
    // клешни
    const cx = 27 + dx + (atk ? 3 : 0);
    const cy = 22 + dy + (atk ? -2 : 0);
    p.ellipse(cx, cy, 3.5, 2.5, "bone", 1);
    p.line(cx + 2, cy - 2, cx + 6, cy - 4, "bone", 2, 2);
    p.line(cx + 2, cy + 1, cx + 6, cy + 2, "bone", 1, 2);
    p.line(4 + dx, 17 + dy, 1 + dx, 22 + dy, "chitin", 1, 2);
    return p.finish();
  }

  // хвост и ноги
  p.line(10, 19 + dy, 4, 23, "chitin", 1, 3);
  p.line(4, 23, 1, 26, "chitin", 1, 2);
  p.px(0, 27, "bone", 3);
  p.line(12, 21, 8, 25, "chitin", 0, 2);
  p.line(8, 25, 11, 30, "chitin", 0, 2);
  p.px(12, 30, "bone", 2);
  p.line(17, 21, 20, 25, "chitin", 1, 2);
  p.line(20, 25, 18, 30, "chitin", 1, 2);
  p.px(19, 30, "bone", 3).px(17, 30, "bone", 2);

  // туловище
  p.ellipse(14 + dx, 17 + dy, 6, 4.5, "chitin", 1);
  // сегменты панциря с шипами
  for (const [cx, cy] of [[10, 15], [13, 13.5], [16, 13]] as const) {
    p.ellipse(cx + dx, cy + dy, 2, 1.5, "bone", 1);
  }
  p.px(9 + dx, 13 + dy, "bone", 3).px(8 + dx, 12 + dy, "bone", 3);
  p.px(12 + dx, 11 + dy, "bone", 3).px(11 + dx, 10 + dy, "bone", 3);
  p.px(15 + dx, 11 + dy, "bone", 3);
  // светящиеся жилы
  p.px(11 + dx, 19 + dy, "bio").px(12 + dx, 20 + dy, "bio").px(15 + dx, 20 + dy, "bio", 1);

  // голова
  const hx = 19 + dx;
  const hy = 9 + dy;
  p.ellipse(hx, hy + 3, 3, 2.5, "chitin", 1);
  p.poly([[hx - 1, hy - 1], [hx + 7, hy], [hx + 9, hy + 3], [hx + 6, hy + 6], [hx - 1, hy + 5]], "chitin", 1);
  p.line(hx + 1, hy + 4, hx + 6, hy + 5, "chitin", 0);
  if (look.kind === "guard") {
    p.poly([[hx - 4, hy - 3], [hx + 4, hy - 2], [hx + 6, hy + 1], [hx - 1, hy + 2]], "bone", 2);
    p.line(hx - 4, hy - 3, hx - 7, hy - 5, "bone", 2);
  } else {
    p.poly([[hx - 1, hy - 1], [hx + 3, hy - 2], [hx + 1, hy + 1]], "bone", 2);
    p.line(hx - 1, hy, hx - 5, hy - 3, "bone", 2);
  }
  p.px(hx + 4, hy + 2, "bio").px(hx + 5, hy + 3, "bio").px(hx + 3, hy + 3, "bio");
  p.px(hx + 8, hy + 4, "bone", 3).px(hx + 7, hy + 5, "bone", 2);

  if (look.kind === "guard") {
    // тяжёлая дробящая клешня + костяной щиток
    p.line(17 + dx, 14 + dy, 21 + dx, 17 + dy, "chitin", 1, 2);
    const cx = 24 + dx + (atk ? 3 : 0);
    const cy = 18 + dy;
    p.ellipse(cx, cy, 3.5, 3, "bone", 1);
    p.line(cx + 2, cy - 2, cx + 6, cy - 3, "bone", 2, 2);
    p.line(cx + 2, cy + 2, cx + 6, cy + 3, "bone", 1, 2);
    p.ellipse(15 + dx, 17 + dy, 3, 2, "bone", 1);
  } else {
    // косы
    const ex = 22 + dx;
    const ey = 6 + dy;
    p.line(16 + dx, 14 + dy, ex - 3, ey + 1, "chitin", 0, 2);
    p.line(ex - 3, ey + 1, atk ? ex + 5 : ex + 3, atk ? ey + 16 : ey + 5, "bone", 0, 2);
    p.line(18 + dx, 14 + dy, ex, ey, "chitin", 1, 2);
    if (atk) {
      p.line(ex, ey, ex + 9, ey + 15, "bone", 2, 2);
      p.px(ex + 9, ey + 16, "bone", 3);
    } else {
      p.line(ex, ey, ex + 9, ey + 6, "bone", 2, 2);
      p.line(ex + 9, ey + 6, ex + 8, ey + 9, "bone", 1);
    }
    p.line(18 + dx, 17 + dy, 22 + dx, 20 + dy, "chitin", 1);
    p.px(23 + dx, 21 + dy, "bone", 3);
  }
  return p.finish();
}

// ---------------------------------------------------------------------------
// Каталог бойцов «Костей войны»
// ---------------------------------------------------------------------------

export type Faction = "order" | "horde" | "swarm";

const FIGHTERS: Record<string, { faction: Faction; draw: (pose: Pose) => Sprite }> = {
  iron_captain: { faction: "order", draw: (pose) => orderFighter({ helm: "crest", weapon: "sword", cape: true, trim: "brass" }, pose) },
  storm_huntress: { faction: "order", draw: (pose) => orderFighter({ helm: "lens", weapon: "rifle", light: true }, pose) },
  scrap_brute: { faction: "order", draw: (pose) => orderFighter({ helm: "great", weapon: "hammer", trim: "brass" }, pose) },
  gear_sage: { faction: "order", draw: (pose) => orderFighter({ helm: "visor", weapon: "cannon", trim: "brass" }, pose) },
  ember_witch: { faction: "order", draw: (pose) => orderFighter({ helm: "hood", weapon: "staff" }, pose) },
  gate_warden: { faction: "order", draw: (pose) => orderFighter({ helm: "visor", weapon: "shield" }, pose) },
  fang_chief: { faction: "horde", draw: (pose) => hordeFighter({ weapon: "cleaver", boss: true }, pose) },
  war_drone: { faction: "horde", draw: (pose) => hordeFighter({ weapon: "saw" }, pose) },
  ash_cultist: { faction: "horde", draw: (pose) => hordeFighter({ weapon: "gun", small: true }, pose) },
  hive_reaper: { faction: "swarm", draw: (pose) => swarmFighter({ kind: "reaper" }, pose) },
  fallen_knight: { faction: "swarm", draw: (pose) => swarmFighter({ kind: "guard" }, pose) },
  plague_hulk: { faction: "swarm", draw: (pose) => swarmFighter({ kind: "titan" }, pose) },
};

export const FACTION_LABELS: Record<Faction, string> = {
  order: "Орден Стальной Клятвы",
  horde: "Ржавая Орда",
  swarm: "Рой",
};

const cache = new Map<string, Sprite>();

export function fighterFrame(id: string, pose: Pose = "idle"): Sprite {
  const key = `${id}:${pose}`;
  let s = cache.get(key);
  if (!s) {
    s = (FIGHTERS[id] ?? FIGHTERS.hive_reaper!).draw(pose);
    cache.set(key, s);
  }
  return s;
}

export const fighterFaction = (id: string): Faction => FIGHTERS[id]?.faction ?? "swarm";
export const FIGHTER_IDS = Object.keys(FIGHTERS);

// ---------------------------------------------------------------------------
// «Зелёный рывок»: бегущий громила Ржавой Орды (вид сбоку)
// ---------------------------------------------------------------------------

export type RunnerFrame = 0 | 1 | 2 | 3 | "jump" | "dead";

function runnerBrute(frame: RunnerFrame): Sprite {
  const p = new Painter(28, 26);
  if (frame === "dead") {
    // рухнул навзничь
    p.ellipse(13, 21, 7, 3.5, "skin", 1);
    p.poly([[9, 19], [17, 19], [17, 23], [9, 23]], "rust", 1);
    p.ellipse(22, 21, 3.5, 3, "skin", 1);
    p.px(23, 20, "ink", 0).px(24, 20, "ink", 0);
    p.line(4, 21, 1, 18, "skin", 0, 3);
    p.line(6, 23, 2, 24, "leather", 0, 3);
    p.poly([[18, 13], [23, 14], [22, 18], [18, 17]], "steel", 1);
    return p.finish();
  }
  const air = frame === "jump";
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  // ноги
  const legs: Record<string, Array<[number, number, number, number, number, number]>> = {
    "0": [[9, 16, 5, 19, 3, 23], [13, 16, 16, 19, 17, 23]],
    "1": [[10, 16, 9, 20, 8, 23], [13, 16, 14, 19, 13, 21]],
    "2": [[13, 16, 16, 19, 17, 23], [9, 16, 5, 19, 3, 23]],
    "3": [[13, 16, 14, 20, 13, 23], [10, 16, 9, 19, 8, 21]],
    jump: [[9, 16, 7, 19, 10, 21], [13, 16, 16, 18, 17, 21]],
  };
  const pair = legs[String(frame)]!;
  pair.forEach(([x0, y0, x1, y1, x2, y2], i) => {
    const lvl = i === 0 ? 0 : 1;
    p.line(x0, y0 + bob, x1, y1, "leather", lvl, 3);
    p.line(x1, y1, x2, y2, "leather", lvl, 3);
    p.rect(x2 - 1, y2 - 1, 4, 2, "gunmetal", lvl);
  });
  // задняя рука — размах
  const swing = frame === 0 ? 4 : frame === 2 ? -3 : 0;
  p.line(9, 10 + bob, 6 - swing / 2, 15 + bob, "skin", 0, 3);
  p.ellipse(6 - swing / 2, 16 + bob, 2, 1.5, "skin", 0);
  // туловище, наклон вперёд
  p.ellipse(11, 12 + bob, 6, 5, "skin", 1);
  p.poly([[7, 12 + bob], [14, 11 + bob], [15, 16 + bob], [8, 17 + bob]], "rust", 1);
  p.px(8, 13 + bob, "steel", 3).px(13, 12 + bob, "steel", 3);
  p.rect(6, 16 + bob, 10, 2, "leather", 1);
  // наплечник
  p.poly([[5, 8 + bob], [10, 7 + bob], [11, 10 + bob], [5, 11 + bob]], "gunmetal", 1);
  p.px(6, 6 + bob, "steel", 3).px(8, 5 + bob, "steel", 3);
  // голова
  const hy = 7 + bob + (air ? -1 : 0);
  p.ellipse(17, hy, 3.5, 3, "skin", 1);
  p.rect(15, hy - 3, 6, 2, "skin", 2);
  p.px(19, hy - 1, "ember").px(20, hy - 1, "ember");
  p.rect(15, hy + 1, 7, 2, "skin", 1);
  p.line(16, hy + 2, 21, hy + 2, "ink", 0);
  p.px(21, hy + 1, "bone", 3).px(21, hy, "bone", 2).px(16, hy + 1, "bone", 2);
  p.rect(14, hy - 4, 4, 1, "rust", 2); // ржавый обруч
  // рука с тесаком — выставлен вперёд
  p.line(13, 11 + bob, 18, 14 + bob, "skin", 1, 3);
  p.ellipse(19, 14 + bob, 1.5, 1.5, "skin", 1);
  p.line(19, 14 + bob, 22, 12 + bob, "leather", 1);
  p.poly([[21, 8 + bob], [27, 9 + bob], [27, 14 + bob], [22, 13 + bob]], "steel", 1);
  p.line(27, 9 + bob, 27, 14 + bob, "steel", 3);
  p.px(23, 10 + bob, "rust", 1);
  return p.finish();
}

const runnerCache = new Map<string, Sprite>();
export function runnerFrame(frame: RunnerFrame): Sprite {
  const key = String(frame);
  let s = runnerCache.get(key);
  if (!s) {
    s = runnerBrute(frame);
    runnerCache.set(key, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Препятствия на пути (руины, заграждения, огонь)
// ---------------------------------------------------------------------------

function tankTrap() {
  const p = new Painter(15, 13);
  p.line(1, 12, 13, 2, "steel", 1, 2);
  p.line(1, 2, 13, 12, "gunmetal", 1, 2);
  p.line(7, 0, 7, 12, "steel", 2, 2);
  p.px(4, 8, "rust", 1).px(10, 5, "rust", 1).px(7, 3, "rust", 1);
  return p.finish();
}

function sandbags() {
  const p = new Painter(19, 12);
  for (const [x, y] of [[1, 9], [6, 9], [11, 9], [3, 6], [8, 6], [13, 9], [6, 3]] as const) {
    p.ellipse(x + 2.5, y + 1, 3, 1.6, "leather", 1);
  }
  p.line(1, 2, 17, 4, "steel", 2);
  for (const x of [3, 7, 11, 15]) p.px(x, 1 + (x % 2), "steel", 3);
  return p.finish();
}

function skullPile() {
  const p = new Painter(16, 10);
  p.ellipse(8, 8, 7, 2, "bone", 0);
  for (const [x, y] of [[3, 6], [8, 6], [13, 6], [5, 3], [11, 3], [8, 1]] as const) {
    p.ellipse(x, y + 1, 2, 1.5, "bone", 1);
    p.px(x - 1, y + 1, "ink", 0).px(x + 1, y + 1, "ink", 0);
  }
  return p.finish();
}

function fuelBarrel(flame: 0 | 1) {
  const p = new Painter(11, 18);
  p.rect(1, 6, 9, 12, "rust", 1);
  for (let y = 9; y <= 11; y++) for (let x = 1; x <= 9; x++) p.px(x, y, (x + y) % 4 < 2 ? "amber" : "ink", 1);
  p.rect(1, 6, 9, 1, "gunmetal", 2);
  p.rect(1, 15, 9, 1, "gunmetal", 1);
  // пламя
  p.ellipse(5, 3, 2.5, 2.5, "fire", 1);
  p.ellipse(5 + (flame ? 1 : -1), 2, 1.5, 2, "fire", 2);
  p.px(5 + (flame ? 0 : 1), 0, "fire", 3);
  return p.finish();
}

function brokenPillar() {
  const p = new Painter(11, 17);
  p.poly([[1, 16], [10, 16], [9, 4], [7, 2], [5, 4], [3, 1], [2, 4]], "gunmetal", 1);
  p.line(4, 6, 4, 15, "gunmetal", 0);
  p.line(7, 6, 7, 15, "gunmetal", 2);
  p.rect(0, 14, 11, 3, "steel", 0);
  p.px(3, 10, "lime").px(8, 12, "lime");
  return p.finish();
}

function airBat() {
  const p = new Painter(14, 10);
  p.poly([[6, 4], [3, 1], [1, 1], [3, 5], [6, 7], [8, 7], [11, 5], [13, 1], [11, 1], [8, 4]], "chitin", 1);
  p.ellipse(7, 5, 2, 2, "bone", 1);
  p.px(8, 5, "bio").px(6, 5, "bio");
  p.line(5, 7, 3, 9, "chitin", 1);
  p.line(9, 7, 11, 9, "chitin", 1);
  return p.finish();
}

function airMine() {
  const p = new Painter(11, 13);
  p.ellipse(5, 5, 4, 4, "chitin", 1);
  p.ellipse(5, 5, 2, 2, "bio", 1);
  for (const [x, y] of [[5, 0], [1, 3], [9, 3], [1, 8], [9, 8]] as const) p.line(x, y, 5, 5, "bone", 2);
  p.line(3, 9, 1, 12, "chitin", 1);
  p.line(7, 9, 9, 12, "chitin", 1);
  return p.finish();
}

export const OBSTACLE_SPRITES = {
  trap: tankTrap(),
  bags: sandbags(),
  skulls: skullPile(),
  barrel: [fuelBarrel(0), fuelBarrel(1)] as const,
  pillar: brokenPillar(),
  air_bat: airBat(),
  air_mine: airMine(),
};

// ---------------------------------------------------------------------------
// «Рой: инкубатор» — существа
// ---------------------------------------------------------------------------

function larva() {
  const p = new Painter(32, 32);
  const segs = [[8, 24, 3.5], [12, 23, 4], [16, 22, 4.5], [20, 21, 4], [24, 19, 3.5]] as const;
  for (const [x, y, r] of segs) {
    p.ellipse(x, y, r, r - 0.5, "flesh", 1);
    p.ellipse(x, y - 1.5, r - 1, 1.5, "chitin", 1);
  }
  p.px(26, 18, "bio").px(27, 19, "bio");
  p.px(28, 20, "bone", 3).px(28, 17, "bone", 3);
  p.px(13, 25, "bio", 1).px(19, 24, "bio", 1);
  return p;
}

function skitter() {
  const p = new Painter(32, 32);
  for (const [x0, x1] of [[10, 6], [14, 12], [18, 19], [21, 25]] as const) {
    p.line(x0, 21, x1, 26, "chitin", 0, 1);
    p.line(x1, 26, x1 + (x1 < 15 ? -1 : 1), 29, "chitin", 0);
  }
  p.ellipse(15, 20, 7, 4, "chitin", 1);
  p.ellipse(14, 18, 5, 2, "bone", 1);
  p.ellipse(22, 19, 3, 2.5, "chitin", 1);
  p.px(23, 18, "bio").px(24, 19, "bio");
  p.px(25, 21, "bone", 3).px(24, 22, "bone", 2);
  return p;
}

function spiker() {
  const p = skitter();
  for (const x of [9, 12, 15, 18]) p.line(x, 17, x - 2, 11, "bone", 2);
  p.line(8, 20, 3, 17, "chitin", 1, 2);
  p.line(3, 17, 1, 13, "bone", 2);
  p.px(13, 22, "bio").px(17, 22, "bio");
  return p;
}

function hornedGuard() {
  const p = new Painter(32, 32);
  for (const [x0, x1] of [[9, 5], [13, 11], [18, 20], [22, 26]] as const) {
    p.line(x0, 22, x1, 28, "chitin", 0, 2);
  }
  p.ellipse(15, 19, 9, 6, "chitin", 1);
  p.ellipse(14, 16, 8, 3.5, "bone", 1);
  p.line(10, 14, 18, 14, "bone", 3);
  p.ellipse(24, 19, 4, 3.5, "chitin", 1);
  p.poly([[22, 15], [30, 8], [27, 16]], "bone", 2);
  p.px(25, 18, "bio").px(26, 19, "bio");
  for (const [x, y] of [[11, 21], [15, 22], [19, 21]] as const) p.px(x, y, "bio", 1);
  return p;
}

const creatureCache = new Map<string, Sprite>();

export function creatureFrame(id: string, pose: Pose = "idle"): Sprite {
  const key = `${id}:${pose}`;
  const cached = creatureCache.get(key);
  if (cached) return cached;
  let s: Sprite;
  const bob = pose === "idle2";
  const build = (p: Painter) => {
    if (bob) {
      // лёгкое «дыхание»: подъём на пиксель верхней половины не нужен — смещаем глаза
    }
    return p.finish();
  };
  switch (id) {
    case "larva": s = build(larva()); break;
    case "skitter": s = build(skitter()); break;
    case "spiker": s = build(spiker()); break;
    case "horned_guard": s = build(hornedGuard()); break;
    case "void_stalker": s = swarmFighter({ kind: "reaper" }, pose); break;
    case "brood_queen": s = broodQueen(pose); break;
    default: s = emptyShell();
  }
  creatureCache.set(key, s);
  return s;
}

function broodQueen(pose: Pose) {
  const p = new Painter(36, 32);
  const dy = pose === "idle2" ? -1 : 0;
  p.line(8, 20, 5, 30, "chitin", 0, 3);
  p.line(14, 21, 13, 30, "chitin", 1, 3);
  p.line(21, 21, 23, 30, "chitin", 1, 3);
  p.ellipse(14, 16 + dy, 11, 8, "chitin", 1);
  for (const [cx, cy, rx] of [[8, 11, 4], [14, 9, 4.5], [20, 11, 4]] as const) p.ellipse(cx, cy + dy, rx, 2.5, "bone", 1);
  // корона из шипов, тронутая варпом (лайм WarpHub)
  for (const [x, h] of [[18, 6], [21, 8], [24, 7], [27, 5]] as const) p.line(x, 9 + dy, x + 1, 9 - h + dy, "bone", 3);
  p.ellipse(26, 15 + dy, 4.5, 4, "chitin", 1);
  p.px(28, 14 + dy, "lime").px(27, 15 + dy, "lime").px(29, 15 + dy, "lime");
  p.line(8, 17 + dy, 11, 20 + dy, "lime", 1).line(14, 18 + dy, 16, 21 + dy, "lime", 1).line(19, 17 + dy, 18, 20 + dy, "lime", 1);
  p.line(28, 18 + dy, 33, 22 + dy, "bone", 2, 2);
  p.line(4, 15 + dy, 1, 21 + dy, "chitin", 1, 2);
  return p.finish();
}

function emptyShell() {
  const p = new Painter(32, 32);
  p.poly([[7, 30], [25, 30], [26, 22], [23, 19], [20, 22], [17, 18], [13, 22], [10, 18], [6, 22]], "flesh", 1);
  p.ellipse(16, 29, 10, 2, "bio", 0);
  p.px(9, 26, "chitin", 1).px(21, 25, "chitin", 1);
  return p.finish();
}
