/**
 * Иллюстрации карт «Легенды Warp Hub» (44×40, рисуются кодом).
 * Оригинальные фэнтези-персонажи клуба: общий конструктор фигуры
 * (люди, гномы, эльфы, гоблины, скелеты, великаны) и отдельные чудища.
 */
import { Painter, type Mat } from "./paint";
import type { Sprite } from "./pixel";

export const ART_W = 44;
export const ART_H = 40;
const B = 38; // линия земли

type Race = "human" | "dwarf" | "elf" | "goblin" | "skeleton" | "big";
type Helm = "none" | "open" | "great" | "hood" | "crown" | "horned" | "mask" | "circlet";
type Weapon =
  | "none" | "spear" | "crossbow" | "sword" | "greatsword" | "axe" | "pick" | "gun"
  | "hammer" | "staff" | "bow" | "club" | "scythe" | "halberd" | "cleaver";

type Figure = {
  race: Race;
  cx?: number;
  baseY?: number;
  scale?: number;
  skin: Mat;
  armor: Mat;
  cloth?: Mat;
  trim?: Mat;
  helm?: Helm;
  weapon?: Weapon;
  weaponMat?: Mat;
  glow?: Mat;
  shield?: Mat;
  shieldSign?: Mat;
  beard?: Mat;
  cape?: Mat;
  robe?: Mat;
  eyes?: Mat;
  ears?: boolean;
  tusks?: boolean;
};

const BODY: Record<Race, { leg: number; torso: number; head: number; sh: number; legW: number }> = {
  human: { leg: 9, torso: 9, head: 3.5, sh: 6, legW: 3 },
  dwarf: { leg: 5, torso: 8, head: 3.5, sh: 7, legW: 3 },
  elf: { leg: 10, torso: 8, head: 3, sh: 5, legW: 2 },
  goblin: { leg: 5, torso: 6, head: 4, sh: 5, legW: 2 },
  skeleton: { leg: 9, torso: 9, head: 3.5, sh: 6, legW: 2 },
  big: { leg: 8, torso: 12, head: 4, sh: 10, legW: 4 },
};

