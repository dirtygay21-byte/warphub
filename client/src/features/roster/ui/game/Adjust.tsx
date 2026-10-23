import { useEffect, useRef, useState } from 'react';
import type { GameEvent, Seat } from '../../game';
import { haptic, pushOverlay } from '../../telegram';
import { Button, IconButton, Segmented } from '../kit';
import { cx } from '../util';
import type { GameHook } from './useGame';

interface CpLine {
  round: number;
  delta: number;
  text: string;
}

/**
 * История CP игрока из журнала (G3.5): +1 в каждой фазе командования, +1 за сброс, −1 за замену, стратагемы и прочее.
 * Отменённые события снимаются как стек (как в движке); раунд считается по концам ходов.
 */
function cpHistory(events: GameEvent[], seat: Seat): CpLine[] {
  const live: GameEvent[] = [];
  for (const ev of events) {
    if (ev.type === 'event-reverted') live.pop();
    else live.push(ev);
  }
  let first: Seat | null = null;
  let active: Seat | null = null;
  let round = 1;
  const out: CpLine[] = [];
  for (const ev of live) {
    if (ev.type === 'first-turn-set') first = ev.first;
    else if (ev.type === 'battle-started') active = first;
    else if (ev.type === 'turn-ended') {
      if (active !== first) round++;
      active = active === 'p1' ? 'p2' : 'p1';
    } else if (ev.type === 'command-phase-started') out.push({ round, delta: 1, text: 'фаза командования' });
    else if (ev.type === 'card-discarded' && ev.target === seat && ev.forCp) out.push({ round, delta: 1, text: 'сброс карты' });
    else if (ev.type === 'card-redrawn' && ev.target === seat && ev.reason === 'swap') out.push({ round, delta: -1, text: 'замена карты' });
    else if (ev.type === 'cp-changed' && ev.target === seat)
      out.push({ round, delta: ev.delta, text: `${ev.reason === 'stratagem' ? 'стратагема' : ev.reason === 'base' ? 'базовые' : 'другое'}${ev.note ? ` — ${ev.note}` : ''}` });
  }
  return out;
}

/** Панель игрока: CP (стратагемы, прочее), поправка ПО с причиной, история CP и поправок. «Назад» Telegram закрывает. */
export function AdjustSheet({ game, seat, onClose }: { game: GameHook; seat: Seat; onClose: () => void }) {
  const state = game.state!;
  const p = state.players[seat];
  const finished = state.stage === 'finished';
  // «Назад» Telegram закрывает панель; ref — чтобы новая функция onClose при каждой отрисовке не перерегистрировала оверлей
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => pushOverlay(() => close.current()), []);

  const [note, setNote] = useState('');
  const [kind, setKind] = useState<'primary' | 'secondary'>('primary');
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState('');
  const cp = (d: number, why: 'stratagem' | 'other') => {
    if (game.dispatch({ type: 'cp-changed', target: seat, delta: d, reason: why, ...(note.trim() ? { note: note.trim() } : {}) })) {
      haptic.select();
      setNote('');
    }
  };
  const vp = () => {
    if (game.dispatch({ type: 'vp-adjusted', target: seat, kind, delta, note: reason })) {
      haptic.ok();
      setReason('');
      setDelta(1);
    }
  };
  const history = cpHistory(game.events, seat);

  return (
    <div className="fade-enter fixed inset-0 z-50 flex flex-col bg-black/70" onClick={onClose}>
      <div
        className="sheet-enter mt-auto max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-app-elevated px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-2">
            <p className="font-display min-w-0 flex-1 truncate text-xl font-semibold uppercase">{p.name}</p>
            <IconButton icon="close" label="Закрыть" onClick={onClose} className="size-9" />
          </div>

          <section className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold">Командные очки</p>
              <p className="font-display text-2xl font-semibold leading-none">{p.cp} CP</p>
            </div>
            {!finished ? (
              <>
                <input
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Пояснение (необязательно): название стратагемы…"
                  className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-sm outline-none focus:border-accent"
                />
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <Button variant="primary" disabled={p.cp < 1} onClick={() => cp(-1, 'stratagem')}>
                    −1 стратагема
                  </Button>
                  <Button disabled={p.cp < 1} onClick={() => cp(-1, 'other')}>
                    −1 другое
                  </Button>
                  <Button onClick={() => cp(1, 'other')}>+1 другое</Button>
                </div>
                <p className="mt-1.5 text-[11px] text-white/45">+1 в фазе командования, за сброс и −1 за замену начисляются сами.</p>
              </>
            ) : (
              <p className="mt-1 text-xs text-white/45">Битва окончена — CP не меняются.</p>
            )}
          </section>

          <section className="mt-2.5 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-semibold">Поправка ПО</p>
            <p className="text-[11px] text-white/45">
              Если очки нужно исправить вручную. Идёт в {finished ? 'последний раунд' : `раунд ${state.round}`}; лимиты действуют как обычно.
            </p>
            <Segmented<'primary' | 'secondary'>
              className="mt-2"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'primary', label: 'Основная' },
                { value: 'secondary', label: 'Вторичные' },
              ]}
            />
            <div className="mt-2 flex items-center justify-center gap-3">
              <button type="button" onClick={() => setDelta((d) => (d - 1 === 0 ? -1 : Math.max(-50, d - 1)))} className="size-10 rounded-lg border border-white/15 text-lg active:bg-white/10" aria-label="Меньше">
                −
              </button>
              <span className={cx('font-display w-16 text-center text-2xl font-semibold tabular-nums', delta < 0 ? 'text-danger' : 'text-accent')}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
              <button type="button" onClick={() => setDelta((d) => (d + 1 === 0 ? 1 : Math.min(50, d + 1)))} className="size-10 rounded-lg border border-white/15 text-lg active:bg-white/10" aria-label="Больше">
                +
              </button>
            </div>
            <input
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Причина (обязательно)"
              className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-sm outline-none focus:border-accent"
            />
            <Button variant="primary" className="mt-2 w-full" disabled={!reason.trim()} onClick={vp}>
              Записать поправку
            </Button>
          </section>

          <section className="mt-2.5 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-semibold">История</p>
            {p.adjustments.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {p.adjustments.map((a, i) => (
                  <li key={i} className="text-xs text-white/75">
                    р. {a.round} · {a.kind === 'primary' ? 'основная' : 'вторичные'} {a.delta > 0 ? `+${a.delta}` : a.delta} ПО — {a.note}
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-1.5 space-y-0.5">
              {history.map((h, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="w-8 shrink-0 text-white/45">р. {h.round}</span>
                  <span className={cx('w-8 shrink-0 font-semibold tabular-nums', h.delta < 0 ? 'text-danger' : 'text-accent')}>
                    {h.delta > 0 ? `+${h.delta}` : h.delta}
                  </span>
                  <span className="min-w-0 flex-1 text-white/70">{h.text}</span>
                </li>
              ))}
            </ul>
            {!history.length && !p.adjustments.length && <p className="mt-1 text-xs text-white/45">Пока пусто.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
