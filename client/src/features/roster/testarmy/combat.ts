/**
 * Симулятор боя 40K, этап S1 (08.11.2026): точный расчёт атаки (не выборка случайных бросков) — распределение убитых
 * моделей, шанс уничтожить отряд, средние значения по шагам и разбор «как считали».
 *
 * Правила — 11-я редакция, Core Rules (Wahapedia, 08.11.2026) и способности оружия из глоссария wh-rules.ru 995:
 *  05.01 бросок на попадание: немодифицированная 1 — промах, 6 — критическое попадание; иначе результат с
 *        модификаторами ≥ BS/WS — попадание. BS/WS после модификаторов не лучше 2+ и не хуже 6+ (02.02.06).
 *        Укрытие (13.08) ухудшает BS дальнобойной атаки на 1.
 *  05.02 бросок на ранение: немодифицированная 1 — неудача, 6 — критическое ранение; таблица S против T:
 *        S ≥ 2T — 2+, S > T — 3+, S = T — 4+, S < T — 5+, S ≤ T/2 — 6+.
 *  05.03/05.04 спасбросок: немодифицированная 1 — урон; результат ≥ InSv — спасён; результат с AP ≥ Sv — спасён.
 *        Урон — модели текущей группы распределения; лишний урон модели теряется; модель с потерянными ранами — первой.
 *  06.02 смертельные раны: по одной, после обычного урона; [DEVASTATING WOUNDS] — не больше одной модели на крит.
 *  01.05.02 переброс — до модификаторов, кубик перебрасывается не больше одного раза.
 *  24.12 Feel No Pain X+: каждую теряемую рану можно не потерять на X+.
 * Способности оружия: ANTI, BLAST, CLEAVE, DEVASTATING WOUNDS, HEAVY, IGNORES COVER, INDIRECT FIRE (режим непрямой
 * стрельбы, 10.07), LANCE, LETHAL HITS, MELTA, RAPID FIRE, SUSTAINED HITS, TORRENT, TWIN-LINKED, в том числе с условием
 * («LETHAL HITS: NON-MONSTER/VEHICLE»). Остальное (HAZARDOUS, PRECISION, PSYCHIC, особые правила оружия) не считается и
 * возвращается списком notCounted — ничего не пропускается молча.
 *
 * Не учитывается (этап S2 — ручные модификаторы): правила детачментов, стратагем и способностей юнитов, несколько
 * групп распределения в цели (персонажи, разные профили) — цель считается одной группой одинаковых моделей.
 */

/** Распределение целого значения: p[v] — вероятность значения v. */
export type Dist = number[];

const EPS = 1e-12;

/** «D6+1», «2D3», «D3», «4» → распределение; не кубы и не число — null. D3 — D6 пополам с округлением вверх (01.05). */
export function diceDist(expr: string | number): Dist | null {
  const s = String(expr).trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d+$/.test(s)) return point(Number(s));
  const m = s.match(/^(\d*)D(3|6)(?:\+(\d+))?$/);
  if (!m) return null;
  const n = Number(m[1] || 1);
  const faces = Number(m[2]);
  const add = Number(m[3] ?? 0);
  let d: Dist = [1];
  for (let i = 0; i < n; i++) d = convolve(d, [0, ...Array(faces).fill(1 / faces)]);
  return shift(d, add);
}
const point = (v: number): Dist => Object.assign(Array(v + 1).fill(0), { [v]: 1 });
const shift = (d: Dist, k: number): Dist => [...Array(k).fill(0), ...d];
export function convolve(a: Dist, b: Dist): Dist {
  const out = Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) if (a[i]! > EPS) for (let j = 0; j < b.length; j++) out[i + j] += a[i]! * b[j]!;
  return out;
}
export const mean = (d: Dist) => d.reduce((s, p, v) => s + p * v, 0);
const binom = (n: number, p: number): Dist => {
  let d: Dist = [1];
  for (let i = 0; i < n; i++) d = convolve(d, [1 - p, p]);
  return d;
};

// ---------- цель и ключевые слова ----------

