import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AosIndex, AosRoster } from '../../aos/types';
import type { AosEventBody, AosSavedEntry } from '../../aosgame';
import { haptic, pushOverlay } from '../../telegram';
import { Button, Icon, IconButton } from '../kit';
import { cx } from '../util';
import { AosSetup } from './AosSetup';
import { rosterRefOf } from './refs';
import { AosTracker } from './AosTracker';
import { useAosGame, type AosGameHook } from './useAosGame';

/**
 * «Начать игру» для Age of Sigmar (S6): подготовка по General's Handbook 2026-27 (ростеры, батлплан, роли, территория,
 * боевые тактики), затем трекер раундов (priority, CP, кубы ярости, батлплан и тактики в конце хода, итог).
 * Один телефон; игра сохраняется после каждого действия. initialRosterId — ростер из меню ростера (первому игроку).
 */
export function AosGameScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: AosRoster[]; index: AosIndex; initialRosterId?: string }) {
  const game = useAosGame();
  const { bp, loadError, state } = game;
  const start = () => {
    const r = initialRosterId ? rosters.find((x) => x.id === initialRosterId) : undefined;
    const initial: AosEventBody[] = r ? [{ type: 'player-set', target: 'p1', patch: { roster: rosterRefOf(r, 'own', index) } }] : [];
    game.newGame(initial);
  };
  if (loadError) return <Shell onBack={onBack}><p className="mt-10 text-center text-sm text-white/50">Нет данных батлпака: {loadError}</p></Shell>;
  if (!bp) {
    return (
      <Shell onBack={onBack}>
        <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </Shell>
    );
  }
  return (
    <Shell onBack={state ? game.closeGame : onBack} undo={state && game.canUndo ? game.undo : undefined}>
      {!state ? <StartCard game={game} onStart={start} /> : state.stage === 'setup' ? <AosSetup game={game} rosters={rosters} index={index} /> : <AosTracker game={game} />}
      {game.error && (
        <div className="sheet-enter fixed inset-x-0 bottom-0 z-40 border-t border-danger/40 bg-app-elevated px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-lg items-start gap-2">
            <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-danger" />
            <p className="min-w-0 flex-1 text-sm text-white/85">{game.error}</p>
            <IconButton icon="close" label="Закрыть" onClick={game.clearError} className="size-8" />
          </div>
        </div>
      )}
      <p className="mt-6 text-[11px] leading-snug text-white/35">
        Источник: {bp.title}. {bp.source.note}
      </p>
    </Shell>
  );
}

function Shell({ onBack, undo, children }: { onBack: () => void; undo?: () => void; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5">
      <header className="mb-4 flex items-end gap-3">
        <IconButton icon="back" label="Назад" onClick={onBack} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Age of Sigmar · GH 2026-27</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Игра</h1>
        </div>
        {undo && (
          <button type="button" onClick={undo} className="mb-0.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/75 active:bg-white/10">
            Отменить
          </button>
        )}
      </header>
      {children}
    </div>
  );
}

function StartCard({ game, onStart }: { game: AosGameHook; onStart: () => void }) {
  const [list, setList] = useState(false);
  const closeList = useCallback(() => setList(false), []);
  if (list) return <SavedList game={game} onClose={closeList} />;
  const count = game.library?.length ?? 0;
  const unfinished = game.library?.filter((e) => e.summary.stage !== 'finished').length ?? 0;
  return (
    <section className="space-y-3">
      <button type="button" onClick={() => setList(true)} className="flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-left active:bg-accent/15">
        <Icon name="book" className="size-5 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-semibold uppercase leading-tight">Сохранённые игры{count ? ` (${count})` : ''}</span>
          <span className="block text-[11px] text-white/55">{count ? (unfinished ? `Незаконченных: ${unfinished}` : 'Все законченные') : 'Пока нет — начните новую игру'}</span>
        </span>
        <Icon name="chevron" className="size-4 text-white/40" />
      </button>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="font-display text-xl font-semibold uppercase">Новая игра</p>
        <p className="mt-1 text-sm leading-snug text-white/60">
          Подготовка по General’s Handbook 2026-27: игроки и ростеры, батлплан, атакующий и защитник, территория, карты боевых тактик. Затем — трекер раундов: priority,
          CP, кубы ярости, батлплан и тактики в конце хода. Игра сохраняется на этом телефоне после каждого действия.
        </p>
        <Button variant="primary" className="mt-3 w-full" onClick={onStart}>
          Начать подготовку
        </Button>
        <p className="mt-2 text-[11px] text-white/40">Игра на двух телефонах для AoS — позже; сейчас — один телефон на двоих.</p>
      </div>
    </section>
  );
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function SavedList({ game, onClose }: { game: AosGameHook; onClose: () => void }) {
  useEffect(() => pushOverlay(onClose), [onClose]);
  const list = game.library ?? [];
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <IconButton icon="back" label="Назад" onClick={onClose} className="size-8" />
        <p className="font-display min-w-0 flex-1 text-xl font-semibold uppercase">Сохранённые игры</p>
        <span className="text-xs text-white/45">{list.length}</span>
      </div>
      {!list.length && <p className="py-6 text-center text-sm text-white/50">Сохранённых игр пока нет.</p>}
      <ul className="space-y-2">
        {list.map((e) => (
          <SavedRow key={e.key} entry={e} rounds={game.bp!.rounds} onOpen={() => game.openSaved(e.key) && haptic.ok()} onRemove={() => game.removeSaved(e.key)} />
        ))}
      </ul>
      <p className="pt-1 text-[11px] text-white/40">Игры хранятся на этом телефоне (до 20).</p>
    </section>
  );
}

function SavedRow({ entry, rounds, onOpen, onRemove }: { entry: AosSavedEntry; rounds: number; onOpen: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const s = entry.summary;
  const stage = s.stage === 'setup' ? 'Подготовка' : s.stage === 'finished' ? 'Битва окончена' : `Раунд ${s.round} из ${rounds}`;
  return (
    <li className={cx('rounded-2xl border bg-white/[0.03]', s.stage === 'finished' ? 'border-white/10' : 'border-accent/30')}>
      <button type="button" onClick={onOpen} className="w-full px-3 pb-2 pt-2.5 text-left active:bg-white/5">
        <span className="block text-[11px] text-white/45">
          {fmtDate(entry.updatedAt)} · {stage}
        </span>
        <span className="mt-1 flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {s.names.p1} — {s.names.p2}
          </span>
          {s.stage !== 'setup' && (
            <span className="font-display shrink-0 text-lg font-semibold tabular-nums">
              {s.score.p1} : {s.score.p2}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-white/65">{s.battleplan ? `Батлплан: ${s.battleplan}` : 'Батлплан ещё не выбран'}</span>
      </button>
      <div className="flex items-center justify-end gap-2 border-t border-white/5 px-3 py-1.5">
        {!confirm ? (
          <button type="button" onClick={() => setConfirm(true)} className="flex items-center gap-1 text-[11px] font-semibold text-white/45 active:text-white/70">
            <Icon name="trash" className="size-3.5" />
            Удалить
          </button>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-[11px] text-warn">Игра будет удалена с телефона.</span>
            <Button variant="danger" className="text-xs" onClick={onRemove}>
              Удалить
            </Button>
            <Button className="text-xs" onClick={() => setConfirm(false)}>
              Нет
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