/** Фигура анфас: оружие в правой (для зрителя) руке, щит в левой */
function figure(p: Painter, f: Figure) {
  const cx = f.cx ?? 22;
  const base = f.baseY ?? B;
  const b = BODY[f.race];
  const waist = base - b.leg;
  const top = waist - b.torso;
  const headY = top - b.head + 0.5;
  const cloth = f.cloth ?? "crimson";
  const trim = f.trim ?? "gold";
  const skel = f.race === "skeleton";

  // плащ
  if (f.cape) p.poly([[cx - b.sh, top + 1], [cx + b.sh, top + 1], [cx + b.sh + 3, base - 1], [cx - b.sh - 3, base - 1]], f.cape, 0);

  // ноги или ряса
  if (f.robe) {
    p.poly([[cx - b.sh + 1, waist - 1], [cx + b.sh - 1, waist - 1], [cx + b.sh + 1, base], [cx - b.sh - 1, base]], f.robe, 1);
    p.line(cx, waist + 1, cx, base - 1, f.robe, 0);
    p.rect(cx - b.sh - 1, base - 1, b.sh * 2 + 3, 1, trim, 2);
  } else {
    const legMat: Mat = skel ? "bone" : f.armor;
    for (const lx of [cx - b.legW - 1, cx + 1]) {
      p.rect(lx, waist, b.legW, b.leg, legMat, skel ? 1 : 1);
      if (skel) p.rect(lx + (b.legW > 1 ? 1 : 0), waist + 2, 1, b.leg - 3, "ink", 0);
      p.rect(lx - (lx < cx ? 1 : 0), base - 2, b.legW + 1, 2, skel ? "bone" : "gunmetal", 1);
    }
  }

  // торс
  if (skel) {
    p.rect(cx - 1, top, 2, b.torso, "bone", 2); // позвоночник
    for (let y = top + 1; y < waist - 2; y += 2) p.line(cx - b.sh + 2, y, cx + b.sh - 2, y, "bone", 1);
    p.rect(cx - b.sh + 2, waist - 2, b.sh * 2 - 3, 2, "bone", 1);
    if (f.robe || f.cape) p.rect(cx - b.sh + 1, waist - 2, b.sh * 2 - 1, 2, cloth, 1);
  } else {
    p.poly([[cx - b.sh, top], [cx + b.sh, top], [cx + b.sh - 1, waist], [cx - b.sh + 1, waist]], f.armor, 1);
    p.rect(cx - 1, top + 2, 2, waist - top - 2, cloth, 1);
    p.rect(cx - b.sh + 1, waist - 1, b.sh * 2 - 1, 1, trim, 2);
  }

  // руки
  const armMat: Mat = skel ? "bone" : f.armor;
  p.rect(cx - b.sh - 2, top + 1, 2, b.torso - 1, armMat, 1);
  p.rect(cx + b.sh, top + 1, 2, b.torso - 1, armMat, 1);
  const handL = { x: cx - b.sh - 1, y: waist };
  const handR = { x: cx + b.sh + 1, y: waist };
  p.px(handL.x, handL.y, f.skin === "bone" ? "bone" : f.skin, 2).px(handL.x - 1, handL.y, f.skin, 1);
  p.px(handR.x, handR.y, f.skin, 2).px(handR.x - 1, handR.y, f.skin, 1);
  if (!skel && f.race !== "goblin") {
    p.ellipse(cx - b.sh - 0.5, top + 1, 2.5, 1.8, f.armor, 2);
    p.ellipse(cx + b.sh + 0.5, top + 1, 2.5, 1.8, f.armor, 2);
  }

  // голова
  p.ellipse(cx, headY, b.head, b.head, f.skin, 1);
  const eyeMat: Mat = f.eyes ?? "ink";
  if (skel) {
    p.px(cx - 1, headY, "ink", 0).px(cx + 1, headY, "ink", 0).px(cx - 1, headY + 2, "ink", 0).px(cx + 1, headY + 2, "ink", 0);
    if (f.eyes) p.px(cx - 1, headY, f.eyes).px(cx + 1, headY, f.eyes);
  } else {
    p.px(cx - 1, headY, eyeMat, 0).px(cx + 1, headY, eyeMat, 0);
  }
  if (f.ears) {
    p.poly([[cx - b.head, headY - 1], [cx - b.head - 4, headY - 3], [cx - b.head, headY + 1]], f.skin, 1);
    p.poly([[cx + b.head, headY - 1], [cx + b.head + 4, headY - 3], [cx + b.head, headY + 1]], f.skin, 1);
    p.px(cx, headY + 1, f.skin, 3);
  }
  if (f.tusks) p.px(cx - 2, headY + 2, "bone", 3).px(cx + 2, headY + 2, "bone", 3);
  if (f.beard) {
    p.poly([[cx - b.head, headY + 1], [cx + b.head, headY + 1], [cx + 2, top + 6], [cx, top + 8], [cx - 2, top + 6]], f.beard, 1);
    p.line(cx, headY + 2, cx, top + 6, f.beard, 0);
  }

  // шлем
  const hr = b.head;
  switch (f.helm ?? "none") {
    case "open":
      p.ellipse(cx, headY - 1, hr + 0.5, hr - 0.5, f.armor, 2);
      p.recolor(cx - hr, headY, hr * 2 + 1, 3, f.armor, f.skin);
      p.rect(cx, headY - 1, 1, 3, f.armor, 2);
      break;
    case "great":
      p.ellipse(cx, headY, hr + 0.5, hr + 0.5, f.armor, 2);
      p.rect(cx - hr + 1, headY, hr * 2 - 1, 1, f.glow ?? "ink", f.glow ? 2 : 0);
      p.rect(cx, headY + 1, 1, 2, "ink", 0);
      break;
    case "hood":
      p.ellipse(cx, headY - 0.5, hr + 1.5, hr + 1, cloth, 1);
      p.ellipse(cx, headY + 0.5, hr - 1, hr - 1, "ink", 0);
      p.px(cx - 1, headY, f.eyes ?? "ink").px(cx + 1, headY, f.eyes ?? "ink");
      break;
    case "crown":
      for (const dx of [-3, -1, 1, 3]) p.line(cx + dx, headY - hr, cx + dx, headY - hr - 2, "gold", 3);
      p.rect(cx - hr, headY - hr, hr * 2 + 1, 2, "gold", 2);
      p.px(cx, headY - hr, "ember");
      break;
    case "circlet":
      p.rect(cx - hr, headY - 2, hr * 2 + 1, 1, "gold", 3);
      break;
    case "horned":
      p.ellipse(cx, headY - 1, hr + 0.5, hr, f.armor, 2);
      p.line(cx - hr, headY - 2, cx - hr - 3, headY - 6, "bone", 2, 2);
      p.line(cx + hr, headY - 2, cx + hr + 3, headY - 6, "bone", 2, 2);
      p.rect(cx - hr + 1, headY, hr * 2 - 1, 1, f.eyes ?? "ink", f.eyes ? 2 : 0);
      break;
    case "mask":
      p.ellipse(cx, headY, hr, hr, "bone", 2);
      p.px(cx - 1, headY, f.eyes ?? "ink").px(cx + 1, headY, f.eyes ?? "ink");
      p.rect(cx - 1, headY + 2, 3, 1, "ink", 0);
      break;
  }

  // щит
  if (f.shield) {
    const sx = handL.x - 3;
    const sy = handL.y - 7;
    p.rect(sx, sy, 6, 8, f.shield, 1);
    p.poly([[sx, sy + 8], [sx + 6, sy + 8], [sx + 3, sy + 11]], f.shield, 1);
    p.rect(sx, sy, 6, 1, trim, 2);
    if (f.shieldSign) {
      // знак фракции: солнечный диск с лучами (оригинальная эмблема)
      p.ellipse(sx + 3, sy + 4.5, 1.2, 1.2, f.shieldSign, 2);
      p.px(sx + 3, sy + 1, f.shieldSign, 2).px(sx + 3, sy + 8, f.shieldSign, 2);
      p.px(sx + 0.5, sy + 4.5, f.shieldSign, 2).px(sx + 5.5, sy + 4.5, f.shieldSign, 2);
    }
  }

  // оружие
  const wm = f.weaponMat ?? "steel";
  const hx = handR.x;
  const hy = handR.y;
  switch (f.weapon ?? "none") {
    case "spear":
      p.line(hx, base, hx, top - 9, "bark", 1);
      p.poly([[hx - 1, top - 9], [hx + 1, top - 9], [hx, top - 13]], wm, 2);
      break;
    case "sword":
      p.line(hx - 1, hy - 1, hx + 1, hy - 1, "gold", 2);
      p.line(hx, hy - 2, hx, hy - 11, f.glow ?? wm, f.glow ? 2 : 2);
      break;
    case "greatsword":
      p.line(hx - 2, hy - 1, hx + 2, hy - 1, "gold", 2);
      p.rect(hx, hy - 15, 2, 14, f.glow ?? wm, 2);
      p.px(hx, hy - 16, f.glow ?? wm, 3);
      break;
    case "axe":
      p.line(hx, hy + 3, hx, hy - 10, "bark", 1);
      p.poly([[hx, hy - 10], [hx + 5, hy - 12], [hx + 5, hy - 5], [hx, hy - 7]], wm, 2);
      break;
    case "pick":
      p.line(hx, hy + 2, hx, hy - 10, "bark", 1);
      p.line(hx - 4, hy - 9, hx + 5, hy - 11, wm, 2);
      break;
    case "hammer":
      p.line(hx, hy + 3, hx, hy - 9, "bark", 1);
      p.rect(hx - 3, hy - 14, 7, 5, wm, 2);
      if (f.glow) p.line(hx - 2, hy - 12, hx + 2, hy - 12, f.glow, 2);
      break;
    case "cleaver":
      p.line(hx, hy + 1, hx, hy - 5, "bark", 1);
      p.poly([[hx - 1, hy - 5], [hx + 5, hy - 6], [hx + 5, hy - 13], [hx - 1, hy - 12]], wm, 2);
      break;
    case "staff":
      p.line(hx, base, hx, top - 8, "bark", 1);
      p.ellipse(hx, top - 10, 1.8, 1.8, f.glow ?? "holy", 2);
      break;
    case "scythe":
    case "halberd":
      p.line(hx, base, hx, top - 10, "bark", 1);
      if (f.weapon === "scythe") p.poly([[hx, top - 10], [hx - 9, top - 8], [hx - 5, top - 10]], wm, 2);
      else p.poly([[hx, top - 12], [hx + 4, top - 10], [hx + 4, top - 5], [hx, top - 6]], wm, 2);
      if (f.glow) p.px(hx, top - 11, f.glow);
      break;
    case "bow":
      p.line(hx + 2, hy - 12, hx + 4, hy - 5, "bark", 2);
      p.line(hx + 4, hy - 5, hx + 2, hy + 2, "bark", 2);
      p.line(hx + 2, hy - 12, hx + 2, hy + 2, "bone", 3);
      break;
    case "crossbow":
      p.rect(cx - 3, waist - 4, 9, 2, "bark", 1);
      p.line(cx + 4, waist - 8, cx + 4, waist + 1, wm, 2);
      break;
    case "gun":
      p.line(cx - b.sh, waist + 1, cx + b.sh + 5, waist - 7, "bark", 1, 2);
      p.line(cx + 2, waist - 4, cx + b.sh + 6, waist - 8, wm, 2);
      break;
    case "club":
      p.line(hx, hy + 2, hx + 1, hy - 6, "bark", 1, 2);
      p.ellipse(hx + 1, hy - 9, 2.5, 3.5, "bark", 1);
      p.px(hx + 2, hy - 11, "bone", 3).px(hx, hy - 8, "bone", 3);
      break;
  }
}