export type Target = {
  /** моделей в цели в шаге Select Targets (для BLAST, CLEAVE) и всего */
  models: number;
  T: number;
  /** Sv, InSv — число перед «+» (3 для 3+); null — нет */
  Sv: number;
  inv: number | null;
  W: number;
  /** Feel No Pain X+ — X; null — нет */
  fnp: number | null;
  /** ключевые слова цели (любой регистр) — для ANTI и способностей с условием */
  keywords: string[];
};

/** Условие способности: «non-monster/vehicle», «monster/vehicle», «infantry», «epic hero». */
export function keywordsMatch(expr: string, targetKeywords: string[]): boolean {
  const have = new Set(targetKeywords.map((k) => k.toLowerCase().trim()));
  const e = expr.toLowerCase().trim();
  const neg = e.startsWith('non-');
  const any = (neg ? e.slice(4) : e).split('/').some((k) => have.has(k.trim()));
  return neg ? !any : any;
}

// ---------- оружие ----------

export type WeaponInput = {
  name: string;
  melee: boolean;
  /** дальность в дюймах (для половины дальности — решает обстановка) */
  A: string;
  /** BS/WS — «3» или «3+»; «N/A» — TORRENT */
  skill: string;
  S: string;
  AP: string;
  D: string;
  /** строка способностей из инфолиста: «rapid fire 1, lethal hits: non-monster/vehicle» */
  keywords: string;
  /** сколько моделей атакуют этим оружием */
  count: number;
  /** цель в пределах половины дальности именно этого оружия (S2, со стола); не задано — Situation.halfRange */
  halfRange?: boolean;
};

export type Situation = {
  /** цель в пределах половины дальности (RAPID FIRE, MELTA) */
  halfRange?: boolean;
  /** условия HEAVY выполнены: не в ближнем бою, не выставлен в этом ходу, никто не двигался больше 3″ */
  heavy?: boolean;
  /** отряд совершил атаку (charge) в этом ходу — LANCE */
  charged?: boolean;
  /** цель получает преимущество укрытия (13.08) — только дальнобойные атаки, если нет IGNORES COVER */
  cover?: boolean;
  /** непрямая стрельба (10.07) оружием INDIRECT FIRE; stationaryVisible — отряд стоял и цель видна дружественному */
  indirect?: boolean;
  indirectStationaryVisible?: boolean;
  /** модификаторы бросков (сумма), ±BS/WS — к характеристике */
  hitMod?: number;
  woundMod?: number;
  skillMod?: number;
  /** критическое попадание на немодифицированные N+ (6 по умолчанию) */
  critHit?: number;
  rerollHit?: 'none' | 'ones' | 'fails';
  rerollWound?: 'none' | 'ones' | 'fails';
  /** доп. к AP (−1 — улучшить на 1), к D, к S */
  apMod?: number;
  dMod?: number;
  sMod?: number;
};

type Parsed = {
  torrent: boolean;
  twin: boolean;
  ignoresCover: boolean;
  heavy: boolean;
  lance: boolean;
  indirect: boolean;
  lethal: boolean;
  dev: boolean;
  sustained: Dist | null;
  anti: number | null;
  melta: Dist | null;
  rapid: Dist | null;
  blast: number;
  cleave: number;
  counted: string[];
  notCounted: string[];
};

const NO_EFFECT = new Set(['assault', 'pistol', 'close-quarters', 'extra attacks', 'one shot']);

