import { useState } from 'react';
import { rollOff, type Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button } from '../kit';
import { Dice } from './Dice';
import type { GameHook } from './useGame';

/**
 * Шаг «Атакующий и защитник» (правила: бросок «кто выше», победитель решает, кто атакующий, а кто защитник).
 * Кубики считает движок по seed и номеру броска — на экране те же, что он проверит. Переброс — только по
 * договорённости и только после записанного результата (следующий номер броска); отмена даёт те же кубики.
 */
export function StepRoles({ game, onNext }: { game: GameHook; onNext: () => void }) {
  const state = game.state!;
  const names = { p1: state.players.p1.name, p2: state.players.p2.name };
  const attacker: Seat | null = state.players.p1.role === 'attacker' ? 'p1' : state.players.p2.role === 'attacker' ? 'p2' : null;
  const locked = state.secondariesRevealed;
  const [mode, setMode] = useState<'idle' | 'roll' | 'manual'>('idle');
  const attempt = state.rollCount.roles;
  const roll = rollOff(state.seed, 'roles', attempt);

  const set = (atk: Seat, random: boolean) => {
    const ok = game.dispatch(random ? { type: 'roles-set', attacker: atk, source: 'random', roll: { attempt } } : { type: 'roles-set', attacker: atk, source: 'manual' });
    if (ok) {
      haptic.ok();
      setMode('idle');
    }
  };
  const other = (s: Seat): Seat => (s === 'p1' ? 'p2' : 'p1');

  return (
    <div className="mt-3 space-y-2.5">
      {mode === 'roll' && (
        <>
          <Dice rolls={roll.rolls} winner={roll.winner} names={names} />
          <p className="text-sm text-white/70">{names[roll.winner]} решает:</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={() => set(roll.winner, true)}>
              Я атакующий
            </Button>
            <Button variant="primary" onClick={() => set(other(roll.winner), true)}>
              Я защитник
            </Button>
          </div>
        </>
      )}

      {mode === 'manual' && (
        <>
          <p className="text-sm text-white/70">Кто атакующий?</p>
          <div className="grid grid-cols-2 gap-2">
            {(['p1', 'p2'] as const).map((s) => (
              <Button key={s} onClick={() => set(s, false)}>
                {names[s]}
              </Button>
            ))}
          </div>
          <Button className="w-full" onClick={() => setMode('idle')}>
            Назад
          </Button>
        </>
      )}

      {mode === 'idle' && attacker && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          {state.rolesSource === 'random' && state.rolls.roles && <Dice rolls={state.rolls.roles.rolls} winner={state.rolls.roles.winner} names={names} />}
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <p className="rounded-lg border border-[#f87171]/40 bg-[#f87171]/10 px-2.5 py-2">
              <span className="block text-[11px] text-white/50">Атакующий</span>
              <span className="font-semibold">{names[attacker]}</span>
            </p>
            <p className="rounded-lg border border-[#60a5fa]/40 bg-[#60a5fa]/10 px-2.5 py-2">
              <span className="block text-[11px] text-white/50">Защитник</span>
              <span className="font-semibold">{names[other(attacker)]}</span>
            </p>
          </div>
          <p className="mt-1.5 text-[11px] text-white/45">{state.rolesSource === 'random' ? 'По броску' : 'По договорённости'}. Зоны и края — как на карте раскладки.</p>
          {!locked && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button onClick={() => setMode('roll')}>Перебросить</Button>
              <Button onClick={() => setMode('manual')}>Изменить вручную</Button>
            </div>
          )}
          {locked && <p className="mt-1.5 text-[11px] text-white/45">Вторичные миссии уже раскрыты — роли закреплены.</p>}
        </div>
      )}

      {mode === 'idle' && !attacker && (
        <div className="grid grid-cols-1 gap-2">
          <Button variant="primary" onClick={() => setMode('roll')}>
            Бросить кубики
          </Button>
          <Button onClick={() => setMode('manual')}>Договорились без броска</Button>
        </div>
      )}

      <Button variant="primary" className="w-full" disabled={!attacker || mode !== 'idle'} onClick={onNext}>
        Далее: вторичные миссии
      </Button>
    </div>
  );
}
