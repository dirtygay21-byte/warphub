import { useCallback, useEffect, useRef, useState } from 'react';
import type { AosBattlepack } from '../../aos/types';
import {
  AOS_GAME_SCHEMA,
  aosSeatForEvent,
  aosUndoTarget,
  applyAosEvent,
  loadAosGame,
  readAosLibrary,
  rememberAosOnline,
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
import { appendRemote, isAosLog, type GameEvent } from '../../game';
import { newSeed } from '../../game/rng';
import { createOnlineGame, getOnlineEvents, joinOnlineGame, postOnlineEvent, type OnlineGame } from '../../online';
import { haptic, tg } from '../../telegram';

const USER_SUFFIX = tg?.initDataUnsafe.user?.id ? `.${tg.initDataUnsafe.user.id}` : '';
/** как часто телефон спрашивает сервер о новых событиях соперника (как у 40K) */
const POLL_MS = 2500;
const store = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
// сервер общий с 40K и типизирован под журнал 40K: события AoS идут теми же запросами
const asAos = (list: GameEvent[]) => list as unknown as AosGameEvent[];
const asWire = (ev: AosGameEvent) => ev as unknown as GameEvent;
type OnlineRef = { id: string; seat: Seat; code: string };

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
  openSaved: (key: string) => Promise<boolean>;
  removeSaved: (key: string) => void;
  closeGame: () => void;
  /** игра на двух телефонах: null — один телефон */
  online: (OnlineGame & { seat: Seat }) | null;
  sync: { sending: boolean; offline: boolean };
  startOnline: (initial?: AosEventBody[]) => Promise<boolean>;
  joinOnline: (code: string) => Promise<boolean>;
  /** может ли этот телефон действовать за игрока (один телефон — за обоих) */
  mine: (seat: Seat) => boolean;
}

/**
 * Игра AoS на экране (S6): журнал событий + состояние из движка aosgame. Один телефон — журнал на телефоне после каждого
 * действия. Два телефона (30.10.2026, как у 40K): событие применяется у себя и уходит на сервер с ожидаемым номером;
 * при конфликте журнал берётся с сервера заново; события соперника — опросом. Свои события — со своим местом.
 */
