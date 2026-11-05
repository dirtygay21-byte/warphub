import { useCallback, useEffect, useRef, useState } from 'react';
import { appendRemote, type GameEvent } from '../../game';
import { createOnlineGame, getOnlineEvents, joinOnlineGame, postOnlineEvent, type OnlineGame } from '../../online';

type WireEvent = GameEvent & { game?: 'kt' | 'warcry' };
type OnlineRef = { id: string; code: string; seat: 'p1' | 'p2' };

/** Общая синхронизация журнала Kill Team / Warcry по существующему roster-games API. */
export function useSkirmishOnline<E extends { id: string; seq: number; type: string }>({
  events,
  setEvents,
  replay,
}: {
  events: E[];
  setEvents: React.Dispatch<React.SetStateAction<E[]>>;
  replay: (events: E[]) => { ok: boolean; error?: string };
}) {
  const [online, setOnline] = useState<(OnlineGame & { seat: 'p1' | 'p2' }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState({ sending: false, offline: false });
  const onlineRef = useRef<OnlineRef | null>(null);
  const eventsRef = useRef(events);
  const replayRef = useRef(replay);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => { eventsRef.current = events; }, [events]);
  useEffect(() => { replayRef.current = replay; }, [replay]);

  const resync = useCallback(async () => {
    const current = onlineRef.current;
    if (!current) return false;
    const result = await getOnlineEvents(current.id, 0);
    if (!result.ok) { setSync((s) => ({ ...s, offline: result.status === 0 })); setError(result.error); return false; }
    setSync((s) => ({ ...s, offline: false }));
    setOnline({ ...result.data.game, seat: current.seat });
    const list = result.data.events as unknown as E[];
    const checked = replayRef.current(list);
    if (!checked.ok) { setError(checked.error ?? 'Журнал на сервере не проигрывается'); return false; }
    setEvents(list);
    return true;
  }, [setEvents]);

  const send = useCallback((event: E) => {
    const current = onlineRef.current;
    if (!current) return;
    setSync((s) => ({ ...s, sending: true }));
    queue.current = queue.current.then(async () => {
      const result = await postOnlineEvent(current.id, event.seq - 1, event as unknown as WireEvent);
      if (!result.ok) {
        setSync((s) => ({ ...s, offline: result.status === 0 }));
        await resync();
        setError(result.code === 'CONFLICT' ? 'Соперник сделал действие раньше — повторите своё действие.' : result.error);
      } else setSync((s) => ({ ...s, offline: false }));
      setSync((s) => ({ ...s, sending: false }));
    });
  }, [resync]);

  const start = useCallback(async (event: E) => {
    const result = await createOnlineGame();
    if (!result.ok) { setError(result.error); return false; }
    onlineRef.current = { id: result.data.id, code: result.data.code, seat: 'p1' };
    setOnline({ ...result.data, seat: 'p1' });
    setEvents([event]);
    setError(null);
    send(event);
    return true;
  }, [send, setEvents]);

  const join = useCallback(async (code: string) => {
    const result = await joinOnlineGame(code);
    if (!result.ok || !result.data.seat) { setError(result.ok ? 'Нет свободного места' : result.error); return false; }
    onlineRef.current = { id: result.data.id, code: result.data.code, seat: result.data.seat };
    setOnline({ ...result.data, seat: result.data.seat });
    return resync();
  }, [resync]);

  useEffect(() => {
    if (!online) return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState === 'hidden') return;
      const last = eventsRef.current.at(-1)?.seq ?? 0;
      const result = await getOnlineEvents(online.id, last);
      if (!result.ok) { setSync((s) => ({ ...s, offline: result.status === 0 })); return; }
      setSync((s) => ({ ...s, offline: false }));
      setOnline({ ...result.data.game, seat: online.seat });
      if (!result.data.events.length) return;
      const merged = appendRemote(eventsRef.current as unknown as GameEvent[], result.data.events) as unknown as E[] | null;
      if (!merged) { await resync(); return; }
      const checked = replayRef.current(merged);
      if (!checked.ok) { setError(checked.error ?? 'Событие соперника не принято движком'); return; }
      setEvents(merged);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [online, resync, setEvents]);

  const leave = useCallback(() => {
    onlineRef.current = null;
    setOnline(null);
  }, []);

  return { online, error, setError, sync, start, join, send, resync, leave };
}