// ---------------------------------------------------------------------------
// Чудища
// ---------------------------------------------------------------------------

function quadruped(
  p: Painter,
  o: { cx: number; base: number; len: number; h: number; body: Mat; belly?: Mat; head: "wolf" | "boar" | "lion" | "eagle"; headMat?: Mat; eyes?: Mat },
) {
  const { cx, base, len, h } = o;
  const by = base - 4 - h / 2;
  for (const [lx, lvl] of [[cx - len / 2 + 2, 0], [cx - len / 2 + 4, 1], [cx + len / 2 - 4, 0], [cx + len / 2 - 2, 1]] as const) {
    p.rect(lx, by + 1, 2, base - by - 1, o.body, lvl);
  }
  p.ellipse(cx, by, len / 2, h / 2, o.body, 1);
  if (o.belly) p.ellipse(cx, by + h / 4, len / 2 - 2, h / 5, o.belly, 2);
  // хвост
  p.line(cx - len / 2, by - 1, cx - len / 2 - 4, by - 4, o.body, 1, 2);
  const hx = cx + len / 2;
  const hy = by - h / 2;
  const hm = o.headMat ?? o.body;
  if (o.head === "wolf") {
    p.ellipse(hx, hy, 3, 2.5, hm, 1);
    p.poly([[hx + 1, hy - 1], [hx + 6, hy + 1], [hx + 1, hy + 2]], hm, 1);
    p.poly([[hx - 2, hy - 2], [hx - 1, hy - 5], [hx, hy - 2]], hm, 2);
    p.px(hx + 1, hy - 1, o.eyes ?? "holy");
  } else if (o.head === "boar") {
    p.ellipse(hx, hy + 1, 3.5, 3, hm, 1);
    p.rect(hx + 2, hy + 1, 3, 2, hm, 2);
    p.line(hx + 3, hy + 3, hx + 5, hy, "bone", 3);
    p.px(hx + 1, hy - 1, o.eyes ?? "ember");
  } else if (o.head === "lion") {
    p.ellipse(hx, hy, 4.5, 4.5, "rust", 1);
    p.ellipse(hx + 1, hy, 2.5, 2.5, hm, 2);
    p.px(hx + 2, hy - 1, o.eyes ?? "ember");
  } else {
    p.ellipse(hx, hy, 3, 3, "bone", 2);
    p.poly([[hx + 2, hy - 1], [hx + 6, hy + 1], [hx + 2, hy + 2]], "gold", 2);
    p.px(hx + 1, hy - 1, "ink", 0);
  }
}

