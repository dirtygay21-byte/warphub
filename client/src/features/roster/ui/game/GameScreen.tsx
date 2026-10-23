import { useEffect, useState, type ReactNode } from 'react';
import type { DataIndex, Roster } from '../../engine/types';
import { currentSetupStep, setupSteps, totals, type SetupStepId } from '../../game';
import { pushOverlay } from '../../telegram';
import { Battlefield } from '../Battlefield';
import { Button, Icon, IconButton } from '../kit';
import { cx } from '../util';
import { rosterRef } from './players';
import { StepDispositions } from './StepDispositions';
import { StepLayout } from './StepLayout';
import { StepRoles } from './StepRoles';
import { StepSecondaries } from './StepSecondaries';
import { StepStart, Summary } from './StepStart';
import { StepPlayers } from './StepPlayers';
import { SecondaryCard } from './SecondaryCard';
import { useGame, type GameHook } from './useGame';

/**
 * «Начать игру»: подготовка к битве по шагам правил колоды миссий, затем трекер (G3).
 * Шаги: игроки, типы армий, раскладка, роли, вторичные, первый ход и начало битвы (StepBody); после начала — BattleStarted до трекера G3.
 * initialRosterId — ростер из меню «Начать игру с этим ростером»: он сразу выбирается первому игроку.
 */
export function GameScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: Roster[]; index: DataIndex; initialRosterId?: string }) {
  const game = useGame();
  const { data, loadError, state } = game;
  // ростер из меню «Начать игру с этим ростером» — первым событием подготовки
  const start = () => {
    const r = initialRosterId ? rosters.find((x) => x.id === initialRosterId) : undefined;
    game.newGame({}, r ? [{ type: 'player-set', target: 'p1', patch: { roster: rosterRef(r, 'own') } }] : []);
  };
  // просмотр поля боя открывается поверх игры: игра не теряется, «Назад» Telegram закрывает просмотр
  const [viewing, setViewing] = useState(false);
  useEffect(() => (viewing ? pushOverlay(() => setViewing(false)) : undefined), [viewing]);
  if (viewing) return <Battlefield onBack={() => setViewing(false)} />;

  if (loadError) {
    return (
      <Shell onBack={onBack}>
        <p className="mt-10 text-center text-sm text-white/50">{loadError}</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell onBack={onBack}>
        <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </Shell>
    );
  }

  return (
    <Shell onBack={onBack} undo={state && game.canUndo ? game.undo : undefined}>
      {!state ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="font-display text-xl font-semibold uppercase">Новая игра</p>
          <p className="mt-1 text-sm leading-snug text-white/60">
            Подготовка по шагам правил Chapter Approved 2026–27: игроки и ростеры, типы армий, раскладка, атакующий и защитник, вторичные миссии,
            первый ход. Затем — трекер партии.
          </p>
          <Button variant="primary" className="mt-3 w-full" onClick={start}>
            Начать подготовку
          </Button>
        </section>
      ) : (
        state.stage === 'setup' ? <Setup game={game} rosters={rosters} index={index} /> : <BattleStarted game={game} index={index} />
      )}

      {game.error && (
        <div className="sheet-enter fixed inset-x-0 bottom-0 z-40 border-t border-danger/40 bg-app-elevated px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-lg items-start gap-2">
            <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-danger" />
            <p className="min-w-0 flex-1 text-sm text-white/85">{game.error}</p>
            <IconButton icon="close" label="Закрыть" onClick={game.clearError} className="size-8" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setViewing(true)}
        className="mt-6 flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10"
      >
        <Icon name="map" className="size-5 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Поле боя</span>
          <span className="block text-[11px] text-white/45">Просмотр без игры: зоны деплоя и раскладки террейна</span>
        </span>
        <Icon name="chevron" className="size-4 text-white/40" />
      </button>
    </Shell>
  );
}

