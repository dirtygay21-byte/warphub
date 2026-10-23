/**
 * Колоды вторичных миссий (G1.4). Правила колоды миссий Chapter Approved 2026-27:
 * - у атакующего и защитника свои колоды из одних и тех же 18 карт;
 * - фиксированный режим: две выбранные карты активны всю битву;
 * - тактический: колода перемешана; в начале своей фазы командования игрок тянет две карты (предела руки нет);
 *   если в колоде меньше — тянет сколько осталось (так же считает трекер wh-rules.ru);
 * - правила «при взятии»: взять новую карту и вернуть эту в колоду с перемешиванием — или сбросить эту.
 * Порядок колоды — из seed игры (deckOrder), поэтому одинаковый журнал даёт одинаковые карты.
 */
import { deckOrder } from './rng';
import type { GameCatalog, GameState, PlayerState, Seat } from './types';

/** Сколько карт тянуть в начале фазы командования. */
export const DRAW_PER_COMMAND = 2;

/** id вторичных миссий в порядке каталога (основа колоды). */
export function secondaryIds(catalog: GameCatalog): string[] {
  return catalog.cards.filter((c) => c.type === 'secondary').map((c) => c.id);
}

/** Колода и активные карты игрока в начале битвы. */
export function initDecks(s: GameState, catalog: GameCatalog): void {
  const ids = secondaryIds(catalog);
  for (const seat of ['p1', 'p2'] as const) {
    const p = s.players[seat];
    p.discarded = [];
    p.discardLog = [];
    p.drawn = 0;
    p.scored = [];
    p.swapUsed = false;
    if (p.secondaryMode === 'fixed' && p.fixed) {
      p.deck = [];
      p.shuffles = 0;
      p.active = p.fixed.map((id) => ({ id, round: 1, source: 'manual' as const }));
    } else {
      p.deck = deckOrder(s.seed, seat, 0, ids);
      p.shuffles = 1;
      p.active = [];
    }
  }
}

/** Сколько карт игрок ещё может вытянуть сейчас (0 — не его фаза командования, не тактический режим или колода пуста). */
export function drawsLeft(s: GameState, seat: Seat): number {
  const p = s.players[seat];
  if (s.stage !== 'battle' || s.activeSeat !== seat || s.step !== 'command' || p.secondaryMode !== 'tactical') return 0;
  return Math.min(DRAW_PER_COMMAND - s.drawsThisPhase, p.deck.length);
}

/** Что вытянет случайная выдача сейчас (верх колоды) — для экрана и для события cards-drawn. */
export function nextDraw(s: GameState, seat: Seat): string[] {
  return s.players[seat].deck.slice(0, drawsLeft(s, seat));
}

/** Убрать карты из колоды и сделать активными. Ошибка — строкой. */
export function drawCards(s: GameState, seat: Seat, cards: string[], source: 'random' | 'manual'): string | null {
  const p = s.players[seat];
  if (p.secondaryMode !== 'tactical') return 'Карты тянут только в тактическом режиме';
  if (s.stage !== 'battle' || s.activeSeat !== seat || s.step !== 'command') return 'Карты тянут в начале своей фазы командования';
  const left = drawsLeft(s, seat);
  if (!cards.length) return 'Не выбраны карты';
  if (new Set(cards).size !== cards.length) return 'Одна и та же карта дважды';
  if (cards.length > left) return left ? `Можно вытянуть ещё ${left}` : 'В этой фазе карты уже вытянуты';
  if (source === 'random') {
    const top = p.deck.slice(0, cards.length);
    if (top.join('|') !== cards.join('|')) return 'Случайная выдача должна совпадать с верхом колоды';
  } else if (cards.some((c) => !p.deck.includes(c))) return 'Этой карты нет в колоде';
  p.deck = p.deck.filter((c) => !cards.includes(c));
  for (const id of cards) p.active.push({ id, round: s.round, source, n: ++p.drawn });
  s.drawsThisPhase += cards.length;
  return null;
}

/**
 * Правило «при взятии»: взять замену (верх колоды или выбранную вручную), а эту карту вернуть в колоду
 * с перемешиванием (shuffleBack) или сбросить. Только для карты, вытянутой в текущей фазе командования.
 */
