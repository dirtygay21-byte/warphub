import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadIndex } from '../data';
import { loadRosters, saveRosters, markDeleted } from '../storage';
import { tg } from '../telegram';
import type { DataIndex, Roster } from '../engine/types';
import { RosterList } from './RosterList';
import { RosterEditor } from './RosterEditor';

type Route = { screen: 'list' } | { screen: 'editor'; id: string };

/** Roster Builder внутри WarpHub. onExit — вернуться в приложение (кнопка «Назад» на списке ростеров). */
export function RosterBuilder({ onExit }: { onExit: () => void }) {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Roster[] | null>(null);
  const [route, setRoute] = useState<Route>({ screen: 'list' });
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<Roster[] | null>(null);

  useEffect(() => {
    loadIndex().then(setIndex, (e) => setError(String(e.message ?? e)));
    loadRosters().then(setRosters);
  }, []);

  const persist = useCallback((list: Roster[]) => {
    pending.current = list;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      pending.current = null;
      saveRosters(list);
    }, 500);
  }, []);

  // при выходе из раздела сохраняем несохранённые изменения сразу
  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
      if (pending.current) saveRosters(pending.current);
    },
    [],
  );

  const update = useCallback(
    (fn: (list: Roster[]) => Roster[]) => {
      setRosters((prev) => {
        const next = fn(prev ?? []);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const goList = useCallback(() => setRoute({ screen: 'list' }), []);

  // кнопка «Назад» Telegram: из ростера — к списку, со списка — обратно в WarpHub
  useEffect(() => {
    if (!tg) return;
    const handler = route.screen === 'list' ? onExit : goList;
    tg.BackButton.show();
    tg.BackButton.onClick(handler);
    return () => {
      tg!.BackButton.offClick(handler);
      tg!.BackButton.hide();
    };
  }, [route, goList, onExit]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.screen]);

  if (error) {
    return (
      <Centered>
        <p className="font-display text-xl uppercase">Нет данных</p>
        <p className="mt-2 text-sm text-white/50">{error}</p>
        <button type="button" onClick={onExit} className="mt-5 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/80">
          Назад
        </button>
      </Centered>
    );
  }
  if (!index || !rosters) {
    return (
      <Centered>
        <div className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </Centered>
    );
  }

  if (route.screen === 'editor') {
    const roster = rosters.find((r) => r.id === route.id);
    if (roster) {
      return (
        <RosterEditor
          key={roster.id}
          roster={roster}
          index={index}
          onBack={goList}
          onChange={(r) => update((list) => list.map((x) => (x.id === r.id ? r : x)))}
          onDuplicate={(r) => {
            update((list) => [r, ...list]);
            setRoute({ screen: 'editor', id: r.id });
          }}
          onDelete={() => {
            markDeleted(roster.id);
            update((list) => list.filter((x) => x.id !== roster.id));
            goList();
          }}
        />
      );
    }
  }

  return (
    <RosterList
      onExit={onExit}
      index={index}
      rosters={rosters}
      onOpen={(id) => setRoute({ screen: 'editor', id })}
      onCreate={(r) => {
        update((list) => [r, ...list]);
        setRoute({ screen: 'editor', id: r.id });
      }}
      onDuplicate={(r) => update((list) => [r, ...list])}
      onDelete={(id) => {
        markDeleted(id);
        update((list) => list.filter((x) => x.id !== id));
      }}
    />
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">{children}</div>;
}
