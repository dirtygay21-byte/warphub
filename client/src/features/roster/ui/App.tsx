import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadAosIndex, loadIndex, loadKtIndex, loadWarcryIndex } from '../data';
import {
  loadAosRosters,
  loadKtRosters,
  loadRosters,
  loadWarcryRosters,
  markAosDeleted,
  markDeleted,
  markKtDeleted,
  markWarcryDeleted,
  saveAosLocal,
  saveAosRosters,
  saveKtLocal,
  saveKtRosters,
  saveLocal,
  saveRosters,
  saveWarcryLocal,
  saveWarcryRosters,
} from '../storage';
import { closeTopOverlay, tg } from '../telegram';
import type { DataIndex, Roster } from '../engine/types';
import type { AosIndex, AosRoster } from '../aos/types';
import type { KtIndex } from '../kt/types';
import type { KtRoster } from '../kt/roster';
import { KtList } from './kt/KtList';
import { KtEditor } from './kt/KtEditor';
import type { WarcryIndex } from '../warcry/types';
import type { WarcryRoster } from '../warcry/roster';
import { WarcryList } from './warcry/WarcryList';
import { WarcryEditor } from './warcry/WarcryEditor';
import { RosterList } from './RosterList';
import { AosList } from './aos/AosList';
import { AosEditor } from './aos/AosEditor';
import { Home, type GameSystem } from './Home';
import { RosterEditor } from './RosterEditor';
import { Battlefield } from './Battlefield';
import { GameScreen } from './game/GameScreen';
import { TestArmyScreen } from './testarmy/TestArmyScreen';
import { AosGameScreen } from './aosgame/AosGameScreen';
import { AosTestArmyScreen } from './testarmy/AosTestArmyScreen';
import { WarcryFullGameScreen } from './warcry/WarcryFullGameScreen';
import { KtFullGameScreen } from './kt/KtFullGameScreen';
import { KtTestArmyScreen, WarcryTestArmyScreen } from './skirmish/SkirmishTestArmyScreen';
import { Rules } from './Rules';

type ResumeScreen = 'game' | 'test-army' | 'aos-game' | 'aos-test-army' | 'kt-game' | 'kt-test-army' | 'warcry-game' | 'warcry-test-army';
const RESUMABLE: ResumeScreen[] = ['game', 'test-army', 'aos-game', 'aos-test-army', 'kt-game', 'kt-test-army', 'warcry-game', 'warcry-test-army'];
const RESUME_KEY = 'warphub:wb-resume';
const RESUME_LABEL: Record<ResumeScreen, string> = {
  game: 'Игра',
  'test-army': 'Test Army',
  'aos-game': 'Игра',
  'aos-test-army': 'Test Army',
  'kt-game': 'Игра',
  'kt-test-army': 'Test Army',
  'warcry-game': 'Игра',
  'warcry-test-army': 'Test Army',
};
const SYSTEM_LABEL: Record<GameSystem, string> = { '40k': 'Warhammer 40,000', aos: 'Age of Sigmar', kt: 'Kill Team', warcry: 'Warcry' };
const systemOf = (screen: ResumeScreen): GameSystem =>
  screen.startsWith('aos-') ? 'aos' : screen.startsWith('kt-') ? 'kt' : screen.startsWith('warcry-') ? 'warcry' : '40k';

/** Последняя игра / Test Army (не старше 14 дней). */
function readResume(): { screen: ResumeScreen; rosterId: string | null; system: GameSystem } | null {
  try {
    const v = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null') as { screen?: string; rosterId?: string | null; at?: number } | null;
    if (!v?.screen || !RESUMABLE.includes(v.screen as ResumeScreen) || !v.at || Date.now() - v.at > 14 * 864e5) return null;
    const screen = v.screen as ResumeScreen;
    return { screen, rosterId: v.rosterId ?? null, system: systemOf(screen) };
  } catch {
    return null;
  }
}

