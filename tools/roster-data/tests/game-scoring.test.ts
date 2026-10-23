// «Начать игру», G1.6: базовые CP, основная миссия, поправки ПО, итоги с лимитами (game/scoring.ts totals).
// Лимиты: правила колоды миссий (15/45 основная и вторичные, 20 за фиксированную карту, ПО «конец битвы» вне лимита
// раунда), Battle Ready 10; базовые CP — Core Rules 08.02 (оба игрока по 1 CP в каждую фазу командования).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../../../client/src/features/roster/game/reducer';
import { totals } from '../../../client/src/features/roster/game/scoring';
import type { GameState, Round } from '../../../client/src/features/roster/game/types';
import { catalog, log, setupBodies, type Body } from './game-helpers';

const ok = (r: ReturnType<typeof replay>): GameState => {
  assert.ok(r.ok, r.ok ? '' : `№${r.seq}: ${r.error}`);
  return r.state;
};
const err = (r: ReturnType<typeof replay>, re: RegExp) => assert.ok(!r.ok && re.test(r.error), r.ok ? 'принято' : r.error);
const B = (b: object) => b as Body;
const turn = (): Body[] => [B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' }), B({ type: 'turn-ended' })];
// p2 ходит первым; основная p1 — immovable-object, p2 — unstoppable-force; p2 фиксированный (assassination, bring-it-down)
const P1_MAIN_R1 = [...setupBodies(), ...turn(), B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' })];
const FULL = [...setupBodies(), ...Array.from({ length: 10 }, turn).flat()];
const run = (base: Body[], ...extra: Body[]) => replay(log(...base, ...extra), catalog);
const prim = (target: string, block: number, count = 1, row = 0) => B({ type: 'primary-scored', target, picks: [{ block, row, count }] });

test('базовые CP: оба игрока получают 1 CP в каждой фазе командования', () => {
  const s = ok(run([...setupBodies(), B({ type: 'command-phase-started' })]));
  assert.deepEqual([s.players.p1.cp, s.players.p2.cp], [1, 1]);
  const all = ok(run(FULL));
  assert.deepEqual([all.players.p1.cp, all.players.p2.cp], [10, 10], '10 фаз командования');
});

test('основная миссия: строки своей карты в своём раунде; повтор в тот же ход и чужая — нет', () => {
  const s = ok(run(P1_MAIN_R1, prim('p1', 0)));
  assert.deepEqual(s.players.p1.primaryScored.map((e) => [e.round, e.turn, e.end, e.vp]), [[1, 'p1', false, 3]]);
  err(run(P1_MAIN_R1, prim('p1', 1)), /не действует в этом раунде/);
  err(run(P1_MAIN_R1, prim('p1', 0), prim('p1', 0)), /уже засчитана в этот ход/);
  err(run(P1_MAIN_R1, B({ ...prim('p1', 0), seat: 'p2' })), /только свою/);
  err(run([...setupBodies()], prim('p2', 0)), /в фазе командования, в конце хода или в конце битвы/);
  // раунд 2: блок «со 2-го раунда» — за каждую цель
  const r2 = [...P1_MAIN_R1, B({ type: 'turn-ended' }), B({ type: 'command-phase-started' })];
  assert.equal(ok(run(r2, prim('p2', 1, 3))).players.p2.primaryScored.at(-1)?.vp, 12);
});

test('конец битвы: только блоки «Конец битвы», один раз; обычные после битвы — нет', () => {
  const s = ok(run(FULL, prim('p2', 3)));
  assert.deepEqual(s.players.p2.primaryScored.map((e) => [e.round, e.turn, e.end, e.vp]), [[5, null, true, 5]]);
  err(run(FULL, prim('p2', 3), prim('p2', 3)), /уже засчитана в конце битвы/);
  err(run(FULL, prim('p2', 0)), /только блоки «Конец битвы»/);
  err(run(FULL, B({ type: 'command-phase-started' })), /закончена/);
});

test('поправка ПО: с причиной, во время или после битвы, входит в свой раунд', () => {
  const s = ok(run(P1_MAIN_R1, B({ type: 'vp-adjusted', target: 'p1', kind: 'secondary', delta: 2, note: 'забыли засчитать' })));
  assert.deepEqual(s.players.p1.adjustments, [{ round: 1, kind: 'secondary', delta: 2, note: 'забыли засчитать' }]);
  assert.equal(totals(s, 'p1', catalog).secondary.byRound[0], 2);
  err(run(P1_MAIN_R1, B({ type: 'vp-adjusted', target: 'p1', kind: 'primary', delta: 2, note: '  ' })), /причину/);
  err(run(setupBodies().slice(0, 3), B({ type: 'vp-adjusted', target: 'p1', kind: 'primary', delta: 2, note: 'x' })), /во время или после/);
  err(run(P1_MAIN_R1, B({ type: 'vp-adjusted', target: 'p1', seat: 'p2', kind: 'primary', delta: 2, note: 'x' })), /свои ПО/);
  assert.equal(ok(run(FULL, B({ type: 'vp-adjusted', target: 'p1', kind: 'primary', delta: 1, note: 'после битвы' }))).players.p1.adjustments[0]?.round, 5);
});

/** Состояние для проверки лимитов: записи очков задаются прямо (как после засчитывания). */
function base(): GameState {
  return structuredClone(ok(run(FULL)));
}

test('основная: лимит 15 за раунд и 45 за битву; «конец битвы» — вне лимита раунда, но в лимите битвы', () => {
  const s = base();
  const p = s.players.p1;
  for (let r = 1; r <= 5; r++) p.primaryScored.push({ round: r as Round, turn: 'p1', end: false, vp: r === 1 ? 20 : 8, picks: [] });
  p.primaryScored.push({ round: 5, turn: null, end: true, vp: 5, picks: [] });
  const t = totals(s, 'p1', catalog);
  assert.deepEqual(t.primary.byRound, [15, 8, 8, 8, 8], 'раунд 1: 20 → 15');
  assert.equal(t.primary.end, 5);
  assert.equal(t.primary.total, 45, '15 + 32 + 5 = 52 → 45');
  assert.equal(t.primary.cut, 57 - 45, 'срезано: 5 лимитом раунда и 7 лимитом битвы');
  // если бы «конец битвы» входил в лимит раунда — пятый раунд 8 + 5 = 13
  const strict = { ...catalog, caps: { ...catalog.caps, endOfBattleOutsideRoundCap: false } };
  const t2 = totals(s, 'p1', strict);
  assert.deepEqual([t2.primary.byRound[4], t2.primary.end], [13, 0]);
  // «конец битвы» не срезается лимитом раунда
  const e = base();
  e.players.p2.primaryScored.push({ round: 5, turn: 'p2', end: false, vp: 15, picks: [] }, { round: 5, turn: null, end: true, vp: 5, picks: [] });
  assert.deepEqual([totals(e, 'p2', catalog).primary.byRound[4], totals(e, 'p2', catalog).primary.total], [15, 20]);
});

test('вторичные: фиксированная карта — не больше 20 за битву; 15 за раунд; 45 за битву', () => {
  const s = base();
  const p2 = s.players.p2; // фиксированный режим
  for (let r = 1; r <= 4; r++) p2.scored.push({ id: 'assassination', round: r as Round, turn: 'p2', vp: 7, picks: [] });
  const t = totals(s, 'p2', catalog);
  assert.deepEqual(t.secondary.byFixedCard, { assassination: 20 }, '7 + 7 + 6 + 0');
  assert.deepEqual(t.secondary.byRound, [7, 7, 6, 0, 0]);
  assert.deepEqual([t.secondary.total, t.secondary.cut], [20, 8]);
  // раунд: две карты по 10 → 15
  const r = base();
  r.players.p1.scored.push({ id: 'cleanse', round: 2, turn: 'p1', vp: 10, picks: [] }, { id: 'plunder', round: 2, turn: 'p2', vp: 10, picks: [] });
  assert.equal(totals(r, 'p1', catalog).secondary.byRound[1], 15);
  // битва: по 15 в каждом раунде → 75 → 45
  const g = base();
  for (let k = 1; k <= 5; k++) g.players.p1.scored.push({ id: `c${k}`, round: k as Round, turn: 'p1', vp: 15, picks: [] });
  const tg = totals(g, 'p1', catalog);
  assert.deepEqual([tg.secondary.total, tg.secondary.cut], [45, 30]);
  // тактическому лимит 20 на карту не применяется
  assert.deepEqual(totals(r, 'p1', catalog).secondary.byFixedCard, {});
});

test('итог: основная + вторичные + Battle Ready 10', () => {
  const s = base();
  s.players.p1.primaryScored.push({ round: 1, turn: 'p1', end: false, vp: 3, picks: [] });
  s.players.p1.scored.push({ id: 'cleanse', round: 1, turn: 'p1', vp: 5, picks: [] });
  assert.equal(totals(s, 'p1', catalog).total, 8);
  const br = ok(run(FULL, B({ type: 'player-set', target: 'p1', patch: { battleReady: true } })));
  assert.deepEqual([totals(br, 'p1', catalog).battleReady, totals(br, 'p1', catalog).total], [10, 10]);
});

test('полная игра на настоящих событиях: итоги считаются из журнала', () => {
  const events = [
    ...setupBodies(),
    B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' }),
    B({ type: 'card-scored', target: 'p2', card: 'assassination', picks: [{ block: 0, row: 0, count: 2 }, { block: 0, row: 1, count: 1 }] }),
    prim('p2', 0), B({ type: 'turn-ended' }),
    B({ type: 'command-phase-started' }), B({ type: 'cards-drawn', target: 'p1', cards: ['behind-enemy-lines', 'assassination'], source: 'manual' }), B({ type: 'command-phase-ended' }),
    B({ type: 'card-scored', target: 'p1', card: 'behind-enemy-lines', picks: [{ block: 0, row: 0, count: 1 }] }), prim('p1', 0), B({ type: 'turn-ended' }),
  ];
  const s = ok(run(events));
  const t1 = totals(s, 'p1', catalog);
  const t2 = totals(s, 'p2', catalog);
  assert.deepEqual([t1.primary.total, t1.secondary.total, t1.total], [3, 3, 6]);
  assert.deepEqual([t2.primary.total, t2.secondary.total, t2.total, t2.secondary.byFixedCard.assassination], [3, 7, 10, 7]);
});
