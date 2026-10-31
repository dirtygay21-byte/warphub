/**
 * Очки карт (G1.5: подсчёт строк карты; лимиты и итоги — G1.6).
 * Игрок отмечает выполненные строки карты (RowPick: блок, строка, сколько раз); очки считает движок по карте,
 * поэтому ни экран, ни второй телефон не могут прислать произвольное число.
 * Строки внутри блока: обычная — самостоятельная награда; «или» (or) — вместо строки выше, из цепочки
 * «строка + её или» засчитывается одна; «+» (plus) — сверх строки выше, не чаще её.
 */
import { ROUNDS, type BlockTurn, type PrimaryAt, type TurnStep, type CatalogBlock, type CatalogCard, type GameCatalog, type GameState, type PlayerTotals, type Round, type RowPick, type SecondaryMode, type Seat } from './types';

/** Подходит ли блок карты к раунду. 'end' — только конец битвы. */
export function blockInRound(rounds: string, round: Round, endOfBattle = false): boolean {
  if (rounds === 'end') return endOfBattle;
  if (endOfBattle) return false;
  if (rounds === 'any') return true;
  if (/^\d\+$/.test(rounds)) return round >= Number(rounds[0]);
  const range = /^(\d)[–-](\d)$/.exec(rounds);
  if (range) return round >= Number(range[1]) && round <= Number(range[2]);
  if (/^\d$/.test(rounds)) return round === Number(rounds);
  return false;
}

/**
 * Можно ли засчитать блок вторичной миссии в конце этого хода (G2.11a, правила колоды миссий: в конце каждого хода
 * засчитывают оба игрока, но карта указывает, чей ход). ownTurn — заканчивается ход владельца карты;
 * lastTurnOfBattle — последний ход 5-го раунда: для «хода противника или конца 5-го раунда» игрок, ходящий вторым,
 * засчитывает карту в конце своего хода (ход противника в 5-м раунде уже прошёл). Без turn — любой ход.
 */
export function blockTurnOk(turn: BlockTurn | undefined, ownTurn: boolean, lastTurnOfBattle: boolean): boolean {
  if (turn === 'own') return ownTurn;
  if (turn === 'opponent') return !ownTurn;
  if (turn === 'opponent-or-r5') return !ownTurn || lastTurnOfBattle;
  return true;
}

/**
 * Можно ли засчитать блок основной миссии сейчас (G3.1). end — битва окончена (только «Конец битвы»);
 * step — шаг хода (command — идёт фаза командования, main — после неё, до конца хода); ownTurn — ход владельца.
 * «Конец фазы командования» засчитывается, пока идёт ваша фаза командования; own-command-r5-turn в 5-м раунде —
 * в конце вашего хода. Без at — как раньше (по раундам блока).
 */
export function primaryAtOk(
  at: PrimaryAt | undefined,
  ctx: { end: boolean; step: TurnStep; ownTurn: boolean; round: Round; /** ход второго игрока раунда (DM1) */ lastTurnOfRound?: boolean },
): boolean {
  if (!at) return true;
  if (ctx.end) return at === 'battle-end';
  if (at === 'battle-end') return false;
  if (at === 'any-turn') return ctx.step === 'main';
  // конец раунда (Agenda Dominatus): после фаз хода игрока, ходящего вторым, — засчитывают оба
  if (at === 'round-end') return ctx.step === 'main' && !!ctx.lastTurnOfRound;
  if (!ctx.ownTurn) return false;
  if (at === 'own-turn') return ctx.step === 'main';
  if (at === 'own-command') return ctx.step === 'command';
  return ctx.round === ROUNDS ? ctx.step === 'main' : ctx.step === 'command';
}

/**
 * Контекст «когда засчитывается» для основной миссии игрока seat в текущем состоянии — один для движка и экранов.
 * lastTurnOfRound — идёт ход игрока, который ходит в раунде вторым (конец раунда — после его фаз).
 */
