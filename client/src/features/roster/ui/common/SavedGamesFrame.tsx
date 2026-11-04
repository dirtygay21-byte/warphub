import { useEffect, type ReactNode } from 'react';
import { pushOverlay } from '../../telegram';
import { IconButton } from '../kit';

/** Общая оболочка списка сохранённых игр; строки остаются специфичными для системы. */
export function SavedGamesFrame({ count, note, onClose, children }: { count: number; note: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => pushOverlay(onClose), [onClose]);
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <IconButton icon="back" label="Назад" onClick={onClose} className="size-8" />
        <p className="font-display min-w-0 flex-1 text-xl font-semibold uppercase">Сохранённые игры</p>
        <span className="text-xs text-fg-3">{count}</span>
      </div>
      {!count && <p className="py-6 text-center text-sm text-fg-3">Сохранённых игр пока нет.</p>}
      {children}
      <p className="pt-1 text-[12px] text-fg-3">{note}</p>
    </section>
  );
}
