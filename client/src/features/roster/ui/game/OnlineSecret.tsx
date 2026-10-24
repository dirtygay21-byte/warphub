import { useState, type ReactNode } from 'react';
import type { EventBody, Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button } from '../kit';
import type { GameHook } from './useGame';

/**
 * Тайный выбор на двух телефонах (T4): каждый выбирает у себя; выбор соперника не показывается до раскрытия —
 * видно только, сделан ли он. Когда выбрали оба, раскрыть может любой телефон (общее событие).
 */
export function OnlineSecret({
  game,
  seat,
  chosen,
  what,
  reveal,
  revealLabel,
  extra,
  choose,
}: {
  game: GameHook;
  seat: Seat;
  chosen: (s: Seat) => boolean;
  what: string;
  reveal: EventBody;
  revealLabel: string;
  extra?: ReactNode;
  choose: (onDone: () => void) => ReactNode;
}) {
  const state = game.state!;
  const opp: Seat = seat === 'p1' ? 'p2' : 'p1';
  const [editing, setEditing] = useState(!chosen(seat));
  if (editing) return <>{choose(() => setEditing(false))}</>;
  const both = chosen(seat) && chosen(opp);
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4 text-center">
      <p className="text-sm text-white/70">Ваш выбор ({what}) сохранён и скрыт от соперника.</p>
      <p className="font-display mt-2 text-lg font-semibold uppercase">
        {both ? 'Оба игрока выбрали' : `Ждём: ${state.players[opp].name}`}
      </p>
      {!both && <p className="mt-1 text-[11px] text-white/45">Соперник выбирает на своём телефоне — экран обновится сам.</p>}
      {extra && <div className="mt-3 space-y-2 text-left">{extra}</div>}
      {both && (
        <Button
          variant="primary"
          className="mt-3 w-full"
          onClick={() => {
            if (game.dispatch(reveal)) haptic.ok();
          }}
        >
          {revealLabel}
        </Button>
      )}
      <Button className="mt-2 w-full" onClick={() => setEditing(true)}>
        Изменить свой выбор
      </Button>
    </div>
  );
}
