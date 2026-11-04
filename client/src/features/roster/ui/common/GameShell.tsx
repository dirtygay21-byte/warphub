import type { ReactNode } from 'react';
import { IconButton } from '../kit';
import { cx } from '../util';

/** Общая шапка игрового экрана. Визуальные различия режимов передаются через props. */
export function GameShell({
  onBack,
  undo,
  kicker,
  title,
  master,
  onMaster,
  className,
  undoClassName,
  children,
}: {
  onBack: () => void;
  undo?: () => void;
  kicker: string;
  title: string;
  master?: boolean;
  onMaster?: () => void;
  className?: string;
  undoClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('mx-auto min-h-dvh max-w-lg px-4 pt-5', className)}>
      <header className="mb-4 flex items-end gap-3">
        <IconButton icon="back" label="Назад" onClick={onBack} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{kicker}</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">{title}</h1>
        </div>
        {onMaster && (
          <button
            type="button"
            onClick={onMaster}
            aria-pressed={master}
            title="Режим мастера: открывать ростеры игроков"
            className={cx(
              'mb-0.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
              master ? 'border-accent bg-accent/15 text-accent' : 'border-white/15 text-fg-2 active:bg-white/10',
            )}
          >
            Мастер
          </button>
        )}
        {undo && (
          <button
            type="button"
            onClick={undo}
            className={undoClassName ?? 'mb-0.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-fg-2 active:bg-white/10'}
          >
            Отменить
          </button>
        )}
      </header>
      {children}
    </div>
  );
}
