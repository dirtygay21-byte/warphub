import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadIndex } from '../data';
import { loadRosters, saveLocal, saveRosters, markDeleted } from '../storage';
import { closeTopOverlay, tg } from '../telegram';
import type { DataIndex, Roster } from '../engine/types';
import { RosterList } from './RosterList';
import { RosterEditor } from './RosterEditor';
import { Battlefield } from './Battlefield';
import { Rules } from './Rules';

type Route =
  | { screen: 'list' }
  | { screen: 'editor'; id: string }
  | { screen: 'rules'; back: Route; factionId?: string; detachmentIds?: string[] }
  | { screen: 'battlefield'; back: Route; disposition?: string | null };

/** Roster Builder внутри WarpHub. onExit — вернуться в приложение (кнопка «Назад» на списке ростеров). */
export function RosterBuilder({ onExit }: { onExit: () => void }) {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Roster[] | null>(null);
  const [route, setRoute] = useState<Route>({ screen: 'list' });
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<Roster[] | null>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    loadIndex().then(setIndex, (e) => setError(String(e.message ?? e)));
  }, [attempt]);
  useEffect(() => {
    loadRosters().then(setRosters, () => setRosters([]));
  }, []);

  // на устройство — сразу при каждом изменении, в облако Telegram — с задержкой 0,5 с (там лимиты на запросы)
  const persist = useCallback((list: Roster[]) => {
    saveLocal(list);
    pending.current = list;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      pending.current = null;
      saveRosters(list);
    }, 500);
  }, []);

  // при выходе из раздела или закрытии Mini App отправляем несохранённое в облако сразу
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      if (pending.current) saveRosters(pending.current);
      pending.current = null;
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);

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
  const goBack = useCallback(() => setRoute((r) => ('back' in r ? r.back : { screen: 'list' })), []);

  // кнопка «Назад» Telegram: из ростера — к списку, из правил/поля — туда, откуда пришли, со списка — в WarpHub
  useEffect(() => {
    if (!tg) return;
    const nav = route.screen === 'list' ? onExit : route.screen === 'editor' ? goList : goBack;
    // сначала закрывается открытая шторка, и только потом — экран
    const handler = () => {
      if (!closeTopOverlay()) nav();
    };
    tg.BackButton.show();
    tg.BackButton.onClick(handler);
    return () => {
      tg!.BackButton.offClick(handler);
      tg!.BackButton.hide();
    };
  }, [route, goList, goBack, onExit]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.screen]);

  if (error) {
    return (
      <Centered>
        <p className="font-display text-xl uppercase">Нет данных</p>
        <p className="mt-2 text-sm text-white/50">{error}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onExit} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/80">
            Назад
          </button>
          <button type="button" onClick={() => (setError(null), setAttempt((n) => n + 1))} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black">
            Повторить
          </button>
        </div>
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

  if (route.screen === 'rules') {
    return <Rules index={index} onBack={goBack} factionId={route.factionId} detachmentIds={route.detachmentIds} />;
  }
  if (route.screen === 'battlefield') {
    return <Battlefield onBack={goBack} initialDisposition={route.disposition} />;
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
          onRules={() => setRoute({ screen: 'rules', back: route, factionId: roster.factionId, detachmentIds: roster.detachmentIds })}
          onBattlefield={() => setRoute({ screen: 'battlefield', back: route, disposition: roster.forceDisposition })}
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
      onRules={() => setRoute({ screen: 'rules', back: route })}
      onBattlefield={() => setRoute({ screen: 'battlefield', back: route })}
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
