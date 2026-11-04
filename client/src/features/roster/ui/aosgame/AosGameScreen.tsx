import { useCallback, useState } from 'react';
import type { AosIndex, AosRoster } from '../../aos/types';
import type { AosEventBody, AosSavedEntry } from '../../aosgame';
import { haptic } from '../../telegram';
import { OnlineBar, OnlineStart } from '../game/Online';
import { Button, Icon } from '../kit';
import { cx } from '../util';
import { GameErrorBar } from '../common/GameErrorBar';
import { GameShell } from '../common/GameShell';
import { SavedGamesFrame } from '../common/SavedGamesFrame';
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
  const initial = (): AosEventBody[] => {
    const r = initialRosterId ? rosters.find((x) => x.id === initialRosterId) : undefined;
    return r ? [{ type: 'player-set', target: 'p1', patch: { roster: rosterRefOf(r, 'own', index) } }] : [];
  };
  const start = () => game.newGame(initial());
  const startOnline = async () => {
    await game.startOnline(initial());
  };
  if (loadError) return <GameShell onBack={onBack} kicker="Age of Sigmar · GH 2026-27" title="Игра" className="pb-28"><p className="mt-10 text-center text-sm text-fg-3">Нет данных батлпака: {loadError}</p></GameShell>;
  if (!bp) {
    return (
      <GameShell onBack={onBack} kicker="Age of Sigmar · GH 2026-27" title="Игра" className="pb-28">
        <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </GameShell>
    );
  }
  return (
    <GameShell
      onBack={state || game.online ? game.closeGame : onBack}
      undo={state && game.canUndo ? game.undo : undefined}
      kicker="Age of Sigmar · GH 2026-27"
      title="Игра"
      className="pb-28"
    >
      <OnlineBar game={game} system="aos" />
      {game.online && !state ? (
        <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      ) : !state ? <StartCard game={game} onStart={start} onStartOnline={startOnline} /> : state.stage === 'setup' ? <AosSetup game={game} rosters={rosters} index={index} /> : <AosTracker game={game} />}
      {game.error && <GameErrorBar error={game.error} onClose={game.clearError} />}
      <p className="mt-6 text-[12px] leading-snug text-fg-3">
        Источник: {bp.title}. {bp.source.note}
      </p>
    </GameShell>
  );
}

function StartCard({ game, onStart, onStartOnline }: { game: AosGameHook; onStart: () => void; onStartOnline: () => Promise<void> }) {
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
          <span className="block text-[12px] text-fg-3">{count ? (unfinished ? `Незаконченных: ${unfinished}` : 'Все законченные') : 'Пока нет — начните новую игру'}</span>
        </span>
        <Icon name="chevron" className="size-4 text-fg-3" />
      </button>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="font-display text-xl font-semibold uppercase">Новая игра</p>
        <p className="mt-1 text-sm leading-snug text-fg-2">
          Подготовка по General’s Handbook 2026-27: игроки и ростеры, батлплан, атакующий и защитник, территория, карты боевых тактик. Затем — трекер раундов: priority,
          CP, кубы ярости, батлплан и тактики в конце хода. Игра сохраняется на этом телефоне после каждого действия.
        </p>
        <Button variant="primary" className="mt-3 w-full" onClick={onStart}>
          Начать подготовку
        </Button>
      </div>
      <OnlineStart game={game} onCreate={onStartOnline} busy={false} />
    </section>
  );
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function SavedList({ game, onClose }: { game: AosGameHook; onClose: () => void }) {
  const list = game.library ?? [];
  return (
    <SavedGamesFrame count={list.length} note="Игры хранятся на этом телефоне (до 20)." onClose={onClose}>
      <ul className="space-y-2">
        {list.map((e) => (
          <SavedRow key={e.key} entry={e} rounds={game.bp!.rounds} onOpen={() => void game.openSaved(e.key).then((ok) => ok && haptic.ok())} onRemove={() => game.removeSaved(e.key)} />
        ))}
      </ul>
    </SavedGamesFrame>
  );
}

function SavedRow({ entry, rounds, onOpen, onRemove }: { entry: AosSavedEntry; rounds: number; onOpen: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const s = entry.summary;
  const stage = s.stage === 'setup' ? 'Подготовка' : s.stage === 'finished' ? 'Битва окончена' : `Раунд ${s.round} из ${rounds}`;
  return (
    <li className={cx('rounded-2xl border bg-white/[0.03]', s.stage === 'finished' ? 'border-white/10' : 'border-accent/30')}>
      <button type="button" onClick={onOpen} className="w-full px-3 pb-2 pt-2.5 text-left active:bg-white/5">
        <span className="block text-[12px] text-fg-3">
          {fmtDate(entry.updatedAt)} · {stage} · {entry.online ? `2 телефона · ${entry.online.code}` : '1 телефон'}
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
        <span className="mt-0.5 block text-xs text-fg-2">{s.battleplan ? `Батлплан: ${s.battleplan}` : 'Батлплан ещё не выбран'}</span>
      </button>
      <div className="flex items-center justify-end gap-2 border-t border-white/5 px-3 py-1.5">
        {!confirm ? (
          <button type="button" onClick={() => setConfirm(true)} className="flex items-center gap-1 text-[12px] font-semibold text-fg-3 active:text-fg-2">
            <Icon name="trash" className="size-3.5" />
            Удалить
          </button>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-[12px] text-warn">{entry.online ? 'Игра останется на сервере, уберётся только ссылка.' : 'Игра будет удалена с телефона.'}</span>
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
