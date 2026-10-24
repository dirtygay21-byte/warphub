import { useCallback, useEffect, useRef, useState } from 'react';
import { loadBattlefield, loadMissions, type BattlefieldData, type MissionsData } from '../../data';
import { uid } from '../../engine/roster';
import {
  GAME_SCHEMA,
  appendRemote,
  applyEvent,
  loadLocalGame,
  newSeed,
  readLibrary,
  rememberOnlineGame,
  removeSavedGame,
  replay,
  saveLocalGame,
  undoTarget,
  type EventBody,
  type GameCatalog,
  type GameEvent,
  type GameState,
  type SavedEntry,
  type Seat,
  seatForEvent,
} from '../../game';
import { createOnlineGame, getOnlineEvents, joinOnlineGame, postOnlineEvent, type OnlineGame } from '../../online';
import { haptic, tg } from '../../telegram';

// сохранение — своё у каждого аккаунта Telegram (как ростеры в storage.ts)
const USER_SUFFIX = tg?.initDataUnsafe.user?.id ? `.${tg.initDataUnsafe.user.id}` : '';
/** ссылка на игру на двух телефонах до списка игр (T2) — переносится в список */
const ONLINE_KEY = `warphub.game.online.v1${USER_SUFFIX}`;
/** как часто телефон спрашивает сервер о новых событиях соперника */
const POLL_MS = 2500;
type OnlineRef = { id: string; seat: Seat; code: string };
const readOnlineRef = (): OnlineRef | null => {
  try {
    const v = JSON.parse(store()?.getItem(ONLINE_KEY) ?? 'null') as OnlineRef | null;
    return v && typeof v.id === 'string' && (v.seat === 'p1' || v.seat === 'p2') ? v : null;
  } catch {
    return null;
  }
};
const dropOnlineRef = () => {
  try {
    store()?.removeItem(ONLINE_KEY);
  } catch {
    /* хранилище недоступно */
  }
};
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
  /** сохранённые игры на этом телефоне, новые сверху (null — ещё грузятся) */
  library: SavedEntry[] | null;
  /** открыть игру из списка (одиночную — с телефона, на двух телефонах — с сервера) */
  openSaved: (entry: SavedEntry) => Promise<boolean>;
  /** убрать игру из списка (на двух телефонах — только ссылку) */
  removeSaved: (key: string) => void;
  /** закрыть игру и вернуться к началу (игра остаётся в списке) */
  closeGame: () => void;
  /** игра на двух телефонах (T2): null — игра на одном телефоне */
  online: (OnlineGame & { seat: Seat }) | null;
  /** соединение с сервером: идёт отправка / последняя ошибка связи */
  sync: { sending: boolean; offline: boolean };
  /** создать игру на двух телефонах: этот телефон — игрок 1; initial — первые события (ростер из меню) */
  startOnline: (initial?: EventBody[]) => Promise<boolean>;
  /** войти по коду вторым игроком */
  joinOnline: (code: string) => Promise<boolean>;
}

/**
 * Игра на экране: журнал событий + состояние из движка. Каждое действие экрана — событие; движок его проверяет,
 * при отказе журнал не меняется и показывается причина. Журнал сохраняется на устройстве после каждого действия (G4b).
 * На двух телефонах (T2): событие сразу применяется у себя и уходит на сервер с ожидаемым номером; если соперник успел
 * раньше (409) — журнал берётся с сервера заново и действие нужно повторить. События соперника телефон забирает
 * опросом раз в POLL_MS. Каждый телефон действует только за своё место (seatForEvent), общие события — для обоих.
 */
