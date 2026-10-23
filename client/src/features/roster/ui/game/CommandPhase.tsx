import { useState } from 'react';
import type { MissionCard } from '../../data';
import { blockInRound, commandPhasePending, nextDraw, primaryAtOk, type Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button } from '../kit';
import { cx } from '../util';
import { CardLink } from './CardSheet';
import { ScoreRows } from './ScoreRows';
import type { GameHook } from './useGame';

/**
 * Фаза командования активного игрока (G3.3), по правилам колоды миссий:
 * 1) тактический игрок берёт 2 карты сверху колоды (обязательно; меньше, если колода кончается);
 * 2) правила «при взятии» по данным карты: вернуть в колоду и перемешать / сбросить и взять новую (обязательно или по желанию),
 *    выбор (маяк, цель, охрана) — заметкой;
 * 3) один раз за битву — замена карты за 1 CP в конце фазы командования;
 * 4) блоки основной миссии «конец вашей фазы командования».
 * Всё проверяет движок; пока что-то обязательное не сделано, фазу не закончить (commandPhasePending).
 */
export function CommandPhase({ game }: { game: GameHook }) {
  const state = game.state!;
  const { catalog, missions } = game.data!;
  const seat = state.activeSeat!;
  const p = state.players[seat];
  const card = (id: string) => missions.cards.find((c) => c.id === id);
  const top = nextDraw(state, seat);
  const pending = commandPhasePending(state, seat, catalog);
  const drawnNow = p.secondaryMode === 'tactical' ? [...p.active].filter((a) => a.round === state.round).sort((a, b) => (a.n ?? 0) - (b.n ?? 0)) : [];
  const noteCards = p.active.filter((a) => card(a.id)?.onDraw?.action === 'note');

  const draw = () => {
    if (game.dispatch({ type: 'cards-drawn', target: seat, cards: top, source: 'random' })) haptic.ok();
  };

  return (
    <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Фаза командования · {p.name}</p>
      <p className="text-xs text-white/55">Оба игрока получили 1 CP.</p>

      {p.secondaryMode === 'fixed' && <p className="text-sm text-white/70">Фиксированные вторичные — карты не берутся.</p>}
      {p.secondaryMode === 'tactical' &&
        (top.length ? (
          <Button variant="primary" className="h-12 w-full" onClick={draw}>
            Взять {top.length === 1 ? '1 карту' : `${top.length} карты`} вторичных миссий
          </Button>
        ) : (
          !drawnNow.length && !p.deck.length && <p className="text-sm text-white/60">Колода пуста — брать нечего.</p>
        ))}

      {drawnNow.map((a) => {
        const c = card(a.id);
        return c ? <DrawnCard key={a.id} game={game} seat={seat} card={c} n={a.n} /> : null;
      })}

      {noteCards.length > 0 && (
        <div className="space-y-2">
          {noteCards.map((a) => (
            <NoteEditor key={a.id} game={game} seat={seat} cardId={a.id} name={card(a.id)?.name ?? a.id} rule={card(a.id)?.drawn ?? ''} value={a.note ?? ''} />
          ))}
        </div>
      )}

      {p.secondaryMode === 'tactical' && !top.length && <Swap game={game} seat={seat} />}

      <PrimaryNow game={game} seat={seat} />

      {pending && <p className="rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-2 text-xs text-warn">{pending}</p>}
    </div>
  );
}

/** Карта, взятая в эту фазу: правило «при взятии» кнопкой, если оно меняет карту. */
function DrawnCard({ game, seat, card, n }: { game: GameHook; seat: Seat; card: MissionCard; n?: number }) {
  const state = game.state!;
  const p = state.players[seat];
  const od = card.onDraw;
  const swap = od && od.action !== 'note' ? od : null;
  const blocked = swap
    ? swap.round1 && state.round !== 1
      ? 'только в 1-м раунде'
      : swap.ifActive && !p.active.some((a) => a.id === swap.ifActive)
        ? `только если активна «${game.data!.missions.cards.find((c) => c.id === swap.ifActive)?.name ?? swap.ifActive}»`
        : !p.deck.length
          ? 'колода пуста'
          : null
    : null;
  const act = () => {
    if (!swap) return;
    const ok = game.dispatch({
      type: 'card-redrawn',
      target: seat,
      card: card.id,
      replacement: p.deck[0]!,
      reason: 'when-drawn',
      shuffleBack: swap.action === 'reshuffle',
      source: 'random',
    });
    if (ok) haptic.ok();
  };
  return (
    <div className={cx('rounded-xl border px-3 py-2.5', swap?.required && !blocked ? 'border-warn/50 bg-warn/[0.06]' : 'border-white/10 bg-black/20')}>
      <p className="flex items-baseline text-sm font-bold">
        {n != null && <span className="mr-1.5 shrink-0 text-[11px] font-semibold text-white/45">№{n}</span>}
        <CardLink id={card.id} seat={seat} name={card.name} />
      </p>
      {card.drawn && <p className="mt-1 text-[12px] leading-snug text-white/70">{card.drawn}</p>}
      {swap && (
        <>
          <Button variant={swap.required && !blocked ? 'primary' : 'ghost'} className="mt-2 w-full" disabled={!!blocked} onClick={act}>
            {swap.action === 'reshuffle' ? 'Взять новую, эту — в колоду' : swap.confirm ? 'Условие выполнено — сбросить и взять новую' : 'Сбросить и взять новую'}
            {swap.required ? ' (обязательно)' : ''}
          </Button>
          {blocked && <p className="mt-1 text-[11px] text-white/45">Сейчас нельзя: {blocked}.</p>}
          {swap.confirm && !blocked && <p className="mt-1 text-[11px] text-white/45">Условие проверяете вы — по желанию.</p>}
        </>
      )}
    </div>
  );
}

