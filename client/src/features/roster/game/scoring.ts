/**
 * Очки карт (G1.5: подсчёт строк карты; лимиты и итоги — G1.6).
 * Игрок отмечает выполненные строки карты (RowPick: блок, строка, сколько раз); очки считает движок по карте,
 * поэтому ни экран, ни второй телефон не могут прислать произвольное число.
 * Строки внутри блока: обычная — самостоятельная награда; «или» (or) — вместо строки выше, из цепочки
 * «строка + её или» засчитывается одна; «+» (plus) — сверх строки выше, не чаще её.
 */
import { ROUNDS, type CatalogBlock, type CatalogCard, type GameCatalog, type GameState, type PlayerTotals, type Round, type RowPick, type SecondaryMode, type Seat } from './types';

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
    if (!blockInRound(block.rounds, round, endOfBattle)) return { error: endOfBattle ? 'В конце битвы засчитываются только блоки «Конец битвы»' : 'Этот блок не действует в этом раунде' };
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
