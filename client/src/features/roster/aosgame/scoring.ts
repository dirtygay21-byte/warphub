/** Счёт AoS: ПО (батлплан + тактики + поправки), underdog, CP раунда, итог битвы. */
import type { AosCatalog, AosGameState, Seat } from './types';

export const otherSeat = (s: Seat): Seat => (s === 'p1' ? 'p2' : 'p1');

export interface AosTotals {
  plan: number;
  tactics: number;
  adjust: number;
  total: number;
  byRound: number[];
  tacticsCount: number;
}

export function aosTotals(s: AosGameState, seat: Seat, cat: AosCatalog): AosTotals {
  const p = s.players[seat];
  const byRound = Array.from({ length: cat.rounds }, () => 0);
  let plan = 0;
  for (const x of p.planScored) {
    plan += x.vp;
    byRound[x.round - 1] = (byRound[x.round - 1] ?? 0) + x.vp;
  }
  const tactics = p.tacticsDone.length * cat.tactics.vp;
  for (const t of p.tacticsDone) byRound[t.round - 1] = (byRound[t.round - 1] ?? 0) + cat.tactics.vp;
  const adjust = p.vpAdjust.reduce((a, x) => a + x.delta, 0);
  return { plan, tactics, adjust, total: plan + tactics + adjust, byRound, tacticsCount: p.tacticsDone.length };
}

/** Underdog раунда — меньше ПО; поровну — нет (Core Rules 12.0, исправление). */
export function underdogOf(s: AosGameState, cat: AosCatalog): Seat | null {
  const a = aosTotals(s, 'p1', cat).total;
  const b = aosTotals(s, 'p2', cat).total;
  return a === b ? null : a < b ? 'p1' : 'p2';
}

/** CP в начале раунда: 4, +1 underdog, +1 у кого меньше вспомогательных отрядов (если известно у обоих). */
export function roundCp(s: AosGameState, seat: Seat, underdog: Seat | null, cat: AosCatalog): number {
  const mine = s.players[seat].roster.auxiliaries;
  const theirs = s.players[otherSeat(seat)].roster.auxiliaries;
  const fewer = mine != null && theirs != null && mine < theirs;
  return cat.cp.perRound + (underdog === seat ? cat.cp.underdog : 0) + (fewer ? cat.cp.fewerAuxiliaries : 0);
}

/** Строки батлплана, которые можно засчитать в этом раунде (по rounds: all / 1 / 2+). */
export function planRowsFor(cat: AosCatalog, n: number, round: number): number[] {
  const bp = cat.battleplans.find((b) => b.n === n);
  if (!bp) return [];
  return bp.scoring.map((r, i) => ({ r, i })).filter(({ r }) => r.rounds === 'all' || (r.rounds === '1' ? round === 1 : round >= 2)).map(({ i }) => i);
}

/** Следующая тактика карты (по порядку) или null — все три выполнены. */
export function nextTier(s: AosGameState, seat: Seat, card: string, cat: AosCatalog) {
  const done = new Set(s.players[seat].tacticsDone.filter((t) => t.card === card).map((t) => t.tier));
  return cat.tactics.order.find((t) => !done.has(t)) ?? null;
}

export interface AosResult {
  winner: Seat | null;
  /** concede — победа сдачей соперника (крупная или малая правилами не задано) */
  kind: 'major' | 'minor' | 'draw' | 'concede';
  by: 'vp' | 'tactics' | 'concede';
  totals: Record<Seat, number>;
}

/**
 * Итог: перевес 5+ ПО — крупная победа, меньше — малая; поровну — малая победа у выполнившего больше тактик, иначе ничья.
 * Сдавшийся проигрывает независимо от ПО (как в 40K, решение владельца). null — битва не окончена.
 */
export function aosResult(s: AosGameState, cat: AosCatalog): AosResult | null {
  if (s.stage !== 'finished') return null;
  const t1 = aosTotals(s, 'p1', cat);
  const t2 = aosTotals(s, 'p2', cat);
  const totals = { p1: t1.total, p2: t2.total };
  if (s.endReason === 'concede' && s.concededBy) return { winner: otherSeat(s.concededBy), kind: 'concede', by: 'concede', totals };
  const diff = t1.total - t2.total;
  if (diff !== 0) return { winner: diff > 0 ? 'p1' : 'p2', kind: Math.abs(diff) >= cat.victory.majorMargin ? 'major' : 'minor', by: 'vp', totals };
  if (t1.tacticsCount !== t2.tacticsCount) return { winner: t1.tacticsCount > t2.tacticsCount ? 'p1' : 'p2', kind: 'minor', by: 'tactics', totals };
  return { winner: null, kind: 'draw', by: 'vp', totals };
}
