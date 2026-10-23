// «Начать игру», G3.1: когда засчитывается блок основной миссии (поле at в missions.json, primaryAtOk в
// game/scoring.ts, проверка primary-scored в game/reducer.ts). Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../../../client/src/features/roster/game/reducer';
import { primaryAtOk } from '../../../client/src/features/roster/game/scoring';
import type { GameState, PrimaryAt, Round, TurnStep } from '../../../client/src/features/roster/game/types';
import { PRIMARY_AT } from '../scripts/build-missions.mjs';
import { catalog, log, setupBodies, type Body } from './game-helpers';

const ok = (r: ReturnType<typeof replay>): GameState => {
  assert.ok(r.ok, r.ok ? '' : `№${r.seq}: ${r.error}`);
  return r.state;
};
const err = (r: ReturnType<typeof replay>, re: RegExp) => assert.ok(!r.ok && re.test(r.error), r.ok ? 'принято' : r.error);
const B = (b: object) => b as Body;
const run = (...bodies: Body[]) => replay(log(...bodies), catalog);
const start = B({ type: 'command-phase-started' });
const endCmd = B({ type: 'command-phase-ended' });
const endTurn = B({ type: 'turn-ended' });
const prim = (target: string, block: number) => B({ type: 'primary-scored', target, picks: [{ block, row: 0, count: 1 }] });

// p1: Immovable Object (0: конец вашего хода; 1: конец вашей фазы командования, раунды 2–4; 2: конец вашего хода, 5-й раунд)
// p2: Unstoppable Force (0: конец вашего хода; 1: фаза командования, в 5-м раунде — конец хода, с 2-го; 3: конец битвы); p2 ходит первым
/** Раунд n: прошли полные раунды до n; дальше — ход p2. */
const toRound = (n: number): Body[] => {
  const out: Body[] = [...setupBodies()];
  for (let r = 1; r < n; r++) out.push(start, endCmd, endTurn, start, endCmd, endTurn);
  return out;
};

test('данные: у каждого блока основной миссии есть at, совпадает с текстом «when»; «конец битвы» — только раунды end', () => {
  for (const c of catalog.cards.filter((x) => x.type === 'primary'))
    for (const b of c.blocks as { at?: string; when?: string; rounds: string }[]) {
      assert.equal(b.at, (PRIMARY_AT as Record<string, string>)[b.when!], `${c.id}: ${b.when}`);
      assert.equal(b.at === 'battle-end', b.rounds === 'end', c.id);
    }
  const at = (id: string) => catalog.cards.find((c) => c.id === id)!.blocks.map((b) => b.at);
  assert.deepEqual(at('immovable-object'), ['own-turn', 'own-command', 'own-turn']);
  assert.deepEqual(at('punishment'), ['any-turn', 'own-command-r5-turn', 'battle-end']);
});

test('primaryAtOk: шаг, чей ход, 5-й раунд, конец битвы', () => {
  const c = (end: boolean, step: TurnStep, ownTurn: boolean, round: number) => ({ end, step, ownTurn, round: round as Round });
  const t: [PrimaryAt | undefined, ReturnType<typeof c>, boolean][] = [
    ['own-turn', c(false, 'main', true, 2), true], ['own-turn', c(false, 'command', true, 2), false], ['own-turn', c(false, 'main', false, 2), false],
    ['own-command', c(false, 'command', true, 3), true], ['own-command', c(false, 'main', true, 3), false], ['own-command', c(false, 'command', false, 3), false],
    ['own-command-r5-turn', c(false, 'command', true, 4), true], ['own-command-r5-turn', c(false, 'main', true, 4), false],
    ['own-command-r5-turn', c(false, 'main', true, 5), true], ['own-command-r5-turn', c(false, 'command', true, 5), false],
    ['any-turn', c(false, 'main', false, 1), true], ['any-turn', c(false, 'main', true, 1), true], ['any-turn', c(false, 'command', true, 1), false],
    ['battle-end', c(false, 'main', true, 5), false], ['battle-end', c(true, 'main', false, 5), true],
    ['own-turn', c(true, 'main', true, 5), false], [undefined, c(false, 'main', false, 1), true],
  ];
  for (const [at, ctx, exp] of t) assert.equal(primaryAtOk(at, ctx), exp, `${at} ${JSON.stringify(ctx)}`);
});

test('«конец вашего хода»: после фазы командования своего хода; не в фазе командования и не в ход противника', () => {
  const r1 = toRound(1);
  ok(run(...r1, start, endCmd, prim('p2', 0)));
  err(run(...r1, start, prim('p2', 0)), /в конце вашего хода/);
  err(run(...r1, start, endCmd, prim('p1', 0)), /в конце вашего хода/);
});

test('«конец вашей фазы командования»: только в своей фазе командования, раунды 2–4', () => {
  const r2 = toRound(2);
  const p1Cmd = [...r2, start, endCmd, endTurn, start];
  ok(run(...p1Cmd, prim('p1', 1)));
  err(run(...p1Cmd, endCmd, prim('p1', 1)), /фазы командования/);
  err(run(...r2, start, prim('p1', 1)), /фазы командования/, 'в фазе командования противника');
  err(run(...toRound(5), start, endCmd, endTurn, start, prim('p1', 1)), /не действует в этом раунде/);
});

test('«фаза командования, в 5-м раунде — конец хода»: раунды 2–4 — фаза командования, 5-й — конец своего хода', () => {
  ok(run(...toRound(3), start, prim('p2', 1)));
  err(run(...toRound(3), start, endCmd, prim('p2', 1)), /в 5-м раунде — в конце вашего хода/);
  ok(run(...toRound(5), start, endCmd, prim('p2', 1)));
  err(run(...toRound(5), start, prim('p2', 1)), /в 5-м раунде — в конце вашего хода/);
});

test('«конец битвы»: только после окончания битвы; другие блоки после окончания — нет', () => {
  const finished = [...toRound(5), start, endCmd, endTurn, start, endCmd, endTurn];
  const s = ok(run(...finished, prim('p2', 3)));
  assert.equal(s.stage, 'finished');
  assert.deepEqual(s.players.p2.primaryScored.map((x) => [x.end, x.vp]), [[true, 5]]);
  err(run(...toRound(5), start, endCmd, prim('p2', 3)), /конце битвы/);
  err(run(...finished, prim('p2', 0)), /конце битвы/);
});
