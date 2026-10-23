/**
 * Очки карт (G1.5: подсчёт строк карты; лимиты и итоги — G1.6).
 * Игрок отмечает выполненные строки карты (RowPick: блок, строка, сколько раз); очки считает движок по карте,
 * поэтому ни экран, ни второй телефон не могут прислать произвольное число.
 * Строки внутри блока: обычная — самостоятельная награда; «или» (or) — вместо строки выше, из цепочки
 * «строка + её или» засчитывается одна; «+» (plus) — сверх строки выше, не чаще её.
 */
import type { CatalogBlock, CatalogCard, Round, RowPick, SecondaryMode } from './types';

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
