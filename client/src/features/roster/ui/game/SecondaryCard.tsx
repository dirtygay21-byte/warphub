import { useState, type ReactNode } from 'react';
import type { MissionBlock, MissionCard } from '../../data';
import { totals, type Seat } from '../../game';
import { Icon } from '../kit';
import { cx } from '../util';
import { CardLink } from './CardSheet';
import { useOpenCard } from './cardViewer';
import type { GameHook } from './useGame';

/** В конце чьего хода засчитывается блок (поле turn из missions.json, G2.11a). */
const TURN_RU: Record<NonNullable<MissionBlock['turn']>, [full: string, short: string]> = {
  own: ['Конец вашего хода', 'ваш ход'],
  opponent: ['Конец хода противника', 'ход противника'],
  any: ['Конец любого хода', 'любой ход'],
  'opponent-or-r5': ['Ход противника или конец 5-го раунда', 'ход противника / 5-й раунд'],
};
const ROUNDS_FROM: Record<string, string> = { '2+': 'с 2-го раунда', '4+': 'с 4-го раунда', '1': 'только 1-й раунд', '5': 'только 5-й раунд' };

/** Блоки карты для режима игрока (у карт с двумя режимами — свои блоки). */
const blocksFor = (card: MissionCard, mode: 'fixed' | 'tactical') => card.blocks.filter((b) => !b.mode || b.mode === mode);
const turnsOf = (card: MissionCard, mode: 'fixed' | 'tactical') => [...new Set(blocksFor(card, mode).map((b) => b.turn ?? 'any'))];
const roundsOf = (card: MissionCard, mode: 'fixed' | 'tactical') => [...new Set(blocksFor(card, mode).map((b) => ROUNDS_FROM[b.rounds]).filter(Boolean))];

/**
 * Вторичные миссии игрока (G2.11b): роль (атакующий — красный, защитник — синий), режим, карты.
 * Фиксированные — две карты на всю битву с ПО из лимита 20. Тактические — счётчики колоды, активные карты по порядку
 * выхода из колоды (№), когда взята, когда засчитывается, «при взятии»; история выполненных и сброшенных; все карты
 * колоды по алфавиту (порядок колоды не показывается). hidden — до раскрытия выбор не виден.
 * Всё состояние — из движка, поэтому трекер G3 добавляет только действия.
 */
