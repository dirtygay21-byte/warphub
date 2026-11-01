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

/** Режим игры (DM1, 31.10.2026): обычная партия 11-й редакции или битва кампании Dominatus. */
export type GameMode = 'standard' | 'dominatus';

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
  /** вторичные: чей ход должен заканчиваться — см. blockTurnOk */
  turn?: BlockTurn;
  /** основные: когда засчитывается — см. primaryAtOk */
  at?: PrimaryAt;
  rows: CatalogRow[];
}
/**
 * конец вашего хода | конец вашей фазы командования | то же, в 5-м раунде — конец вашего хода | конец любого хода |
 * конец раунда (ход второго игрока; Agenda Dominatus) | конец битвы
 */
export type PrimaryAt = 'own-turn' | 'own-command' | 'own-command-r5-turn' | 'any-turn' | 'round-end' | 'battle-end';
/** own — ваш ход, opponent — ход противника, any — любой, opponent-or-r5 — ход противника или конец 5-го раунда (что раньше) */
export type BlockTurn = 'own' | 'opponent' | 'any' | 'opponent-or-r5';
export interface CatalogCard {
  id: string;
  name: string;
  type: 'primary' | 'secondary';
  you?: string;
  foe?: string;
  modes?: SecondaryMode[];
  /** правило «при взятии» есть на карте (подсказка и варианты на экране) */
  drawn?: string;
  /** правило «при взятии» обязательное */
  drawnRequired?: boolean;
  /** «при взятии» в виде данных — см. redrawWhenDrawn */
  onDraw?: { action: 'reshuffle' | 'discard' | 'note'; round1?: boolean; ifActive?: string; required?: boolean; confirm?: boolean };
  blocks: CatalogBlock[];
  /** Agenda кампании Dominatus: основная миссия альянса в фазе (только в режиме dominatus) */
  agenda?: boolean;
  alliance?: string;
  phase?: number;
}

/** Что движку нужно из dominatus.json (DM1). */
export interface DominatusCatalog {
  locations: { id: string; phase: number; rolls: [number, number] }[];
  alliances: string[];
  /** все карты улучшений (Battle Honour, Battle Skill, Relic) — проверка названий и повторов */
  upgrades: string[];
  limits: { upgradesPerBattle: number; upgradesTitangrave: number };
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
  /** данные Dominatus (нет — режим dominatus недоступен) */
  dominatus?: DominatusCatalog;
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
  /** тип армии, выбранный в ростере (английское название, как в ростере: «Take and Hold») — выбор по умолчанию */
  forceDisposition?: string | null;
  /** типы армий, которые дают детачменты ростера (id из battlefield.json) — из них игрок выбирает (G2.12) */
  dispositions?: string[];
  /** названия детачментов ростера — для показа */
  detachments?: string[];
  /** код ростера (WH1.…): ростер можно открыть в режиме мастера и передать второму телефону */
  code?: string;
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

/** Игрок в битве Dominatus. */
export interface DominatusPlayer {
  alliance: string | null;
  /** решение играть Agenda: null — не решено; Agenda действуют, только если оба true */
  attempt: boolean | null;
  /** id карты Agenda (dom-…) */
  agenda: string | null;
  /** улучшения: карта → отряд (название из ростера или вручную) */
  upgrades: { card: string; unit: string }[];
  /** после битвы: карт Agenda Achieved (null — ещё не отмечено) */
  achieved: 0 | 1 | 2 | null;
}

export interface DominatusState {
  phase: 1 | 2 | 3 | null;
  locationId: string | null;
  locationSource: Source | null;
  /** выпавшее на D6 (при случайном выборе) */
  locationRoll: number | null;
  locationDraws: number;
  players: Record<Seat, DominatusPlayer>;
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
    | { type: 'game-created'; schema: number; seed: string; names: Record<Seat, string>; /** нет — обычная игра */ mode?: GameMode }
    /** Dominatus: фаза кампании и локация (бросок D6 по seed или выбор Warmaster) */
    | { type: 'dom-location-set'; phase: 1 | 2 | 3; locationId: string; source: Source; roll?: RollRef }
    /** Dominatus: альянс, решение играть Agenda, выбранная Agenda, улучшения отрядов */
    | { type: 'dom-player-set'; target: Seat; patch: Partial<DominatusPlayer> }
    /** Dominatus, после битвы: сколько карт Agenda Achieved получил игрок (0–2) */
    | { type: 'dom-achieved'; target: Seat; cards: 0 | 1 | 2 }
    | { type: 'player-set'; target: Seat; patch: Partial<Pick<PlayerSetup, 'name' | 'roster' | 'disposition' | 'battleReady'>> }
    | { type: 'layout-set'; layoutId: string; source: Source; roll?: RollRef }
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
    | { type: 'battle-ended'; reason: 'rounds' | 'concede' | 'manual'; /** кто сдался (для concede) */ by?: Seat }
    | { type: 'event-reverted'; target: string }
  );

export type GameEventType = GameEvent['type'];

/** Событие без служебных полей (id, seq, at; seat — по желанию): то, что отправляет экран. */
export type EventBody = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'id' | 'seq' | 'at' | 'seat'> & { seat?: Seat | null } : never) : never;

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
  /** номер карты в порядке выхода из колоды (1, 2, …; только тактические) */
  n?: number;
  /** заметка «при взятии» (маяк, заманчивая цель …) */
  note?: string;
}

/** Карта ушла в сброс: сброс в конце хода (cp +1 или 0), замена за 1 CP (−1) или правило «при взятии». */
export interface DiscardEntry {
  id: string;
  round: Round;
  n?: number;
  why: 'discard' | 'swap' | 'when-drawn';
  /** изменение CP этим действием */
  cp: number;
}

export interface ScoredCard {
  id: string;
  round: Round;
  /** чей ход шёл, когда карта засчитана (вторичные считаются в конце хода любого игрока) */
  turn: Seat;
  /** номер карты в порядке выхода из колоды (тактические) */
  n?: number;
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
  /** сколько карт вышло из колоды за битву (последний номер n) */
  drawn: number;
  discarded: string[];
  /** сброшенные карты по порядку: когда, почему, CP */
  discardLog: DiscardEntry[];
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
  /** режим игры (DM1); у игр до DM1 — standard */
  mode: GameMode;
  /** состояние кампании Dominatus (только mode = dominatus) */
  dominatus: DominatusState | null;
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
  /** как определены роли и первый ход: бросок (random) или договорились (manual); null — ещё не определены */
  rolesSource: Source | null;
  firstTurnSource: Source | null;
  /** сколько раз раскладку уже тянули случайно (следующая случайная — с этим номером) */
  layoutDraws: number;
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
  /** кто сдался: решение владельца (G3.6) — победа достаётся сопернику независимо от ПО */
  concededBy: Seat | null;
  /** номер последнего применённого события */
  lastSeq: number;
  /** id отменённых событий */
  reverted: string[];
}

/** Результат применения события: новое состояние или понятная ошибка (на русском), без исключений. */
export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: string };
