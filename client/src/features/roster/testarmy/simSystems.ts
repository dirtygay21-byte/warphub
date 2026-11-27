import type { SimActionDef, SimContext, SimRules } from './sim';
import { COHERENCY_AOS } from './deploy';

/**
 * Симулятор игровых моментов (этап 3, 27.11.2026): Age of Sigmar 4, Kill Team (2024), Warcry.
 * Источники: AoS — Wahapedia, AoS 4 Core Rules (сверено 27.11.2026: 14.1–14.4, 15.1, 15.3, 16.0, 20.0);
 * Kill Team — Wahapedia, Kill Team 3rd edition Core Rules; Warcry — warcrier.net (Fighting the Battle, Move / Attack / Other Actions).
 * Дистанции — по полю, без высоты и обхода террейна.
 */

const first = (...xs: (string | undefined | false | null)[]) => xs.find((x): x is string => !!x);
const inch = (n: number | null) => (n != null ? `${n}″` : 'Move');

// ---------- Age of Sigmar 4 ----------

const AOS_COMBAT = 3;

function actionsAos(c: SimContext): SimActionDef[] {
  const f = c.flags;
  const notPlaced = c.placed ? undefined : 'отряд не на столе';
  const notActive = c.active ? undefined : 'сейчас ход другой армии';
  const ranOrRetreated = f.moved === 'advance' ? 'после Run нельзя' : f.moved === 'fallback' ? 'после Retreat нельзя' : undefined;
  switch (c.phase) {
    case 'movement': {
      const done = f.moved ? 'отряд уже двигался в этой фазе' : undefined;
      const noMove = c.move == null && 'нет характеристики Move';
      return [
        { id: 'normal', label: 'Normal Move', en: 'Normal Move', kind: 'move', distance: { move: true }, endUnengaged: true, mark: 'moved', blocked: first(notPlaced, notActive, done, c.engaged && 'отряд в бою — только Retreat', noMove), hint: `до ${inch(c.move)}; нельзя входить в бой (3″ от врага)`, rule: 'Normal Move' },
        { id: 'advance', label: 'Run', en: 'Run', kind: 'move', distance: { move: true, dice: 1 }, endUnengaged: true, mark: 'moved', blocked: first(notPlaced, notActive, done, c.engaged && 'отряд в бою', noMove), hint: `до ${inch(c.move)} + D6; потом нельзя стрелять и нападать`, rule: 'Run' },
        { id: 'fallback', label: 'Retreat', en: 'Retreat', kind: 'move', distance: { move: true }, endUnengaged: true, mortalD3: true, mark: 'moved', blocked: first(notPlaced, notActive, done, !c.engaged && 'только для отряда в бою', noMove), hint: `до ${inch(c.move)}, D3 смертельных ран; закончить вне 3″ от врага; потом нельзя стрелять и нападать`, rule: 'Retreat' },
        { id: 'stationary', label: 'Остаться на месте', en: 'Stay', kind: 'stationary', mark: 'moved', blocked: first(notPlaced, notActive, done), rule: 'Movement phase' },
      ];
    }
    case 'shooting':
      // 16.0: в бою стрелять нельзя, кроме оружия Shoot in Combat (20.0), и только по отрядам в бою с ним
      return [{ id: 'shoot', label: 'Стрелять', en: 'Shoot', kind: 'shoot', mark: 'shot', blocked: first(notPlaced, notActive, f.shot && 'отряд уже стрелял', ranOrRetreated, c.engaged && c.shootInCombat === false && 'отряд в бою — нужно оружие Shoot in Combat (16.0)'), hint: c.engaged ? 'в бою: только оружие Shoot in Combat, цель — отряд в бою с ним (16.0)' : 'выберите цель: проверка дистанции', rule: '14.2 Shoot; 16.0' }];
    case 'charge':
      return [
        { id: 'charge', label: 'Charge', en: 'Charge', kind: 'move', distance: { dice: 2 }, endNear: 0.5, failable: true, mark: 'charged', blocked: first(notPlaced, notActive, f.charged && 'отряд уже нападал', c.engaged && 'отряд в бою', ranOrRetreated), hint: 'бросок 2D6 — дистанция; закончить в ½″ от врага', rule: 'Charge' },
      ];
    case 'combat': {
      const can = c.engaged || f.charged;
      return [
        { id: 'pilein', label: 'Pile-in', en: 'Pile-in', kind: 'move', distance: { fixed: 3 }, mark: 'pileIn', keepEngaged: true, blocked: first(notPlaced, f.pileIn && 'уже было', !can && 'только отряд в бою или нападавший'), hint: 'до 3″, не дальше от цели; остаться в бою со всеми, с кем был (15.3)', rule: '15.3 Pile-in' },
        { id: 'fight', label: 'Fight', en: 'Fight', kind: 'fight', mark: 'fought', blocked: first(notPlaced, f.fought && 'отряд уже сражался', !can && 'отряд не в бою и не нападал'), hint: 'выберите цель в бою', rule: 'Fight' },
      ];
    }
    default:
      return [];
  }
}