export function useGame(): GameHook {
  const [data, setData] = useState<GameHook['data']>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<SavedEntry[] | null>(null);
  const [online, setOnline] = useState<GameHook['online']>(null);
  const [sync, setSync] = useState({ sending: false, offline: false });

  // текущие журнал и состояние для асинхронной отправки и опроса (без устаревших замыканий)
  const eventsRef = useRef<GameEvent[]>([]);
  const stateRef = useRef<GameState | null>(null);
  const onlineRef = useRef<OnlineRef | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);

  const commit = useCallback((list: GameEvent[], st: GameState | null) => {
    eventsRef.current = list;
    stateRef.current = st;
    setEvents(list);
    setState(st);
  }, []);

  useEffect(() => {
    Promise.all([loadBattlefield(), loadMissions()]).then(
      ([battlefield, missions]) => {
        const catalog = toCatalog(battlefield, missions);
        setData({ battlefield, missions, catalog });
        const s = store();
        if (!s) return setLibrary([]);
        // ссылка на игру на двух телефонах из прежней версии — в список
        const old = readOnlineRef();
        if (old && !rememberOnlineGame(s, USER_SUFFIX, { gameId: old.id, seat: old.seat, code: old.code }, null, catalog)) dropOnlineRef();
        const lib = readLibrary(s, USER_SUFFIX, catalog);
        setLibrary(lib.entries);
        if (lib.warnings.length) setError(lib.warnings.join(' '));
      },
      (e) => setLoadError(String(e?.message ?? e)),
    );
  }, []);

  // автосохранение (одиночная игра): после каждого принятого действия и отмены журнал целиком пишется на устройство.
  // Ошибка записи возвращается строкой — её показывает тот, кто менял журнал. Игру на двух телефонах хранит сервер.
  const persist = useCallback(
    (list: GameEvent[], st: GameState | null): string | null => {
      if (onlineRef.current || !st) return null;
      const s = store();
      return data && s ? saveLocalGame(s, USER_SUFFIX, list, st, data.catalog) : null;
    },
    [data],
  );

  // игра на двух телефонах: сводка для списка игр обновляется после каждого изменения
  useEffect(() => {
    const s = store();
    if (online && state && data && s) rememberOnlineGame(s, USER_SUFFIX, { gameId: online.id, seat: online.seat, code: online.code }, state, data.catalog);
  }, [online, state, data]);

  const refreshLibrary = useCallback(() => {
    const s = store();
    if (s && data) setLibrary(readLibrary(s, USER_SUFFIX, data.catalog).entries);
  }, [data]);

  const stamp = useCallback((body: EventBody, seq: number): GameEvent => {
    const o = onlineRef.current;
    const seat = o ? seatForEvent(body.type, o.seat) : null;
    return { seat, ...body, id: uid(), seq, at: new Date().toISOString() } as GameEvent;
  }, []);

  const reject = useCallback((msg: string) => {
    setError(msg);
    haptic.error();
  }, []);

  // ---------- два телефона: журнал с сервера ----------

  /** Взять журнал с сервера целиком и проиграть (после конфликта, при входе и возвращении). */
  const resync = useCallback(async (): Promise<boolean> => {
    const o = onlineRef.current;
    if (!o || !data) return false;
    const r = await getOnlineEvents(o.id, 0);
    if (!r.ok) {
      setSync((x) => ({ ...x, offline: r.status === 0 }));
      setError(r.error);
      return false;
    }
    setSync((x) => ({ ...x, offline: false }));
    setOnline({ ...r.data.game, seat: o.seat });
    if (!r.data.events.length) {
      commit([], null);
      return true;
    }
    const rp = replay(r.data.events, data.catalog);
    if (!rp.ok) {
      setError(`Журнал игры на сервере не проигрывается (событие №${rp.seq}): ${rp.error}`);
      return false;
    }
    commit(r.data.events, rp.state);
    return true;
  }, [data, commit]);

  /** Отправить события по очереди; при отказе — журнал с сервера и сообщение. */
  const send = useCallback(
    (list: GameEvent[]) => {
      const o = onlineRef.current;
      if (!o) return;
      pending.current += list.length;
      setSync((x) => ({ ...x, sending: true }));
      queue.current = queue.current.then(async () => {
        let failed = false;
        for (const ev of list) {
          if (failed) break;
          const r = await postOnlineEvent(o.id, ev.seq - 1, ev);
          if (!r.ok) {
            failed = true;
            const conflict = r.status === 409 && r.code === 'CONFLICT';
            setSync((x) => ({ ...x, offline: r.status === 0 }));
            await resync();
            setError(conflict ? 'Соперник успел сделать действие раньше — игра обновлена, повторите своё действие.' : r.error);
            haptic.error();
          } else setSync((x) => ({ ...x, offline: false }));
        }
        pending.current = Math.max(0, pending.current - list.length);
        if (!pending.current) setSync((x) => ({ ...x, sending: false }));
      });
    },
    [resync],
  );

  // опрос: новые события соперника (только когда своих неотправленных нет)
  useEffect(() => {
    if (!online || !data) return;
    const id = online.id;
    const t = window.setInterval(async () => {
      if (pending.current || document.visibilityState === 'hidden') return;
      const last = eventsRef.current.at(-1)?.seq ?? 0;
      const r = await getOnlineEvents(id, last);
      if (!r.ok) {
        setSync((x) => ({ ...x, offline: r.status === 0 }));
        return;
      }
      if (pending.current || onlineRef.current?.id !== id) return;
      setSync((x) => (x.offline ? { ...x, offline: false } : x));
      setOnline((cur) => (cur && cur.id === id && (cur.players.p2?.name !== r.data.game.players.p2?.name || cur.lastSeq !== r.data.game.lastSeq) ? { ...r.data.game, seat: cur.seat } : cur));
      if (!r.data.events.length) return;
      const merged = appendRemote(eventsRef.current, r.data.events);
      if (!merged) return void resync();
      const rp = replay(merged, data.catalog);
      if (!rp.ok) return setError(`Событие соперника не принято движком (№${rp.seq}): ${rp.error}`);
      commit(merged, rp.state);
      haptic.tap();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [online, data, resync, commit]);

  const enterOnline = useCallback(
    (g: OnlineGame, seat: Seat) => {
      onlineRef.current = { id: g.id, seat, code: g.code };
      const s = store();
      if (s && data) rememberOnlineGame(s, USER_SUFFIX, { gameId: g.id, seat, code: g.code }, null, data.catalog);
      setOnline({ ...g, seat });
    },
    [data],
  );

  const startOnline = useCallback(
    async (initial: EventBody[] = []): Promise<boolean> => {
      if (!data) return false;
      const r = await createOnlineGame();
      if (!r.ok) return (reject(r.error), false);
      enterOnline(r.data, 'p1');
      const names = { p1: r.data.players.p1?.name || 'Игрок 1', p2: 'Игрок 2' };
      const list = [stamp({ type: 'game-created', schema: GAME_SCHEMA, seed: newSeed(), names }, 1), ...initial.map((b, i) => stamp(b, i + 2))];
      const rp = replay(list, data.catalog);
      if (!rp.ok) return (reject(rp.error), false);
      commit(list, rp.state);
      setError(null);
      send(list);
      return true;
    },
    [data, reject, enterOnline, stamp, commit, send],
  );

  const joinOnline = useCallback(
    async (code: string): Promise<boolean> => {
      if (!data) return false;
      const r = await joinOnlineGame(code);
      if (!r.ok) return (reject(r.error), false);
      const seat = r.data.seat;
      if (!seat) return (reject('Не удалось занять место в игре'), false);
      enterOnline(r.data, seat);
      if (!(await resync())) {
        onlineRef.current = null;
        setOnline(null);
        return false;
      }
      // второй игрок: своё имя из Telegram вместо «Игрок 2»
      const st = stateRef.current;
      const myName = r.data.players[seat]?.name;
      if (st && myName && st.players[seat].name !== myName && st.stage === 'setup') {
        const ev = stamp({ type: 'player-set', target: seat, patch: { name: myName } }, st.lastSeq + 1);
        const a = applyEvent(st, ev, data.catalog);
        if (a.ok) {
          commit([...eventsRef.current, ev], a.state);
          send([ev]);
        }
      }
      setError(null);
      return true;
    },
    [data, reject, enterOnline, resync, stamp, commit, send],
  );

  const closeGame = useCallback(() => {
    onlineRef.current = null;
    setOnline(null);
    commit([], null);
    setError(null);
    refreshLibrary();
  }, [commit, refreshLibrary]);

  const openSaved = useCallback(
    async (entry: SavedEntry): Promise<boolean> => {
      const s = store();
      if (!data || !s) return false;
      if (entry.kind === 'local') {
        const r = loadLocalGame(s, USER_SUFFIX, entry.key, data.catalog);
        if (r.kind !== 'ok') return (reject(r.kind === 'bad' ? `Игру не удалось открыть: ${r.error}` : 'Игра не найдена на телефоне'), false);
        onlineRef.current = null;
        setOnline(null);
        commit(r.events, r.state);
        setError(r.warnings.length ? r.warnings.join(' ') : null);
        return true;
      }
      const link = entry.online;
      if (!link) return false;
      onlineRef.current = { id: link.gameId, seat: link.seat, code: link.code };
      setOnline({ id: link.gameId, code: link.code, seat: link.seat, lastSeq: 0, players: { p1: null, p2: null }, createdAt: '', updatedAt: '' });
      if (await resync()) return true;
      // не открылась — обратно к началу (ссылка остаётся в списке, можно повторить)
      onlineRef.current = null;
      setOnline(null);
      return false;
    },
    [data, reject, commit, resync],
  );

  const removeSaved = useCallback(
    (key: string) => {
      const s = store();
      if (!s) return;
      const err = removeSavedGame(s, USER_SUFFIX, key);
      if (err) reject(err);
      refreshLibrary();
    },
    [reject, refreshLibrary],
  );

  // ---------- общие действия ----------

  const newGame = useCallback(
    (names: Partial<Record<Seat, string>> = {}, initial: EventBody[] = []) => {
      if (!data) return;
      onlineRef.current = null;
      setOnline(null);
      const ev = stamp({ type: 'game-created', schema: GAME_SCHEMA, seed: newSeed(), names: { p1: names.p1 ?? 'Игрок 1', p2: names.p2 ?? 'Игрок 2' } }, 1);
      const list = [ev, ...initial.map((b, i) => stamp(b, i + 2))];
      const r = replay(list, data.catalog);
      if (!r.ok) return reject(r.error);
      commit(list, r.state);
      setError(persist(list, r.state));
    },
    [data, stamp, reject, persist, commit],
  );

  const dispatch = useCallback(
    (body: EventBody): boolean => {
      const st = stateRef.current;
      if (!data || !st) return false;
      const ev = stamp(body, st.lastSeq + 1);
      const r = applyEvent(st, ev, data.catalog);
      if (!r.ok) {
        reject(r.error);
        return false;
      }
      const list = [...eventsRef.current, ev];
      commit(list, r.state);
      if (onlineRef.current) {
        setError(null);
        send([ev]);
      } else setError(persist(list, r.state));
      return true;
    },
    [data, stamp, reject, commit, persist, send],
  );

  // отмена: на двух телефонах — только своё последнее действие (движок проверяет место)
  const target = undoTarget(events);
  const canUndo = !!target && (!online || target.seat === null || target.seat === online.seat);
  const undo = useCallback(() => {
    const st = stateRef.current;
    const list = eventsRef.current;
    const t = undoTarget(list);
    if (!data || !st || !t) return;
    // отмене нужна история — журнал проигрывается целиком
    const ev = stamp({ type: 'event-reverted', target: t.id }, st.lastSeq + 1);
    const next = [...list, ev];
    const r = replay(next, data.catalog);
    if (!r.ok) return reject(r.error);
    haptic.tap();
    commit(next, r.state);
    if (onlineRef.current) send([ev]);
    else setError(persist(next, r.state));
  }, [data, stamp, reject, commit, persist, send]);

  return {
    data,
    loadError,
    events,
    state,
    error,
    clearError: () => setError(null),
    newGame,
    dispatch,
    canUndo,
    undo,
    library,
    openSaved,
    removeSaved,
    closeGame,
    online,
    sync,
    startOnline,
    joinOnline,
  };
}
