// «Начать игру», G2.11a: в конце чьего хода засчитывается блок вторичной миссии (поле turn в missions.json,
// blockTurnOk в game/scoring.ts, проверка card-scored в game/reducer.ts). Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../../../client/src/features/roster/game/reducer';
import { blockTurnOk } from '../../../client/src/features/roster/game/scoring';
import type { GameState } from '../../../client/src/features/roster/game/types';
import { SECONDARY_TURN } from '../scripts/build-missions.mjs';
import { catalog, log, setupBodies, type Body } from './game-helpers';

const ok = (r: ReturnType<typeof replay>): GameState => {
  assert.ok(r.ok, r.ok ? '' : `№${r.seq}: ${r.error}`);
  return r.state;
};
const err = (r: ReturnType<typeof replay>, re: RegExp) => assert.ok(!r.ok && re.test(r.error), r.ok ? 'принято' : r.error);
const B = (b: object) => b as Body;
const run = (...bodies: Body[]) => replay(log(...bodies), catalog);

// p2 (фиксированный) ходит первым, p1 (тактический) — вторым
const start = B({ type: 'command-phase-started' });
const endCmd = B({ type: 'command-phase-ended' });
const endTurn = B({ type: 'turn-ended' });
const fullTurn = [start, endCmd, endTurn];
const draw = (...cards: string[]) => B({ type: 'cards-drawn', target: 'p1', cards, source: 'manual' });
const score = (card: string, block: number) => B({ type: 'card-scored', target: 'p1', card, picks: [{ block, row: 0, count: 1 }] });

/** Раунд n (1–5): ход p2 прошёл, у p1 идёт фаза командования. */
const p1Command = (round: number): Body[] => {
  const out: Body[] = [...setupBodies()];
  for (let r = 1; r < round; r++) out.push(...fullTurn, ...fullTurn);
  out.push(...fullTurn, start);
  return out;
};

test('данные: у каждого блока вторичной миссии есть turn, и он совпадает с текстом «when»', () => {
  for (const c of catalog.cards.filter((x) => x.type === 'secondary'))
    for (const b of c.blocks as { turn?: string; when?: string }[]) {
      assert.ok(b.turn, `${c.id}: нет turn`);
      assert.equal(b.turn, (SECONDARY_TURN as Record<string, string>)[b.when!], `${c.id}: ${b.when}`);
    }
  const turns = (id: string) => catalog.cards.find((c) => c.id === id)!.blocks.map((b) => b.turn);
  assert.deepEqual(turns('display-of-might'), ['own', 'opponent']);
  assert.deepEqual(turns('beacon'), ['opponent-or-r5']);
  assert.deepEqual(turns('burden-of-trust'), ['opponent-or-r5']);
  assert.deepEqual(turns('defend-stronghold'), ['opponent-or-r5']);
  assert.deepEqual(turns('behind-enemy-lines'), ['own']);
  assert.deepEqual(turns('no-prisoners'), ['any']);
  assert.equal(catalog.cards.find((c) => c.id === 'defend-stronghold')!.drawnRequired, true);
  assert.ok(catalog.cards.filter((c) => c.drawnRequired).length === 1, 'обязательное «при взятии» — только Defend Stronghold');
});

test('blockTurnOk: свой ход, ход противника, любой, «противника или конец 5-го раунда»', () => {
  const t: [Parameters<typeof blockTurnOk>[0], boolean, boolean, boolean][] = [
    ['own', true, false, true], ['own', false, false, false], ['own', false, true, false],
    ['opponent', false, false, true], ['opponent', true, false, false], ['opponent', true, true, false],
    ['any', true, false, true], ['any', false, false, true], [undefined, true, false, true],
    ['opponent-or-r5', false, false, true], ['opponent-or-r5', true, false, false],
    ['opponent-or-r5', true, true, true], // ходит вторым: в 5-м раунде ход противника уже прошёл
  ];
  for (const [turn, own, last, exp] of t) assert.equal(blockTurnOk(turn, own, last), exp, `${turn} own=${own} last=${last}`);
});

test('«конец вашего хода»: в свой ход — да, в ход противника — нет; карта остаётся активной', () => {
  const mine = [...p1Command(1), draw('behind-enemy-lines', 'no-prisoners'), endCmd];
  ok(run(...mine, score('behind-enemy-lines', 0)));
  const foeTurn = [...mine, endTurn, start, endCmd]; // раунд 2, ход p2
  err(run(...foeTurn, score('behind-enemy-lines', 0)), /в конце вашего хода/);
  const s = ok(run(...foeTurn));
  assert.ok(s.players.p1.active.some((a) => a.id === 'behind-enemy-lines' && a.round === 1), 'не выполнена — активна дальше');
  ok(run(...foeTurn, score('no-prisoners', 0)), '«конец любого хода» — и в ход противника');
});

test('«конец хода противника или конец 5-го раунда»: в свой ход — нет (кроме последнего хода битвы), в ход противника — да', () => {
  const mine = [...p1Command(1), draw('beacon'), endCmd];
  err(run(...mine, score('beacon', 0)), /хода противника/);
  ok(run(...mine, endTurn, start, endCmd, score('beacon', 0)));
  // 4-й раунд, ход p1 — ещё не конец битвы
  err(run(...p1Command(4), draw('beacon'), endCmd, score('beacon', 0)), /хода противника/);
  // 5-й раунд: p1 ходит вторым, ход противника уже прошёл — засчитывается в конце своего хода
  ok(run(...p1Command(5), draw('beacon'), endCmd, score('beacon', 0)));
});

test('Display of Might: 2 ПО — в конце своего хода, 5 ПО — в конце хода противника', () => {
  const mine = [...p1Command(1), draw('display-of-might'), endCmd];
  err(run(...mine, score('display-of-might', 1)), /хода противника/);
  const s = ok(run(...mine, score('display-of-might', 0)));
  assert.deepEqual(s.players.p1.scored.map((x) => [x.id, x.vp]), [['display-of-might', 2]]);
  const foe = ok(run(...mine, endTurn, start, endCmd, score('display-of-might', 1)));
  assert.deepEqual(foe.players.p1.scored.map((x) => [x.id, x.vp, x.turn]), [['display-of-might', 5, 'p2']]);
  err(run(...mine, endTurn, start, endCmd, score('display-of-might', 0)), /в конце вашего хода/);
});
