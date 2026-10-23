// «Начать игру», G1.2: детерминированная случайность (client/src/features/roster/game/rng.ts). Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deckOrder, hashSeed, makeRng, newSeed, pickIndex, rollOff, shuffle } from '../../../client/src/features/roster/game/rng';

const CARDS = Array.from({ length: 18 }, (_, i) => `card-${i + 1}`);
const GAME = path.join(import.meta.dirname, '..', '..', '..', 'client', 'src', 'features', 'roster', 'game');

test('одинаковый seed и части → одинаковая последовательность и порядок колоды', () => {
  const a = makeRng('seed-1', 'x');
  const b = makeRng('seed-1', 'x');
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  assert.deepEqual(deckOrder('seed-1', 'p1', 0, CARDS), deckOrder('seed-1', 'p1', 0, CARDS));
});

test('другой seed, место или номер перемешивания → другой порядок', () => {
  const base = deckOrder('seed-1', 'p1', 0, CARDS);
  assert.notDeepEqual(deckOrder('seed-2', 'p1', 0, CARDS), base);
  assert.notDeepEqual(deckOrder('seed-1', 'p2', 0, CARDS), base);
  assert.notDeepEqual(deckOrder('seed-1', 'p1', 1, CARDS), base);
  assert.notEqual(hashSeed('a', 'bc'), hashSeed('ab', 'c'), 'части не склеиваются');
});

test('перемешивание: каждая карта ровно один раз, исходный массив не меняется', () => {
  const src = CARDS.slice();
  const out = shuffle(src, makeRng('s'));
  assert.deepEqual(src, CARDS);
  assert.equal(out.length, CARDS.length);
  assert.deepEqual(out.slice().sort(), CARDS.slice().sort());
  assert.deepEqual(shuffle([], makeRng('s')), []);
  assert.deepEqual(shuffle(['x'], makeRng('s')), ['x']);
});

test('генератор в [0, 1), pickIndex в [0, n)', () => {
  const r = makeRng('range');
  for (let i = 0; i < 10000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
    const k = pickIndex(r, 7);
    assert.ok(Number.isInteger(k) && k >= 0 && k < 7);
  }
  assert.throws(() => pickIndex(r, 0), RangeError);
});

test('равномерность: за 10 000 перемешиваний каждая карта в каждой позиции ≈ 1/18 (±25%)', () => {
  const N = 10000;
  const counts = CARDS.map(() => new Array(CARDS.length).fill(0));
  for (let s = 0; s < N; s++) deckOrder(`seed-${s}`, 'p1', 0, CARDS).forEach((c, pos) => counts[CARDS.indexOf(c)]![pos]++);
  const expected = N / CARDS.length;
  for (const row of counts) for (const n of row) assert.ok(Math.abs(n - expected) < expected * 0.25, `${n} vs ${expected}`);
});

test('бросок «кто выше»: детерминирован, без ничьей у победителя, оба места выигрывают', () => {
  assert.deepEqual(rollOff('g', 'roles'), rollOff('g', 'roles'));
  const wins = { p1: 0, p2: 0 };
  for (let s = 0; s < 2000; s++) {
    const r = rollOff(`g${s}`, 'first-turn');
    const last = r.rolls.at(-1)!;
    assert.notEqual(last.p1, last.p2);
    assert.equal(r.winner, last.p1 > last.p2 ? 'p1' : 'p2');
    for (const x of r.rolls) for (const v of [x.p1, x.p2]) assert.ok(v >= 1 && v <= 6);
    r.rolls.slice(0, -1).forEach((x) => assert.equal(x.p1, x.p2, 'перебрасываются только ничьи'));
    wins[r.winner]++;
  }
  assert.ok(wins.p1 > 800 && wins.p2 > 800, JSON.stringify(wins));
  assert.notDeepEqual(rollOff('g', 'roles', 0), rollOff('g', 'roles', 1));
});

test('новый seed: 32 hex-символа, разные при каждом вызове', () => {
  const a = newSeed();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(newSeed(), a);
});

test('модуль игры не использует Math.random', () => {
  for (const f of fs.readdirSync(GAME)) {
    const src = fs.readFileSync(path.join(GAME, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.ok(!/Math\.random/.test(src), f);
  }
});
