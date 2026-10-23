import { layoutPick, layoutsFor } from '../../game';
import { haptic } from '../../telegram';
import { BattleMap, Legend } from '../Battlefield';
import { Button } from '../kit';
import { cx } from '../util';
import type { GameHook } from './useGame';

const LETTERS = ['A', 'B', 'C'];

/**
 * Шаг «Раскладка»: одна из трёх раскладок пары типов армий (у каждой своя карта деплоя) — жребием или вручную.
 * Жребий считает движок по seed и номеру выбора, поэтому результат проверяемый и повторяемый.
 * После определения атакующего и защитника раскладка не меняется.
 */
export function StepLayout({ game, onNext }: { game: GameHook; onNext: () => void }) {
  const state = game.state!;
  const { battlefield, catalog } = game.data!;
  const opts = layoutsFor(state, catalog);
  const locked = !!state.players.p1.role;
  const chosen = battlefield.layouts.find((l) => l.id === state.layoutId);
  const dep = chosen && battlefield.deployments.find((d) => d.id === chosen.deployment);
  const depName = (id: string) => battlefield.deployments.find((d) => d.id === id)?.nameRu ?? id;

  const setLayout = (layoutId: string, random: boolean) => {
    const ok = game.dispatch(
      random ? { type: 'layout-set', layoutId, source: 'random', roll: { attempt: state.layoutDraws } } : { type: 'layout-set', layoutId, source: 'manual' },
    );
    if (ok) haptic.select();
  };
  const draw = () => setLayout(opts[layoutPick(state.seed, state.layoutDraws, opts.length)]!.id, true);

  return (
    <div className="mt-3 space-y-2.5">
      <div className="grid grid-cols-3 gap-1.5">
        {opts.map((l, i) => (
          <button
            key={l.id}
            type="button"
            disabled={locked}
            onClick={() => setLayout(l.id, false)}
            className={cx(
              'min-w-0 rounded-xl border px-2.5 py-2 text-left transition disabled:opacity-60',
              state.layoutId === l.id ? 'border-accent bg-accent/15' : 'border-white/10 bg-white/[0.03] active:bg-white/10',
            )}
          >
            <span className="font-display block text-2xl font-semibold leading-none">{LETTERS[i]}</span>
            <span className="mt-1 block break-words text-[11px] leading-tight text-white/55">{depName(l.deployment)}</span>
          </button>
        ))}
      </div>
      {!locked && (
        <Button className="w-full" onClick={draw}>
          {state.layoutId ? 'Тянуть раскладку заново' : 'Случайная раскладка'}
        </Button>
      )}
      {locked && <p className="text-xs text-white/45">Атакующий и защитник уже определены — раскладка закреплена.</p>}

      {chosen && dep && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-2">
          <p className="px-1 pb-1.5 text-sm font-semibold">
            Раскладка {LETTERS[opts.findIndex((l) => l.id === chosen.id)]} · {dep.nameRu}
            <span className="font-normal text-white/45"> · {dep.name}</span>
          </p>
          <BattleMap layout={chosen} dep={dep} guides="none" className="mx-auto block w-full max-w-[360px]" />
          <Legend />
        </div>
      )}

      <Button variant="primary" className="w-full" disabled={!state.layoutId} onClick={onNext}>
        Далее: атакующий и защитник
      </Button>
    </div>
  );
}
