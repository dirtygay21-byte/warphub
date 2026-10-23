import { useCallback, useEffect, useState } from 'react';
import { loadBattlefield, loadMissions, type BattlefieldData, type MissionsData } from '../../data';
import { uid } from '../../engine/roster';
import {
  GAME_SCHEMA,
  applyEvent,
  gameSaveKey,
  newSeed,
  readSavedGame,
  replay,
  setAsideSavedGame,
  undoTarget,
  writeSavedGame,
  type EventBody,
  type GameCatalog,
  type GameEvent,
  type GameState,
  type SavedRead,
  type Seat,
} from '../../game';
import { haptic, tg } from '../../telegram';

// сохранение — своё у каждого аккаунта Telegram (как ростеры в storage.ts)
const SAVE_KEY = gameSaveKey(tg?.initDataUnsafe.user?.id ? `.${tg.initDataUnsafe.user.id}` : '');
const store = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Каталог движка из данных «Поля боя» и карт миссий (missions.json подходит как есть). */
export function toCatalog(bf: BattlefieldData, m: MissionsData): GameCatalog {
  return { cards: m.cards, caps: m.caps, matchups: bf.matchups, layouts: bf.layouts };
}

export interface GameHook {
  /** данные загружены (null — ещё грузятся) */
  data: { battlefield: BattlefieldData; missions: MissionsData; catalog: GameCatalog } | null;
  loadError: string | null;
  events: GameEvent[];
  state: GameState | null;
  /** последняя ошибка движка (событие не принято) — показывается на экране */
  error: string | null;
  clearError: () => void;
  /** новая игра; initial — первые события подготовки (например, ростер из меню) */
  newGame: (names?: Partial<Record<Seat, string>>, initial?: EventBody[]) => void;
  /** отправить событие; seat — чьё (null — общее, один телефон). true — принято. */
  dispatch: (body: EventBody) => boolean;
  /** что снимет «Отменить» (null — нечего) */
  canUndo: boolean;
  undo: () => void;
  /** сохранённая на устройстве игра (G4b): null — данные ещё грузятся; none / ok / bad */
  saved: SavedRead | null;
  /** продолжить сохранённую игру */
  resume: () => void;
}

/**
 * Игра на экране: журнал событий + состояние из движка. Каждое действие экрана — событие; движок его проверяет,
 * при отказе журнал не меняется и показывается причина. Журнал сохраняется на устройстве после каждого действия (G4b);
 * для двух телефонов здесь же появится отправка событий на сервер и приём чужих.
 */
export function useGame(): GameHook {
  const [data, setData] = useState<GameHook['data']>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [saved, setSaved] = useState<SavedRead | null>(null);

  useEffect(() => {
    Promise.all([loadBattlefield(), loadMissions()]).then(
      ([battlefield, missions]) => {
        const catalog = toCatalog(battlefield, missions);
        setData({ battlefield, missions, catalog });
        const s = store();
        setSaved(s ? readSavedGame(s, SAVE_KEY, catalog) : { kind: 'none' });
      },
      (e) => setLoadError(String(e?.message ?? e)),
    );
  }, []);

  // автосохранение: после каждого принятого действия и отмены журнал целиком пишется на устройство.
  // Ошибка записи возвращается строкой — её показывает тот, кто менял журнал.
  const persist = useCallback(
    (list: GameEvent[]): string | null => {
      const s = store();
      return data && s ? writeSavedGame(s, SAVE_KEY, list, data.catalog) : null;
    },
    [data],
  );

  const resume = useCallback(() => {
    if (saved?.kind !== 'ok') return;
    setEvents(saved.events);
    setState(saved.state);
    setError(saved.warnings.length ? saved.warnings.join(' ') : null);
  }, [saved]);

  const stamp = useCallback(
    (body: EventBody, seq: number): GameEvent => ({ seat: null, ...body, id: uid(), seq, at: new Date().toISOString() }) as GameEvent,
    [],
  );

  const reject = useCallback((msg: string) => {
    setError(msg);
    haptic.error();
  }, []);

  const newGame = useCallback(
    (names: Partial<Record<Seat, string>> = {}, initial: EventBody[] = []) => {
      if (!data) return;
      // нечитаемое сохранение не затирается молча — откладывается под ключ .broken
      const s = store();
      if (s && saved?.kind === 'bad') setAsideSavedGame(s, SAVE_KEY);
      const ev = stamp({ type: 'game-created', schema: GAME_SCHEMA, seed: newSeed(), names: { p1: names.p1 ?? 'Игрок 1', p2: names.p2 ?? 'Игрок 2' } }, 1);
      const list = [ev, ...initial.map((b, i) => stamp(b, i + 2))];
      const r = replay(list, data.catalog);
      if (!r.ok) return reject(r.error);
      setEvents(list);
      setState(r.state);
      setError(persist(list));
    },
    [data, saved, stamp, reject, persist],
  );

  const dispatch = useCallback(
    (body: EventBody): boolean => {
      if (!data || !state) return false;
      const ev = stamp(body, state.lastSeq + 1);
      const r = applyEvent(state, ev, data.catalog);
      if (!r.ok) {
        reject(r.error);
        return false;
      }
      const list = [...events, ev];
      setEvents(list);
      setState(r.state);
      setError(persist(list));
      return true;
    },
    [data, state, events, stamp, reject, persist],
  );

  const target = undoTarget(events);
  const undo = useCallback(() => {
    if (!data || !state || !target) return;
    // отмене нужна история — журнал проигрывается целиком
    const next = [...events, stamp({ type: 'event-reverted', target: target.id }, state.lastSeq + 1)];
    const r = replay(next, data.catalog);
    if (!r.ok) return reject(r.error);
    haptic.tap();
    setEvents(next);
    setState(r.state);
    setError(persist(next));
  }, [data, state, target, events, stamp, reject, persist]);

  return { data, loadError, events, state, error, clearError: () => setError(null), newGame, dispatch, canUndo: !!target, undo, saved, resume };
}
