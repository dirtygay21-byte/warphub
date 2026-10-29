/**
 * «Начать игру» для Age of Sigmar (S5, 30.10.2026): типы игры. Отдельно от 40K (game/): свои правила и данные
 * (General's Handbook 2026-27, backend/roster-data/aos/battlepack.json). Общая только архитектура — журнал событий,
 * места p1/p2, seed для бросков, отмена событием — и генератор случайности (game/rng.ts).
 */
import type { AosBattlepack, AosTacticTier } from '../aos/types';

export const AOS_GAME_SCHEMA = 1;

export type Seat = 'p1' | 'p2';
export const SEATS: readonly Seat[] = ['p1', 'p2'];
export type Role = 'attacker' | 'defender';
export type Source = 'random' | 'manual';
export type Stage = 'setup' | 'battle' | 'finished';
/** шаг раунда: priority — ждём броска priority (начало раунда); turn — идёт ход activeSeat */
export type RoundStep = 'priority' | 'turn';

/** Что движку нужно из battlepack.json (подходит как есть). */
export type AosCatalog = Pick<AosBattlepack, 'rounds' | 'victory' | 'cp' | 'priority' | 'tactics' | 'battleplans'>;

/** Ростер игрока (AoS): свой из Roster Builder или по коду (AOS1.…). */
export interface AosRosterRef {
  source: 'own' | 'code' | 'none';
  rosterId?: string;
  name?: string;
  factionId?: string;
  points?: number;
  /** число вспомогательных (auxiliary) отрядов — у кого меньше, тот получает +1 CP за раунд */
  auxiliaries?: number;
  code?: string;
}

export interface AosPlayerSetup {
  name: string;
  roster: AosRosterRef;
  role: Role | null;
  /** выбранные карты боевых тактик (id, до tactics.pick); тайно до tactics-revealed */
  tacticCards: string[];
}

export interface TacticDone {
  card: string;
  tier: AosTacticTier;
  round: number;
}
export interface PlanScore {
  round: number;
  /** индекс строки battleplan.scoring */
  row: number;
  vp: number;
}

export interface AosPlayerState extends AosPlayerSetup {
  seat: Seat;
  cp: number;
  /** кубы ярости и уровень ярости (Season Rules 2026-27) */
  rage: number;
  fury: number;
  tacticsDone: TacticDone[];
  planScored: PlanScore[];
  /** ручные поправки ПО (не по правилам батлплана: ошибки, особые правила) */
  vpAdjust: { delta: number; note: string; round: number }[];
}

export interface PriorityRoll {
  round: number;
  attempt: number;
  p1: number;
  p2: number;
  /** победитель броска; null — ничья (решает тот, кто ходил первым в прошлом раунде) */
  winner: Seat | null;
  /** кто решал, кто ходит первым */
  decider: Seat;
}

export interface AosGameState {
  schema: number;
  seed: string;
  stage: Stage;
  players: Record<Seat, AosPlayerState>;
  /** номер батлплана 1–12 */
  battleplan: number | null;
  battleplanSource: Source | null;
  battleplanDraws: number;
  /** территория атакующего (подпись по карте батлплана) */
  territory: string | null;
  tacticsRevealed: boolean;
  rolesSource: Source | null;
  rolesRoll: { p1: number; p2: number }[] | null;
  rollCount: { roles: number; priority: number };
  round: number;
  step: RoundStep;
  /** кто ходит первым в этом раунде и кто в прошлом */
  first: Seat | null;
  prevFirst: Seat | null;
  activeSeat: Seat | null;
  /** 0 — первый ход раунда, 1 — второй */
  turnIndex: 0 | 1;
  /** перехватил инициативу в этом раунде (не выполняет тактики в этот ход) */
  seized: Seat | null;
  underdog: Seat | null;
  priority: PriorityRoll | null;
  endReason: 'rounds' | 'concede' | 'manual' | null;
  concededBy: Seat | null;
  lastSeq: number;
  reverted: string[];
}

interface EventBase {
  id: string;
  seq: number;
  seat: Seat | null;
  at: string;
}

export type AosEventBody =
  | { type: 'game-created'; schema: number; seed: string; names: Record<Seat, string> }
  | { type: 'player-set'; target: Seat; patch: Partial<Pick<AosPlayerSetup, 'name' | 'roster' | 'tacticCards'>> }
  | { type: 'battleplan-set'; n: number; source: Source; roll?: { attempt: number } }
  | { type: 'roles-set'; attacker: Seat; source: Source; roll?: { attempt: number } }
  | { type: 'territory-set'; territory: string }
  | { type: 'tactics-revealed' }
  | { type: 'battle-started' }
  /** начало раунда: бросок priority (или вручную) и кто ходит первым */
  | { type: 'round-started'; first: Seat; source: Source; roll?: { attempt: number } }
  | { type: 'plan-scored'; target: Seat; rows: number[] }
  | { type: 'tactic-completed'; target: Seat; card: string; tier: AosTacticTier }
  | { type: 'cp-changed'; target: Seat; delta: number; reason: string }
  | { type: 'rage-changed'; target: Seat; dice?: number; fury?: number }
  | { type: 'vp-adjusted'; target: Seat; delta: number; note: string }
  | { type: 'turn-ended' }
  | { type: 'battle-ended'; reason: 'concede' | 'manual'; by?: Seat }
  | { type: 'event-reverted'; target: string };

export type AosGameEvent = EventBase & AosEventBody;

export type ApplyResult = { ok: true; state: AosGameState } | { ok: false; error: string };
