import type { ReactNode } from 'react';
import type { DataIndex } from '../../engine/types';
import { rollOff, setupMissing, type Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button } from '../kit';
import { CardLink } from './CardSheet';
import { Dice } from './Dice';
import { RosterButton } from './RosterViewer';
import type { GameHook } from './useGame';

const LETTERS = ['A', 'B', 'C'];

/**
 * Шаг «Первый ход» (правила: бросок «кто выше», победитель ходит первым — выбора нет) + сводка подготовки +
 * «Начать битву». По договорённости первый ход можно назначить вручную.
 */
export function StepStart({ game, index }: { game: GameHook; index: DataIndex }) {
  const state = game.state!;
  const names = { p1: state.players.p1.name, p2: state.players.p2.name };
  const attempt = state.rollCount['first-turn'];
  const missing = setupMissing(state).filter((m) => m !== 'кто ходит первым');

  const rollFirst = () => {
    const r = rollOff(state.seed, 'first-turn', attempt);
    if (game.dispatch({ type: 'first-turn-set', first: r.winner, source: 'random', roll: { attempt } })) haptic.ok();
  };
  const setFirst = (s: Seat) => {
    if (game.dispatch({ type: 'first-turn-set', first: s, source: 'manual' })) haptic.select();
  };
  const start = () => {
    if (game.dispatch({ type: 'battle-started' })) haptic.ok();
  };

  return (
    <div className="mt-3 space-y-2.5">
      {state.firstTurn ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          {state.firstTurnSource === 'random' && state.rolls['first-turn'] && (
            <Dice rolls={state.rolls['first-turn'].rolls} winner={state.rolls['first-turn'].winner} names={names} />
          )}
          <p className="mt-2 text-sm">
            Первым ходит <span className="font-semibold text-accent">{names[state.firstTurn]}</span>
            <span className="text-white/45"> · {state.firstTurnSource === 'random' ? 'по броску' : 'по договорённости'}</span>
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <Button onClick={rollFirst}>Перебросить</Button>
            {(['p1', 'p2'] as const).map((s) => (
              <Button key={s} disabled={state.firstTurn === s} onClick={() => setFirst(s)}>
                {names[s]}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          <Button variant="primary" onClick={rollFirst}>
            Бросить кубики — победитель ходит первым
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {(['p1', 'p2'] as const).map((s) => (
              <Button key={s} onClick={() => setFirst(s)}>
                Первым — {names[s]}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Summary game={game} index={index} />

      {missing.length > 0 && <p className="text-xs text-warn">Не готово: {missing.join(', ')}</p>}
      <Button variant="primary" className="h-12 w-full" disabled={!state.firstTurn || missing.length > 0} onClick={start}>
        Начать битву
      </Button>
    </div>
  );
}

/** Сводка подготовки: игроки, типы армий и основные миссии, роли, вторичные, раскладка. */
export function Summary({ game, index }: { game: GameHook; index: DataIndex }) {
  const state = game.state!;
  const { battlefield, missions } = game.data!;
  const dName = (id: string | null) => battlefield.dispositions.find((d) => d.id === id)?.nameRu ?? '—';
  const cName = (id: string | null) => missions.cards.find((c) => c.id === id)?.name ?? '—';
  const fName = (id?: string) => index.factions.find((f) => f.id === id)?.name ?? null;
  const layouts = battlefield.layouts.filter((l) => l.pair.join('|') === battlefield.layouts.find((x) => x.id === state.layoutId)?.pair.join('|')).sort((a, b) => a.variant - b.variant);
  const layoutIdx = layouts.findIndex((l) => l.id === state.layoutId);
  const dep = battlefield.deployments.find((d) => d.id === state.deploymentId);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Сводка</p>
      {(['p1', 'p2'] as const).map((s) => {
        const p = state.players[s];
        const faction = fName(p.roster.factionId);
        return (
          <div key={s} className="mt-2 border-t border-white/10 pt-2 first:border-0 first:pt-0">
            <p className="flex items-center gap-2 font-semibold">
              <span className="min-w-0 flex-1">
                {p.name}
                <span className="font-normal text-white/50"> · {p.role === 'attacker' ? 'атакующий' : p.role === 'defender' ? 'защитник' : '—'}</span>
              </span>
              <RosterButton seat={s} />
            </p>
            <Row label="Армия">
              {p.roster.source !== 'none' && p.roster.name ? `${p.roster.name}${faction ? ` · ${faction}` : ''}` : (faction ?? 'без ростера')}
            </Row>
            <Row label="Тип армии">
              {dName(p.disposition)} →{' '}
              {state.primary[s] ? <CardLink id={state.primary[s]!} seat={s} name={cName(state.primary[s])} className="text-accent" /> : '—'}
            </Row>
            <Row label="Вторичные">
              {p.secondaryMode === 'fixed' ? (
                <>
                  фиксированные:{' '}
                  {(p.fixed ?? []).map((id, i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <CardLink id={id} seat={s} name={cName(id)} className="text-accent" />
                    </span>
                  ))}
                </>
              ) : p.secondaryMode === 'tactical' ? (
                'тактические'
              ) : (
                '—'
              )}
            </Row>
          </div>
        );
      })}
      <div className="mt-2 border-t border-white/10 pt-2">
        <Row label="Раскладка">{layoutIdx >= 0 ? `${LETTERS[layoutIdx]} · ${dep?.nameRu ?? ''}` : '—'}</Row>
        <Row label="Первый ход">{state.firstTurn ? state.players[state.firstTurn].name : '—'}</Row>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="mt-0.5 text-[13px] leading-snug">
      <span className="text-white/45">{label}: </span>
      {children}
    </p>
  );
}