/** Разбор строки способностей оружия против цели (условия «: KEYWORD» проверяются по цели). */
export function parseWeaponKeywords(s: string, target: Target): Parsed {
  const r: Parsed = { torrent: false, twin: false, ignoresCover: false, heavy: false, lance: false, indirect: false, lethal: false, dev: false, sustained: null, anti: null, melta: null, rapid: null, blast: 0, cleave: 0, counted: [], notCounted: [] };
  for (const raw of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    const k = raw.toLowerCase();
    const [head, cond] = k.split(/:\s*/, 2) as [string, string | undefined];
    const applies = cond === undefined || keywordsMatch(cond, target.keywords);
    let m: RegExpMatchArray | null;
    let ok = true;
    if (head === 'torrent') r.torrent = true;
    else if (head === 'twin-linked') r.twin = true;
    else if (head === 'ignores cover') r.ignoresCover = true;
    else if (head === 'heavy') r.heavy = true;
    else if (head === 'lance') r.lance = true;
    else if (head === 'indirect fire') r.indirect = true;
    else if (head === 'lethal hits') r.lethal ||= applies;
    else if (head === 'devastating wounds') r.dev ||= applies;
    else if ((m = head.match(/^sustained hits (\S+)$/)) && diceDist(m[1]!)) r.sustained = applies ? diceDist(m[1]!) : r.sustained;
    else if ((m = head.match(/^melta (\S+)$/)) && diceDist(m[1]!)) r.melta = diceDist(m[1]!);
    else if ((m = head.match(/^rapid fire (\S+)$/)) && diceDist(m[1]!)) r.rapid = diceDist(m[1]!);
    else if ((m = head.match(/^blast(?: (\d+))?$/))) r.blast = Number(m[1] ?? 1);
    else if ((m = head.match(/^cleave (\d+)$/))) r.cleave = Number(m[1]);
    else if ((m = head.match(/^anti-(.+?) (\d)\+?$/))) {
      if (keywordsMatch(m[1]!, target.keywords)) r.anti = Math.min(r.anti ?? 7, Number(m[2]));
    } else if (NO_EFFECT.has(head)) ok = true;
    else ok = false;
    (ok ? r.counted : r.notCounted).push(raw);
  }
  return r;
}

// ---------- броски ----------

/** Вероятности исхода одного броска D6 с перебросом: fn(face) → исход. */
function rollProbs<K extends string>(outcome: (face: number) => K, reroll: (face: number, o: K) => boolean): Partial<Record<K, number>> {
  const p: Partial<Record<K, number>> = {};
  const add = (k: K, v: number) => (p[k] = (p[k] ?? 0) + v);
  for (let f = 1; f <= 6; f++) {
    const o = outcome(f);
    if (reroll(f, o)) for (let g = 1; g <= 6; g++) add(outcome(g), 1 / 36);
    else add(o, 1 / 6);
  }
  return p;
}

/** Требуемый результат броска на ранение (05.02). */
export function woundTarget(S: number, T: number): number {
  if (S >= 2 * T) return 2;
  if (S > T) return 3;
  if (S === T) return 4;
  if (S * 2 <= T) return 6;
  return 5;
}

