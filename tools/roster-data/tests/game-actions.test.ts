// «Начать игру», G1.5: действия с картами — подсчёт строк карты, засчитывание, сброс за CP, замена за 1 CP,
// ручные изменения CP (game/scoring.ts, game/decks.ts, game/reducer.ts). Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../../../client/src/features/roster/game/reducer';
import { blockInRound, cardVp } from '../../../client/src/features/roster/game/scoring';
import type { CatalogCard, GameState, Round } from '../../../client/src/features/roster/game/types';
import { catalog, log, setupBodies, type Body } from './game-helpers';

const card = (id: string) => catalog.cards.find((c) => c.id === id) as CatalogCard;
const ok = (r: ReturnType<typeof replay>): GameState => {
  assert.ok(r.ok, r.ok ? '' : `№${r.seq}: ${r.error}`);
  return r.state;
};
const err = (r: ReturnType<typeof replay>, re: RegExp) => assert.ok(!r.ok && re.test(r.error), r.ok ? 'принято' : r.error);
const B = (b: object) => b as Body;
const vp = (r: ReturnType<typeof cardVp>) => ('vp' in r ? r.vp : r.error);

// p2 (фиксированный: assassination + bring-it-down) ходит первым; p1 — тактический
const P2_MAIN = [...setupBodies(), B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' })];
const P1_COMMAND = [...P2_MAIN, B({ type: 'turn-ended' }), B({ type: 'command-phase-started' })];
const DRAW = B({ type: 'cards-drawn', target: 'p1', cards: ['behind-enemy-lines', 'assassination'], source: 'manual' });
const P1_MAIN = [...P1_COMMAND, DRAW, B({ type: 'command-phase-ended' })];
const run = (base: Body[], ...extra: Body[]) => replay(log(...base, ...extra), catalog);

test('раунды блока карты', () => {
  const t: [string, Round, boolean, boolean][] = [
    ['any', 3, false, true], ['1', 1, false, true], ['1', 2, false, false], ['1–2', 2, false, true], ['1–2', 3, false, false],
    ['2+', 1, false, false], ['2+', 5, false, true], ['2–4', 4, false, true], ['2–4', 5, false, false], ['4+', 4, false, true],
    ['5', 5, false, true], ['end', 5, false, false], ['end', 5, true, true], ['any', 5, true, false],
  ];
  for (const [r, round, end, exp] of t) assert.equal(blockInRound(r, round, end), exp, `${r} ${round} ${end}`);
});

test('очки по строкам: «за каждый», «+ сверх того», максимум, «или», режим, раунд', () => {
  const a = card('assassination'); // блок 0: фикс. 3 за персонажа, +1 если W4+; блок 1: такт. 5 или 5
  assert.equal(vp(cardVp({ card: a, round: 1, mode: 'fixed', picks: [{ block: 0, row: 0, count: 2 }, { block: 0, row: 1, count: 1 }] })), 7);
  assert.match(vp(cardVp({ card: a, round: 1, mode: 'fixed', picks: [{ block: 0, row: 0, count: 1 }, { block: 0, row: 1, count: 2 }] })) as string, /не чаще/);
  assert.match(vp(cardVp({ card: a, round: 1, mode: 'fixed', picks: [{ block: 0, row: 1, count: 1 }] })) as string, /вместе со строкой выше/);
  assert.match(vp(cardVp({ card: a, round: 1, mode: 'tactical', picks: [{ block: 1, row: 0, count: 1 }, { block: 1, row: 1, count: 1 }] })) as string, /«или»/);
  assert.match(vp(cardVp({ card: a, round: 1, mode: 'tactical', picks: [{ block: 0, row: 0, count: 1 }] })) as string, /фиксированного режима/);
  assert.equal(vp(cardVp({ card: card('behind-enemy-lines'), round: 3, mode: 'tactical', picks: [{ block: 0, row: 0, count: 3 }] })), 5, '3 × 3 = 9, максимум 5');
  assert.match(vp(cardVp({ card: card('defend-stronghold'), round: 1, mode: 'tactical', picks: [{ block: 0, row: 0, count: 1 }] })) as string, /не действует в этом раунде/);
  assert.equal(vp(cardVp({ card: card('defend-stronghold'), round: 2, mode: 'tactical', picks: [{ block: 0, row: 0, count: 1 }, { block: 0, row: 1, count: 1 }] })), 5);
  assert.match(vp(cardVp({ card: a, round: 1, picks: [] })) as string, /ни одной/);
  assert.match(vp(cardVp({ card: a, round: 1, picks: [{ block: 9, row: 0, count: 1 }] })) as string, /нет/);
  assert.match(vp(cardVp({ card: a, round: 1, picks: [{ block: 0, row: 0, count: 0 }] })) as string, /целое/);
  assert.match(vp(cardVp({ card: a, round: 1, mode: 'fixed', picks: [{ block: 0, row: 0, count: 1 }, { block: 0, row: 0, count: 1 }] })) as string, /дважды/);
});

test('фиксированная карта: засчитывается в конце хода, остаётся активной, один раз за ход, в любой ход', () => {
  const score = B({ type: 'card-scored', target: 'p2', card: 'assassination', picks: [{ block: 0, row: 0, count: 1 }] });
  const s = ok(run(P2_MAIN, score));
  assert.deepEqual(s.players.p2.scored.map((x) => [x.id, x.vp, x.round, x.turn]), [['assassination', 3, 1, 'p2']]);
  assert.ok(s.players.p2.active.some((a) => a.id === 'assassination'));
  err(run(P2_MAIN, score, score), /уже засчитана в этот ход/);
  const later = ok(run([...P1_MAIN, score]));
  assert.equal(later.players.p2.scored.at(-1)?.turn, 'p1', 'в конце хода противника — тоже');
  err(run([...setupBodies(), B({ type: 'command-phase-started' })], score), /в конце хода/);
  err(run(P2_MAIN, B({ ...score, seat: 'p1' })), /только свои карты/);
});

test('тактическая карта: засчитана — уходит из активных; очки считает движок', () => {
  const s = ok(run(P1_MAIN, B({ type: 'card-scored', target: 'p1', card: 'behind-enemy-lines', picks: [{ block: 0, row: 0, count: 2 }] })));
  assert.deepEqual(s.players.p1.active.map((a) => a.id), ['assassination']);
  assert.deepEqual(s.players.p1.scored.map((x) => [x.id, x.vp]), [['behind-enemy-lines', 5]]);
  assert.ok(!s.players.p1.discarded.includes('behind-enemy-lines'), 'выполненная — не в сбросе');
  err(run(P1_MAIN, B({ type: 'card-scored', target: 'p1', card: 'plunder', picks: [{ block: 0, row: 0, count: 1 }] })), /нет среди активных/);
});

test('сброс за CP: в конце своего хода, 1 CP один раз за ход; фиксированные не сбрасываются', () => {
  const d1 = B({ type: 'card-discarded', target: 'p1', card: 'assassination', forCp: true });
  const s = ok(run(P1_MAIN, d1));
  assert.equal(s.players.p1.cp, 1);
  assert.deepEqual(s.players.p1.discarded, ['assassination']);
  err(run(P1_MAIN, d1, B({ type: 'card-discarded', target: 'p1', card: 'behind-enemy-lines', forCp: true })), /уже получен/);
  const both = ok(run(P1_MAIN, d1, B({ type: 'card-discarded', target: 'p1', card: 'behind-enemy-lines', forCp: false })));
  assert.equal(both.players.p1.cp, 1);
  assert.equal(both.players.p1.active.length, 0);
  err(run(P2_MAIN, B({ type: 'card-discarded', target: 'p2', card: 'assassination', forCp: true })), /не сбрасываются/);
  err(run(P1_COMMAND, DRAW, B({ type: 'card-discarded', target: 'p1', card: 'assassination', forCp: true })), /конце своего хода/);
  // в следующем своём ходу снова можно получить 1 CP
  const next = [B({ type: 'turn-ended' }), B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' }), B({ type: 'turn-ended' }), B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' })];
  assert.equal(ok(run(P1_MAIN, d1, ...next, B({ type: 'card-discarded', target: 'p1', card: 'behind-enemy-lines', forCp: true }))).players.p1.cp, 2);
});

