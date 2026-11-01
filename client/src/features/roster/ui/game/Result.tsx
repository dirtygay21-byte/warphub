import { useState } from 'react';
import { battleResult, BATTLE_READY_VP, totals, type Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button, Icon } from '../kit';
import { cx } from '../util';
import { ActAs } from './ActAs';
import { DominatusResult } from './DominatusResult';
import { useMySeat } from './cardViewer';
import { RosterButton } from './RosterViewer';
import { ScoreRows } from './ScoreRows';
import type { GameHook } from './useGame';

const SEATS: Seat[] = ['p1', 'p2'];

/**
 * Итог битвы (G3.6): победитель (по ПО; сдавшийся проигрывает независимо от ПО — решение владельца), как закончилась
 * битва; блоки основной «Конец битвы» для обоих; Battle Ready (+10 ПО за полностью покрашенную армию); разбивка ПО.
 */
export function Result({ game }: { game: GameHook }) {
  const state = game.state!;
  const { catalog } = game.data!;
  const r = battleResult(state, catalog)!;
  const name = (s: Seat) => state.players[s].name;
  const how =
    state.endReason === 'rounds' ? 'после 5 раундов' : state.endReason === 'concede' && state.concededBy ? `${name(state.concededBy)} сдался` : 'по договорённости';
  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl border border-accent/50 bg-accent/15 p-4 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">Итог · {how}</p>
        <p className="font-display mt-1 text-3xl font-semibold uppercase leading-none">{r.winner ? `Победа: ${name(r.winner)}` : 'Ничья'}</p>
        <p className="font-display mt-2 text-2xl font-semibold tabular-nums">
          {r.totals.p1} : {r.totals.p2}
        </p>
        <p className="text-[12px] text-fg-3">
          {name('p1')} — {name('p2')}
          {r.by === 'concede' ? ' · сдавшийся проигрывает независимо от ПО' : ''}
        </p>
      </div>

      {SEATS.map((s) => (
        <ActAs key={s} game={game} seat={s}>
          <EndScoring game={game} seat={s} />
        </ActAs>
      ))}

      {state.mode === 'dominatus' && <DominatusResult game={game} />}

      <div className="grid grid-cols-2 gap-2">
        {SEATS.map((s) => {
          const t = totals(state, s, catalog);
          return (
            <div key={s} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[12px] leading-relaxed">
              <p className="flex items-center gap-1.5 font-semibold">
                <span className="min-w-0 flex-1 truncate">{name(s)}</span>
                <RosterButton seat={s} />
              </p>
              <p>
                Основная: <b>{t.primary.total}</b>
                {t.primary.end ? <span className="text-fg-3"> (конец битвы {t.primary.end})</span> : null}
              </p>
              <p>
                Вторичные: <b>{t.secondary.total}</b>
              </p>
              <p>
                Покраска: <b>{t.battleReady}</b>
              </p>
              {t.primary.cut + t.secondary.cut > 0 && <p className="text-warn">Сверх лимитов: {t.primary.cut + t.secondary.cut}</p>}
              <p className="mt-1 border-t border-white/10 pt-1 font-semibold">Всего: {t.total} ПО</p>
              <p className="text-fg-3">CP осталось: {state.players[s].cp}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Игрок после битвы: блоки «Конец битвы» его основной миссии и Battle Ready. */
function EndScoring({ game, seat }: { game: GameHook; seat: Seat }) {
  const state = game.state!;
  const { missions } = game.data!;
  const p = state.players[seat];
  const card = missions.cards.find((c) => c.id === state.primary[seat]);
  const done = p.primaryScored.filter((x) => x.end).flatMap((x) => x.picks.map((k) => k.block));
  const blocks = card ? card.blocks.map((b, i) => [b, i] as const).filter(([b, i]) => b.rounds === 'end' && !done.includes(i)).map(([, i]) => i) : [];
  const scored = p.primaryScored.filter((x) => x.end);
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <span className="min-w-0 flex-1 text-sm font-semibold">{p.name}: конец битвы</span>
        <Icon name="down" className={cx('size-4 text-fg-3 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {scored.map((x, i) => (
            <p key={i} className="text-xs text-accent">
              ✓ Основная, конец битвы: {x.vp} ПО
            </p>
          ))}
          {card && blocks.length > 0 && (
            <ScoreRows
              card={card}
              blocks={blocks}
              round={5}
              endOfBattle
              label="Засчитать конец битвы"
              onScore={(picks) => {
                const ok = game.dispatch({ type: 'primary-scored', target: seat, picks });
                if (ok) haptic.ok();
                return ok;
              }}
            />
          )}
          {card && !blocks.length && !scored.length && <p className="text-xs text-fg-3">У «{card.name}» нет блоков конца битвы.</p>}
          <label className="flex items-center gap-2.5 rounded-lg border border-white/10 px-2.5 py-2">
            <input
              type="checkbox"
              checked={p.battleReady}
              onChange={(e) => {
                if (game.dispatch({ type: 'player-set', target: seat, patch: { battleReady: e.target.checked } })) haptic.select();
              }}
              className="size-5 accent-[rgb(var(--color-accent))]"
            />
            <span className="min-w-0 flex-1 text-sm">
              Армия полностью покрашена (Battle Ready)
              <span className="block text-[12px] text-fg-3">+{BATTLE_READY_VP} ПО</span>
            </span>
          </label>
        </div>
      )}
    </section>
  );
}

/** Досрочное окончание: кто сдаётся (победа сопернику) или по договорённости; с подтверждением. */
export function EndEarly({ game }: { game: GameHook }) {
  const state = game.state!;
  const [open, setOpen] = useState(false);
  // два телефона: сдаться можно только за себя
  const mine = useMySeat();
  const end = (by: Seat | null) => {
    const ok = game.dispatch(by ? { type: 'battle-ended', reason: 'concede', by } : { type: 'battle-ended', reason: 'manual' });
    if (ok) {
      haptic.ok();
      setOpen(false);
    }
  };
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full py-1 text-center text-xs font-semibold text-fg-3 active:text-fg-2">
        Завершить битву досрочно
      </button>
    );
  return (
    <div className="space-y-2 rounded-xl border border-danger/40 bg-danger/[0.06] p-3">
      <p className="text-sm font-semibold">Завершить битву досрочно?</p>
      <p className="text-[12px] text-fg-3">Если игрок сдаётся — победа сопернику независимо от ПО. «Отменить» вернёт битву.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {SEATS.filter((s) => !mine || s === mine).map((s) => (
          <Button key={s} variant="danger" onClick={() => end(s)}>
            {mine ? 'Я сдаюсь' : `Сдаётся ${state.players[s].name}`}
          </Button>
        ))}
      </div>
      <Button className="w-full" onClick={() => end(null)}>
        По договорённости — итог по ПО
      </Button>
      <Button className="w-full" onClick={() => setOpen(false)}>
        Не завершать
      </Button>
    </div>
  );
}