export const rulesAos: SimRules = {
  system: 'aos',
  title: 'Age of Sigmar',
  phases: [
    { id: 'hero', label: 'Герои', en: 'Hero' },
    { id: 'movement', label: 'Движение', en: 'Movement' },
    { id: 'shooting', label: 'Стрельба', en: 'Shooting' },
    { id: 'charge', label: 'Нападение', en: 'Charge' },
    { id: 'combat', label: 'Бой', en: 'Combat' },
    { id: 'end', label: 'Конец хода', en: 'End of Turn' },
  ],
  engagement: AOS_COMBAT,
  bothArmies: ['combat'],
  actions: actionsAos,
  coherency: COHERENCY_AOS,
  source: 'AoS 4 Core Rules (Wahapedia): combat range 3″, Normal Move, Run, Retreat, Charge, Pile-in, Fight, Shoot in Combat',
};

// ---------- Kill Team (2024) ----------

const KT_CONTROL = 1;

function actionsKt(c: SimContext): SimActionDef[] {
  if (c.phase !== 'firefight') return [];
  const f = c.flags;
  const did = f.did ?? [];
  const conceal = (f.order ?? 'conceal') === 'conceal';
  const base = first(!c.placed && 'оперативник не на столе', !c.active && 'сейчас активация другого игрока', f.expended && 'оперативник уже активирован в этом turning point');
  // одно и то же действие — не больше раза за активацию
  const again = (id: string) => did.includes(id) && 'это действие уже было в этой активации';
  return [
    { id: 'reposition', label: 'Reposition', en: 'Reposition', kind: 'move', ap: 1, distance: { move: true }, endUnengaged: true, blocked: first(base, again('reposition'), c.engaged && 'враг в control range', did.includes('fallback') && 'в этой активации был Fall Back', did.includes('charge') && 'в этой активации был Charge', c.move == null && 'нет Move'), hint: `1AP · до ${inch(c.move)}`, rule: 'Reposition' },
    { id: 'dash', label: 'Dash', en: 'Dash', kind: 'move', ap: 1, distance: { fixed: 3 }, endUnengaged: true, blocked: first(base, again('dash'), c.engaged && 'враг в control range', did.includes('charge') && 'в этой активации был Charge'), hint: '1AP · до 3″', rule: 'Dash' },
    { id: 'fallback', label: 'Fall Back', en: 'Fall Back', kind: 'move', ap: 2, distance: { move: true }, endUnengaged: true, blocked: first(base, again('fallback'), !c.engaged && 'только когда враг в control range', did.includes('reposition') && 'в этой активации был Reposition', did.includes('charge') && 'в этой активации был Charge', c.move == null && 'нет Move'), hint: `2AP · до ${inch(c.move)}; нельзя закончить в control range`, rule: 'Fall Back' },
    { id: 'charge', label: 'Charge', en: 'Charge', kind: 'move', ap: 1, distance: { move: true, plus: 2 }, endNear: KT_CONTROL, blocked: first(base, again('charge'), conceal && 'приказ Conceal', c.engaged && 'враг уже в control range', did.includes('reposition') && 'в этой активации был Reposition', did.includes('dash') && 'в этой активации был Dash', did.includes('fallback') && 'в этой активации был Fall Back', c.move == null && 'нет Move'), hint: `1AP · до ${c.move != null ? `${c.move + 2}″` : 'Move + 2″'}; закончить в control range (1″) врага`, rule: 'Charge' },
    { id: 'shoot', label: 'Shoot', en: 'Shoot', kind: 'shoot', ap: 1, blocked: first(base, again('shoot'), conceal && 'приказ Conceal', c.engaged && 'враг в control range'), hint: '1AP · цель видима и без своих оперативников в её control range', rule: 'Shoot' },
    { id: 'fight', label: 'Fight', en: 'Fight', kind: 'fight', ap: 1, blocked: first(base, again('fight'), !c.engaged && 'враг не в control range'), hint: '1AP · цель в control range', rule: 'Fight' },
  ];
}

