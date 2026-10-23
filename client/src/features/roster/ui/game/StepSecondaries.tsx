import { useState } from 'react';
import type { SecondaryMode, Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button, Icon, Segmented } from '../kit';
import { MissionCardView } from '../MissionCard';
import { cx } from '../util';
import { DeckList, SecondaryCard } from './SecondaryCard';
import type { GameHook } from './useGame';

/**
 * Шаг «Вторичные миссии» (правила: игроки тайно отмечают режим — тактические или две фиксированные, затем раскрывают).
 * На одном телефоне — по очереди с экраном «передайте телефон»; на двух — каждый у себя (secondary-chosen),
 * раскрытие — secondaries-revealed.
 */
export function StepSecondaries({ game, onNext }: { game: GameHook; onNext: () => void }) {
  const state = game.state!;
  const [phase, setPhase] = useState<'p1' | 'pass' | 'p2' | 'ready'>('p1');
  if (state.secondariesRevealed) return <Revealed game={game} onNext={onNext} />;

  if (phase === 'pass' || phase === 'ready') {
    const who = state.players.p2.name;
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4 text-center">
        {phase === 'pass' ? (
          <>
            <p className="text-sm text-white/70">Выбор игрока «{state.players.p1.name}» сохранён и скрыт.</p>
            <p className="font-display mt-2 text-lg font-semibold uppercase">Передайте телефон: {who}</p>
            <Button variant="primary" className="mt-3 w-full" onClick={() => setPhase('p2')}>
              Я — {who}, выбрать вторичные
            </Button>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-semibold uppercase">Оба игрока выбрали</p>
            <p className="mt-1 text-sm text-white/60">Положите телефон так, чтобы видели оба, и раскройте выбор.</p>
            <div className="mt-3 space-y-2 text-left">
              <SecondaryCard game={game} seat="p1" hidden />
              <SecondaryCard game={game} seat="p2" hidden />
            </div>
            <Button
              variant="primary"
              className="mt-3 w-full"
              onClick={() => {
                if (game.dispatch({ type: 'secondaries-revealed' })) haptic.ok();
              }}
            >
              Раскрыть вторичные миссии
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

function Choose({ seat, game, onDone }: { seat: Seat; game: GameHook; onDone: () => void }) {
  const state = game.state!;
  const p = state.players[seat];
  const fixedCards = game.data!.missions.cards.filter((c) => c.type === 'secondary' && c.modes?.includes('fixed'));
  const cap = game.data!.missions.caps.fixedSecondaryCard;
  const [mode, setMode] = useState<SecondaryMode>(p.secondaryMode ?? 'tactical');
  const [picked, setPicked] = useState<string[]>(p.fixed ? [...p.fixed] : []);
  const [open, setOpen] = useState<string | null>(null);
  const [deck, setDeck] = useState(false);
  const ready = mode === 'tactical' || picked.length === 2;

  const toggle = (id: string) => {
    haptic.select();
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length < 2 ? [...list, id] : [list[1]!, id]));
  };
  const done = () => {
    const fixed = mode === 'fixed' ? ([picked[0]!, picked[1]!] as [string, string]) : null;
    const same = p.secondaryMode === mode && (mode === 'tactical' || (p.fixed && fixed && p.fixed.join('|') === fixed.join('|')));
    if (same || game.dispatch({ type: 'secondary-chosen', target: seat, mode, fixed })) {
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
      <p className="mt-0.5 text-[11px] text-white/45">Колода {p.role === 'attacker' ? 'атакующего' : 'защитника'} — те же 18 карт, что у соперника.</p>
      <Segmented<SecondaryMode>
        className="mt-2"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'tactical', label: 'Тактические', hint: 'по 2 карты в каждой фазе командования' },
          { value: 'fixed', label: 'Фиксированные', hint: 'две карты на всю битву' },
        ]}
      />
      {mode === 'tactical' ? (
        <>
          <p className="mt-2 text-xs leading-snug text-white/55">
            Колода перемешивается; в начале каждой своей фазы командования вы тянете две карты. Карта активна до выполнения или сброса.
            Выполненные засчитываются в конце хода, указанного на карте; ненужные можно сбросить в конце своего хода (1 CP за ход), одну
            карту за битву — заменить за 1 CP.
          </p>
          <button
            type="button"
            onClick={() => setDeck((v) => !v)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-[13px] font-semibold active:bg-white/10"
          >
            Все карты колоды ({game.data!.missions.cards.filter((c) => c.type === 'secondary').length})
            <Icon name="down" className={cx('size-4 text-white/50 transition', deck && 'rotate-180')} />
          </button>
          {deck && <DeckList cards={game.data!.missions.cards.filter((c) => c.type === 'secondary')} />}
        </>
      ) : (
        <>
          <p className="mt-2 text-xs leading-snug text-white/55">
            Выберите две — они активны всю битву, их нельзя сбросить{cap ? `; с одной карты — не больше ${cap} ПО` : ''}. Фиксированными можно взять только эти
            карты:
          </p>
          <ul className="mt-2 space-y-1.5">
            {fixedCards.map((c) => {
              const on = picked.includes(c.id);
              return (
                <li key={c.id}>
                  <div className={cx('flex items-center gap-2 rounded-lg border px-2.5 py-2', on ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03]')}>
                    <button type="button" onClick={() => toggle(c.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className={cx('flex size-5 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent text-black' : 'border-white/30')}>
                        {on && <Icon name="check" className="size-3.5" strokeWidth={3} />}
                      </span>
                      <span className="truncate text-sm font-semibold">{c.name}</span>
                    </button>
                    <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="shrink-0 text-xs font-semibold text-accent/90">
                      {open === c.id ? 'Скрыть' : 'Карта'}
                    </button>
                  </div>
                  {open === c.id && <MissionCardView card={c} className="mt-1.5" />}
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-[11px] text-white/45">Выбрано: {picked.length} из 2</p>
        </>
      )}
      <Button variant="primary" className="mt-3 w-full" disabled={!ready} onClick={done}>
        Готово — скрыть выбор
      </Button>
    </div>
  );
}

/** После раскрытия: карточки вторичных миссий обоих игроков (SecondaryCard). */
function Revealed({ game, onNext }: { game: GameHook; onNext: () => void }) {
  return (
    <div className="mt-3 space-y-2">
      {(['p1', 'p2'] as const).map((s) => (
        <SecondaryCard key={s} game={game} seat={s} />
      ))}
      <Button variant="primary" className="w-full" onClick={onNext}>
        Далее: первый ход
      </Button>
    </div>
  );
}
