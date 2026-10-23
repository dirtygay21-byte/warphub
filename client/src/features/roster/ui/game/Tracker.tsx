import { useState } from 'react';
import type { DataIndex } from '../../engine/types';
import { commandPhasePending, ROUNDS, totals, type Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button, Icon } from '../kit';
import { cx } from '../util';
import { AdjustSheet } from './Adjust';
import { CardLink } from './CardSheet';
import { CommandPhase } from './CommandPhase';
import { EndOfTurn } from './EndOfTurn';
import { EndEarly, Result } from './Result';
import { SecondaryCard } from './SecondaryCard';
import { Summary } from './StepStart';
import type { GameHook } from './useGame';

const STEP_RU = { start: 'Начало хода', command: 'Фаза командования', main: 'Ход идёт' } as const;

/**
 * Трекер битвы (G3.2): раунд и чей ход, шаг хода, кнопка следующего шага, счёт и CP обоих игроков, ПО по раундам,
 * карточки вторичных миссий, сводка подготовки. Действия фазы командования (G3.3) и подсчёт в конце хода (G3.4)
 * встают в отмеченные места. Каждое действие — событие движка; «Отменить» в шапке снимает последнее.
 */
export function Tracker({ game, index }: { game: GameHook; index: DataIndex }) {
  const state = game.state!;
  const finished = state.stage === 'finished';
  const active = state.activeSeat;
  const [summary, setSummary] = useState(false);
  const pending = state.step === 'command' && active ? commandPhasePending(state, active, game.data!.catalog) : null;
  const lastTurn = state.round === ROUNDS && active != null && active !== state.firstTurn;

  const next = () => {
    const body =
      state.step === 'start' ? { type: 'command-phase-started' as const } : state.step === 'command' ? { type: 'command-phase-ended' as const } : { type: 'turn-ended' as const };
    if (game.dispatch(body)) haptic.select();
  };
  const nextLabel =
    state.step === 'start' ? 'Начать фазу командования' : state.step === 'command' ? 'Завершить фазу командования' : lastTurn ? 'Завершить ход и битву' : 'Завершить ход';

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-2xl font-semibold uppercase leading-none">{finished ? 'Битва окончена' : `Раунд ${state.round} из ${ROUNDS}`}</p>
          {!finished && <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{STEP_RU[state.step]}</p>}
        </div>
        {!finished && active && (
          <p className="mt-1.5 text-sm">
            Ход: <span className={cx('font-semibold', roleText(state.players[active].role))}>{state.players[active].name}</span>
            <span className="text-white/45"> · {state.players[active].role === 'attacker' ? 'атакующий' : 'защитник'}</span>
          </p>
        )}
        <RoundDots round={state.round} finished={finished} />
      </div>

      {finished && <Result game={game} />}

      <Scoreboard game={game} />

      {!finished && (
        <>
          {state.step === 'command' && <CommandPhase game={game} />}
          {state.step === 'main' && <EndOfTurn game={game} />}
          <Button variant="primary" className="h-12 w-full" disabled={!!pending} onClick={next}>
            {nextLabel}
          </Button>
          {state.step === 'start' && <p className="text-center text-[11px] text-white/45">В начале фазы командования оба игрока получают 1 CP.</p>}
          <EndEarly game={game} />
        </>
      )}

      <RoundTable game={game} />

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Основные миссии</p>
        {(['p1', 'p2'] as Seat[]).map((s) => {
          const id = state.primary[s];
          const c = id ? game.data!.missions.cards.find((x) => x.id === id) : undefined;
          return (
            <p key={s} className="mt-1 flex items-baseline gap-1.5 text-sm">
              <span className={cx('shrink-0 font-semibold', roleText(state.players[s].role))}>{state.players[s].name}:</span>
              {c ? <CardLink id={c.id} seat={s} name={c.name} className="text-white/85" /> : '—'}
            </p>
          );
        })}
      </div>

      <p className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Вторичные миссии</p>
      {(['p1', 'p2'] as const).map((s) => (
        <SecondaryCard key={s} game={game} seat={s} />
      ))}

      <button
        type="button"
        onClick={() => setSummary((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-[13px] font-semibold active:bg-white/10"
      >
        Подготовка к битве
        <Icon name="down" className={cx('size-4 text-white/50 transition', summary && 'rotate-180')} />
      </button>
      {summary && <Summary game={game} index={index} />}
    </section>
  );
}

const roleText = (role: string | null) => (role === 'attacker' ? 'text-[#f87171]' : role === 'defender' ? 'text-[#60a5fa]' : 'text-accent');

function RoundDots({ round, finished }: { round: number; finished: boolean }) {
  return (
    <div className="mt-3 grid grid-cols-5 gap-1">
      {Array.from({ length: ROUNDS }, (_, i) => (
        <span key={i} className={cx('h-1.5 rounded-full', finished || i + 1 < round ? 'bg-accent' : i + 1 === round ? 'bg-accent/50' : 'bg-white/10')} />
      ))}
    </div>
  );
}

/** Счёт обоих игроков: всего ПО (основная, вторичные, Battle Ready), срезано лимитами, CP. */
function Scoreboard({ game }: { game: GameHook }) {
  const state = game.state!;
  const catalog = game.data!.catalog;
  const [open, setOpen] = useState<Seat | null>(null);
  return (
    <div className="grid grid-cols-2 gap-2">
      {open && <AdjustSheet game={game} seat={open} onClose={() => setOpen(null)} />}
      {(['p1', 'p2'] as Seat[]).map((s) => {
        const p = state.players[s];
        const t = totals(state, s, catalog);
        const cut = t.primary.cut + t.secondary.cut;
        return (
          <button
            key={s}
            type="button"
            onClick={() => setOpen(s)}
            className={cx('rounded-xl border bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10', state.activeSeat === s ? 'border-accent/50' : 'border-white/10')}
          >
            <span className={cx('block truncate text-[12px] font-semibold', roleText(p.role))}>{p.name}</span>
            <span className="block font-display mt-0.5 text-3xl font-semibold leading-none">
              {t.total}
              <span className="ml-1 text-sm text-white/50">ПО</span>
            </span>
            <span className="block mt-1 text-[11px] leading-snug text-white/55">
              основная {t.primary.total} · вторичные {t.secondary.total}
              {t.battleReady ? ` · покраска ${t.battleReady}` : ''}
            </span>
            {cut > 0 && <span className="block text-[11px] text-warn">сверх лимитов: {cut}</span>}
            <span className="mt-1.5 flex items-center justify-between gap-1">
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[12px] font-semibold">CP: {p.cp}</span>
              <span className="text-[11px] font-semibold text-accent/90">Изменить</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** ПО по раундам (после лимитов раунда): основная / вторичные для каждого игрока; «Конец» — ПО конца битвы. */
function RoundTable({ game }: { game: GameHook }) {
  const state = game.state!;
  const catalog = game.data!.catalog;
  const t = { p1: totals(state, 'p1', catalog), p2: totals(state, 'p2', catalog) };
  const caps = catalog.caps;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-2.5">
      <table className="w-full text-center text-[12px]">
        <thead>
          <tr className="text-white/45">
            <th className="pb-1 text-left font-semibold">ПО</th>
            {Array.from({ length: ROUNDS }, (_, i) => (
              <th key={i} className={cx('pb-1 font-semibold', i + 1 === state.round && state.stage === 'battle' && 'text-accent')}>
                {i + 1}
              </th>
            ))}
            <th className="pb-1 font-semibold">Конец</th>
          </tr>
        </thead>
        <tbody>
          {(['p1', 'p2'] as Seat[]).map((s) => (
            <tr key={s} className="border-t border-white/10">
              <td className={cx('max-w-[5.5rem] truncate py-1 text-left font-semibold', roleText(state.players[s].role))}>{state.players[s].name}</td>
              {t[s].primary.byRound.map((v, i) => (
                <td key={i} className="py-1 tabular-nums">
                  {v}
                  <span className="text-white/40">/{t[s].secondary.byRound[i]}</span>
                </td>
              ))}
              <td className="py-1 tabular-nums">{t[s].primary.end}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[10.5px] leading-snug text-white/40">
        основная / вторичные. Лимит за раунд: {caps.primaryRound} и {caps.secondaryRound}; за битву: {caps.primaryGame} и {caps.secondaryGame}.
      </p>
    </div>
  );
}