const num = (v: string) => Number(String(v).replace(/[+"″\s]/g, ''));

export type WeaponMath = {
  weapon: string;
  /** среднее число кубиков атаки */
  attacks: number;
  /** итоговый BS/WS (null — TORRENT), требуемый результат ранения, спасбросок: какой и на сколько */
  skill: number | null;
  woundOn: number;
  save: { kind: 'Sv' | 'InSv' | 'none'; on: number | null };
  pHit: number;
  pCritHit: number;
  pWound: number;
  pCritWound: number;
  pUnsaved: number;
  expected: { hits: number; wounds: number; mortalCrits: number; unsaved: number };
  counted: string[];
  notCounted: string[];
  notes: string[];
};

export type CombatResult = {
  /** p[k] — вероятность, что убито ровно k моделей (k = 0…models) */
  slain: Dist;
  wipe: number;
  expectedSlain: number;
  /** среднее число потерянных ран (лишний урон не считается) */
  expectedDamage: number;
  weapons: WeaponMath[];
  error: string | null;
};

/** Состояние цели: [убито моделей][ран осталось у текущей] → вероятность; уничтожение — killed = models. */
type State = Map<number, number>;
const key = (k: number, w: number) => k * 1000 + w;

function applyLoss(s: State, lost: Dist, models: number, W: number): State {
  const out: State = new Map();
  const put = (k: number, w: number, p: number) => p > EPS && out.set(key(k, w), (out.get(key(k, w)) ?? 0) + p);
  for (const [st, p] of s) {
    const k = Math.floor(st / 1000);
    const w = st % 1000;
    if (k >= models) {
      put(k, 0, p);
      continue;
    }
    lost.forEach((q, l) => {
      if (q <= EPS) return;
      if (l >= w) put(k + 1 >= models ? models : k + 1, k + 1 >= models ? 0 : W, p * q);
      else put(k, w - l, p * q);
    });
  }
  return out;
}

const mix = (into: State, s: State, p: number) => {
  for (const [k, v] of s) into.set(k, (into.get(k) ?? 0) + v * p);
};

/**
 * Атака отряда по цели: оружие группами (по очереди, урон накапливается), обстановка общая.
 * Каждая группа: кубики атаки (A + RAPID FIRE / BLAST / CLEAVE) → попадания → ранения → спасброски → урон;
 * смертельные раны [DEVASTATING WOUNDS] этой группы — после её обычного урона.
 */
export function simulate(weapons: WeaponInput[], target: Target, sit: Situation = {}): CombatResult {
  const models = Math.max(1, target.models);
  const W = Math.max(1, target.W);
  let state: State = new Map([[key(0, W), 1]]);
  const out: WeaponMath[] = [];
  for (const w of weapons) {
    const res = weaponGroup(w, target, sit, state, models, W);
    if ('error' in res) return { slain: [1], wipe: 0, expectedSlain: 0, expectedDamage: 0, weapons: out, error: `${w.name}: ${res.error}` };
    state = res.state;
    out.push(res.math);
  }
  const slain: Dist = Array(models + 1).fill(0);
  let dmg = 0;
  for (const [st, p] of state) {
    const k = Math.floor(st / 1000);
    const wl = st % 1000;
    slain[k] += p;
    dmg += p * (k >= models ? models * W : k * W + (W - wl));
  }
  return { slain, wipe: slain[models]!, expectedSlain: mean(slain), expectedDamage: dmg, weapons: out, error: null };
}

function weaponGroup(w: WeaponInput, target: Target, sit: Situation, start: State, models: number, W: number): { state: State; math: WeaponMath } | { error: string } {
  const kw = parseWeaponKeywords(w.keywords, target);
  const half = w.halfRange ?? !!sit.halfRange;
  const notes: string[] = [];
  const A = diceDist(w.A);
  const D0 = diceDist(w.D);
  const S = num(w.S) + (sit.sMod ?? 0);
  const AP = Math.min(0, num(w.AP) + (sit.apMod ?? 0));
  if (!A || !D0 || !Number.isFinite(S) || !Number.isFinite(AP)) return { error: 'нет данных о характеристиках оружия (A, S, AP или D)' };

  // кубики атаки одной модели: A + RAPID FIRE (половина дальности) + BLAST / CLEAVE (каждые 5 моделей цели)
  let perModel = A;
  if (kw.rapid && half) perModel = convolve(perModel, kw.rapid);
  const per5 = Math.floor(target.models / 5);
  if (kw.blast) perModel = shift(perModel, kw.blast * per5);
  if (kw.cleave) perModel = shift(perModel, kw.cleave * per5);
  if (kw.rapid && !half) notes.push('RAPID FIRE: цель не в пределах половины дальности');

  // попадание
  const indirect = !!(sit.indirect && kw.indirect && !w.melee);
  const cover = !w.melee && !kw.ignoresCover && (!!sit.cover || indirect);
  const base = num(w.skill);
  const torrent = kw.torrent || !Number.isFinite(base);
  const skill = torrent ? null : Math.min(6, Math.max(2, base + (sit.skillMod ?? 0) + (cover ? 1 : 0)));
  const hitMod = (sit.hitMod ?? 0) + (kw.heavy && sit.heavy && !w.melee ? 1 : 0);
  const critOn = Math.min(6, Math.max(2, sit.critHit ?? 6));
  const failBelow = indirect ? (sit.indirectStationaryVisible ? 4 : 6) : 2; // 10.07: немодифицированные 1-5 (или 1-3) — промах
  type H = 'miss' | 'hit' | 'crit';
  const hitOutcome = (f: number): H => (f < failBelow ? 'miss' : f >= critOn ? 'crit' : f + hitMod >= skill! ? 'hit' : 'miss');
  const rrHit = indirect ? 'none' : (sit.rerollHit ?? 'none');
  const hp = torrent ? { miss: 0, hit: 1, crit: 0 } : { miss: 0, hit: 0, crit: 0, ...rollProbs<H>(hitOutcome, (f, o) => (rrHit === 'ones' ? f === 1 : rrHit === 'fails' ? o === 'miss' : false)) };
  if (indirect) notes.push(`непрямая стрельба: промах на немодифицированные 1–${failBelow - 1}, цель в укрытии, без переброса попаданий`);
  if (cover) notes.push('укрытие: BS хуже на 1');
  if (kw.heavy && sit.heavy && !w.melee) notes.push('HEAVY: +1 к броску на попадание');

  // ранение
  const woundOn = woundTarget(S, num(String(target.T)));
  const woundMod = (sit.woundMod ?? 0) + (kw.lance && sit.charged ? 1 : 0);
  const critW = kw.anti ?? 6;
  type Wd = 'fail' | 'wound' | 'crit';
  const woundOutcome = (f: number): Wd => (f === 1 ? 'fail' : f >= critW ? 'crit' : f + woundMod >= woundOn ? 'wound' : 'fail');
  const rrW = kw.twin ? 'fails' : (sit.rerollWound ?? 'none');
  const wp = { fail: 0, wound: 0, crit: 0, ...rollProbs<Wd>(woundOutcome, (f, o) => (rrW === 'ones' ? f === 1 : rrW === 'fails' ? o === 'fail' : false)) };
  if (kw.lance && sit.charged) notes.push('LANCE: +1 к броску на ранение');
  if (kw.anti) notes.push(`ANTI: критическое ранение на ${kw.anti}+`);

  // спасбросок (05.04): 1 — урон; ≥ InSv — спасён; с AP ≥ Sv — спасён (игрок выбирает лучший — это одно и то же условие «или»)
  let saved = 0;
  for (let f = 2; f <= 6; f++) if ((target.inv != null && f >= target.inv) || f + AP >= target.Sv) saved += 1 / 6;
  const pu = 1 - saved;
  const svOn = Math.max(2, target.Sv - AP);
  const save: WeaponMath['save'] = target.inv != null && target.inv <= svOn ? { kind: 'InSv', on: target.inv } : svOn <= 6 ? { kind: 'Sv', on: svOn } : target.inv != null ? { kind: 'InSv', on: target.inv } : { kind: 'none', on: null };

  // один брошенный на ранение удар → (обычная непройденная рана u, критическая DEVASTATING m)
  const qDev = kw.dev ? wp.crit : 0;
  const qU = (wp.wound + (kw.dev ? 0 : wp.crit)) * pu;
  const oneHit: number[][] = [[1 - qDev - qU, qDev], [qU, 0]]; // [u][m]
  const conv2 = (a: number[][], b: number[][]) => {
    const r: number[][] = Array.from({ length: a.length + b.length - 1 }, () => Array(a[0]!.length + b[0]!.length - 1).fill(0));
    a.forEach((row, i) => row.forEach((x, j) => x > EPS && b.forEach((rb, k) => rb.forEach((y, l) => (r[i + k]![j + l] += x * y)))));
    return r;
  };
  const pow2 = (a: number[][], n: number) => {
    let r: number[][] = [[1]];
    for (let i = 0; i < n; i++) r = conv2(r, a);
    return r;
  };
  // один кубик атаки
  const add2 = (into: number[][], a: number[][], p: number) => a.forEach((row, i) => row.forEach((x, j) => ((into[i] ??= [])[j] = (into[i]![j] ?? 0) + x * p)));
  const perDie: number[][] = [[hp.miss]];
  add2(perDie, oneHit, hp.hit);
  if (hp.crit > EPS) {
    const main = kw.lethal ? [[1 - pu], [pu]] : oneHit; // LETHAL HITS: автоматическое ранение (не критическое)
    const sus = kw.sustained ?? [1];
    sus.forEach((ps, x) => ps > EPS && add2(perDie, conv2(main, pow2(oneHit, x)), hp.crit * ps));
  }
  const width = Math.max(...perDie.map((r) => r.length));
  perDie.forEach((r, i) => (perDie[i] = Array.from({ length: width }, (_, j) => r?.[j] ?? 0)));

  // потеря ран за один непройденный удар: D (+MELTA, +dMod), каждая рана — FNP
  let D = D0;
  if (kw.melta && half) D = convolve(D, kw.melta);
  if (sit.dMod) D = sit.dMod > 0 ? shift(D, sit.dMod) : clampMin1(D, sit.dMod);
  if (kw.melta && half) notes.push('MELTA: + к D на половине дальности');
  const keep = target.fnp != null ? (target.fnp - 1) / 6 : 1; // вероятность потерять каждую рану
  const lost: Dist = [0];
  D.forEach((pd, d) => pd > EPS && binom(d, keep).forEach((q, l) => (lost[l] = (lost[l] ?? 0) + pd * q)));
  for (let i = 0; i < lost.length; i++) lost[i] ??= 0;

  // состояние: (модели, отложенные смертельные раны); кубик за кубиком, модель за моделью
  type S2 = Map<number, State>; // pending dev → state
  const stepDie = (s: S2): S2 => {
    const out: S2 = new Map();
    for (const [pend, st] of s) {
      let cur = st;
      for (let u = 0; u < perDie.length; u++) {
        if (u > 0) cur = applyLoss(cur, lost, models, W);
        perDie[u]!.forEach((p, m) => {
          if (p <= EPS) return;
          const t = out.get(pend + m) ?? new Map();
          mix(t, cur, p);
          out.set(pend + m, t);
        });
      }
    }
    return out;
  };
  let s: S2 = new Map([[0, start]]);
  for (let i = 0; i < Math.max(0, w.count); i++) {
    // модель бросает n кубиков с вероятностью perModel[n]: состояния после 0, 1, 2… кубиков — по очереди
    const next: S2 = new Map();
    let cur = s;
    let done = 0;
    for (let n = 0; n < perModel.length; n++) {
      if (perModel[n]! <= EPS) continue;
      while (done < n) {
        cur = stepDie(cur);
        done++;
      }
      for (const [pend, st] of cur) {
        const t = next.get(pend) ?? new Map();
        mix(t, st, perModel[n]!);
        next.set(pend, t);
      }
    }
    s = next;
  }
  // смертельные раны DEVASTATING WOUNDS — после обычного урона, каждая «пачка» — не больше одной модели (как удар с потерей ран)
  const final: State = new Map();
  for (const [pend, st] of s) {
    let cur = st;
    for (let i = 0; i < pend; i++) cur = applyLoss(cur, lost, models, W);
    mix(final, cur, 1);
  }

  const dice = mean(perModel) * Math.max(0, w.count);
  const extra = kw.sustained ? mean(kw.sustained) : 0;
  const rolledHits = dice * (hp.hit + hp.crit * ((kw.lethal ? 0 : 1) + extra));
  const autoWounds = kw.lethal ? dice * hp.crit : 0;
  const wounds = rolledHits * (wp.wound + wp.crit) + autoWounds;
  const mortalCrits = kw.dev ? rolledHits * wp.crit : 0;
  return {
    state: final,
    math: {
      weapon: w.name,
      attacks: dice,
      skill,
      woundOn,
      save,
      pHit: hp.hit + hp.crit,
      pCritHit: hp.crit,
      pWound: wp.wound + wp.crit,
      pCritWound: wp.crit,
      pUnsaved: pu,
      expected: { hits: dice * (hp.hit + hp.crit * (1 + extra)), wounds, mortalCrits, unsaved: (wounds - mortalCrits) * pu },
      counted: kw.counted,
      notCounted: kw.notCounted,
      notes,
    },
  };
}

/** D с отрицательным модификатором: не меньше 1 (02.02.06). */
function clampMin1(d: Dist, mod: number): Dist {
  const out: Dist = [0, 0];
  d.forEach((p, v) => {
    if (p <= EPS) return;
    const x = Math.max(1, v + mod);
    out[x] = (out[x] ?? 0) + p;
  });
  for (let i = 0; i < out.length; i++) out[i] ??= 0;
  return out;
}
