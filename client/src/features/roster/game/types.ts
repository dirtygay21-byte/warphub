/**
 * «Начать игру» (40K, Chapter Approved 2026-27): типы игры. Только типы — логики здесь нет.
 *
 * Архитектура (рассчитана на два телефона, сейчас — один):
 * - Игра — это журнал событий (GameEvent[]), только дописывается. Состояние (GameState) не правится напрямую:
 *   его всегда получают, проигрывая журнал одной чистой функцией (reducer). Отмена — тоже событие (event-reverted).
 * - Игроки — места p1 / p2, а не «этот телефон». С одним телефоном все события пишет одно устройство; с двумя
 *   каждое устройство пишет события своего места, сервер упорядочивает журнал (seq) и раздаёт его обоим.
 * - Случайность — из seed игры (хранится в событии game-created): одинаковый журнал → одинаковые карты на любом
 *   устройстве. Вытянутые карты записываются в событие явно, чтобы второй телефон и сервер могли их проверить.
 * - Тайный выбор — два шага, как в правилах колоды миссий: тип армии (раскрытие dispositions-revealed) и режим
 *   вторичных (secondaries-revealed). На двух телефонах сервер не отдаёт чужой выбор до раскрытия; на одном —
 *   игроки выбирают по очереди, передавая телефон.
 * - Броски кубиков «кто выше» записываются с номером броска; движок сверяет результат с seed.
 * - Движок не загружает данные сам: получает каталог карт (GameCatalog) — подходит missions.json как есть,
 *   а значит, движок можно будет запустить и на сервере для проверки ходов.
 */

/** Версия схемы журнала. Меняется только с миграцией сохранённых игр (G1.7). */
export const GAME_SCHEMA = 1;

export type Seat = 'p1' | 'p2';
export const SEATS: readonly Seat[] = ['p1', 'p2'];

export type Role = 'attacker' | 'defender';
export type SecondaryMode = 'fixed' | 'tactical';
/** Откуда взялся результат: случайно в приложении, вручную (выбрано или вытянуто из настоящей колоды) */
export type Source = 'random' | 'manual';

export const ROUNDS = 5;
export type Round = 1 | 2 | 3 | 4 | 5;

/** Этап игры: подготовка по шагам последовательности битвы → битва → итог. */
export type Stage = 'setup' | 'battle' | 'finished';
/**
 * Шаг внутри хода активного игрока:
 * start — ход начался, фаза командования ещё не начата;
 * command — идёт фаза командования (карты вытянуты, CP получены; в конце — подсчёт основной миссии);
 * main — фазы после командования; в конце хода (до turn-ended) — подсчёт выполненных карт обоими игроками.
 */
export type TurnStep = 'start' | 'command' | 'main';

// ---------- каталог: что движку нужно из missions.json и battlefield.json ----------

export interface CatalogRow {
  vp: number;
  plus?: boolean;
  or?: boolean;
  max?: number;
}
export interface CatalogBlock {
  /** 'any' | '1' | '1–2' | '2+' | '2–3' | '2–4' | '4+' | '5' | 'end' */
  rounds: string;
  mode?: SecondaryMode;
  rows: CatalogRow[];
}
export interface CatalogCard {
  id: string;
  name: string;
  type: 'primary' | 'secondary';
  you?: string;
  foe?: string;
  modes?: SecondaryMode[];
  /** правило «при взятии» есть на карте (подсказка и варианты на экране) */
  drawn?: string;
  blocks: CatalogBlock[];
}
export interface GameCatalog {
  cards: CatalogCard[];
  caps: {
    primaryRound: number;
    primaryGame: number;
    secondaryRound: number;
    secondaryGame: number;
    fixedSecondaryCard?: number;
    endOfBattleOutsideRoundCap?: boolean;
  };
  /** пары типов армий → основная миссия (battlefield.json) */
  matchups: { you: string; foe: string; mission: string }[];
  /** раскладки: id → карта деплоя и пара типов армий (battlefield.json) */
  layouts: { id: string; pair: [string, string]; variant: number; deployment: string }[];
}

// ---------- подготовка игрока ----------

/** Ссылка на ростер (снимок для подписи; сам ростер в игру не копируется). */
export interface RosterRef {
  /** own — ростер из Roster Builder этого аккаунта; code — вставлен кодом ростера; none — без ростера */
  source: 'own' | 'code' | 'none';
  rosterId?: string;
  name?: string;
  factionId?: string;
  points?: number;
}

export interface PlayerSetup {
  name: string;
  roster: RosterRef;
  /** тип армии (id из battlefield.json: take-and-hold …) */
  disposition: string | null;
  role: Role | null;
  secondaryMode: SecondaryMode | null;
  /** две фиксированные вторичные (id карт), если режим fixed */
  fixed: [string, string] | null;
  /** армия Battle Ready (+10 ПО в итоге) */
  battleReady: boolean;
}

// ---------- события ----------

interface EventBase {
  /** уникальный id события (для отмены и синхронизации) */
  id: string;
  /** порядковый номер в журнале: 1, 2, 3 … (на двух телефонах назначает сервер) */
  seq: number;
  /** чьё событие; null — общее (подготовка на одном телефоне, системные шаги) */
  seat: Seat | null;
  /** время записи, ISO 8601 */
  at: string;
}

