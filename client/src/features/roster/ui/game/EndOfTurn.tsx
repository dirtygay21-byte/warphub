import type { MissionCard } from '../../data';
import { blockInRound, blockTurnOk, primaryAtOk, ROUNDS, type GameState, type Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button } from '../kit';
import { cx } from '../util';
import { CardLink } from './CardSheet';
import { ScoreRows } from './ScoreRows';
import type { GameHook } from './useGame';

/**
 * Конец хода (G3.4), по правилам колоды миссий: в конце каждого хода засчитывают оба игрока, начиная с того, чей ход;
 * затем игрок, чей ход, может сбросить тактические карты (1 CP — за первый сброс в ход).
 * Показывается только то, что засчитывается сейчас: блоки вторичных — по раунду и «чей ход» (turn), основной — по at.
 * Засчитывать не обязательно: невыполненная тактическая карта остаётся активной.
 */
export function EndOfTurn({ game }: { game: GameHook }) {
  const state = game.state!;
  const active = state.activeSeat!;
  const order: Seat[] = [active, active === 'p1' ? 'p2' : 'p1'];
  return (
    <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Конец хода · {state.players[active].name}</p>
      <p className="text-xs text-white/55">Засчитывают оба игрока — сначала тот, чей ход. Невыполненные карты остаются активными.</p>
      {order.map((s, i) => (
        <PlayerScoring key={s} game={game} seat={s} first={i === 0} />
      ))}
      <Discard game={game} seat={active} />
    </div>
  );
}

/** Секция игрока: вторичные (активные карты с блоками, действующими сейчас), основная, уже засчитанное в этот ход. */
function PlayerScoring({ game, seat, first }: { game: GameHook; seat: Seat; first: boolean }) {
  const state = game.state!;
  const { missions } = game.data!;
  const p = state.players[seat];
  const card = (id: string) => missions.cards.find((c) => c.id === id);
  const turn = state.activeSeat!;
  const thisTurn = (x: { round: number; turn: Seat | null }) => x.round === state.round && x.turn === turn;
  const scoredNow = p.scored.filter(thisTurn);
  const secondary = p.active
    .map((a) => ({ a, c: card(a.id) }))
    .filter((x): x is { a: (typeof p.active)[number]; c: MissionCard } => !!x.c)
    .filter(({ a }) => !scoredNow.some((x) => x.id === a.id))
    .map(({ a, c }) => ({ a, c, blocks: secondaryBlocks(state, seat, c) }))
    .filter((x) => x.blocks.length);
  const primaryId = state.primary[seat];
  const primary = primaryId ? card(primaryId) : undefined;
  const primaryDone = p.primaryScored.filter((x) => !x.end && thisTurn(x));
  const pBlocks = primary ? primaryBlocks(state, seat, primary).filter((i) => !primaryDone.some((x) => x.picks.some((k) => k.block === i))) : [];
  const nothing = !secondary.length && !pBlocks.length && !scoredNow.length && !primaryDone.length;

  return (
    <section className={cx('rounded-xl border px-3 py-2.5', first ? 'border-accent/40' : 'border-white/10')}>
      <p className="text-sm font-semibold">
        {first ? '1. ' : '2. '}
        {p.name}
        <span className="font-normal text-white/45"> · {seat === turn ? 'его ход' : 'ход противника'}</span>
      </p>
      {nothing && <p className="mt-1 text-xs text-white/45">Сейчас засчитывать нечего.</p>}

      {(scoredNow.length > 0 || primaryDone.length > 0) && (
        <ul className="mt-1.5 space-y-1">
          {primaryDone.map((x, i) => (
            <li key={`p${i}`} className="text-xs text-accent">
              ✓ Основная{primary ? ` «${primary.name}»` : ''}: {x.vp} ПО
            </li>
          ))}
          {scoredNow.map((x) => (
            <li key={x.id} className="text-xs text-accent">
              <CardLink id={x.id} seat={seat} name={card(x.id)?.name ?? x.id}>
                ✓ {card(x.id)?.name ?? x.id}: {x.vp} ПО
              </CardLink>
            </li>
          ))}
        </ul>
      )}

      {primary && pBlocks.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[12px] font-semibold text-white/70">
            <CardLink id={primary.id} seat={seat} name={primary.name}>
              Основная: {primary.name}
            </CardLink>
          </p>
          <ScoreRows
            card={primary}
            blocks={pBlocks}
            round={state.round}
            label="Засчитать основную"
            onScore={(picks) => {
              const ok = game.dispatch({ type: 'primary-scored', target: seat, picks });
              if (ok) haptic.ok();
              return ok;
            }}
          />
        </div>
      )}

      {secondary.map(({ a, c, blocks }) => (
        <details key={a.id} className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
          <summary className="cursor-pointer text-[13px] font-semibold">
            {a.n != null && <span className="mr-1 text-[11px] text-white/45">№{a.n}</span>}
            <CardLink id={a.id} seat={seat} name={c.name} />
            {a.note && <span className="font-normal text-white/50"> · {a.note}</span>}
            <span className="ml-1.5 text-[11px] font-normal text-accent/80">— засчитать</span>
          </summary>
          <div className="mt-2">
            <ScoreRows
              card={c}
              blocks={blocks}
              round={state.round}
              mode={p.secondaryMode}
              label={p.secondaryMode === 'tactical' ? 'Выполнена — засчитать' : 'Засчитать'}
              onScore={(picks) => {
                const ok = game.dispatch({ type: 'card-scored', target: seat, card: a.id, picks });
                if (ok) haptic.ok();
                return ok;
              }}
            />
          </div>
        </details>
      ))}
    </section>
  );
}