/** Выбор по карте (маяк, заманчивая цель, охрана) — заметка к активной карте. */
function NoteEditor({ game, seat, cardId, name, rule, value }: { game: GameHook; seat: Seat; cardId: string; name: string; rule: string; value: string }) {
  const [text, setText] = useState(value);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-sm font-semibold">
        <CardLink id={cardId} seat={seat} name={name}>
          {name}: выбор
        </CardLink>
      </p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-white/55">{rule}</p>
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder="Что выбрано"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-sm outline-none focus:border-accent"
        />
        <Button
          disabled={text.trim() === value.trim()}
          onClick={() => {
            if (game.dispatch({ type: 'card-noted', target: seat, card: cardId, note: text })) haptic.select();
          }}
        >
          Сохранить
        </Button>
      </div>
    </div>
  );
}

/** Замена за 1 CP — один раз за битву, в конце своей фазы командования; сброшенная карта в колоду не возвращается. */
function Swap({ game, seat }: { game: GameHook; seat: Seat }) {
  const state = game.state!;
  const p = state.players[seat];
  const [pick, setPick] = useState<string | null>(null);
  if (p.swapUsed) return <p className="text-[11px] text-white/45">Замена за 1 CP в этой битве уже использована.</p>;
  if (!p.active.length || !p.deck.length) return null;
  const name = (id: string) => game.data!.missions.cards.find((c) => c.id === id)?.name ?? id;
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-sm font-semibold">Заменить карту за 1 CP</p>
      <p className="text-[11px] text-white/50">Один раз за битву: сбросить активную карту и взять новую сверху колоды. CP: {p.cp}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.active.map((a) => (
          <span key={a.id} className={cx('inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1', pick === a.id ? 'border-accent bg-accent/15 text-accent' : 'border-white/15 text-white/75')}>
            <button type="button" onClick={() => setPick(pick === a.id ? null : a.id)} className="py-1 text-xs font-semibold">
              {name(a.id)}
            </button>
            <CardLink id={a.id} seat={seat} name={name(a.id)} className="py-1 pr-1">
              {''}
            </CardLink>
          </span>
        ))}
      </div>
      <Button
        className="mt-2 w-full"
        disabled={!pick || p.cp < 1}
        onClick={() => {
          const ok = game.dispatch({ type: 'card-redrawn', target: seat, card: pick!, replacement: p.deck[0]!, reason: 'swap', shuffleBack: false, source: 'random' });
          if (ok) {
            haptic.ok();
            setPick(null);
          }
        }}
      >
        {p.cp < 1 ? 'Нужен 1 CP' : 'Заменить за 1 CP'}
      </Button>
    </div>
  );
}

/** Блоки основной миссии, которые засчитываются сейчас (в фазе командования — «конец вашей фазы командования»). */
function PrimaryNow({ game, seat }: { game: GameHook; seat: Seat }) {
  const state = game.state!;
  const { missions } = game.data!;
  const id = state.primary[seat];
  const card = missions.cards.find((c) => c.id === id);
  if (!card) return null;
  const ctx = { end: false, step: state.step, ownTurn: true, round: state.round };
  const done = state.players[seat].primaryScored.filter((x) => !x.end && x.round === state.round && x.turn === seat).flatMap((x) => x.picks.map((k) => k.block));
  const blocks = card.blocks
    .map((b, i) => [b, i] as const)
    .filter(([b, i]) => blockInRound(b.rounds, state.round) && primaryAtOk(b.at, ctx) && !done.includes(i))
    .map(([, i]) => i);
  if (!blocks.length) return null;
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/[0.05] px-3 py-2.5">
      <p className="text-sm font-semibold">
        <CardLink id={card.id} seat={seat} name={card.name}>
          Основная миссия: {card.name}
        </CardLink>
      </p>
      <div className="mt-2">
        <ScoreRows
          card={card}
          blocks={blocks}
          round={state.round}
          label="Засчитать основную"
          onScore={(picks) => {
            const ok = game.dispatch({ type: 'primary-scored', target: seat, picks });
            if (ok) haptic.ok();
            return ok;
          }}
        />
      </div>
    </div>
  );
}