function wings(p: Painter, cx: number, y: number, span: number, mat: Mat, tattered = false) {
  for (const dir of [-1, 1]) {
    const tip = cx + dir * span;
    p.poly([[cx, y], [tip, y - 10], [tip - dir * 2, y - 2], [tip - dir * 5, y + 2], [cx + dir * 3, y + 3]], mat, 1);
    p.line(cx, y, tip, y - 10, mat, 2);
    if (tattered) {
      p.erase(tip - dir * 3, y);
      p.erase(tip - dir * 1, y - 4);
    }
  }
}

function dragon(p: Painter, o: { scale: Mat; belly: Mat; wing: Mat; eyes: Mat; breath?: Mat; bone?: boolean }) {
  wings(p, 18, 16, 16, o.wing, o.bone);
  // тело и хвост
  p.ellipse(18, 27, 9, 6, o.scale, 1);
  p.ellipse(18, 29, 7, 3, o.belly, 2);
  p.line(9, 28, 2, 33, o.scale, 1, 3);
  p.line(2, 33, 1, 37, o.scale, 1, 2);
  for (const [lx, lvl] of [[11, 0], [14, 1], [21, 0], [24, 1]] as const) p.rect(lx, 31, 3, 7, o.scale, lvl);
  // шея и голова
  p.line(24, 24, 30, 14, o.scale, 1, 4);
  p.ellipse(32, 12, 4, 3, o.scale, 1);
  p.poly([[33, 11], [40, 13], [34, 15]], o.scale, 1);
  p.line(30, 9, 27, 4, "bone", 3);
  p.line(32, 9, 32, 4, "bone", 2);
  p.px(33, 11, o.eyes).px(34, 11, o.eyes);
  if (o.bone) {
    for (let x = 12; x <= 24; x += 3) p.line(x, 24, x, 30, "ink", 0);
  }
  if (o.breath) {
    p.ellipse(41, 14, 2.5, 2, o.breath, 2);
    p.px(43, 13, o.breath, 3).px(43, 15, o.breath, 1);
  }
  // спинные шипы
  for (let x = 12; x <= 24; x += 3) p.px(x, 21, "bone", 3);
}