export const rulesKt: SimRules = {
  system: 'kt',
  title: 'Kill Team',
  phases: [
    { id: 'strategy', label: 'Strategy', en: 'Strategy phase' },
    { id: 'firefight', label: 'Firefight', en: 'Firefight phase' },
  ],
  engagement: KT_CONTROL,
  actions: actionsKt,
  activation: { phase: 'firefight', budget: (c) => c.apl ?? 2, unit: 'AP' },
  source: 'Kill Team 3rd ed. Core Rules (Wahapedia): control range 1″, Reposition, Dash, Fall Back, Charge, Shoot, Fight, APL',
};

// ---------- Warcry ----------

const WC_ENGAGE = 1;

function actionsWarcry(c: SimContext): SimActionDef[] {
  if (c.phase !== 'combat') return [];
  const f = c.flags;
  const base = first(!c.placed && 'боец не на столе', !c.active && 'сейчас активация другого игрока', f.expended && 'боец уже активирован в этом раунде');
  return [
    { id: 'move', label: 'Move', en: 'Move', kind: 'move', ap: 1, distance: { move: true }, blocked: first(base, c.engaged && 'враг в 1″ — только Disengage', c.move == null && 'нет Move'), hint: `до ${inch(c.move)}; нельзя начать в 1″ от врага`, rule: 'Move action' },
    { id: 'disengage', label: 'Disengage', en: 'Disengage', kind: 'move', ap: 1, distance: { fixed: 3 }, endUnengaged: true, blocked: first(base, !c.engaged && 'только в 1″ от врага'), hint: 'до 3″; закончить дальше 1″ от всех врагов', rule: 'Disengage action' },
    { id: 'attack', label: 'Attack', en: 'Attack', kind: 'shoot', ap: 1, blocked: base, hint: c.engaged ? 'враг в 1″ — цель только из них' : 'видимый враг в дальности оружия', rule: 'Attack action' },
    { id: 'wait', label: 'Wait', en: 'Wait', kind: 'wait', ap: 1, blocked: base, hint: (f.spent ?? 0) === 0 ? 'первым действием — можно активировать позже с 1 действием' : 'завершить активацию', rule: 'Wait action' },
  ];
}

export const rulesWarcry: SimRules = {
  system: 'warcry',
  title: 'Warcry',
  phases: [
    { id: 'initiative', label: 'Initiative', en: 'Initiative phase' },
    { id: 'reserve', label: 'Reserve', en: 'Reserve phase' },
    { id: 'combat', label: 'Combat', en: 'Combat phase' },
  ],
  engagement: WC_ENGAGE,
  actions: actionsWarcry,
  activation: { phase: 'combat', budget: (c) => (c.flags.waiting ? 1 : 2), unit: 'действ.' },
  source: 'warcrier.net: Fighting the Battle, Move / Attack / Other Actions — 2 действия за активацию, 1″, Disengage 3″',
};

/**
 * Проверка цели атаки без симулятора боя (AoS, Kill Team, Warcry): null — можно, иначе причина.
 *  AoS 16.0: отряд в бою стреляет только по отрядам в бою с ним (оружием Shoot in Combat).
 *  Kill Team, Shoot: у цели в control range не должно быть своих оперативников.
 *  Warcry, Attack: если враги в 1″ — цель только из них; дальняя атака (дальность > 3″) не по врагу в 1″ от своего бойца,
 *  кроме оружия без минимальной дальности, когда атакующий в 3″ от цели.
 */
export function skirmishTargetRule(
  system: string,
  a: { melee: boolean; attackerEngaged: boolean; targetEngagedWithAttacker: boolean; friendlyNearTarget: boolean; gap: number | null; ranges: { min?: number; max: number }[] },
): string | null {
  if (system === 'aos' && !a.melee && a.attackerEngaged && !a.targetEngagedWithAttacker) return 'отряд в бою — стрелять можно только по отрядам в бою с ним (16.0)';
  if (system === 'kt' && !a.melee && a.friendlyNearTarget) return 'у цели в control range свой оперативник — стрелять нельзя (Shoot)';
  if (system === 'warcry') {
    if (a.attackerEngaged && !a.targetEngagedWithAttacker) return 'враг в 1″ — цель только из врагов в 1″ (Attack)';
    // оружие подходит: цель в его дальности и (ближняя атака, или рядом с целью нет своих, или без мин. дальности и атакующий в 3″)
    if (a.friendlyNearTarget && a.gap != null && a.ranges.length) {
      const g = a.gap;
      const inRange = a.ranges.filter((r) => g <= r.max + 1e-6 && (r.min == null || g >= r.min));
      if (inRange.length && !inRange.some((r) => r.max <= 3 || (!r.min && g <= 3 + 1e-6))) return 'цель в 1″ от вашего бойца — дальняя атака только из 3″ оружием без минимальной дальности (Attack)';
    }
  }
  return null;
}
