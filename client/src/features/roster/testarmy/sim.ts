import { dist, unitToUnit, type Placed, type Pt } from './geometry';
import type { TAUnit } from './state';

/**
 * Test Army — симулятор игровых моментов (этап 2, 27.11.2026): фазы хода и действия отряда в каждой фазе
 * с настоящими дистанциями. Чистые функции без React; правила системы — объект SimRules (40K — ниже, rules40k).
 *
 * Дистанции меряются по полю (по прямой от исходного места модели), высота и путь вокруг террейна не учитываются.
 */

export type SimPhase = { id: string; label: string; en: string };

/** Что игрок может выбрать для отряда в фазе. */
export type SimActionKind = 'stationary' | 'move' | 'charge' | 'shoot' | 'fight' | 'test' | 'wait';
export type SimActionDef = {
  id: string;
  label: string;
  en: string;
  kind: SimActionKind;
  /** причина, почему нельзя (по правилам); нет — можно */
  blocked?: string;
  /** подсказка под кнопкой */
  hint?: string;
  /** move: максимальная дистанция — фиксированная (″), или характеристика M (+ бросок) */
  distance?: { fixed?: number; move?: boolean; dice?: number; plus?: number };
  /** после манёвра юнит не должен быть связан боем */
  endUnengaged?: boolean;
  /** манёвр нападения: цели в пределах 12″, после — связан со всеми целями и ни с кем больше */
  chargeTargets?: boolean;
  /** манёвр должен закончиться в пределах этого расстояния от врага (AoS нападение ½″, KT Charge — 1″) */
  endNear?: number;
  /** не по правилам — можно завершить как неудачу (нападение «не удалось») */
  failable?: boolean;
  /** стоимость в AP / действиях активации (Kill Team, Warcry) */
  ap?: number;
  /** при начале: бросок D3 смертельных ран (AoS Retreat) */
  mortalD3?: boolean;
  /** что отметить у отряда, когда действие выполнено */
  mark?: keyof UnitFlags;
  /** источник правила (раздел основных правил) */
  rule: string;
};

export type UnitFlags = {
  /** манёвр в фазе движения этого хода */
  moved?: 'stationary' | 'normal' | 'advance' | 'fallback';
  charged?: boolean;
  shot?: boolean;
  fought?: boolean;
  pileIn?: boolean;
  consolidated?: boolean;
  /** под боевым шоком (до успешной проверки) */
  shocked?: boolean;
  /** активации (Kill Team, Warcry): потрачено AP / действий, действия этой активации, активация завершена */
  spent?: number;
  did?: string[];
  expended?: boolean;
  /** Kill Team: приказ */
  order?: 'engage' | 'conceal';
  /** Warcry: Wait первым действием — можно активировать ещё раз с 1 действием */
  waiting?: boolean;
};

export type SimContext = {
  phase: string;
  /** отряд армии, чей сейчас ход */
  active: boolean;
  placed: boolean;
  flags: UnitFlags;
  /** связан боем с врагом (радиус связывания) */
  engaged: boolean;
  /** расстояние до ближайшего вражеского отряда (от края базы до края), нет врагов на столе — null */
  nearestEnemy: number | null;
  /** характеристика M (самая медленная модель) */
  move: number | null;
  leadership: number | null;
  /** есть ли у отряда оружие ближнего боя / дальнего (для «Атаковать») — по умолчанию да */
  canShoot?: boolean;
  /** Kill Team: APL оперативника */
  apl?: number | null;
};

export type SimRules = {
  system: string;
  title: string;
  phases: SimPhase[];
  /** радиус связывания, ″ (по горизонтали) */
  engagement: number;
  /** фаза, в которой обе армии действуют (40K — бой) */
  bothArmies?: string[];
  actions: (ctx: SimContext) => SimActionDef[];
  source: string;
  /** активации по одному отряду, игроки по очереди (Kill Team, Warcry): фаза и бюджет AP / действий */
  activation?: { phase: string; budget: (ctx: SimContext) => number; unit: string };
};

// ---------- кубы ----------

export const rollDice = (n: number, rnd: () => number = Math.random): number[] => Array.from({ length: n }, () => 1 + Math.floor(rnd() * 6));
export const diceSum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

/** «6"» → 6, «20+"» → 20, «-» → null */
export function parseInches(s: string | null | undefined): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(s ?? '');
  return m ? Number(m[1]!.replace(',', '.')) : null;
}
/** «6+» → 6 */
export function parseTarget(s: string | null | undefined): number | null {
  const m = /(\d+)\s*\+?/.exec(s ?? '');
  return m ? Number(m[1]) : null;
}

// ---------- манёвр с ограничением ----------

/** Начало манёвра: где стояла каждая модель и сколько ей можно пройти. */
export type ActiveMove = {
  uid: string;
  action: SimActionDef;
  start: Record<string, Pt>;
  max: Record<string, number>;
  roll?: number[];
  /** цели нападения (uid) */
  targets?: string[];
  /** снимок отряда до манёвра — для «Отменить» */
  before: TAUnit;
};

