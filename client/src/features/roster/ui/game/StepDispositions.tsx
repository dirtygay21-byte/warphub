import { useState } from 'react';
import type { Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button } from '../kit';
import { MissionCardView } from '../MissionCard';
import { cx } from '../util';
import type { GameHook } from './useGame';

/**
 * Шаг «Типы армий» (правила: каждый игрок тайно выбирает тип армии из тех, что дают детачменты его ростера, затем оба раскрывают).
 * На одном телефоне — по очереди, с экраном «передайте телефон»; на двух телефонах каждый выберет у себя
 * (выбор — отдельные события player-set, раскрытие — dispositions-revealed).
 */
export function StepDispositions({ game, onNext }: { game: GameHook; onNext: () => void }) {
  const state = game.state!;
  const [phase, setPhase] = useState<'p1' | 'pass' | 'p2' | 'ready'>('p1');
  if (state.dispositionsRevealed) return <Revealed game={game} onNext={onNext} />;

  if (phase === 'pass' || phase === 'ready') {
    const who = state.players.p2.name;
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4 text-center">
        {phase === 'pass' ? (
          <>
            <p className="text-sm text-white/70">Выбор игрока «{state.players.p1.name}» сохранён и скрыт.</p>
            <p className="font-display mt-2 text-lg font-semibold uppercase">Передайте телефон: {who}</p>
            <Button variant="primary" className="mt-3 w-full" onClick={() => setPhase('p2')}>
              Я — {who}, выбрать тип армии
            </Button>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-semibold uppercase">Оба игрока выбрали</p>
            <p className="mt-1 text-sm text-white/60">Положите телефон так, чтобы видели оба, и раскройте выбор.</p>
            <Button
              variant="primary"
              className="mt-3 w-full"
              onClick={() => {
                if (game.dispatch({ type: 'dispositions-revealed' })) haptic.ok();
              }}
            >
              Раскрыть типы армий
            </Button>
            <Button className="mt-2 w-full" onClick={() => setPhase('p1')}>
              Изменить выбор
            </Button>
          </>
        )}
      </div>
    );
  }

  return <Choose key={phase} seat={phase} game={game} onDone={() => setPhase(phase === 'p1' ? 'pass' : 'ready')} />;
}

/** Тайный выбор одного игрока; тип армии из ростера отмечен заранее. */
function Choose({ seat, game, onDone }: { seat: Seat; game: GameHook; onDone: () => void }) {
  const state = game.state!;
  const p = state.players[seat];
  // G2.12: только типы армий, которые дают детачменты ростера; выбранный в ростере — заранее
  const allowed = p.roster.dispositions ?? [];
  const list = game.data!.battlefield.dispositions.filter((d) => allowed.includes(d.id));
  const fromRoster = list.find((d) => d.name === p.roster.forceDisposition || d.id === p.roster.forceDisposition)?.id ?? null;
  const [pick, setPick] = useState<string | null>(p.disposition ?? fromRoster ?? (list.length === 1 ? list[0]!.id : null));
  const done = () => {
    if (!pick) return;
    if (pick === p.disposition || game.dispatch({ type: 'player-set', target: seat, patch: { disposition: pick } })) {
      haptic.ok();
      onDone();
    }
  };
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-sm">
        Выбирает <span className="font-semibold text-accent">{p.name}</span>
        <span className="text-white/50"> — втайне от соперника</span>
      </p>
      <p className="mt-0.5 text-[11px] text-white/45">
        {list.length === 1
          ? `Ростер «${p.roster.name ?? ''}» даёт один тип армии — подтвердите его.`
          : `Типы армий, которые дают детачменты ростера «${p.roster.name ?? ''}».`}
      </p>
      <div className="mt-2 grid grid-cols-1 gap-1.5 min-[380px]:grid-cols-2">
        {list.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => (haptic.select(), setPick(d.id))}
            className={cx(
              'rounded-xl border px-3 py-2 text-left transition',
              pick === d.id ? 'border-accent bg-accent/15' : 'border-white/10 bg-white/[0.03] active:bg-white/10',
            )}
          >
            <span className="block text-sm font-semibold">{d.nameRu}</span>
            <span className="block text-[11px] text-white/45">
              {d.name}
              {d.id === fromRoster ? ' · из ростера' : ''}
            </span>
          </button>
        ))}
      </div>
      <Button variant="primary" className="mt-3 w-full" disabled={!pick} onClick={done}>
        Готово — скрыть выбор
      </Button>
    </div>
  );
}

/** После раскрытия: типы армий и основные миссии обоих игроков. */
function Revealed({ game, onNext }: { game: GameHook; onNext: () => void }) {
  const state = game.state!;
  const { battlefield, missions } = game.data!;
  const [side, setSide] = useState<Seat>('p1');
  const dName = (id: string | null) => battlefield.dispositions.find((d) => d.id === id)?.nameRu ?? '—';
  const card = missions.cards.find((c) => c.id === state.primary[side]);
  const foe: Seat = side === 'p1' ? 'p2' : 'p1';
  return (
    <div className="mt-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        {(['p1', 'p2'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={cx('min-w-0 rounded-xl border px-2.5 py-2 text-left transition', side === s ? 'border-accent bg-accent/15' : 'border-white/10 bg-white/[0.03] active:bg-white/10')}
          >
            <span className="block truncate text-[11px] text-white/45">{state.players[s].name}</span>
            <span className="block text-sm font-semibold">{dName(state.players[s].disposition)}</span>
            <span className="block truncate text-[11px] text-accent">{missions.cards.find((c) => c.id === state.primary[s])?.name ?? '—'}</span>
          </button>
        ))}
      </div>
      {card && <MissionCardView card={card} foeName={dName(state.players[foe].disposition)} />}
      <Button variant="primary" className="w-full" onClick={onNext}>
        Далее: раскладка
      </Button>
    </div>
  );
}