export type GameEvent = EventBase &
  (
    | { type: 'game-created'; schema: number; seed: string; names: Record<Seat, string> }
    | { type: 'player-set'; target: Seat; patch: Partial<Pick<PlayerSetup, 'name' | 'roster' | 'disposition' | 'battleReady'>> }
    | { type: 'layout-set'; layoutId: string; source: Source }
    | { type: 'dispositions-revealed' }
    | { type: 'roles-set'; attacker: Seat; source: Source; roll?: RollRef }
    | { type: 'secondary-chosen'; target: Seat; mode: SecondaryMode; fixed: [string, string] | null }
    | { type: 'secondaries-revealed' }
    | { type: 'first-turn-set'; first: Seat; source: Source; roll?: RollRef }
    | { type: 'battle-started' }
    | { type: 'command-phase-started' }
    | { type: 'cards-drawn'; target: Seat; cards: string[]; source: Source }
    | { type: 'card-redrawn'; target: Seat; card: string; replacement: string; reason: 'when-drawn' | 'swap'; shuffleBack: boolean; source: Source }
    | { type: 'card-noted'; target: Seat; card: string; note: string }
    | { type: 'card-scored'; target: Seat; card: string; picks: RowPick[] }
    | { type: 'card-discarded'; target: Seat; card: string; forCp: boolean }
    | { type: 'primary-scored'; target: Seat; picks: RowPick[] }
    | { type: 'vp-adjusted'; target: Seat; kind: 'primary' | 'secondary'; delta: number; note: string }
    | { type: 'cp-changed'; target: Seat; delta: number; reason: 'base' | 'stratagem' | 'discard' | 'swap' | 'other'; note?: string }
    | { type: 'command-phase-ended' }
    | { type: 'turn-ended' }
    | { type: 'battle-ended'; reason: 'rounds' | 'concede' | 'manual' }
    | { type: 'event-reverted'; target: string }
  );

export type GameEventType = GameEvent['type'];

/** Ссылка на бросок «кто выше»: номер броска этого вида в игре (0, 1, …); кубики движок считает по seed. */
export interface RollRef {
  attempt: number;
}
export type RollKey = 'roles' | 'first-turn';
export interface RollResult {
  attempt: number;
  rolls: { p1: number; p2: number }[];
  winner: Seat;
}

/** Выбранная строка карты: блок, строка и сколько раз она выполнена («за каждую цель» — count > 1). */
export interface RowPick {
  block: number;
  row: number;
  count: number;
}

// ---------- состояние (результат проигрывания журнала) ----------

export interface ActiveCard {
  id: string;
  /** когда стала активной */
  round: Round;
  source: Source;
  /** заметка «при взятии» (маяк, заманчивая цель …) */
  note?: string;
}

export interface ScoredCard {
  id: string;
  round: Round;
  /** чей ход шёл, когда карта засчитана (вторичные считаются в конце хода любого игрока) */
  turn: Seat;
  /** очки по карте до лимитов (лимиты раунда, битвы и фиксированной карты — в итогах, G1.6) */
  vp: number;
  picks: RowPick[];
}

export interface PlayerState extends PlayerSetup {
  seat: Seat;
  cp: number;
  /** колода вторичных: порядок оставшихся карт (верх — первая) */
  deck: string[];
  /** сколько раз колоду перемешивали (часть seed для следующего перемешивания) */
  shuffles: number;
  active: ActiveCard[];
  discarded: string[];
  scored: ScoredCard[];
  /** замена карты за 1 CP — один раз за битву */
  swapUsed: boolean;
  /** основная миссия: засчитанные строки (сырые очки; лимиты — в totals) */
  primaryScored: PrimaryEntry[];
  /** ручные поправки ПО с пояснением */
  adjustments: VpAdjustment[];
}

export interface PrimaryEntry {
  round: Round;
  turn: Seat | null;
  /** блок «Конец битвы» (вне лимита раунда) */
  end: boolean;
  vp: number;
  picks: RowPick[];
}

export interface VpAdjustment {
  round: Round;
  kind: 'primary' | 'secondary';
  delta: number;
  note: string;
}

/** Итоги игрока с лимитами (G1.6). cut — сколько ПО срезано лимитами. */
export interface PlayerTotals {
  primary: { byRound: number[]; end: number; total: number; cut: number };
  secondary: { byRound: number[]; byFixedCard: Record<string, number>; total: number; cut: number };
  battleReady: number;
  total: number;
}

export interface GameState {
  schema: number;
  id: string;
  seed: string;
  createdAt: string;
  stage: Stage;
  players: Record<Seat, PlayerState>;
  /** основная миссия каждого игрока (из пары типов армий) */
  primary: Record<Seat, string | null>;
  layoutId: string | null;
  deploymentId: string | null;
  /** типы армий раскрыты (после этого — основные миссии, раскладка, атакующий и защитник) */
  dispositionsRevealed: boolean;
  /** режимы вторичных раскрыты (после этого — первый ход) */
  secondariesRevealed: boolean;
  /** последние броски «кто выше» и сколько бросков каждого вида уже было (следующий — с этим номером) */
  rolls: Partial<Record<RollKey, RollResult>>;
  rollCount: Record<RollKey, number>;
  firstTurn: Seat | null;
  round: Round;
  activeSeat: Seat | null;
  step: TurnStep;
  /** сколько тактических карт активный игрок уже вытянул в текущей фазе командования (правило: две) */
  drawsThisPhase: number;
  /** 1 CP за сброс вторичных уже получен в этот ход (правило: один раз за ход, сколько карт ни сбрось) */
  discardCpTaken: boolean;
  /** почему битва закончилась (stage = finished) */
  endReason: 'rounds' | 'concede' | 'manual' | null;
  /** номер последнего применённого события */
  lastSeq: number;
  /** id отменённых событий */
  reverted: string[];
}

/** Результат применения события: новое состояние или понятная ошибка (на русском), без исключений. */
export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: string };