type Route =
  | { screen: 'home' }
  | { screen: 'list' }
  | { screen: 'editor'; id: string }
  | { screen: 'aos-editor'; id: string }
  | { screen: 'kt-editor'; id: string }
  | { screen: 'wc-editor'; id: string }
  | { screen: 'rules'; back: Route; factionId?: string; detachmentIds?: string[] }
  | { screen: 'battlefield'; back: Route; disposition?: string | null }
  | { screen: 'game'; back: Route; rosterId?: string }
  | { screen: 'test-army'; back: Route; rosterId?: string }
  | { screen: 'aos-game'; back: Route; rosterId?: string }
  | { screen: 'aos-test-army'; back: Route; rosterId?: string }
  | { screen: 'kt-game'; back: Route; rosterId?: string }
  | { screen: 'kt-test-army'; back: Route; rosterId?: string }
  | { screen: 'warcry-game'; back: Route; rosterId?: string }
  | { screen: 'warcry-test-army'; back: Route; rosterId?: string };

const SYSTEM_KEY = 'warphub.roster.system';
const readSystem = (): GameSystem => {
  try {
    const v = localStorage.getItem(SYSTEM_KEY);
    return v === 'aos' || v === 'kt' || v === 'warcry' ? v : '40k';
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

/** WarpBuilder (бывший Roster Builder) внутри WarpHub. onExit — вернуться в приложение (кнопка «Назад» на списке ростеров). */
export function RosterBuilder({ onExit }: { onExit: () => void }) {
  const [system, setSystemState] = useState<GameSystem>(readSystem);
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [aosIndex, setAosIndex] = useState<AosIndex | null>(null);
  const [ktIndex, setKtIndex] = useState<KtIndex | null>(null);
  const [ktRosters, setKtRosters] = useState<KtRoster[] | null>(null);
  const [wcIndex, setWcIndex] = useState<WarcryIndex | null>(null);
  const [wcRosters, setWcRosters] = useState<WarcryRoster[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Roster[] | null>(null);
  const [aosRosters, setAosRosters] = useState<AosRoster[] | null>(null);
  const [route, setRoute] = useState<Route>({ screen: 'home' });

  // «Продолжить» на главной WarpBuilder (14.11.2026): последняя игра или Test Army — одним нажатием
  useEffect(() => {
    if (!RESUMABLE.includes(route.screen as ResumeScreen)) return;
    const r = route as { screen: ResumeScreen; rosterId?: string };
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ screen: r.screen, rosterId: r.rosterId ?? null, system: systemOf(r.screen), at: Date.now() }));
    } catch {
      /* приватный режим */
    }
  }, [route]);

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
    else if (system === 'aos') loadAosIndex().then(setAosIndex, (e) => setError(String(e.message ?? e)));
    else if (system === 'kt') loadKtIndex().then(setKtIndex, (e) => setError(String(e.message ?? e)));
    else loadWarcryIndex().then(setWcIndex, (e) => setError(String(e.message ?? e)));
  }, [attempt, system]);
  useEffect(() => {
    loadRosters().then(setRosters, () => setRosters([]));
    loadAosRosters().then(setAosRosters, () => setAosRosters([]));
    loadKtRosters().then(setKtRosters, () => setKtRosters([]));
    loadWarcryRosters().then(setWcRosters, () => setWcRosters([]));
  }, []);

  const persist = usePersist<Roster>(saveLocal, saveRosters);
  const persistAos = usePersist<AosRoster>(saveAosLocal, saveAosRosters);
  const persistKt = usePersist<KtRoster>(saveKtLocal, saveKtRosters);
  const persistWc = usePersist<WarcryRoster>(saveWarcryLocal, saveWarcryRosters);

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
  const updateKt = useCallback(
    (fn: (list: KtRoster[]) => KtRoster[]) => {
      setKtRosters((prev) => {
        const next = fn(prev ?? []);
        persistKt(next);
        return next;
      });
    },
    [persistKt],
  );
  const updateWc = useCallback(
    (fn: (list: WarcryRoster[]) => WarcryRoster[]) => {
      setWcRosters((prev) => {
        const next = fn(prev ?? []);
        persistWc(next);
        return next;
      });
    },
    [persistWc],
  );
  const onWcChange = useCallback((r: WarcryRoster) => updateWc((list) => list.map((x) => (x.id === r.id ? r : x))), [updateWc]);
  const onKtChange = useCallback((r: KtRoster) => updateKt((list) => list.map((x) => (x.id === r.id ? r : x))), [updateKt]);
  const onAosChange = useCallback((r: AosRoster) => updateAos((list) => list.map((x) => (x.id === r.id ? r : x))), [updateAos]);

  const goList = useCallback(() => setRoute({ screen: 'list' }), []);
  const goBack = useCallback(() => setRoute((r) => ('back' in r ? r.back : { screen: 'list' })), []);
  const goHome = useCallback(() => setRoute({ screen: 'home' }), []);

  // кнопка «Назад» Telegram: из ростера — к списку, из правил/поля — туда, откуда пришли, со списка — в WarpHub
  useEffect(() => {
    if (!tg) return;
    const nav = route.screen === 'home' ? onExit : route.screen === 'list' ? goHome : route.screen === 'editor' || route.screen === 'aos-editor' || route.screen === 'kt-editor' || route.screen === 'wc-editor' ? goList : goBack;
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
  }, [route, goList, goBack, goHome, onExit]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.screen]);

  if (error) {
    return (
      <Centered>
        <p className="font-display text-xl uppercase">Нет данных</p>
        <p className="mt-2 text-sm text-fg-3">{error}</p>
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
  if (route.screen === 'home' && rosters && aosRosters && ktRosters && wcRosters) {
    const resume = readResume();
    const resumeName =
      resume?.rosterId &&
      [...rosters, ...aosRosters, ...ktRosters, ...wcRosters].find((r) => r.id === resume.rosterId)?.name;
    return (
      <Home
        resume={
          resume
            ? {
                title: `${RESUME_LABEL[resume.screen]}${resumeName ? ` · ${resumeName}` : ''}`,
                sub: SYSTEM_LABEL[resume.system],
                onClick: () => {
                  setSystem(resume.system);
                  setRoute({ screen: resume.screen, back: { screen: 'home' }, rosterId: resume.rosterId ?? undefined } as Route);
                },
              }
            : null
        }
        onExit={onExit}
        rosters={rosters}
        aosRosters={aosRosters}
        ktRosters={ktRosters}
        wcRosters={wcRosters}
        aosIndex={aosIndex}
        onGame={(g) => (setSystem(g), setRoute({ screen: 'list' }))}
        onOpen={(g, id) => (setSystem(g), setRoute(g === '40k' ? { screen: 'editor', id } : g === 'aos' ? { screen: 'aos-editor', id } : g === 'kt' ? { screen: 'kt-editor', id } : { screen: 'wc-editor', id }))}
      />
    );
  }
  if ((system === '40k' ? !index : system === 'aos' ? !aosIndex : system === 'kt' ? !ktIndex : !wcIndex) || !rosters || !aosRosters || !ktRosters || !wcRosters) {
    return (
      <Centered>
        <div className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </Centered>
    );
  }

  const switcher = null;

  if (system === 'warcry' && wcIndex && wcRosters) {
    if (route.screen === 'warcry-game') return <WarcryFullGameScreen onBack={goBack} rosters={wcRosters} index={wcIndex} initialRosterId={route.rosterId} />;
    if (route.screen === 'warcry-test-army') return <WarcryTestArmyScreen onBack={goBack} rosters={wcRosters} index={wcIndex} initialRosterId={route.rosterId} />;
    const wr = route.screen === 'wc-editor' ? wcRosters.find((r) => r.id === route.id) : undefined;
    if (wr)
      return (
        <WarcryEditor
          key={wr.id}
          roster={wr}
          index={wcIndex}
          onBack={goList}
          onStartGame={() => setRoute({ screen: 'warcry-game', back: route, rosterId: wr.id })}
          onTestArmy={() => setRoute({ screen: 'warcry-test-army', back: route, rosterId: wr.id })}
          onChange={onWcChange}
          onDuplicate={(r) => {
            updateWc((list) => [r, ...list]);
            setRoute({ screen: 'wc-editor', id: r.id });
          }}
          onDelete={() => {
            markWarcryDeleted(wr.id);
            updateWc((list) => list.filter((x) => x.id !== wr.id));
            goList();
          }}
        />
      );
    return (
      <WarcryList
        onExit={goHome}
        index={wcIndex}
        rosters={wcRosters}
        onOpen={(id) => setRoute({ screen: 'wc-editor', id })}
        onStartGame={() => setRoute({ screen: 'warcry-game', back: route })}
        onTestArmy={() => setRoute({ screen: 'warcry-test-army', back: route })}
        onCreate={(r) => {
          updateWc((list) => [r, ...list]);
          setRoute({ screen: 'wc-editor', id: r.id });
        }}
        onDuplicate={(r) => updateWc((list) => [r, ...list])}
        onDelete={(id) => {
          markWarcryDeleted(id);
          updateWc((list) => list.filter((x) => x.id !== id));
        }}
      />
    );
  }

  if (system === 'kt' && ktIndex && ktRosters) {
    if (route.screen === 'kt-game') return <KtFullGameScreen onBack={goBack} rosters={ktRosters} index={ktIndex} initialRosterId={route.rosterId} />;
    if (route.screen === 'kt-test-army') return <KtTestArmyScreen onBack={goBack} rosters={ktRosters} index={ktIndex} initialRosterId={route.rosterId} />;
    const kr = route.screen === 'kt-editor' ? ktRosters.find((r) => r.id === route.id) : undefined;
    if (kr)
      return (
        <KtEditor
          key={kr.id}
          roster={kr}
          index={ktIndex}
          onBack={goList}
          onStartGame={() => setRoute({ screen: 'kt-game', back: route, rosterId: kr.id })}
          onTestArmy={() => setRoute({ screen: 'kt-test-army', back: route, rosterId: kr.id })}
          onChange={onKtChange}
          onDuplicate={(r) => {
            updateKt((list) => [r, ...list]);
            setRoute({ screen: 'kt-editor', id: r.id });
          }}
          onDelete={() => {
            markKtDeleted(kr.id);
            updateKt((list) => list.filter((x) => x.id !== kr.id));
            goList();
          }}
        />
      );
    return (
      <KtList
        onExit={goHome}
        index={ktIndex}
        rosters={ktRosters}
        onOpen={(id) => setRoute({ screen: 'kt-editor', id })}
        onStartGame={() => setRoute({ screen: 'kt-game', back: route })}
        onTestArmy={() => setRoute({ screen: 'kt-test-army', back: route })}
        onCreate={(r) => {
          updateKt((list) => [r, ...list]);
          setRoute({ screen: 'kt-editor', id: r.id });
        }}
        onDuplicate={(r) => updateKt((list) => [r, ...list])}
        onDelete={(id) => {
          markKtDeleted(id);
          updateKt((list) => list.filter((x) => x.id !== id));
        }}
      />
    );
  }

  if (route.screen === 'aos-test-army' && aosIndex) {
    return <AosTestArmyScreen onBack={goBack} rosters={aosRosters!} index={aosIndex} initialRosterId={route.rosterId} />;
  }
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
          onTestArmy={() => setRoute({ screen: 'aos-test-army', back: route, rosterId: roster.id })}
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
        onExit={goHome}
        switcher={switcher}
        index={aosIndex}
        rosters={aosRosters!}
        onOpen={(id) => setRoute({ screen: 'aos-editor', id })}
        onStartGame={() => setRoute({ screen: 'aos-game', back: route })}
        onTestArmy={() => setRoute({ screen: 'aos-test-army', back: route })}
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
      onExit={goHome}
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