export function SecondaryCard({ game, seat, hidden = false }: { game: GameHook; seat: Seat; hidden?: boolean }) {
  const state = game.state!;
  const p = state.players[seat];
  const role = p.role;
  const mode = p.secondaryMode;
  const tone = role === 'attacker' ? 'atk' : role === 'defender' ? 'def' : null;
  return (
    <section
      className={cx(
        'overflow-hidden rounded-2xl border bg-white/[0.03]',
        tone === 'atk' ? 'border-[#f87171]/45' : tone === 'def' ? 'border-[#60a5fa]/45' : 'border-white/10',
      )}
    >
      <header className={cx('flex items-center gap-2.5 px-3 py-2.5', tone === 'atk' ? 'bg-[#f87171]/10' : tone === 'def' ? 'bg-[#60a5fa]/10' : 'bg-white/[0.04]')}>
        {role && (
          <span
            className={cx(
              'rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider',
              tone === 'atk' ? 'bg-[#f87171]/20 text-[#f87171]' : 'bg-[#60a5fa]/20 text-[#60a5fa]',
            )}
          >
            {role === 'attacker' ? 'Атакующий' : 'Защитник'}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
        <span className={cx('text-xs font-semibold', hidden || !mode ? 'text-white/45' : 'text-accent')}>
          {hidden ? (mode ? 'выбрано' : 'не выбрано') : mode === 'fixed' ? 'Фиксированные' : mode === 'tactical' ? 'Тактические' : '—'}
        </span>
      </header>
      {hidden ? (
        <p className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-white/50">
          <Icon name="lock" className="size-4" />
          Выбор скрыт до раскрытия
        </p>
      ) : mode === 'fixed' ? (
        <Fixed game={game} seat={seat} />
      ) : mode === 'tactical' ? (
        <Tactical game={game} seat={seat} />
      ) : null}
    </section>
  );
}

function Fixed({ game, seat }: { game: GameHook; seat: Seat }) {
  const state = game.state!;
  const { missions, catalog } = game.data!;
  const p = state.players[seat];
  const cap = missions.caps.fixedSecondaryCard;
  const t = state.stage === 'setup' ? null : totals(state, seat, catalog);
  return (
    <div className="space-y-2 p-3">
      {(p.fixed ?? []).map((id) => {
        const card = missions.cards.find((c) => c.id === id);
        if (!card) return null;
        const vp = t?.secondary.byFixedCard[id] ?? 0;
        return (
          <CardRow key={id} card={card} seat={seat} mode="fixed">
            <Chip>Активна всю битву</Chip>
            {cap != null && (
              <Chip>
                {vp} / {cap} ПО
              </Chip>
            )}
          </CardRow>
        );
      })}
      <p className="text-[11.5px] leading-snug text-white/50">
        Сбросить нельзя.{cap != null ? ` С одной карты — не больше ${cap} ПО;` : ''} вторичные — не больше {missions.caps.secondaryRound} ПО за раунд и{' '}
        {missions.caps.secondaryGame} за битву.
      </p>
    </div>
  );
}

function Tactical({ game, seat }: { game: GameHook; seat: Seat }) {
  const state = game.state!;
  const { missions } = game.data!;
  const p = state.players[seat];
  const all = missions.cards.filter((c) => c.type === 'secondary');
  const battle = state.stage !== 'setup';
  const [history, setHistory] = useState(false);
  const [deck, setDeck] = useState(false);
  const byId = (id: string) => missions.cards.find((c) => c.id === id);
  const active = [...p.active].sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  // история по порядку выхода из колоды: выполненные и сброшенные
  const past = [
    ...p.scored.map((x) => ({ id: x.id, n: x.n, round: x.round, text: `выполнена · р. ${x.round} · ${x.vp} ПО` })),
    ...p.discardLog.map((d) => ({
      id: d.id,
      n: d.n,
      round: d.round,
      text: `${d.why === 'swap' ? 'заменена' : d.why === 'when-drawn' ? 'сброшена при взятии' : 'сброшена'} · р. ${d.round}${d.cp ? ` · ${d.cp > 0 ? '+' : '−'}${Math.abs(d.cp)} CP` : ''}`,
    })),
  ].sort((a, b) => (a.n ?? 0) - (b.n ?? 0) || a.round - b.round);
  const status = (id: string) =>
    !battle ? null : p.active.some((a) => a.id === id) ? 'активна' : p.scored.some((x) => x.id === id) ? 'выполнена' : p.discarded.includes(id) ? 'сброшена' : null;

  return (
    <div className="p-3">
      <div className="grid grid-cols-4 gap-1.5">
        <Stat value={battle ? p.deck.length : all.length} label="в колоде" />
        <Stat value={p.active.length} label="активны" />
        <Stat value={p.scored.length} label="выполнены" />
        <Stat value={p.discarded.length} label="сброшены" />
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-white/50">
        {all.length} карт, одинаковых у атакующего и защитника. Колода перемешана, порядок скрыт. В начале каждой своей фазы командования — 2 карты
        сверху колоды. Карта активна до выполнения или сброса, предела руки нет.
      </p>

      {active.length > 0 && (
        <div className="mt-2 space-y-2">
          {active.map((a) => {
            const card = byId(a.id);
            if (!card) return null;
            return (
              <CardRow key={a.id} card={card} seat={seat} mode="tactical" n={a.n} note={a.note} showDrawn>
                <Chip>Взята: раунд {a.round}, ваш ход</Chip>
              </CardRow>
            );
          })}
          <p className="text-[11px] text-white/45">№ — порядок, в котором карты вышли из колоды.</p>
        </div>
      )}

      {past.length > 0 && (
        <>
          <Toggle open={history} onClick={() => setHistory((v) => !v)}>
            История: выполнены {p.scored.length} · сброшены {p.discarded.length}
          </Toggle>
          {history && (
            <ul className="mt-1.5 space-y-1.5">
              {past.map((x, i) => (
                <li key={`${x.id}-${i}`} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2">
                  <span className="w-7 shrink-0 text-[11px] font-semibold text-white/45">{x.n != null ? `№${x.n}` : ''}</span>
                  <CardLink id={x.id} seat={seat} name={byId(x.id)?.name ?? x.id} className="flex-1 text-sm font-semibold" />
                  <span className="shrink-0 text-[11px] text-white/50">{x.text}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Toggle open={deck} onClick={() => setDeck((v) => !v)}>
        Все карты колоды ({all.length})
      </Toggle>
      {deck && <DeckList cards={all} status={status} seat={seat} />}
    </div>
  );
}

/** Все карты тактической колоды по алфавиту (не в порядке колоды): когда засчитывается, отметка, текст карты. */
export function DeckList({ cards, status, seat }: { cards: MissionCard[]; status?: (id: string) => string | null; seat?: Seat }) {
  const open = useOpenCard();
  const sorted = [...cards].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <ul className="mt-1.5 space-y-1.5">
      {sorted.map((c) => {
        const st = status?.(c.id);
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => open?.(c.id, seat)}
              className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left active:bg-white/10"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="block text-[11px] text-white/45">{turnsOf(c, 'tactical').map((t) => TURN_RU[t][1]).join(' · ')}</span>
              </span>
              {st && <span className="shrink-0 text-[11px] text-accent/90">{st}</span>}
              <Icon name="info" className="size-4 shrink-0 text-accent/80" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Карта игрока: номер, название, когда засчитывается, раунды, «при взятии», заметка; раскрывается в текст карты. */
function CardRow({
  card,
  seat,
  mode,
  n,
  note,
  showDrawn,
  children,
}: {
  card: MissionCard;
  seat: Seat;
  mode: 'fixed' | 'tactical';
  n?: number;
  note?: string;
  showDrawn?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <div className="flex w-full items-baseline gap-2">
        {n != null && <span className="shrink-0 text-[11px] font-semibold text-white/45">№{n}</span>}
        <CardLink id={card.id} seat={seat} name={card.name} className="flex-1 text-sm font-bold" />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {children}
        {turnsOf(card, mode).map((t) => (
          <Chip key={t} tone="accent">
            {TURN_RU[t][0]}
          </Chip>
        ))}
        {roundsOf(card, mode).map((r) => (
          <Chip key={r}>{r}</Chip>
        ))}
      </div>
      {showDrawn && card.drawn && (
        <p className="mt-1.5 text-[12px] leading-snug text-white/70">
          <span className={cx('font-semibold', card.drawnRequired ? 'text-warn' : 'text-white/50')}>
            {card.drawnRequired ? 'Когда взята — обязательно: ' : 'Когда взята: '}
          </span>
          {card.drawn}
        </p>
      )}
      {note && (
        <p className="mt-1 text-[12px] text-white/70">
          <span className="font-semibold text-white/50">Заметка: </span>
          {note}
        </p>
      )}
    </div>
  );
}

function Chip({ tone, children }: { tone?: 'accent'; children: ReactNode }) {
  return (
    <span className={cx('rounded-full border px-2 py-0.5 text-[11px]', tone === 'accent' ? 'border-accent/40 text-accent' : 'border-white/15 text-white/75')}>
      {children}
    </span>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 px-1 py-1.5 text-center">
      <span className="font-display block text-xl font-semibold leading-none">{value}</span>
      <span className="text-[10.5px] text-white/50">{label}</span>
    </div>
  );
}

function Toggle({ open, onClick, children }: { open: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-[13px] font-semibold active:bg-white/10"
    >
      {children}
      <Icon name="down" className={cx('size-4 text-white/50 transition', open && 'rotate-180')} />
    </button>
  );
}