export function primaryContext(state: GameState, seat: Seat, end = false) {
  return {
    end,
    step: state.step,
    ownTurn: state.activeSeat === seat,
    round: (end ? ROUNDS : state.round) as Round,
    lastTurnOfRound: !!state.activeSeat && !!state.firstTurn && state.activeSeat !== state.firstTurn,
  };
}

/** Группа «или»: индекс первой строки цепочки, к которой относится строка. */
function orGroup(block: CatalogBlock, row: number): number {
  let i = row;
  while (i > 0 && block.rows[i]!.or) i--;
  return i;
}

/** Базовая строка для «+»: ближайшая выше, которая сама не «+». */
function plusBase(block: CatalogBlock, row: number): number {
  let i = row - 1;
  while (i > 0 && block.rows[i]!.plus) i--;
  return i;
}

export interface CardVpInput {
  card: CatalogCard;
  picks: RowPick[];
  round: Round;
  /** режим вторичных игрока: блоки с mode другого режима не засчитываются */
  mode?: SecondaryMode | null;
  endOfBattle?: boolean;
}

/** Очки за отмеченные строки карты (без лимитов раунда, битвы и карты — они в G1.6). Ошибка — строкой. */
export function cardVp({ card, picks, round, mode, endOfBattle = false }: CardVpInput): { vp: number } | { error: string } {
  if (!picks.length) return { error: 'Не отмечено ни одной строки' };
  const seen = new Set<string>();
  const groups = new Map<string, number>();
  const counts = new Map<string, number>();
  let vp = 0;
  for (const p of picks) {
    const block = card.blocks[p.block];
    const row = block?.rows[p.row];
    if (!block || !row) return { error: 'Такой строки на карте нет' };
    if (!Number.isInteger(p.count) || p.count < 1 || p.count > 99) return { error: 'Количество — целое число от 1' };
    const key = `${p.block}:${p.row}`;
    if (seen.has(key)) return { error: 'Строка отмечена дважды' };
    seen.add(key);
    if (block.mode && mode && block.mode !== mode) return { error: `Этот блок — для ${block.mode === 'fixed' ? 'фиксированного' : 'тактического'} режима` };
    if (!blockInRound(block.rounds, round, endOfBattle))
      return {
        error: endOfBattle
          ? 'В конце битвы засчитываются только блоки «Конец битвы»'
          : block.rounds === 'end'
            ? 'Этот блок засчитывается в конце битвы'
            : 'Этот блок не действует в этом раунде',
      };
    const g = `${p.block}:${orGroup(block, p.row)}`;
    if (groups.has(g)) return { error: 'Из строк, связанных «или», засчитывается одна' };
    groups.set(g, p.row);
    counts.set(key, p.count);
    vp += row.max != null ? Math.min(row.vp * p.count, row.max) : row.vp * p.count;
  }
  for (const p of picks) {
    const block = card.blocks[p.block]!;
    if (!block.rows[p.row]!.plus) continue;
    const base = counts.get(`${p.block}:${plusBase(block, p.row)}`);
    if (base == null) return { error: '«Сверх того» засчитывается только вместе со строкой выше' };
    if (p.count > base) return { error: '«Сверх того» — не чаще строки выше' };
  }
  return { vp };
}

/**
 * Итог битвы (G3.6): победитель по ПО (равенство — ничья). Если игрок сдался — победа сопернику независимо от ПО
 * (решение владельца, 23.10.2026: в источниках правила о сдаче нет, принято турнирное соглашение). null — битва идёт.
 */
export function battleResult(state: GameState, catalog: GameCatalog): { winner: Seat | null; by: 'vp' | 'concede'; totals: Record<Seat, number> } | null {
  if (state.stage !== 'finished') return null;
  const t = { p1: totals(state, 'p1', catalog).total, p2: totals(state, 'p2', catalog).total };
  if (state.concededBy) return { winner: state.concededBy === 'p1' ? 'p2' : 'p1', by: 'concede', totals: t };
  return { winner: t.p1 === t.p2 ? null : t.p1 > t.p2 ? 'p1' : 'p2', by: 'vp', totals: t };
}

