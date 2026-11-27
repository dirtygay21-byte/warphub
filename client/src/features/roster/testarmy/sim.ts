import { dist, unitToUnit, type Placed, type Pt } from './geometry';
import { coherency, COHERENCY_40K, type CoherencyRule } from './deploy';
import type { ShootProfile } from './shooting40k';
import type { TAUnit } from './state';

/**
 * Test Army — симулятор игровых моментов (этап 2, 27.11.2026): фазы хода и действия отряда в каждой фазе
 * с настоящими дистанциями. Чистые функции без React; правила системы — объект SimRules (40K — ниже, rules40k).
 *
 * Дистанции меряются по полю (по прямой от исходного места модели), высота и путь вокруг террейна не учитываются.
 */

export type SimPhase = { id: string; label: string; en: string };

/** Что игрок может выбрать для отряда в фазе. */
export type SimActionKind = 'stationary' | 'move' | 'charge' | 'shoot' | 'fight' | 'test' | 'wait' | 'toggle';
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
  /** после манёвра отряд должен быть связан боем (40K: сближение, консолидация) */
  endEngaged?: boolean;
  /** каждый враг, связанный с отрядом в начале манёвра, остаётся связанным (40K 12.03, 12.08) */
  keepEngaged?: boolean;
  /** закончить в досягаемости цели и не связанным боем (40K: консолидация на цели, 12.08) */
  endObjective?: boolean;
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
  /** больше всего прошла модель отряда в этом ходу, ″ (40K [HEAVY]) */
  dist?: number;
  /** игрок отметил: правило армии (стратагема, аура) разрешает стрелять и нападать после продвижения / отступления */
  ruleAllows?: boolean;
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
  /** 40K: оружие, ключевые слова и исключения отряда для стрельбы (нет — неизвестно, только подсказки) */
  shooting?: ShootProfile | null;
  /** до ближайшей цели (маркера), ″ — 40K консолидация на цели */
  objective?: number | null;
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
  /** правило строя отряда (40K, AoS); нет — у отрядов одна модель (Kill Team, Warcry) */
  coherency?: CoherencyRule;
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
  /** враги, связанные с отрядом в начале манёвра (uid) — для keepEngaged */
  startEngaged?: string[];
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
  /** ближайшая цель (маркер) после манёвра — для консолидации на цели */
  objective?: { inRange: boolean } | null,
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
  if (am.action.endEngaged && !engagedWith.length) out.push(`нужно закончить связанным боем (в ${er}″ от врага)`);
  if (am.action.keepEngaged) {
    const lost = enemies.filter((e) => am.startEngaged?.includes(e.uid) && !engagedWith.includes(e));
    if (lost.length) out.push(`нужно остаться в бою с: ${lost.map((e) => e.name).join(', ')}`);
  }
  if (am.action.endObjective && !objective?.inRange) out.push('нужно закончить в досягаемости цели');
  // строй (40K 03, AoS 15.1): отряд из нескольких моделей заканчивает манёвр в боевом построении
  if (rules.coherency && unitBases.length > 1) {
    const c = coherency(unitBases, rules.coherency);
    if (!c.ok) out.push(`строй разорван: ${c.bad.length === 1 ? 'модель' : 'модели'} ${c.bad.map((i) => i + 1).join(', ')} — нужно ${String(rules.coherency.range).replace('0.5', '½').replace('.', ',')}″${rules.coherency.all ? ` и до каждой ${rules.coherency.all}″` : ''}`);
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

/** Переключатель: правило армии с условием (стратагема, аура, способность) разрешает стрелять и нападать после продвижения / отступления. */
function allowToggle(f: UnitFlags, sh: ShootProfile | null | undefined): SimActionDef {
  const names = sh?.conditional.length ? `: ${sh.conditional.join(', ')}` : ' (стратагема, аура)';
  return { id: 'rule-allows', label: f.ruleAllows ? 'Правило армии: да ✓' : 'Правило армии разрешает', en: 'Rule allows', kind: 'toggle', hint: `стрелять и нападать после ${f.moved === 'advance' ? 'продвижения' : 'отступления'}${names}`, rule: '09.06, 09.07 «unless stated otherwise»' };
}

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
          // 08.03: проверку делают отряды под боевым шоком и на половине численности или ниже; потери Test Army не считает
          hint: c.leadership != null ? `2D6 ≥ Ld ${c.leadership}+${f.shocked ? ' · сейчас под боевым шоком' : ' · только если отряд на половине численности или ниже (08.03)'}` : undefined,
          rule: '08.03 Battle-shock; 01.07',
        },
      ];
    case 'movement': {
      const done = f.moved ? 'отряд уже выбран для движения в этой фазе' : undefined;
      const m = c.move != null ? `${c.move}″` : 'M';
      const sh = c.shooting;
      const advShoot = sh ? (sh.afterAdvance.shoot ? `стрелять можно (${sh.afterAdvance.shoot})` : sh.assault ? 'стрелять — только [ASSAULT]' : 'стрелять нельзя: нет [ASSAULT]') : 'стрелять — только [ASSAULT]';
      return [
        { id: 'normal', label: 'Обычный манёвр', en: 'Normal move', kind: 'move', distance: { move: true }, endUnengaged: true, mark: 'moved', blocked: first(notPlaced, notActive, done, c.engaged && 'отряд связан боем — только отступление', c.move == null && 'нет характеристики M'), hint: `до ${m}, закончить не ближе ${ER_40K}″ к врагу`, rule: '09.05 Normal Move' },
        { id: 'advance', label: 'Продвижение', en: 'Advance move', kind: 'move', distance: { move: true, dice: 1 }, endUnengaged: true, mark: 'moved', blocked: first(notPlaced, notActive, done, c.engaged && 'отряд связан боем', c.move == null && 'нет характеристики M'), hint: `до ${m} + D6; потом ${sh?.afterAdvance.charge ? 'нападать можно' : 'нельзя нападать'}, ${advShoot} (10.05)`, rule: '09.06 Advance Move; 10.05' },
        { id: 'fallback', label: 'Отступление', en: 'Fall-back move', kind: 'move', distance: { move: true }, endUnengaged: true, mark: 'moved', blocked: first(notPlaced, notActive, done, !c.engaged && 'только для отряда, связанного боем', c.move == null && 'нет характеристики M'), hint: `до ${m}; потом ${sh?.afterFallBack.shoot ? `стрелять можно (${sh.afterFallBack.shoot})` : 'стрелять нельзя'}, ${sh?.afterFallBack.charge ? `нападать можно (${sh.afterFallBack.charge})` : 'нападать нельзя'}${f.shocked ? '; под боевым шоком — Desperate Escape: проверка опасности за каждую модель' : ''}`, rule: '09.07 Fall-back Move' },
        { id: 'stationary', label: 'Остаться на месте', en: 'Remain stationary', kind: 'stationary', mark: 'moved', blocked: first(notPlaced, notActive, done), rule: '09.04 Remain Stationary' },
      ];
    }
    case 'shooting': {
      const sh = c.shooting;
      const rule = f.ruleAllows;
      const advanced = f.moved === 'advance' && !sh?.afterAdvance.shoot && !rule;
      const fell = f.moved === 'fallback' && !sh?.afterFallBack.shoot && !rule;
      const why = first(
        notPlaced,
        notActive,
        f.shot && 'отряд уже стрелял в этой фазе',
        fell && 'после отступления стрелять нельзя (09.07)',
        advanced && c.engaged && 'продвигался и связан боем — стрелять нельзя (10.05, 10.06)',
        advanced && !!sh && !sh.assault && 'после продвижения — только штурмовая стрельба, а у отряда нет [ASSAULT] (10.05)',
        !advanced && c.engaged && !!sh && !sh.closeQuarters && !sh.monsterVehicle && 'связан боем — нужна стрельба в ближнем бою: нет [CLOSE-QUARTERS] / [PISTOL] (10.06)',
      );
      const note = advanced
        ? 'штурмовая стрельба — только оружие [ASSAULT] (10.05)'
        : c.engaged
          ? sh?.monsterVehicle
            ? 'стрельба в ближнем бою: MONSTER/VEHICLE — −1 к попаданию, кроме [CLOSE-QUARTERS] по своим противникам (10.06)'
            : 'стрельба в ближнем бою: только [CLOSE-QUARTERS] / [PISTOL] и только по противникам в бою (10.06)'
          : f.moved === 'advance' || f.moved === 'fallback'
            ? `обычная стрельба по правилу «${(f.moved === 'advance' ? sh?.afterAdvance.shoot : sh?.afterFallBack.shoot) ?? 'армии'}»`
            : 'выберите цель на столе';
      const out: SimActionDef[] = [{ id: 'shoot', label: 'Стрелять', en: 'Shoot', kind: 'shoot', mark: 'shot', blocked: why, hint: note, rule: '10.02–10.06 Shooting' }];
      if ((f.moved === 'advance' || f.moved === 'fallback') && !f.shot) out.push(allowToggle(f, sh));
      return out;
    }
    case 'charge': {
      const sh = c.shooting;
      const why = first(
        notPlaced,
        notActive,
        f.charged && 'отряд уже нападал в этой фазе',
        c.engaged && 'отряд связан боем',
        f.moved === 'advance' && !sh?.afterAdvance.charge && !f.ruleAllows && 'после продвижения нападать нельзя (09.06)',
        f.moved === 'fallback' && !sh?.afterFallBack.charge && !f.ruleAllows && 'после отступления нападать нельзя (09.07)',
        (c.nearestEnemy == null || c.nearestEnemy > 12) && 'нет врага в пределах 12″',
      );
      const out: SimActionDef[] = [
        { id: 'charge', label: 'Нападение', en: 'Charge', kind: 'charge', distance: { dice: 2 }, chargeTargets: true, failable: true, mark: 'charged', blocked: why, hint: 'выберите цели в пределах 12″, бросок 2D6 — дистанция; закончить в бою со всеми целями (11.04)', rule: '11.02 Charge; 11.04 Charge Move' },
      ];
      if ((f.moved === 'advance' || f.moved === 'fallback') && !f.charged) out.push(allowToggle(f, sh));
      return out;
    }
    case 'fight': {
      const canFight = c.engaged || f.charged;
      // 12.08: режим консолидации — по обстановке в её начале
      const er3 = c.nearestEnemy != null && c.nearestEnemy <= 3;
      const obj3 = c.objective != null && c.objective <= 3;
      const cons: Pick<SimActionDef, 'endEngaged' | 'keepEngaged' | 'endObjective' | 'endUnengaged' | 'hint'> = c.engaged
        ? { endEngaged: true, keepEngaged: true, hint: 'продолжающаяся: до 3″, остаться в бою со всеми противниками' }
        : er3
          ? { endEngaged: true, hint: 'боевая: до 3″, закончить в бою с врагом в 3″' }
          : obj3
            ? { endObjective: true, endUnengaged: true, hint: 'на цели: до 3″, закончить в досягаемости цели, не в бою' }
            : { hint: 'нет врага и цели в пределах 3″' };
      return [
        { id: 'pilein', label: 'Сближение', en: 'Pile-in move', kind: 'move', distance: { fixed: 3 }, mark: 'pileIn', endEngaged: true, keepEngaged: true, blocked: first(notPlaced, f.pileIn && 'уже было сближение', !canFight && 'только связанный боем или нападавший отряд'), hint: c.engaged ? 'до 3″ к ближайшей цели; остаться в бою со всеми' : 'до 3″ к врагу в 5″; закончить связанным боем', rule: '12.03 Pile-In Move' },
        { id: 'fight', label: 'Сражаться', en: 'Fight', kind: 'fight', mark: 'fought', blocked: first(notPlaced, f.fought && 'отряд уже сражался', !canFight && 'отряд не связан боем'), hint: f.charged ? 'нападал в этом ходу — Fights First' : 'выберите цель рядом', rule: '12.04–12.06 Fight' },
        { id: 'consolidate', label: 'Консолидация', en: 'Consolidation move', kind: 'move', distance: { fixed: 3 }, mark: 'consolidated', ...cons, blocked: first(notPlaced, f.consolidated && 'уже была консолидация', !(canFight || f.fought) && 'только отряд, который мог сражаться', !c.engaged && !er3 && !obj3 && 'нет врага и цели в пределах 3″ — консолидация невозможна (12.08)'), rule: '12.08 Consolidation Move' },
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
  coherency: COHERENCY_40K,
};
