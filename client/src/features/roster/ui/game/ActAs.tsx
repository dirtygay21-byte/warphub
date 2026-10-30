import type { ReactNode } from 'react';
import type { Seat } from '../../game';
import { useCanAct } from './cardViewer';
import type { GameHook } from './useGame';

/**
 * Два телефона (T4): часть экрана, где действует игрок seat. На его телефоне (и на одном общем) — как есть;
 * на телефоне соперника — только просмотр: все кнопки и поля внутри отключены (fieldset disabled), а не просто скрыты.
 */
export function ActAs({ game, seat, children, note }: { game: GameHook; seat: Seat; children: ReactNode; note?: string }) {
  const can = useCanAct(seat);
  if (can) return <>{children}</>;
  return (
    <fieldset disabled className="m-0 min-w-0 border-0 p-0">
      <div className="opacity-60">{children}</div>
      <p className="mt-1 text-[12px] text-fg-3">{note ?? `Отмечает ${game.state!.players[seat].name} на своём телефоне.`}</p>
    </fieldset>
  );
}
