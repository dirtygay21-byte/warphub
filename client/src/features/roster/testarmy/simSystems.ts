import type { SimActionDef, SimContext, SimRules } from './sim';
import { COHERENCY_AOS } from './deploy';

/**
 * Симулятор игровых моментов (этап 3, 27.11.2026): Age of Sigmar 4, Kill Team (2024), Warcry.
 * Источники: AoS — Wahapedia, AoS 4 Quick Start Guide (страница полных Core Rules не открылась 27.11.2026);
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
      return [{ id: 'shoot', label: 'Стрелять', en: 'Shoot', kind: 'shoot', mark: 'shot', blocked: first(notPlaced, notActive, f.shot && 'отряд уже стрелял', ranOrRetreated), hint: c.engaged ? 'отряд в бою — правила стрельбы в бою см. в варскролле' : 'выберите цель: проверка дистанции', rule: 'Shoot' }];
    case 'charge':
      return [
        { id: 'charge', label: 'Charge', en: 'Charge', kind: 'move', distance: { dice: 2 }, endNear: 0.5, failable: true, mark: 'charged', blocked: first(notPlaced, notActive, f.charged && 'отряд уже нападал', c.engaged && 'отряд в бою', ranOrRetreated), hint: 'бросок 2D6 — дистанция; закончить в ½″ от врага', rule: 'Charge' },
      ];
    case 'combat': {
      const can = c.engaged || f.charged;
      return [
        { id: 'pilein', label: 'Pile-in', en: 'Pile-in', kind: 'move', distance: { fixed: 3 }, mark: 'pileIn', blocked: first(notPlaced, f.pileIn && 'уже было', !can && 'только отряд в бою или нападавший'), hint: 'до 3″, не дальше от цели', rule: 'Pile-in' },
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
  source: 'AoS 4, Quick Start Guide (Wahapedia): combat range 3″, Normal Move, Run, Retreat, Charge, Pile-in, Fight',
};

// ---------- Kill Team (2024) ----------

const KT_CONTROL = 1;

function actionsKt(c: SimContext): SimActionDef[] {
  if (c.phase !== 'firefight') return [];
  const f = c.flags;
  const did = f.did ?? [];
  const conceal = (f.order ?? 'conceal') === 'conceal';
  const base = first(!c.placed && 'оперативник не на столе', !c.active && 'сейчас активация другого игрока', f.expended && 'оперативник уже активирован в этом turning point');
  return [
    { id: 'reposition', label: 'Reposition', en: 'Reposition', kind: 'move', ap: 1, distance: { move: true }, endUnengaged: true, blocked: first(base, c.engaged && 'враг в control range', did.includes('fallback') && 'в этой активации был Fall Back', did.includes('charge') && 'в этой активации был Charge', c.move == null && 'нет Move'), hint: `1AP · до ${inch(c.move)}`, rule: 'Reposition' },
    { id: 'dash', label: 'Dash', en: 'Dash', kind: 'move', ap: 1, distance: { fixed: 3 }, endUnengaged: true, blocked: first(base, c.engaged && 'враг в control range', did.includes('charge') && 'в этой активации был Charge'), hint: '1AP · до 3″', rule: 'Dash' },
    { id: 'fallback', label: 'Fall Back', en: 'Fall Back', kind: 'move', ap: 2, distance: { move: true }, endUnengaged: true, blocked: first(base, !c.engaged && 'только когда враг в control range', c.move == null && 'нет Move'), hint: `2AP · до ${inch(c.move)}; нельзя закончить в control range`, rule: 'Fall Back' },
    { id: 'charge', label: 'Charge', en: 'Charge', kind: 'move', ap: 1, distance: { move: true, plus: 2 }, endNear: KT_CONTROL, blocked: first(base, conceal && 'приказ Conceal', c.engaged && 'враг уже в control range', c.move == null && 'нет Move'), hint: `1AP · до ${c.move != null ? `${c.move + 2}″` : 'Move + 2″'}; закончить в control range (1″) врага`, rule: 'Charge' },
    { id: 'shoot', label: 'Shoot', en: 'Shoot', kind: 'shoot', ap: 1, blocked: first(base, conceal && 'приказ Conceal', c.engaged && 'враг в control range'), hint: '1AP · выберите цель: проверка дистанции', rule: 'Shoot' },
    { id: 'fight', label: 'Fight', en: 'Fight', kind: 'fight', ap: 1, blocked: first(base, !c.engaged && 'враг не в control range'), hint: '1AP · цель в control range', rule: 'Fight' },
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
