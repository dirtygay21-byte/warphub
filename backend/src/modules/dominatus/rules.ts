/**
 * Правила кампании Dominatus (DM2, 31.10.2026) без БД — tests/dominatus-rules.test.ts.
 * Источник: Wahapedia «Dominatus» (11-я редакция), сверка — правила владельца на сайте Dominatus.
 * - Награды битвы: фазы 1–2 — победитель Battle Honour (колода фазы), проигравший Battle Skill, ничья — оба Skill;
 *   с Agenda Achieved — тянуть на одну карту того же типа больше и оставить одну; фаза 3 — победителю Path to Conquest.
 * - Agenda Achieved: держать не больше 3.
 * - Конец фазы: контроль — у альянса с наибольшим числом Battle Honour за фазу (ничья — по Battle Honour за кампанию,
 *   дальше решает Warmaster); Ascendancy — у альянса(ов) с наибольшим числом Agenda Achieved; Relics (фазы 1–2) —
 *   каждый игрок тянет столько Relic, сколько у него Agenda Achieved, и оставляет одну; Narrative Points: контроль +1
 *   (в фазе 3 +2), Ascendancy +1; затем Agenda Achieved сбрасываются.
 */

export const ALLIANCES = ['liberators', 'oppressors', 'raiders'] as const;
export type Alliance = (typeof ALLIANCES)[number];
export const isAlliance = (v: unknown): v is Alliance => typeof v === 'string' && (ALLIANCES as readonly string[]).includes(v);

export const PHASES = [1, 2, 3] as const;
export type Phase = (typeof PHASES)[number];

export const AGENDA_ACHIEVED_LIMIT = 3;
export const PATH_TO_CONQUEST = 'Path to Conquest';

export type CardKind = 'honour' | 'skill' | 'relic' | 'agenda';
export type BattleResult = 'p1' | 'p2' | 'draw';

/** Награда стороны за битву: что тянуть и сколько; null — ничего. */
export interface BattleAward {
  kind: 'honour' | 'skill';
  draw: number;
  /** Path to Conquest выдаётся сразу (одна карта, без выбора) */
  fixed?: string;
}

export function battleAwards(phase: Phase, result: BattleResult, achieved: [number, number]): [BattleAward | null, BattleAward | null] {
  const side = (i: 0 | 1): BattleAward | null => {
    const me = i === 0 ? 'p1' : 'p2';
    const extra = achieved[i] > 0 ? 1 : 0;
    if (phase === 3) return result === me ? { kind: 'honour', draw: 1, fixed: PATH_TO_CONQUEST } : null;
    if (result === me) return { kind: 'honour', draw: 1 + extra };
    return { kind: 'skill', draw: 1 + extra };
  };
  return [side(0), side(1)];
}

/** Сколько Agenda Achieved можно добавить, не превышая предел (остальные пропадают). */
export const agendaToAdd = (held: number, gained: number) => Math.max(0, Math.min(gained, AGENDA_ACHIEVED_LIMIT - held));

/** Лидеры по числу: все с максимумом (пусто, если у всех 0). */
export function leaders(counts: Partial<Record<Alliance, number>>): Alliance[] {
  const max = Math.max(0, ...ALLIANCES.map((a) => counts[a] ?? 0));
  if (max === 0) return [];
  return ALLIANCES.filter((a) => (counts[a] ?? 0) === max);
}

/**
 * Контроль локации: больше всех Battle Honour за фазу; ничья — больше Battle Honour за кампанию; дальше — Warmaster
 * (warmasterPick). Нет Battle Honour ни у кого — контроля нет.
 */
export function takeControl(
  phaseHonours: Partial<Record<Alliance, number>>,
  campaignHonours: Partial<Record<Alliance, number>>,
  warmasterPick?: Alliance | null,
): { controller: Alliance | null; tied: Alliance[] } {
  const first = leaders(phaseHonours);
  if (first.length <= 1) return { controller: first[0] ?? null, tied: [] };
  const second = leaders(Object.fromEntries(first.map((a) => [a, campaignHonours[a] ?? 0])));
  if (second.length === 1) return { controller: second[0]!, tied: [] };
  const tied = second.length ? second : first;
  return { controller: warmasterPick && tied.includes(warmasterPick) ? warmasterPick : null, tied };
}

/** Narrative Points фазы: контроль +1 (фаза 3: +2), Ascendancy +1. */
export function narrativePoints(phase: Phase, controller: Alliance | null, ascendant: Alliance[]): Partial<Record<Alliance, number>> {
  const out: Partial<Record<Alliance, number>> = {};
  if (controller) out[controller] = (out[controller] ?? 0) + (phase === 3 ? 2 : 1);
  for (const a of ascendant) out[a] = (out[a] ?? 0) + 1;
  return out;
}

/** Relics в конце фаз 1–2: тянуть столько, сколько у игрока Agenda Achieved (не больше предела), оставить одну. */
export const relicDraw = (phase: Phase, agendaHeld: number) => (phase === 3 ? 0 : Math.min(AGENDA_ACHIEVED_LIMIT, Math.max(0, agendaHeld)));

/** Победитель битвы по ПО (сдавшийся проигрывает — так решает движок игры; сюда приходит готовый результат). */
export const resultOf = (vp1: number, vp2: number): BattleResult => (vp1 === vp2 ? 'draw' : vp1 > vp2 ? 'p1' : 'p2');