export function useAosGame(): AosGameHook {
  const [bp, setBp] = useState<AosBattlepack | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<AosGameEvent[]>([]);
  const [state, setState] = useState<AosGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<AosSavedEntry[] | null>(null);
  const [online, setOnline] = useState<AosGameHook['online']>(null);
  const [sync, setSync] = useState({ sending: false, offline: false });
  const eventsRef = useRef<AosGameEvent[]>([]);
  const stateRef = useRef<AosGameState | null>(null);
  const onlineRef = useRef<OnlineRef | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);

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
      if (onlineRef.current) return null;
      const s = store();
      return bp && s ? saveAosGame(s, USER_SUFFIX, list, st, bp) : null;
    },
    [bp],
  );
  // два телефона: сводка в списке игр обновляется после каждого изменения
  useEffect(() => {
    const s = store();
    if (online && state && bp && s) rememberAosOnline(s, USER_SUFFIX, { gameId: online.id, seat: online.seat, code: online.code }, state, bp);
  }, [online, state, bp]);

  const stamp = useCallback((body: AosEventBody, seq: number): AosGameEvent => {
    const o = onlineRef.current;
    return { seat: o ? aosSeatForEvent(body.type, o.seat) : null, ...body, id: uid(), seq, at: new Date().toISOString() } as AosGameEvent;
  }, []);
  const reject = useCallback((msg: string) => {
    setError(msg);
    haptic.error();
  }, []);

  // ---------- два телефона ----------
  const resync = useCallback(async (): Promise<boolean> => {
    const o = onlineRef.current;
    if (!o || !bp) return false;
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
    if (!isAosLog(r.data.events)) {
      setError('Это игра Warhammer 40,000 — откройте её в разделе Warhammer 40,000 → «Начать игру».');
      return false;
    }
    const list = asAos(r.data.events);
    const rp = replayAos(list, bp);
    if (!rp.ok) {
      setError(`Журнал игры на сервере не проигрывается (событие №${rp.seq}): ${rp.error}`);
      return false;
    }
    commit(list, rp.state);
    return true;
  }, [bp, commit]);

  const send = useCallback(
    (list: AosGameEvent[]) => {
      const o = onlineRef.current;
      if (!o) return;
      pending.current += list.length;
      setSync((x) => ({ ...x, sending: true }));
      queue.current = queue.current.then(async () => {
        let failed = false;
        for (const ev of list) {
          if (failed) break;
          const r = await postOnlineEvent(o.id, ev.seq - 1, asWire(ev));
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

  useEffect(() => {
    if (!online || !bp) return;
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
      const merged = appendRemote(eventsRef.current, asAos(r.data.events));
      if (!merged) return void resync();
      const rp = replayAos(merged, bp);
      if (!rp.ok) return setError(`Событие соперника не принято движком (№${rp.seq}): ${rp.error}`);
      commit(merged, rp.state);
      haptic.tap();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [online, bp, resync, commit]);

  const enterOnline = useCallback(
    (g: OnlineGame, seat: Seat) => {
      onlineRef.current = { id: g.id, seat, code: g.code };
      const s = store();
      if (s && bp) rememberAosOnline(s, USER_SUFFIX, { gameId: g.id, seat, code: g.code }, null, bp);
      setOnline({ ...g, seat });
    },
    [bp],
  );

  const startOnline = useCallback(
    async (initial: AosEventBody[] = []): Promise<boolean> => {
      if (!bp) return false;
      const r = await createOnlineGame();
      if (!r.ok) return (reject(r.error), false);
      enterOnline(r.data, 'p1');
      const names = { p1: r.data.players.p1?.name || 'Игрок 1', p2: 'Игрок 2' };
      const list = [stamp({ type: 'game-created', schema: AOS_GAME_SCHEMA, seed: newSeed(), names, system: 'aos' }, 1), ...initial.map((b, i) => stamp(b, i + 2))];
      const rp = replayAos(list, bp);
      if (!rp.ok) return (reject(rp.error), false);
      commit(list, rp.state);
      setError(null);
      send(list);
      return true;
    },
    [bp, reject, enterOnline, stamp, commit, send],
  );

  const joinOnline = useCallback(
    async (code: string): Promise<boolean> => {
      if (!bp) return false;
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
        const ev = stamp({ type: 'player-set', target: seat, patch: { name: myName.slice(0, 24) } }, st.lastSeq + 1);
        const a = applyAosEvent(st, ev, bp);
        if (a.ok) {
          commit([...eventsRef.current, ev], a.state);
          send([ev]);
        }
      }
      setError(null);
      return true;
    },
    [bp, reject, enterOnline, resync, stamp, commit, send],
  );

  // ---------- общие действия ----------
  const newGame = useCallback(
    (initial: AosEventBody[] = []) => {
      if (!bp) return;
      onlineRef.current = null;
      setOnline(null);
      const list = [stamp({ type: 'game-created', schema: AOS_GAME_SCHEMA, seed: newSeed(), names: { p1: 'Игрок 1', p2: 'Игрок 2' } }, 1), ...initial.map((b, i) => stamp(b, i + 2))];
      const r = replayAos(list, bp);
      if (!r.ok) return reject(r.error);
      commit(list, r.state);
      setError(persist(list, r.state));
    },
    [bp, stamp, reject, commit, persist],
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
      if (onlineRef.current) {
        setError(null);
        send([ev]);
      } else setError(persist(list, r.state));
      return true;
    },
    [bp, stamp, reject, commit, persist, send],
  );

  const target = aosUndoTarget(events);
  const canUndo = !!target && (!online || target.seat === null || target.seat === online.seat);
  const undo = useCallback(() => {
    const st = stateRef.current;
    const t = aosUndoTarget(eventsRef.current);
    if (!bp || !st || !t) return;
    const next = [...eventsRef.current, stamp({ type: 'event-reverted', target: t.id }, st.lastSeq + 1)];
    const r = replayAos(next, bp);
    if (!r.ok) return reject(r.error);
    haptic.tap();
    commit(next, r.state);
    if (onlineRef.current) send([next.at(-1)!]);
    else setError(persist(next, r.state));
  }, [bp, stamp, reject, commit, persist, send]);

  const refresh = useCallback(() => {
    const s = store();
    if (s) setLibrary(readAosLibrary(s, USER_SUFFIX));
  }, []);
  const openSaved = useCallback(
    async (key: string): Promise<boolean> => {
      const s = store();
      if (!bp || !s) return false;
      const entry = readAosLibrary(s, USER_SUFFIX).find((e) => e.key === key);
      if (entry?.online) {
        const link = entry.online;
        onlineRef.current = { id: link.gameId, seat: link.seat, code: link.code };
        setOnline({ id: link.gameId, code: link.code, seat: link.seat, lastSeq: 0, players: { p1: null, p2: null }, createdAt: '', updatedAt: '' });
        if (await resync()) return true;
        onlineRef.current = null;
        setOnline(null);
        return false;
      }
      const r = loadAosGame(s, USER_SUFFIX, key, bp);
      if (typeof r === 'string') return (reject(r), false);
      onlineRef.current = null;
      setOnline(null);
      commit(r.events, r.state);
      setError(null);
      return true;
    },
    [bp, commit, reject, resync],
  );
  const removeSaved = useCallback(
    (key: string) => {
      const s = store();
      if (!s) return;
      const err = removeAosGame(s, USER_SUFFIX, key);
      if (err) reject(err);
      refresh();
    },
    [refresh, reject],
  );
  const closeGame = useCallback(() => {
    onlineRef.current = null;
    setOnline(null);
    commit([], null);
    setError(null);
    refresh();
  }, [commit, refresh]);

  const mine = useCallback((seat: Seat) => !online || online.seat === seat, [online]);

  return { bp, loadError, events, state, error, clearError: () => setError(null), newGame, dispatch, canUndo, undo, library, openSaved, removeSaved, closeGame, online, sync, startOnline, joinOnline, mine };
}
