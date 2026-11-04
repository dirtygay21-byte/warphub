import type { ReactNode } from 'react';
import { Icon } from '../kit';
import { cx } from '../util';

/** Карточка шага подготовки в установленном оформлении AoS. */
export function SetupStep({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl border bg-white/[0.03] p-4', done ? 'border-white/10' : 'border-accent/30')}>
      <p className="mb-2 flex items-center gap-2">
        <span className={cx('flex size-6 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-accent text-black' : 'bg-white/10 text-fg-2')}>
          {done ? <Icon name="check" className="size-3.5" /> : n}
        </span>
        <span className="font-display text-lg font-semibold uppercase">{title}</span>
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