export function startMove(unit: TAUnit, action: SimActionDef, moves: (number | null)[], roll?: number[]): ActiveMove | null {
  const start: Record<string, Pt> = {};
  const max: Record<string, number> = {};
  const extra = roll ? diceSum(roll) : 0;
  const fallback = moves.find((x) => x != null) ?? null;
  unit.models.forEach((m, i) => {
    if (!m.at) return;
    start[m.id] = m.at;
    const d = action.distance ?? {};
    if (d.fixed != null) max[m.id] = d.fixed;
    else if (d.move) {
      const mv = moves[i] ?? fallback;
      if (mv != null) max[m.id] = mv + extra + (d.plus ?? 0);
    } else if (d.dice) max[m.id] = extra;
  });
  if (!Object.keys(start).length) return null;
  return { uid: unit.uid, action, start, max, ...(roll ? { roll } : {}), before: unit };
}

/** Сколько уже прошла модель (по прямой от начала манёвра). */
export const moved = (am: ActiveMove, id: string, at: Pt | null) => (at && am.start[id] ? dist(am.start[id]!, at) : 0);

/**
 * Сдвиг (dx, dy) от позиций `from`, урезанный так, чтобы ни одна из моделей `ids` не ушла дальше своего максимума
 * от начала манёвра. Возвращает долю s ∈ [0, 1] сдвига.
 */
