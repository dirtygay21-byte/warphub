import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadAosIndex, loadIndex } from '../data';
import { loadAosRosters, loadRosters, markAosDeleted, markDeleted, saveAosLocal, saveAosRosters, saveLocal, saveRosters } from '../storage';
import { closeTopOverlay, haptic, tg } from '../telegram';
import type { DataIndex, Roster } from '../engine/types';
import type { AosIndex, AosRoster } from '../aos/types';
import { RosterList } from './RosterList';
import { AosList } from './aos/AosList';
import { AosEditor } from './aos/AosEditor';
import { Segmented } from './kit';
import { RosterEditor } from './RosterEditor';
import { Battlefield } from './Battlefield';
import { GameScreen } from './game/GameScreen';
import { TestArmyScreen } from './testarmy/TestArmyScreen';
import { AosGameScreen } from './aosgame/AosGameScreen';
import { Rules } from './Rules';

type Route =
  | { screen: 'list' }
  | { screen: 'editor'; id: string }
  | { screen: 'aos-editor'; id: string }
  | { screen: 'rules'; back: Route; factionId?: string; detachmentIds?: string[] }
  | { screen: 'battlefield'; back: Route; disposition?: string | null }
  | { screen: 'game'; back: Route; rosterId?: string }
  | { screen: 'test-army'; back: Route; rosterId?: string }
  | { screen: 'aos-game'; back: Route; rosterId?: string };

type GameSystem = '40k' | 'aos';
const SYSTEM_KEY = 'warphub.roster.system';
const readSystem = (): GameSystem => {
  try {
    return localStorage.getItem(SYSTEM_KEY) === 'aos' ? 'aos' : '40k';
  } catch {
    return '40k';
  }
};

/** Отложенное сохранение списка: на устройство — сразу, в облако Telegram — через 0,5 с. */
function usePersist<T>(saveLocalFn: (l: T[]) => void, saveCloudFn: (l: T[]) => void) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<T[] | null>(null);
  const persist = useCallback(
    (list: T[]) => {
      saveLocalFn(list);
      pending.current = list;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        pending.current = null;
        saveCloudFn(list);
      }, 500);
    },
    [saveLocalFn, saveCloudFn],
  );
  // при выходе из раздела или закрытии Mini App отправляем несохранённое в облако сразу
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timer.current);
      if (pending.current) saveCloudFn(pending.current);
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
  }, [saveCloudFn]);
  return persist;
}

