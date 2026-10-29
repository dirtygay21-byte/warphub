import { useCallback, useEffect, useRef, useState } from 'react';
import type { AosBattlepack } from '../../aos/types';
import {
  AOS_GAME_SCHEMA,
  aosUndoTarget,
  applyAosEvent,
  loadAosGame,
  readAosLibrary,
  removeAosGame,
  replayAos,
  saveAosGame,
  type AosEventBody,
  type AosGameEvent,
  type AosGameState,
  type AosSavedEntry,
  type Seat,
} from '../../aosgame';
import { loadAosBattlepack } from '../../data';
import { uid } from '../../engine/roster';
import { newSeed } from '../../game/rng';
import { haptic, tg } from '../../telegram';

const USER_SUFFIX = tg?.initDataUnsafe.user?.id ? `.${tg.initDataUnsafe.user.id}` : '';
const store = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export interface AosGameHook {
  bp: AosBattlepack | null;
  loadError: string | null;
  events: AosGameEvent[];
  state: AosGameState | null;
  error: string | null;
  clearError: () => void;
  newGame: (initial?: AosEventBody[]) => void;
  dispatch: (body: AosEventBody) => boolean;
  canUndo: boolean;
  undo: () => void;
  library: AosSavedEntry[] | null;
  openSaved: (key: string) => boolean;
  removeSaved: (key: string) => void;
  closeGame: () => void;
}

/**
 * Игра AoS на экране (S6): журнал событий + состояние из движка aosgame, сохранение на телефоне после каждого действия.
 * Один телефон: события общие (seat = null). Два телефона для AoS — следующий шаг.
 */
export function useAosGame(): AosGameHook {
  const [bp, setBp] = useState<AosBattlepack | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<AosGameEvent[]>([]);
  const [state, setState] = useState<AosGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<AosSavedEntry[] | null>(null);
  const eventsRef = useRef<AosGameEvent[]>([]);
  const stateRef = useRef<AosGameState | null>(null);

  const commit = useCallback((list: AosGameEvent[], st: AosGameState | null) => {
    eventsRef.current = list;
    stateRef.current = st;
    setEvents(list);
    setState(st);
  }, []);

  useEffect(() => {
    loadAosBattlepack().then(
      (d) => {
        setBp(d);
        const s = store();
        setLibrary(s ? readAosLibrary(s, USER_SUFFIX) : []);
      },
      (e) => setLoadError(String(e?.message ?? e)),
    );
  }, []);

  const persist = useCallback(
    (list: AosGameEvent[], st: AosGameState): string | null => {
      const s = store();
      return bp && s ? saveAosGame(s, USER_SUFFIX, list, st, bp) : null;
    },
    [bp],
  );
  const stamp = (body: AosEventBody, seq: number): AosGameEvent => ({ seat: null, ...body, id: uid(), seq, at: new Date().toISOString() }) as AosGameEvent;
  const reject = (msg: string) => {
    setError(msg);
    haptic.error();
  };

  const newGame = useCallback(
    (initial: AosEventBody[] = []) => {
      if (!bp) return;
      const list = [stamp({ type: 'game-created', schema: AOS_GAME_SCHEMA, seed: newSeed(), names: { p1: 'Игрок 1', p2: 'Игрок 2' } }, 1), ...initial.map((b, i) => stamp(b, i + 2))];
      const r = replayAos(list, bp);
      if (!r.ok) return reject(r.error);
      commit(list, r.state);
      setError(persist(list, r.state));
    },
    [bp, commit, persist],
  );

  const dispatch = useCallback(
    (body: AosEventBody): boolean => {
      const st = stateRef.current;
      if (!bp || !st) return false;
      const ev = stamp(body, st.lastSeq + 1);
      const r = applyAosEvent(st, ev, bp);
      if (!r.ok) {
        reject(r.error);
        return false;
      }
      const list = [...eventsRef.current, ev];
      commit(list, r.state);
      setError(persist(list, r.state));
      return true;
    },
    [bp, commit, persist],
  );

  const canUndo = !!aosUndoTarget(events);
  const undo = useCallback(() => {
    const st = stateRef.current;
    const t = aosUndoTarget(eventsRef.current);
    if (!bp || !st || !t) return;
    const next = [...eventsRef.current, stamp({ type: 'event-reverted', target: t.id }, st.lastSeq + 1)];
    const r = replayAos(next, bp);
    if (!r.ok) return reject(r.error);
    haptic.tap();
    commit(next, r.state);
    setError(persist(next, r.state));
  }, [bp, commit, persist]);

  const refresh = useCallback(() => {
    const s = store();
    if (s) setLibrary(readAosLibrary(s, USER_SUFFIX));
  }, []);
  const openSaved = useCallback(
    (key: string) => {
      const s = store();
      if (!bp || !s) return false;
      const r = loadAosGame(s, USER_SUFFIX, key, bp);
      if (typeof r === 'string') return (reject(r), false);
      commit(r.events, r.state);
      setError(null);
      return true;
    },
    [bp, commit],
  );
  const removeSaved = useCallback(
    (key: string) => {
      const s = store();
      if (!s) return;
      const err = removeAosGame(s, USER_SUFFIX, key);
      if (err) reject(err);
      refresh();
    },
    [refresh],
  );
  const closeGame = useCallback(() => {
    commit([], null);
    setError(null);
    refresh();
  }, [commit, refresh]);

  return { bp, loadError, events, state, error, clearError: () => setError(null), newGame, dispatch, canUndo, undo, library, openSaved, removeSaved, closeGame };
}

export type { Seat };
