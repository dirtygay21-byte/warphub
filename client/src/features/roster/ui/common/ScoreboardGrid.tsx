import type { ReactNode } from 'react';
import { cx } from '../util';

/** Двухколоночная сетка счёта игроков. */
export function ScoreboardGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('grid grid-cols-2 gap-2', className)}>{children}</div>;
}