/** Roster Builder внутри WarpHub. onExit — вернуться в приложение (кнопка «Назад» на списке ростеров). */
export function RosterBuilder({ onExit }: { onExit: () => void }) {
  const [system, setSystemState] = useState<GameSystem>(readSystem);
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [aosIndex, setAosIndex] = useState<AosIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Roster[] | null>(null);
  const [aosRosters, setAosRosters] = useState<AosRoster[] | null>(null);
  const [route, setRoute] = useState<Route>({ screen: 'list' });

  const setSystem = (s: GameSystem) => {
    setError(null);
    setSystemState(s);
    try {
      localStorage.setItem(SYSTEM_KEY, s);
    } catch {
      /* приватный режим */
    }
  };

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (system === '40k') loadIndex().then(setIndex, (e) => setError(String(e.message ?? e)));
    else loadAosIndex().then(setAosIndex, (e) => setError(String(e.message ?? e)));
  }, [attempt, system]);
  useEffect(() => {
    loadRosters().then(setRosters, () => setRosters([]));
    loadAosRosters().then(setAosRosters, () => setAosRosters([]));
  }, []);

  const persist = usePersist<Roster>(saveLocal, saveRosters);
  const persistAos = usePersist<AosRoster>(saveAosLocal, saveAosRosters);

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

  const updateAos = useCallback(
    (fn: (list: AosRoster[]) => AosRoster[]) => {
      setAosRosters((prev) => {
        const next = fn(prev ?? []);
        persistAos(next);
        return next;
      });
    },
    [persistAos],
  );
  const onAosChange = useCallback((r: AosRoster) => updateAos((list) => list.map((x) => (x.id === r.id ? r : x))), [updateAos]);

  const goList = useCallback(() => setRoute({ screen: 'list' }), []);
  const goBack = useCallback(() => setRoute((r) => ('back' in r ? r.back : { screen: 'list' })), []);

  // кнопка «Назад» Telegram: из ростера — к списку, из правил/поля — туда, откуда пришли, со списка — в WarpHub
  useEffect(() => {
    if (!tg) return;
    const nav = route.screen === 'list' ? onExit : route.screen === 'editor' || route.screen === 'aos-editor' ? goList : goBack;
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
  if ((system === '40k' ? !index : !aosIndex) || !rosters || !aosRosters) {
    return (
      <Centered>
        <div className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </Centered>
    );
  }

  const switcher = (
    <Segmented
      className="mb-4"
      value={system}
      onChange={(s) => (haptic.select(), setSystem(s))}
      options={[
        { value: '40k', label: 'Warhammer 40,000' },
        { value: 'aos', label: 'Age of Sigmar' },
      ]}
    />
  );

  if (route.screen === 'aos-game' && aosIndex) {
    return <AosGameScreen onBack={goBack} rosters={aosRosters!} index={aosIndex} initialRosterId={route.rosterId} />;
  }

  if (route.screen === 'aos-editor' && aosIndex) {
    const roster = aosRosters!.find((r) => r.id === route.id);
    if (roster) {
      return (
        <AosEditor
          key={roster.id}
          roster={roster}
          index={aosIndex}
          onBack={goList}
          onStartGame={() => setRoute({ screen: 'aos-game', back: route, rosterId: roster.id })}
          onChange={onAosChange}
          onDuplicate={(r) => {
            updateAos((list) => [r, ...list]);
            setRoute({ screen: 'aos-editor', id: r.id });
          }}
          onDelete={() => {
            markAosDeleted(roster.id);
            updateAos((list) => list.filter((x) => x.id !== roster.id));
            goList();
          }}
        />
      );
    }
  }

  if (system === 'aos' && aosIndex) {
    return (
      <AosList
        onExit={onExit}
        switcher={switcher}
        index={aosIndex}
        rosters={aosRosters!}
        onOpen={(id) => setRoute({ screen: 'aos-editor', id })}
        onStartGame={() => setRoute({ screen: 'aos-game', back: route })}
        onCreate={(r) => {
          updateAos((list) => [r, ...list]);
          setRoute({ screen: 'aos-editor', id: r.id });
        }}
        onDuplicate={(r) => updateAos((list) => [r, ...list])}
        onDelete={(id) => {
          markAosDeleted(id);
          updateAos((list) => list.filter((x) => x.id !== id));
        }}
      />
    );
  }
  if (!index || !rosters) return null;

  if (route.screen === 'rules') {
    return <Rules index={index} onBack={goBack} factionId={route.factionId} detachmentIds={route.detachmentIds} />;
  }
  if (route.screen === 'battlefield') {
    return <Battlefield onBack={goBack} initialDisposition={route.disposition} />;
  }
  if (route.screen === 'game') {
    return <GameScreen onBack={goBack} rosters={rosters} index={index} initialRosterId={route.rosterId} />;
  }
  if (route.screen === 'test-army') {
    return <TestArmyScreen onBack={goBack} rosters={rosters} index={index} initialRosterId={route.rosterId} />;
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
          onStartGame={() => setRoute({ screen: 'game', back: route, rosterId: roster.id })}
          onTestArmy={() => setRoute({ screen: 'test-army', back: route, rosterId: roster.id })}
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
      switcher={switcher}
      onRules={() => setRoute({ screen: 'rules', back: route })}
      onStartGame={() => setRoute({ screen: 'game', back: route })}
      onTestArmy={() => setRoute({ screen: 'test-army', back: route })}
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