export function clampShift(am: ActiveMove, from: Record<string, Pt>, ids: string[], dx: number, dy: number): number {
  const ok = (s: number) => ids.every((id) => {
    const p = from[id];
    const st = am.start[id];
    const mx = am.max[id];
    if (!p || !st || mx == null) return true;
    return dist(st, [p[0] + dx * s, p[1] + dy * s]) <= mx + 1e-6;
  });
  if (ok(1)) return 1;
  if (!ok(0)) return 0;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Расстояние между отрядами (от края базы до края) или null, если кто-то не на столе. */
export const unitGap = (a: readonly Placed[], b: readonly Placed[]) => (a.length && b.length ? unitToUnit([...a], [...b]).d : null);

/** Проверка конца манёвра: список нарушений (пусто — всё по правилам). */
export function checkMove(
  am: ActiveMove,
  rules: SimRules,
  unitBases: readonly Placed[],
  enemies: readonly { uid: string; name: string; bases: readonly Placed[] }[],
): string[] {
  const out: string[] = [];
  const er = rules.engagement;
  const engagedWith = enemies.filter((e) => {
    const d = unitGap(unitBases, e.bases);
    return d != null && d <= er + 1e-6;
  });
  if (am.action.endUnengaged && engagedWith.length) out.push(`ближе ${er}″ к врагу (${engagedWith.map((e) => e.name).join(', ')}) — нельзя закончить связанным боем`);
  if (am.action.endNear != null) {
    const near = enemies.some((e) => {
      const d = unitGap(unitBases, e.bases);
      return d != null && d <= am.action.endNear! + 1e-6;
    });
    if (!near) out.push(`нужно закончить в пределах ${String(am.action.endNear).replace('0.5', '½')}″ от врага`);
  }
  if (am.action.chargeTargets) {
    const targets = am.targets ?? [];
    const missing = enemies.filter((e) => targets.includes(e.uid) && !engagedWith.includes(e));
    const others = engagedWith.filter((e) => !targets.includes(e.uid));
    if (missing.length) out.push(`не связан боем с целью: ${missing.map((e) => e.name).join(', ')}`);
    if (others.length) out.push(`связан боем не с целью: ${others.map((e) => e.name).join(', ')}`);
  }
  return out;
}

// ---------- Warhammer 40,000, 11-я редакция ----------

const ER_40K = 2;
const CORE = 'Основные правила 40K, 11-я ред. (wh-rules.ru, данные 995)';

const PHASES_40K: SimPhase[] = [
  { id: 'command', label: 'Командование', en: 'Command' },
  { id: 'movement', label: 'Движение', en: 'Movement' },
  { id: 'shooting', label: 'Стрельба', en: 'Shooting' },
  { id: 'charge', label: 'Нападение', en: 'Charge' },
  { id: 'fight', label: 'Бой', en: 'Fight' },
];

function actions40k(c: SimContext): SimActionDef[] {
  const f = c.flags;
  const notPlaced = c.placed ? undefined : 'отряд не на столе';
  const notActive = c.active ? undefined : 'сейчас ход другой армии';
  const first = (...xs: (string | undefined | false)[]) => xs.find((x): x is string => !!x);
  switch (c.phase) {
    case 'command':
      return [
        {
          id: 'battleshock',
          label: 'Проверка боевого шока',
          en: 'Battle-shock roll',
          kind: 'test',
          blocked: first(notActive, c.leadership == null && 'нет характеристики Ld'),
          hint: c.leadership != null ? `2D6 ≥ Ld ${c.leadership}+ — пройдено${f.shocked ? ' · сейчас под боевым шоком' : ''}` : undefined,
          rule: '08.03 Battle-shock; 01.07',
        },
      ];
    case 'movement': {
      const done = f.moved ? 'отряд уже выбран для движения в этой фазе' : undefined;
      const m = c.move != null ? `${c.move}″` : 'M';
      return [
        { id: 'normal', label: 'Обычный манёвр', en: 'Normal move', kind: 'move', distance: { move: true }, endUnengaged: true, mark: 'moved', blocked: first(notPlaced, notActive, done, c.engaged && 'отряд связан боем — только отступление', c.move == null && 'нет характеристики M'), hint: `до ${m}, закончить не ближе ${ER_40K}″ к врагу`, rule: '09.05 Normal Move' },
        { id: 'advance', label: 'Продвижение', en: 'Advance move', kind: 'move', distance: { move: true, dice: 1 }, endUnengaged: true, mark: 'moved', blocked: first(notPlaced, notActive, done, c.engaged && 'отряд связан боем', c.move == null && 'нет характеристики M'), hint: `до ${m} + D6; потом нельзя нападать (и обычно стрелять)`, rule: '09.06 Advance Move' },
        { id: 'fallback', label: 'Отступление', en: 'Fall-back move', kind: 'move', distance: { move: true }, endUnengaged: true, mark: 'moved', blocked: first(notPlaced, notActive, done, !c.engaged && 'только для отряда, связанного боем', c.move == null && 'нет характеристики M'), hint: `до ${m}; потом нельзя стрелять и нападать${f.shocked ? '; под боевым шоком — Desperate Escape (бросок опасности за каждую модель)' : ''}`, rule: '09.07 Fall-back Move' },
        { id: 'stationary', label: 'Остаться на месте', en: 'Remain stationary', kind: 'stationary', mark: 'moved', blocked: first(notPlaced, notActive, done), rule: '09.04 Remain Stationary' },
      ];
    }
    case 'shooting': {
      const why = first(
        notPlaced,
        notActive,
        f.shot && 'отряд уже стрелял в этой фазе',
        f.moved === 'fallback' && 'после отступления стрелять нельзя',
      );
      const note = f.moved === 'advance' ? 'после продвижения — только оружие [ASSAULT]' : c.engaged ? 'связан боем — только [CLOSE-QUARTERS] (MONSTER/VEHICLE — с −1 к попаданию)' : 'выберите цель на столе';
      return [{ id: 'shoot', label: 'Стрелять', en: 'Shoot', kind: 'shoot', mark: 'shot', blocked: why, hint: note, rule: '10.02–10.06 Shooting' }];
    }
    case 'charge': {
      const why = first(
        notPlaced,
        notActive,
        f.charged && 'отряд уже нападал в этой фазе',
        c.engaged && 'отряд связан боем',
        f.moved === 'advance' && 'после продвижения нападать нельзя',
        f.moved === 'fallback' && 'после отступления нападать нельзя',
        (c.nearestEnemy == null || c.nearestEnemy > 12) && 'нет врага в пределах 12″',
      );
      return [
        { id: 'charge', label: 'Нападение', en: 'Charge', kind: 'charge', distance: { dice: 2 }, chargeTargets: true, failable: true, mark: 'charged', blocked: why, hint: 'выберите цели в пределах 12″, бросок 2D6 — дистанция; закончить в 2″ от всех целей', rule: '11.02 Charge; 11.04 Charge Move' },
      ];
    }
    case 'fight': {
      const canFight = c.engaged || f.charged;
      return [
        { id: 'pilein', label: 'Сближение', en: 'Pile-in move', kind: 'move', distance: { fixed: 3 }, mark: 'pileIn', blocked: first(notPlaced, f.pileIn && 'уже было сближение', !canFight && 'только связанный боем или нападавший отряд'), hint: 'до 3″ к ближайшей цели; после — связан боем', rule: '12.03 Pile-In Move' },
        { id: 'fight', label: 'Сражаться', en: 'Fight', kind: 'fight', mark: 'fought', blocked: first(notPlaced, f.fought && 'отряд уже сражался', !canFight && 'отряд не связан боем'), hint: f.charged ? 'нападал в этом ходу — Fights First' : 'выберите цель рядом', rule: '12.04–12.06 Fight' },
        { id: 'consolidate', label: 'Консолидация', en: 'Consolidation move', kind: 'move', distance: { fixed: 3 }, mark: 'consolidated', blocked: first(notPlaced, f.consolidated && 'уже была консолидация', !(canFight || f.fought) && 'только отряд, который мог сражаться'), hint: 'до 3″ к ближайшему врагу или к цели', rule: '12.08 Consolidation Move' },
      ];
    }
    default:
      return [];
  }
}

export const rules40k: SimRules = {
  system: '40k',
  title: 'Warhammer 40,000',
  phases: PHASES_40K,
  engagement: ER_40K,
  bothArmies: ['fight'],
  actions: actions40k,
  source: CORE,
};
