/**
 * Dominatus (DM1): что получает каждый игрок после битвы — по правилам Dominatus (Wahapedia, «Determine Victor»):
 * - фазы 1–2: победитель тянет 1 Battle Honour (колода фазы), противник — 1 Battle Skill; ничья — оба Battle Skill;
 * - игрок с Agenda Achieved тянет на одну карту того же типа больше и оставляет одну из двух;
 * - фаза 3: победитель получает Battle Honour фазы 3 «Path to Conquest»;
 * - Agenda Achieved: 35+ ПО по Agenda или условие карты (отмечают игроки; подсказка — по ПО основной миссии).
 * Карты физические: приложение говорит, что тянуть, а не тянет само.
 */
import { agendasActive, battleResult, totals, type GameCatalog, type GameState, type Seat } from '../game';

export type RewardDraw = { kind: 'honour' | 'skill' | 'path-to-conquest'; draw: number; keep: number; phase: number };

export interface SeatReward {
  outcome: 'win' | 'loss' | 'draw';
  /** карта(ы) за итог битвы; null — ничего (фаза 3 без победы) */
  reward: RewardDraw | null;
  /** Agenda в этой битве (id) */
  agenda: string | null;
  /** ПО по основной миссии (Agenda) — для подсказки 35+ */
  primaryVp: number;
  /** подсказка: 35+ ПО по Agenda — Agenda Achieved заработана */
  suggestedAchieved: boolean;
  /** отмечено игроком (0–2) или null */
  achieved: 0 | 1 | 2 | null;
}

export const AGENDA_ACHIEVED_VP = 35;

export function dominatusRewards(state: GameState, catalog: GameCatalog): Record<Seat, SeatReward> | null {
  const d = state.dominatus;
  const result = battleResult(state, catalog);
  if (!d || !d.phase || !result) return null;
  const phase = d.phase;
  const active = agendasActive(state);
  const one = (seat: Seat): SeatReward => {
    const outcome = result.winner === null ? 'draw' : result.winner === seat ? 'win' : 'loss';
    const achieved = active ? d.players[seat].achieved : null;
    const extra = (achieved ?? 0) > 0 ? 1 : 0;
    let reward: RewardDraw | null = null;
    if (phase === 3) {
      if (outcome === 'win') reward = { kind: 'path-to-conquest', draw: 1, keep: 1, phase: 3 };
    } else {
      reward = { kind: outcome === 'win' ? 'honour' : 'skill', draw: 1 + extra, keep: 1, phase };
    }
    const primaryVp = totals(state, seat, catalog).primary.total;
    return {
      outcome,
      reward,
      agenda: active ? d.players[seat].agenda : null,
      primaryVp,
      suggestedAchieved: active && primaryVp >= AGENDA_ACHIEVED_VP,
      achieved,
    };
  };
  return { p1: one('p1'), p2: one('p2') };
}