/** ПО за полностью покрашенную армию (Battle Ready) — правила колоды миссий и трекер wh-rules.ru. */
export const BATTLE_READY_VP = 10;

const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));

/**
 * Итоги игрока с лимитами правил колоды миссий (лимиты — из каталога, т. е. из missions.json):
 * основная — не больше primaryRound за раунд и primaryGame за битву; ПО «в конце битвы» вне лимита раунда
 * (если endOfBattleOutsideRoundCap), но в лимите битвы;
 * вторичные — фиксированная карта не больше fixedSecondaryCard за битву (по порядку засчитывания),
 * затем не больше secondaryRound за раунд и secondaryGame за битву;
 * поправки (vp-adjusted) входят в свой раунд до лимитов.
 */
export function totals(state: GameState, seat: Seat, catalog: GameCatalog): PlayerTotals {
  const p = state.players[seat];
  const caps = catalog.caps;
  const adj = (kind: 'primary' | 'secondary', r: number) => p.adjustments.filter((a) => a.kind === kind && a.round === r).reduce((t, a) => t + a.delta, 0);

  // основная миссия
  const endRaw = p.primaryScored.filter((e) => e.end).reduce((t, e) => t + e.vp, 0);
  const endOutside = caps.endOfBattleOutsideRoundCap !== false;
  const pRaw: number[] = [];
  const pByRound: number[] = [];
  for (let r = 1; r <= ROUNDS; r++) {
    let raw = p.primaryScored.filter((e) => !e.end && e.round === r).reduce((t, e) => t + e.vp, 0) + adj('primary', r);
    if (!endOutside && r === ROUNDS) raw += endRaw;
    pRaw.push(raw);
    pByRound.push(clamp(raw, caps.primaryRound));
  }
  const pEnd = endOutside ? Math.max(0, endRaw) : 0;
  const pSum = pByRound.reduce((t, v) => t + v, 0) + pEnd;
  const pTotal = Math.min(pSum, caps.primaryGame);
  const pAll = pRaw.reduce((t, v) => t + Math.max(0, v), 0) + pEnd;

  // вторичные
  const fixedCap = p.secondaryMode === 'fixed' ? (caps.fixedSecondaryCard ?? Infinity) : Infinity;
  const byFixedCard: Record<string, number> = {};
  const sRawRound = new Array(ROUNDS).fill(0) as number[];
  const sAfterCard = new Array(ROUNDS).fill(0) as number[];
  for (const e of p.scored) {
    sRawRound[e.round - 1]! += e.vp;
    let take = e.vp;
    if (p.secondaryMode === 'fixed') {
      const used = byFixedCard[e.id] ?? 0;
      take = Math.max(0, Math.min(e.vp, fixedCap - used));
      byFixedCard[e.id] = used + take;
    }
    sAfterCard[e.round - 1]! += take;
  }
  const sByRound = sAfterCard.map((v, i) => clamp(v + adj('secondary', i + 1), caps.secondaryRound));
  const sTotal = Math.min(sByRound.reduce((t, v) => t + v, 0), caps.secondaryGame);
  const sAll = sRawRound.reduce((t, v, i) => t + Math.max(0, v + adj('secondary', i + 1)), 0);

  const battleReady = p.battleReady ? BATTLE_READY_VP : 0;
  return {
    primary: { byRound: pByRound, end: pEnd, total: pTotal, cut: Math.max(0, pAll - pTotal) },
    secondary: { byRound: sByRound, byFixedCard, total: sTotal, cut: Math.max(0, sAll - sTotal) },
    battleReady,
    total: pTotal + sTotal + battleReady,
  };
}