export function redrawWhenDrawn(
  s: GameState,
  seat: Seat,
  card: string,
  replacement: string,
  shuffleBack: boolean,
  source: 'random' | 'manual',
  catalog: GameCatalog,
): string | null {
  const p = s.players[seat];
  const i = p.active.findIndex((a) => a.id === card);
  if (i < 0) return 'Этой карты нет среди активных';
  if (s.stage !== 'battle' || s.activeSeat !== seat || s.step !== 'command' || p.active[i]!.round !== s.round)
    return 'Правило «при взятии» действует сразу после взятия — в эту фазу командования';
  if (p.secondaryMode !== 'tactical') return 'Правило «при взятии» — только в тактическом режиме';
  const od = catalog.cards.find((c) => c.id === card)?.onDraw;
  if (!od) return 'У этой карты нет правила «при взятии»';
  if (od.action === 'note') return 'Правило этой карты — выбор при взятии, без замены';
  if (od.action === 'reshuffle' && !shuffleBack) return 'По карте эта карта возвращается в колоду и перемешивается';
  if (od.action === 'discard' && shuffleBack) return 'По карте эта карта сбрасывается';
  if (od.round1 && s.round !== 1) return 'Это правило «при взятии» действует только в первом раунде';
  if (od.ifActive && !p.active.some((a) => a.id === od.ifActive)) return 'Это правило «при взятии» действует, только если активна связанная карта';
  if (!p.deck.length) return 'В колоде не осталось карт для замены';
  if (source === 'random' && p.deck[0] !== replacement) return 'Случайная замена должна совпадать с верхом колоды';
  if (!p.deck.includes(replacement)) return 'Этой карты нет в колоде';
  const old = p.active[i]!;
  p.deck = p.deck.filter((c) => c !== replacement);
  p.active[i] = { id: replacement, round: s.round, source, n: ++p.drawn };
  if (shuffleBack) reshuffle(p, s.seed, [...p.deck, old.id]);
  else {
    p.discarded.push(old.id);
    p.discardLog.push({ id: old.id, round: s.round, ...(old.n != null ? { n: old.n } : {}), why: 'when-drawn', cp: 0 });
  }
  return null;
}

/**
 * Замена карты за 1 CP (один раз за битву): в конце своей фазы командования сбросить одну активную карту
 * и взять одну новую. Сброшенная карта в колоду не возвращается.
 */
export function swapCard(s: GameState, seat: Seat, card: string, replacement: string, shuffleBack: boolean, source: 'random' | 'manual'): string | null {
  const p = s.players[seat];
  if (p.secondaryMode !== 'tactical') return 'Замена — только в тактическом режиме';
  if (s.stage !== 'battle' || s.activeSeat !== seat || s.step !== 'command') return 'Замена — в конце своей фазы командования';
  if (p.swapUsed) return 'Замена за 1 CP уже использована в этой битве';
  if (p.cp < 1) return 'Для замены нужен 1 CP';
  if (shuffleBack) return 'При замене карта сбрасывается, а не возвращается в колоду';
  const i = p.active.findIndex((a) => a.id === card);
  if (i < 0) return 'Этой карты нет среди активных';
  if (!p.deck.length) return 'В колоде не осталось карт для замены';
  if (source === 'random' && p.deck[0] !== replacement) return 'Случайная замена должна совпадать с верхом колоды';
  if (!p.deck.includes(replacement)) return 'Этой карты нет в колоде';
  p.deck = p.deck.filter((c) => c !== replacement);
  const old = p.active[i]!;
  p.active[i] = { id: replacement, round: s.round, source, n: ++p.drawn };
  p.discarded.push(card);
  p.discardLog.push({ id: card, round: s.round, ...(old.n != null ? { n: old.n } : {}), why: 'swap', cp: -1 });
  p.cp -= 1;
  p.swapUsed = true;
  return null;
}

/**
 * Что мешает закончить фазу командования (G3.3): тактический игрок не взял карты, хотя колода не пуста;
 * обязательное «при взятии» (Defend Stronghold в 1-м раунде) не выполнено. null — можно.
 */
export function commandPhasePending(s: GameState, seat: Seat, catalog: GameCatalog): string | null {
  const p = s.players[seat];
  if (p.secondaryMode !== 'tactical') return null;
  const left = drawsLeft(s, seat);
  if (left > 0) return `Сначала возьмите карты вторичных миссий (ещё ${left})`;
  if (!p.deck.length) return null;
  for (const a of p.active) {
    const od = catalog.cards.find((c) => c.id === a.id)?.onDraw;
    if (od?.required && a.round === s.round && (!od.round1 || s.round === 1)) {
      const name = catalog.cards.find((c) => c.id === a.id)?.name ?? a.id;
      return `«${name}»: обязательное правило «при взятии» — возьмите новую карту`;
    }
  }
  return null;
}

/** Перемешать колоду игрока заново (каждое перемешивание — новый номер, свой порядок). */
function reshuffle(p: PlayerState, seed: string, cards: string[]): void {
  p.deck = deckOrder(seed, p.seat, p.shuffles, cards);
  p.shuffles += 1;
}

/** Заметка к активной карте («маяк» — такой-то отряд, заманчивая цель — такая-то). */
export function noteCard(s: GameState, seat: Seat, card: string, note: string): string | null {
  const a = s.players[seat].active.find((x) => x.id === card);
  if (!a) return 'Этой карты нет среди активных';
  const t = note.trim();
  if (t.length > 200) return 'Заметка длиннее 200 символов';
  a.note = t || undefined;
  return null;
}