function Setup({ game, rosters, index }: { game: GameHook; rosters: Roster[]; index: DataIndex }) {
  const state = game.state!;
  const steps = setupSteps(state);
  const current = currentSetupStep(state);
  // открытый шаг: сначала «Игроки» (он не блокирует движок), дальше — первый несделанный
  const [open, setOpen] = useState<SetupStepId>('players');
  const reachable = (id: SetupStepId) => id === 'players' || steps.find((x) => x.id === id)!.done || id === current;
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Подготовка к битве</p>
        <p className="text-[11px] text-white/45">
          {doneCount} из {steps.length}
        </p>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => {
          const active = s.id === open;
          return (
            <li
              key={s.id}
              className={cx('rounded-2xl border px-3 py-2.5', active ? 'border-accent/60 bg-accent/[0.07]' : 'border-white/10 bg-white/[0.03]')}
            >
              <button
                type="button"
                disabled={!reachable(s.id) || active}
                onClick={() => setOpen(s.id)}
                className="flex w-full items-center gap-2.5 text-left disabled:cursor-default"
              >
                <span
                  className={cx(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    s.done ? 'bg-accent text-black' : active ? 'border border-accent text-accent' : 'border border-white/20 text-white/50',
                  )}
                >
                  {s.done ? <Icon name="check" className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cx('min-w-0 flex-1 text-sm font-semibold', !s.done && !active && 'text-white/60')}>{s.title}</span>
              </button>
              {active && <StepBody id={s.id} game={game} rosters={rosters} index={index} onNext={() => setOpen(currentSetupStep(state) ?? 'first-turn')} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Содержимое открытого шага. */
function StepBody({ id, game, rosters, index, onNext }: { id: SetupStepId; game: GameHook; rosters: Roster[]; index: DataIndex; onNext: () => void }) {
  if (id === 'players') return <StepPlayers game={game} rosters={rosters} index={index} onNext={onNext} />;
  if (id === 'dispositions') return <StepDispositions game={game} onNext={onNext} />;
  if (id === 'layout') return <StepLayout game={game} onNext={onNext} />;
  if (id === 'roles') return <StepRoles game={game} onNext={onNext} />;
  if (id === 'secondaries') return <StepSecondaries game={game} onNext={onNext} />;
  return <StepStart game={game} index={index} />;
}

/**
 * Битва началась: раунд, чей ход, CP и ПО игроков, сводка подготовки. Полноценный трекер (фазы, карты,
 * подсчёт) — этап G3; до него этот экран показывает, что подготовка записана и битва идёт.
 */
function BattleStarted({ game, index }: { game: GameHook; index: DataIndex }) {
  const state = game.state!;
  const catalog = game.data!.catalog;
  const active = state.activeSeat ? state.players[state.activeSeat].name : null;
  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{state.stage === 'finished' ? 'Битва окончена' : 'Битва идёт'}</p>
        <p className="font-display mt-1 text-2xl font-semibold uppercase leading-none">
          {state.stage === 'finished' ? 'Итог' : `Раунд ${state.round}`}
        </p>
        {active && <p className="mt-1 text-sm text-white/75">Ход: {active}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['p1', 'p2'] as const).map((s) => {
          const t = totals(state, s, catalog);
          return (
            <div key={s} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <p className="truncate text-[11px] text-white/45">{state.players[s].name}</p>
              <p className="font-display text-2xl font-semibold leading-none">{t.total} ПО</p>
              <p className="mt-1 text-[11px] text-white/55">CP: {state.players[s].cp}</p>
            </div>
          );
        })}
      </div>
      <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs leading-snug text-white/55">
        Трекер партии — фазы, карты вторичных, подсчёт очков — следующий этап (G3). Подготовка записана; «Отменить» вернёт начало битвы.
      </p>
      <p className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Вторичные миссии</p>
      {(['p1', 'p2'] as const).map((s) => (
        <SecondaryCard key={s} game={game} seat={s} />
      ))}
      <Summary game={game} index={index} />
    </section>
  );
}

function Shell({ onBack, undo, children }: { onBack: () => void; undo?: () => void; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-5 lg:max-w-4xl lg:pt-8">
      <header className="mb-4 flex items-end gap-3">
        <IconButton icon="back" label="Назад" onClick={onBack} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Chapter Approved 2026–27</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Начать игру</h1>
        </div>
        {undo && (
          <button type="button" onClick={undo} className="mb-0.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 active:bg-white/10">
            Отменить
          </button>
        )}
      </header>
      {children}
    </div>
  );
}
