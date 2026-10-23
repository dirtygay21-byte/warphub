// «Начать игру», G1.4: колоды вторичных — колода каждого игрока, фиксированные карты, взятие в фазе командования,
// правило «при взятии», заметки (game/decks.ts). Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawCards, drawsLeft, nextDraw, secondaryIds } from '../../../client/src/features/roster/game/decks';
import { replay } from '../../../client/src/features/roster/game/reducer';
import { deckOrder } from '../../../client/src/features/roster/game/rng';
import type { GameState } from '../../../client/src/features/roster/game/types';
import { catalog, log, setupBodies, type Body } from './game-helpers';

const ok = (r: ReturnType<typeof replay>): GameState => {
  assert.ok(r.ok, r.ok ? '' : `№${r.seq}: ${r.error}`);
  return r.state;
};
const err = (r: ReturnType<typeof replay>, re: RegExp) => assert.ok(!r.ok && re.test(r.error), r.ok ? 'принято' : r.error);
const B = (b: object) => b as Body;
/** Подготовка + ход p2 (фиксированный) + начало фазы командования p1 (тактический). */
const toP1Command = (): Body[] => [...setupBodies(), B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' }), B({ type: 'turn-ended' }), B({ type: 'command-phase-started' })];
const run = (...extra: Body[]) => replay(log(...toP1Command(), ...extra), catalog);

test('начало битвы: тактическая колода из 18 карт по seed, фиксированные — две активные', () => {
  const s = ok(replay(log(...setupBodies()), catalog));
  const ids = secondaryIds(catalog);
  assert.equal(ids.length, 18);
  assert.deepEqual(s.players.p1.deck, deckOrder('seed-1', 'p1', 0, ids));
  assert.deepEqual(s.players.p1.active, []);
  assert.deepEqual(s.players.p2.active.map((a) => a.id), ['assassination', 'bring-it-down']);
  assert.deepEqual(s.players.p2.deck, []);
  assert.equal(drawsLeft(s, 'p2'), 0, 'фиксированный режим не тянет');
});

test('взятие: верх колоды, две карты за фазу, третья и «не верх» отклоняются', () => {
  const s0 = ok(run());
  const top = nextDraw(s0, 'p1');
  assert.equal(top.length, 2);
  assert.deepEqual(top, s0.players.p1.deck.slice(0, 2));
  const s1 = ok(run(B({ type: 'cards-drawn', target: 'p1', cards: top, source: 'random' })));
  assert.deepEqual(s1.players.p1.active.map((a) => a.id), top);
  assert.equal(s1.players.p1.deck.length, 16);
  assert.ok(s1.players.p1.active.every((a) => a.round === 1 && a.source === 'random'));
  err(run(B({ type: 'cards-drawn', target: 'p1', cards: top, source: 'random' }), B({ type: 'cards-drawn', target: 'p1', cards: [s1.players.p1.deck[0]], source: 'random' })), /уже вытянуты/);
  err(run(B({ type: 'cards-drawn', target: 'p1', cards: [top[1], top[0]], source: 'random' })), /верхом колоды/);
  // по одной карте — тоже можно, всего две
  const one = ok(run(B({ type: 'cards-drawn', target: 'p1', cards: [top[0]], source: 'random' }), B({ type: 'cards-drawn', target: 'p1', cards: [top[1]], source: 'random' })));
  assert.equal(one.players.p1.active.length, 2);
});

test('взятие вручную (из настоящей колоды): любые карты колоды, без повторов', () => {
  const s = ok(run(B({ type: 'cards-drawn', target: 'p1', cards: ['plunder', 'cleanse'], source: 'manual' })));
  assert.deepEqual(s.players.p1.active.map((a) => a.id), ['plunder', 'cleanse']);
  assert.ok(!s.players.p1.deck.includes('plunder'));
  err(run(B({ type: 'cards-drawn', target: 'p1', cards: ['plunder', 'plunder'], source: 'manual' })), /дважды/);
  err(run(B({ type: 'cards-drawn', target: 'p1', cards: ['death-trap'], source: 'manual' })), /нет в колоде/);
});

test('взятие не в свою фазу командования или не себе отклоняется', () => {
  err(replay(log(...setupBodies(), B({ type: 'cards-drawn', target: 'p1', cards: ['plunder'], source: 'manual' })), catalog), /своей фазы командования/);
  err(run(B({ type: 'command-phase-ended' }), B({ type: 'cards-drawn', target: 'p1', cards: ['plunder'], source: 'manual' })), /своей фазы командования/);
  err(run(B({ type: 'cards-drawn', target: 'p1', seat: 'p2', cards: ['plunder'], source: 'manual' })), /только себе/);
});

test('следующая фаза командования снова даёт две карты; активные остаются', () => {
  const s0 = ok(run());
  const top = nextDraw(s0, 'p1');
  const round2 = [B({ type: 'command-phase-ended' }), B({ type: 'turn-ended' })];
  const s = ok(run(B({ type: 'cards-drawn', target: 'p1', cards: top, source: 'random' }), ...round2, B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' }), B({ type: 'turn-ended' }), B({ type: 'command-phase-started' })));
  assert.deepEqual([s.round, s.activeSeat], [2, 'p1']);
  assert.equal(drawsLeft(s, 'p1'), 2);
  assert.equal(s.players.p1.active.length, 2);
});

test('пустая колода: тянется сколько осталось, при пустой — ничего', () => {
  const s = structuredClone(ok(run()));
  s.players.p1.deck = ['plunder'];
  assert.equal(drawsLeft(s, 'p1'), 1);
  assert.deepEqual(nextDraw(s, 'p1'), ['plunder']);
  assert.match(drawCards(s, 'p1', ['plunder', 'cleanse'], 'manual') ?? '', /ещё 1/);
  assert.equal(drawCards(s, 'p1', ['plunder'], 'random'), null);
  assert.equal(drawsLeft(s, 'p1'), 0);
  assert.match(drawCards(s, 'p1', ['cleanse'], 'manual') ?? '', /уже вытянуты|ещё/);
});

test('«при взятии»: замена с возвратом карты в колоду и перемешиванием — детерминированно', () => {
  const drawn = B({ type: 'cards-drawn', target: 'p1', cards: ['behind-enemy-lines', 'assassination'], source: 'manual' });
  const s0 = ok(run(drawn));
  const top = s0.players.p1.deck[0]!;
  const ev = B({ type: 'card-redrawn', target: 'p1', card: 'behind-enemy-lines', replacement: top, reason: 'when-drawn', shuffleBack: true, source: 'random' });
  const s = ok(run(drawn, ev));
  assert.deepEqual(s.players.p1.active.map((a) => a.id), [top, 'assassination']);
  assert.equal(s.players.p1.deck.length, 16);
  assert.ok(s.players.p1.deck.includes('behind-enemy-lines'));
  assert.equal(s.players.p1.shuffles, 2);
  assert.deepEqual(ok(run(drawn, ev)).players.p1.deck, s.players.p1.deck, 'тот же журнал — тот же порядок');
  err(run(drawn, B({ ...ev, replacement: s0.players.p1.deck[1] })), /верхом колоды/);
});

test('«при взятии»: сброс вместо возврата; карта без такого правила и поздняя замена отклоняются', () => {
  const drawn = B({ type: 'cards-drawn', target: 'p1', cards: ['bring-it-down', 'assassination'], source: 'manual' });
  const s0 = ok(run(drawn));
  const s = ok(run(drawn, B({ type: 'card-redrawn', target: 'p1', card: 'bring-it-down', replacement: s0.players.p1.deck[0], reason: 'when-drawn', shuffleBack: false, source: 'random' })));
  assert.deepEqual(s.players.p1.discarded, ['bring-it-down']);
  assert.ok(!s.players.p1.deck.includes('bring-it-down'));
  err(run(drawn, B({ type: 'card-redrawn', target: 'p1', card: 'assassination', replacement: s0.players.p1.deck[0], reason: 'when-drawn', shuffleBack: true, source: 'random' })), /нет правила/);
  err(run(drawn, B({ type: 'command-phase-ended' }), B({ type: 'card-redrawn', target: 'p1', card: 'bring-it-down', replacement: s0.players.p1.deck[0], reason: 'when-drawn', shuffleBack: false, source: 'random' })), /сразу после взятия/);
  // замена за 1 CP (G1.5) — отдельное правило: в эту же фазу допустима (CP уже есть из фаз командования)
  ok(run(drawn, B({ type: 'card-redrawn', target: 'p1', card: 'bring-it-down', replacement: s0.players.p1.deck[0], reason: 'swap', shuffleBack: false, source: 'random' })));
});

test('заметка к активной карте; к чужой или неактивной — нет', () => {
  const drawn = B({ type: 'cards-drawn', target: 'p1', cards: ['beacon', 'assassination'], source: 'manual' });
  const s = ok(run(drawn, B({ type: 'card-noted', target: 'p1', card: 'beacon', note: ' Капитан на байке ' })));
  assert.equal(s.players.p1.active.find((a) => a.id === 'beacon')?.note, 'Капитан на байке');
  err(run(drawn, B({ type: 'card-noted', target: 'p1', card: 'plunder', note: 'x' })), /нет среди активных/);
  err(run(drawn, B({ type: 'card-noted', target: 'p1', seat: 'p2', card: 'beacon', note: 'x' })), /своим картам/);
});

test('другой seed — другие карты; одинаковый журнал — одинаковое состояние', () => {
  const a = ok(run());
  const other = setupBodies().map((b) => (b.type === 'game-created' ? B({ ...b, seed: 'seed-2' }) : b));
  const b = ok(replay(log(...other, B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' }), B({ type: 'turn-ended' }), B({ type: 'command-phase-started' })), catalog));
  assert.notDeepEqual(nextDraw(a, 'p1'), nextDraw(b, 'p1'));
  assert.deepEqual(ok(run()), a);
});