/** Блоки вторичной карты, которые засчитываются сейчас: режим игрока, раунд, чей ход (с правилом конца 5-го раунда). */
function secondaryBlocks(state: GameState, seat: Seat, card: MissionCard): number[] {
  const mode = state.players[seat].secondaryMode;
  const ownTurn = state.activeSeat === seat;
  const lastTurn = state.round === ROUNDS && state.activeSeat !== state.firstTurn;
  return card.blocks
    .map((b, i) => [b, i] as const)
    .filter(([b]) => (!b.mode || b.mode === mode) && blockInRound(b.rounds, state.round) && blockTurnOk(b.turn, ownTurn, lastTurn))
    .map(([, i]) => i);
}

/** Блоки основной миссии, которые засчитываются в конце этого хода. */
function primaryBlocks(state: GameState, seat: Seat, card: MissionCard): number[] {
  const ctx = { end: false, step: state.step, ownTurn: state.activeSeat === seat, round: state.round };
  return card.blocks
    .map((b, i) => [b, i] as const)
    .filter(([b]) => blockInRound(b.rounds, state.round) && primaryAtOk(b.at, ctx))
    .map(([, i]) => i);
}

/** Сброс тактических карт игроком, чей ход: по одной; за первый сброс в этот ход — 1 CP. */
function Discard({ game, seat }: { game: GameHook; seat: Seat }) {
  const state = game.state!;
  const p = state.players[seat];
  if (p.secondaryMode !== 'tactical' || !p.active.length) return null;
  const name = (id: string) => game.data!.missions.cards.find((c) => c.id === id)?.name ?? id;
  const cp = !state.discardCpTaken;
  return (
    <section className="rounded-xl border border-white/10 px-3 py-2.5">
      <p className="text-sm font-semibold">Сбросить карты · {p.name}</p>
      <p className="text-[11px] text-white/50">
        По желанию, после подсчёта. {cp ? 'За первый сброс в этот ход — 1 CP.' : '1 CP за сброс в этот ход уже получен.'}
      </p>
      <div className="mt-2 space-y-1.5">
        {[...p.active]
          .sort((a, b) => (a.n ?? 0) - (b.n ?? 0))
          .map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <CardLink id={a.id} seat={seat} name={name(a.id)} className="flex-1 text-sm" />
              <Button
                className="shrink-0"
                onClick={() => {
                  if (game.dispatch({ type: 'card-discarded', target: seat, card: a.id, forCp: cp })) haptic.select();
                }}
              >
                {cp ? 'Сбросить · +1 CP' : 'Сбросить'}
              </Button>
            </div>
          ))}
      </div>
    </section>
  );
}
