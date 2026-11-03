import { cx } from '../util';

const COLUMNS: Record<number, string> = { 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6' };

/** Индикатор раундов с сохранением текущего оформления трекера 40K. */
export function RoundDots({ round, rounds, finished }: { round: number; rounds: number; finished: boolean }) {
  return (
    <div className={cx('mt-3 grid gap-1', COLUMNS[rounds] ?? 'grid-cols-5')}>
      {Array.from({ length: rounds }, (_, i) => (
        <span key={i} className={cx('h-1.5 rounded-full', finished || i + 1 < round ? 'bg-accent' : i + 1 === round ? 'bg-accent/50' : 'bg-white/10')} />
      ))}
    </div>
  );
}
