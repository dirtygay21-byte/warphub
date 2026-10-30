import { useState } from 'react';
import { haptic, shareText } from '../../telegram';
import { Button } from '../kit';
import { cx } from '../util';
import type { Seat } from '../../game';
import type { OnlineGame } from '../../online';

/** Что нужно экрану игры на двух телефонах — общее для 40K (useGame) и AoS (useAosGame, 30.10.2026). */
export type OnlineLike = {
  online: (OnlineGame & { seat: Seat }) | null;
  state: { players: Record<Seat, { name: string }> } | null;
  sync: { sending: boolean; offline: boolean };
  joinOnline: (code: string) => Promise<boolean>;
  closeGame: () => void;
};

/**
 * Игра на двух телефонах (T3): создать игру (этот телефон — игрок 1, сопернику — код) или войти по коду (игрок 2);
 * вернуться к незаконченной. Журнал хранит сервер; каждый телефон действует только за своего игрока.
 */
export function OnlineStart({ game, onCreate, busy }: { game: OnlineLike; onCreate: () => Promise<void>; busy: boolean }) {
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const run = async (f: () => Promise<unknown>) => {
    setWorking(true);
    await f();
    setWorking(false);
  };
  const disabled = busy || working;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="font-display text-xl font-semibold uppercase">На двух телефонах</p>
      <p className="mt-1 text-sm leading-snug text-white/60">
        Каждый игрок ведёт игру на своём телефоне: свой ростер, тайный выбор, свои карты и CP. Счёт и ход видны обоим.
        Начатые игры — в «Сохранённых играх».
      </p>
      <Button className="mt-3 w-full" disabled={disabled} onClick={() => void run(onCreate)}>
        Создать игру и позвать соперника
      </Button>
      <div className="mt-3 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          placeholder="Код игры"
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm uppercase tracking-widest text-white outline-none focus:border-accent"
        />
        <Button disabled={disabled || code.trim().length < 4} onClick={() => void run(() => game.joinOnline(code.trim()))}>
          Войти
        </Button>
      </div>
    </div>
  );
}

/** Полоса игры на двух телефонах: код, кто я, есть ли соперник, связь; «Позвать» и «К списку» (игра остаётся в сохранённых). */
export function OnlineBar({ game, system = '40k' }: { game: OnlineLike; system?: '40k' | 'aos' }) {
  const o = game.online;
  if (!o) return null;
  const opp = o.seat === 'p1' ? 'p2' : 'p1';
  const me = game.state?.players[o.seat].name ?? (o.seat === 'p1' ? 'Игрок 1' : 'Игрок 2');
  const joined = !!o.players[opp];
  const invite = () => {
    shareText(`Игра ${system === 'aos' ? 'Age of Sigmar' : 'Warhammer 40,000'} в WarpHub: откройте WarpBuilder${system === 'aos' ? ' → Age of Sigmar' : ''} → «Начать игру» → «На двух телефонах» и введите код ${o.code}`);
    haptic.tap();
  };
  const status = game.sync.offline ? 'нет связи' : game.sync.sending ? 'отправка…' : 'на связи';
  return (
    <div className="mb-3 rounded-xl border border-accent/30 bg-accent/[0.06] px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold tracking-widest text-accent">{o.code}</span>
        <span className="min-w-0 flex-1 truncate text-white/70">
          Вы — <b className="text-white">{me}</b> · {o.seat === 'p1' ? 'игрок 1' : 'игрок 2'}
        </span>
        <span className={cx('flex items-center gap-1', game.sync.offline ? 'text-danger' : 'text-white/55')}>
          <span className={cx('size-1.5 rounded-full', game.sync.offline ? 'bg-danger' : game.sync.sending ? 'bg-warn' : 'bg-accent')} />
          {status}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 text-white/55">{joined ? `Соперник: ${o.players[opp]!.name}` : 'Соперник ещё не вошёл — отправьте ему код'}</span>
        {!joined && (
          <button type="button" onClick={invite} className="rounded-full border border-accent/50 px-2.5 py-1 font-semibold text-accent active:bg-accent/10">
            Позвать
          </button>
        )}
        <button type="button" onClick={game.closeGame} className="rounded-full border border-white/15 px-2.5 py-1 font-semibold text-white/60 active:bg-white/10">
          К списку
        </button>
      </div>
    </div>
  );
}
