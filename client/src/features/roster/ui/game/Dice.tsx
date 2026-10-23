import type { Seat } from '../../game';
import { cx } from '../util';

/** Бросок «кто выше»: все броски по порядку (ничьи перебрасываются), последний — с победителем. */
export function Dice({ rolls, winner, names }: { rolls: { p1: number; p2: number }[]; winner: Seat; names: Record<Seat, string> }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 text-center text-[11px] text-white/45">
        <span className="truncate">{names.p1}</span>
        <span />
        <span className="truncate">{names.p2}</span>
      </div>
      {rolls.map((r, i) => {
        const last = i === rolls.length - 1;
        return (
          <div key={i} className={cx('mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3', !last && 'opacity-50')}>
            <Die value={r.p1} win={last && winner === 'p1'} />
            <span className="text-[11px] font-semibold uppercase text-white/40">{last ? 'vs' : 'ничья'}</span>
            <Die value={r.p2} win={last && winner === 'p2'} />
          </div>
        );
      })}
      <p className="mt-2 text-center text-sm">
        Победил <span className="font-semibold text-accent">{names[winner]}</span>
      </p>
    </div>
  );
}

function Die({ value, win }: { value: number; win: boolean }) {
  return (
    <span
      className={cx(
        'font-display mx-auto flex size-11 items-center justify-center rounded-xl border-2 text-2xl font-semibold',
        win ? 'border-accent bg-accent/15 text-accent' : 'border-white/20 text-white/80',
      )}
    >
      {value}
    </span>
  );
}
