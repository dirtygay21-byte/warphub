import { useEffect, useRef, useState } from 'react';
import { decodeRoster } from '../../engine/roster';
import type { DataIndex, Roster } from '../../engine/types';
import type { RosterRef, Seat } from '../../game';
import { pushOverlay } from '../../telegram';
import { Button, Icon } from '../kit';
import { RosterEditor } from '../RosterEditor';
import { cx } from '../util';
import { useOpenRoster } from './cardViewer';

/**
 * Просмотр ростера игрока в игре (режим мастера, G2.12): тот же экран Roster Builder, только чтение.
 * Свой ростер — текущая версия из Roster Builder (если удалён — по коду), чужой — из кода, сохранённого в игре.
 * Правки данных при открытии (миграции) остаются в этом окне и никуда не сохраняются. «Назад» Telegram закрывает.
 */
export function RosterViewer({ rosterRef: r, rosters, index, onClose }: { rosterRef: RosterRef; rosters: Roster[]; index: DataIndex; onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => pushOverlay(() => close.current()), []);
  const [roster, setRoster] = useState<Roster | null>(() => {
    const own = r.source === 'own' && r.rosterId ? rosters.find((x) => x.id === r.rosterId) : undefined;
    if (own) return own;
    try {
      return r.code ? decodeRoster(r.code, index.factions.map((f) => f.id)) : null;
    } catch {
      return null;
    }
  });
  if (!roster)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xl uppercase">Ростер не открыть</p>
        <p className="mt-2 text-sm text-fg-3">В игре нет копии этого ростера.</p>
        <Button className="mt-5" onClick={onClose}>
          К игре
        </Button>
      </div>
    );
  const noop = () => {};
  return (
    <RosterEditor
      roster={roster}
      index={index}
      onBack={onClose}
      onRules={noop}
      onStartGame={noop}
      onChange={setRoster}
      onDuplicate={noop}
      onDelete={noop}
      viewOnly
    />
  );
}

/** Кнопка «Ростер» игрока — только в режиме мастера. */
export function RosterButton({ seat, className }: { seat: Seat; className?: string }) {
  const open = useOpenRoster();
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(seat);
      }}
      className={cx('inline-flex items-center gap-1 rounded-full border border-accent/40 px-2 py-0.5 text-[12px] font-semibold text-accent active:bg-accent/10', className)}
    >
      <Icon name="eye" className="size-3.5" />
      Ростер
    </button>
  );
}