test('замена за 1 CP: в фазе командования, один раз за битву, нужен CP; карта сбрасывается', () => {
  const cp = B({ type: 'cp-changed', target: 'p1', delta: 2, reason: 'base' });
  const s0 = ok(run(P1_COMMAND, DRAW, cp));
  const top = s0.players.p1.deck[0];
  const swap = B({ type: 'card-redrawn', target: 'p1', card: 'assassination', replacement: top, reason: 'swap', shuffleBack: false, source: 'random' });
  const s = ok(run(P1_COMMAND, DRAW, cp, swap));
  assert.deepEqual(s.players.p1.active.map((a) => a.id), ['behind-enemy-lines', top]);
  assert.deepEqual([s.players.p1.cp, s.players.p1.swapUsed, s.players.p1.discarded], [1, true, ['assassination']]);
  err(run(P1_COMMAND, DRAW, cp, swap, B({ ...swap, card: 'behind-enemy-lines', replacement: s.players.p1.deck[0] })), /уже использована/);
  err(run(P1_COMMAND, DRAW, swap), /нужен 1 CP/);
  err(run(P1_COMMAND, DRAW, cp, B({ ...swap, shuffleBack: true })), /сбрасывается/);
  err(run(P1_COMMAND, DRAW, cp, B({ type: 'command-phase-ended' }), swap), /фазы командования/);
});

test('CP вручную: базовые, стратагемы, прочее; ниже нуля и чужие — нет; сброс и замена — только автоматически', () => {
  const s = ok(run(P2_MAIN, B({ type: 'cp-changed', target: 'p2', delta: 3, reason: 'base' }), B({ type: 'cp-changed', target: 'p2', delta: -2, reason: 'stratagem' })));
  assert.equal(s.players.p2.cp, 1);
  err(run(P2_MAIN, B({ type: 'cp-changed', target: 'p2', delta: -1, reason: 'stratagem' })), /Не хватает CP/);
  err(run(P2_MAIN, B({ type: 'cp-changed', target: 'p2', delta: 1, reason: 'discard' })), /автоматически/);
  err(run(P2_MAIN, B({ type: 'cp-changed', target: 'p2', seat: 'p1', delta: 1, reason: 'base' })), /только себе/);
  err(run(P2_MAIN, B({ type: 'cp-changed', target: 'p2', delta: 0, reason: 'other' })), /не ноль/);
});