// ---------------------------------------------------------------------------
// Каталог иллюстраций
// ---------------------------------------------------------------------------

const ART: Record<string, (p: Painter) => void> = {
  // Орден Рассвета: белое, багряное, золото
  dawn_spear: (p) => figure(p, { race: "human", skin: "tan", armor: "steel", cloth: "crimson", helm: "open", weapon: "spear", shield: "bone", shieldSign: "crimson" }),
  dawn_crossbow: (p) => figure(p, { race: "human", skin: "tan", armor: "leather", cloth: "crimson", helm: "open", weapon: "crossbow" }),
  dawn_shield: (p) => figure(p, { race: "human", skin: "tan", armor: "steel", cloth: "crimson", helm: "great", weapon: "sword", shield: "gold", shieldSign: "crimson", glow: "holy" }),
  dawn_sister: (p) => figure(p, { race: "human", skin: "tan", armor: "bone", cloth: "crimson", robe: "bone", helm: "circlet", weapon: "staff", glow: "holy" }),
  dawn_paladin: (p) => figure(p, { race: "human", skin: "tan", armor: "steel", cloth: "crimson", helm: "great", weapon: "greatsword", glow: "holy", cape: "crimson" }),
  dawn_gryphon: (p) => {
    wings(p, 18, 22, 16, "bone");
    figure(p, { race: "human", cx: 17, baseY: 31, skin: "tan", armor: "steel", cloth: "crimson", helm: "great", weapon: "spear", glow: "holy" });
    quadruped(p, { cx: 18, base: B, len: 20, h: 9, body: "gold", belly: "bone", head: "eagle" });
  },
  dawn_aurel: (p) => figure(p, { race: "human", skin: "tan", armor: "gold", cloth: "crimson", trim: "bone", helm: "crown", weapon: "greatsword", glow: "holy", cape: "crimson", shield: "bone", shieldSign: "holy" }),

  // Каменные кланы: гномы, бороды, руны
  clan_gate: (p) => figure(p, { race: "dwarf", skin: "tan", armor: "steel", cloth: "azure", helm: "open", weapon: "axe", shield: "stone", shieldSign: "gold", beard: "rust" }),
  clan_miner: (p) => figure(p, { race: "dwarf", skin: "tan", armor: "leather", cloth: "rust", helm: "open", weapon: "pick", beard: "bone" }),
  clan_gunner: (p) => figure(p, { race: "dwarf", skin: "tan", armor: "steel", cloth: "azure", helm: "open", weapon: "gun", beard: "bark" }),
  clan_runesmith: (p) => figure(p, { race: "dwarf", skin: "tan", armor: "steel", cloth: "azure", helm: "open", weapon: "hammer", glow: "fire", beard: "bone" }),
  clan_bombard: (p) => {
    // пушка на лафете
    p.ellipse(31, 34, 4, 4, "bark", 1);
    p.ellipse(31, 34, 1.5, 1.5, "gold", 2);
    p.poly([[22, 30], [42, 24], [43, 28], [24, 34]], "brass", 1);
    p.ellipse(42, 26, 2, 2.5, "gunmetal", 0);
    figure(p, { race: "dwarf", cx: 13, skin: "tan", armor: "steel", cloth: "azure", helm: "open", weapon: "none", beard: "rust" });
    p.px(42, 22, "fire", 3).px(41, 21, "fire", 2);
  },
  clan_brunnar: (p) => figure(p, { race: "dwarf", skin: "tan", armor: "gold", cloth: "azure", trim: "bone", helm: "crown", weapon: "hammer", glow: "fire", beard: "bone", cape: "azure" }),

  // Духи Чащи
  grove_thorn: (p) => {
    figure(p, { race: "goblin", skin: "leaf", armor: "bark", cloth: "leaf", trim: "bark", eyes: "ghost", weapon: "none" });
    for (const [x, y] of [[16, 24], [28, 24], [18, 18], [26, 18], [22, 14]] as const) p.px(x, y, "bone", 3);
  },
  grove_wolf: (p) => quadruped(p, { cx: 20, base: B, len: 22, h: 10, body: "stone", belly: "bone", head: "wolf", eyes: "ghost" }),
  grove_dryad: (p) => {
    figure(p, { race: "elf", skin: "bark", armor: "leaf", cloth: "leaf", trim: "bark", helm: "none", weapon: "bow", eyes: "ghost" });
    for (const [x, y] of [[18, 7], [26, 7], [17, 10], [27, 10], [22, 5]] as const) p.px(x, y, "leaf", 3);
  },
  grove_treant: (p) => {
    p.rect(17, 14, 10, 24, "bark", 1);
    p.line(19, 16, 20, 36, "bark", 0);
    p.line(17, 22, 8, 16, "bark", 1, 3);
    p.line(27, 22, 36, 15, "bark", 1, 3);
    p.line(17, 37, 12, 38, "bark", 1, 2);
    p.line(27, 37, 32, 38, "bark", 1, 2);
    p.ellipse(22, 9, 12, 7, "leaf", 1);
    p.ellipse(9, 14, 4, 3, "leaf", 1);
    p.ellipse(36, 13, 4, 3, "leaf", 1);
    p.px(20, 19, "ghost").px(24, 19, "ghost");
    p.rect(20, 23, 4, 1, "ink", 0);
  },

  // Неупокоенные
  dead_skeleton: (p) => figure(p, { race: "skeleton", skin: "bone", armor: "bone", cloth: "ash", helm: "none", weapon: "sword", weaponMat: "rust", shield: "bark", eyes: "ghost" }),
  dead_archer: (p) => figure(p, { race: "skeleton", skin: "bone", armor: "bone", cloth: "ash", helm: "hood", weapon: "bow", eyes: "ghost" }),
  dead_wraith: (p) => {
    p.poly([[16, 10], [28, 10], [33, 32], [29, 29], [26, 34], [22, 30], [18, 34], [15, 29], [11, 32]], "purple", 1);
    p.ellipse(22, 9, 5, 5, "purple", 1);
    p.ellipse(22, 10, 3, 3, "ink", 0);
    p.px(21, 10, "ghost").px(23, 10, "ghost");
    p.line(31, 36, 31, 4, "bark", 1);
    p.poly([[31, 4], [36, 7], [36, 12], [31, 10]], "steel", 2);
    p.line(28, 18, 31, 20, "bone", 2);
  },
  dead_ghoul: (p) => figure(p, { race: "human", skin: "stone", armor: "gunmetal", cloth: "crimson", helm: "horned", weapon: "greatsword", weaponMat: "steel", eyes: "ember", cape: "crimson" }),
  dead_bonedrake: (p) => dragon(p, { scale: "bone", belly: "bone", wing: "ash", eyes: "ghost", breath: "ghost", bone: true }),
  dead_morven: (p) => figure(p, { race: "skeleton", skin: "bone", armor: "bone", cloth: "purple", robe: "purple", helm: "crown", weapon: "staff", glow: "ghost", eyes: "ghost", cape: "purple" }),

  // Болотная орда
  bog_goblin: (p) => figure(p, { race: "goblin", skin: "swamp", armor: "leather", cloth: "rust", trim: "bark", ears: true, weapon: "spear", weaponMat: "rust", eyes: "ember" }),
  bog_shaman: (p) => {
    figure(p, { race: "goblin", skin: "swamp", armor: "leather", cloth: "purple", robe: "purple", ears: true, weapon: "staff", glow: "lime", eyes: "lime" });
    p.ellipse(32, 8, 3, 2, "bone", 2);
  },
  bog_boar: (p) => {
    quadruped(p, { cx: 19, base: B, len: 22, h: 11, body: "bark", belly: "leather", head: "boar" });
    p.rect(12, 22, 14, 3, "steel", 1);
    figure(p, { race: "goblin", cx: 18, baseY: 25, skin: "swamp", armor: "leather", cloth: "rust", ears: true, weapon: "spear", weaponMat: "rust", eyes: "ember" });
  },
  bog_troll: (p) => figure(p, { race: "big", skin: "stone", armor: "stone", cloth: "leather", trim: "bark", weapon: "club", eyes: "ember", tusks: true }),
  bog_ogre: (p) => {
    figure(p, { race: "big", skin: "tan", armor: "tan", cloth: "leather", trim: "steel", helm: "open", weapon: "cleaver", eyes: "ink", tusks: true });
    p.ellipse(22, 26, 6, 4, "steel", 2);
    p.ellipse(22, 26, 2, 1.5, "gold", 2);
  },

  // Пепельные рыцари
  ash_levy: (p) => figure(p, { race: "human", skin: "tan", armor: "ash", cloth: "rust", trim: "bark", helm: "open", weapon: "axe", weaponMat: "steel", shield: "ash", shieldSign: "fire" }),
  ash_cultist: (p) => figure(p, { race: "human", skin: "tan", armor: "ash", cloth: "rust", robe: "rust", helm: "hood", weapon: "staff", glow: "fire", eyes: "fire" }),
  ash_knight: (p) => figure(p, { race: "human", skin: "ash", armor: "ash", cloth: "rust", trim: "fire", helm: "horned", weapon: "greatsword", weaponMat: "ash", glow: "fire", eyes: "fire", shield: "ash", shieldSign: "fire" }),
  ash_colossus: (p) => {
    figure(p, { race: "big", skin: "ash", armor: "ash", cloth: "ash", trim: "fire", helm: "horned", weapon: "hammer", weaponMat: "ash", glow: "fire", eyes: "fire" });
    p.line(17, 19, 20, 24, "fire", 1).line(26, 20, 24, 26, "fire", 1).line(14, 28, 16, 33, "fire", 1);
  },

  // Древние чудища
  wild_manticore: (p) => {
    wings(p, 18, 20, 14, "crimson", true);
    quadruped(p, { cx: 18, base: B, len: 22, h: 10, body: "tan", belly: "bone", head: "lion", headMat: "tan" });
    p.line(6, 26, 4, 14, "crimson", 1, 2);
    p.line(4, 14, 9, 9, "crimson", 1, 2);
    p.poly([[9, 9], [13, 8], [10, 12]], "bone", 3);
  },
  wild_hydra: (p) => {
    p.ellipse(20, 31, 12, 7, "swamp", 1);
    p.ellipse(20, 33, 9, 3, "bone", 1);
    const heads: Array<[number, number]> = [[7, 12], [13, 7], [21, 4], [29, 8], [35, 14]];
    for (const [x, y] of heads) {
      p.line(20, 28, x, y + 3, "swamp", 1, 3);
      p.ellipse(x, y, 2.5, 2, "swamp", 2);
      p.px(x + 1, y - 1, "ember");
      p.px(x + 3, y + 1, "bone", 3);
    }
  },
  wild_ignarr: (p) => dragon(p, { scale: "crimson", belly: "gold", wing: "crimson", eyes: "holy", breath: "fire" }),
};

const cache = new Map<string, Sprite>();

export function cardArt(cardId: string): Sprite {
  const cached = cache.get(cardId);
  if (cached) return cached;
  const p = new Painter(ART_W, ART_H);
  (ART[cardId] ?? ART.dead_skeleton!)(p);
  const s = p.finish();
  cache.set(cardId, s);
  return s;
}

export const ART_IDS = Object.keys(ART);
