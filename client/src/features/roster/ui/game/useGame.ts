import { useCallback, useEffect, useState } from 'react';
import { loadBattlefield, loadMissions, type BattlefieldData, type MissionsData } from '../../data';
import { uid } from '../../engine/roster';
import { GAME_SCHEMA, applyEvent, newSeed, replay, undoTarget, type EventBody, type GameCatalog, type GameEvent, type GameState, type Seat } from '../../game';
import { haptic } from '../../telegram';

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
  newGame: (names?: Partial<Record<Seat, string>>) => void;
  /** отправить событие; seat — чьё (null — общее, один телефон). true — принято. */
  dispatch: (body: EventBody) => boolean;
  /** что снимет «Отменить» (null — нечего) */
  canUndo: boolean;
  undo: () => void;
}

/**
 * Игра на экране: журнал событий + состояние из движка. Каждое действие экрана — событие; движок его проверяет,
 * при отказе журнал не меняется и показывается причина. Пока игра живёт в памяти (автосохранение — G4b);
 * для двух телефонов здесь же появится отправка событий на сервер и приём чужих.
 */
export function useGame(): GameHook {
  const [data, setData] = useState<GameHook['data']>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadBattlefield(), loadMissions()]).then(
      ([battlefield, missions]) => setData({ battlefield, missions, catalog: toCatalog(battlefield, missions) }),
      (e) => setLoadError(String(e?.message ?? e)),
    );
  }, []);

  const stamp = useCallback(
    (body: EventBody, seq: number): GameEvent => ({ seat: null, ...body, id: uid(), seq, at: new Date().toISOString() }) as GameEvent,
    [],
  );

  const reject = useCallback((msg: string) => {
    setError(msg);
    haptic.error();
  }, []);

  const newGame = useCallback(
    (names: Partial<Record<Seat, string>> = {}) => {
      if (!data) return;
      const ev = stamp({ type: 'game-created', schema: GAME_SCHEMA, seed: newSeed(), names: { p1: names.p1 ?? 'Игрок 1', p2: names.p2 ?? 'Игрок 2' } }, 1);
      const r = replay([ev], data.catalog);
      if (!r.ok) return reject(r.error);
      setEvents([ev]);
      setState(r.state);
      setError(null);
    },
    [data, stamp, reject],
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
      setEvents((list) => [...list, ev]);
      setState(r.state);
      setError(null);
      return true;
    },
    [data, state, stamp, reject],
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
    setError(null);
  }, [data, state, target, events, stamp, reject]);

  return { data, loadError, events, state, error, clearError: () => setError(null), newGame, dispatch, canUndo: !!target, undo };
}
