// Игра на двух телефонах, T2: чьё событие и добавление событий с сервера (game/online.ts). Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendRemote, seatForEvent } from '../../../client/src/features/roster/game/online';
import { applyEvent, replay } from '../../../client/src/features/roster/game/reducer';
import type { GameEvent } from '../../../client/src/features/roster/game/types';
import { catalog, created, log } from './game-helpers';

const ev = (seq: number, id = `e${seq}`) => ({ id, seq }) as GameEvent;

test('seatForEvent: общие события — null, остальные — место телефона', () => {
  for (const t of ['game-created', 'dispositions-revealed', 'secondaries-revealed', 'battle-started'] as const) assert.equal(seatForEvent(t, 'p2'), null);
  assert.equal(seatForEvent('player-set', 'p2'), 'p2');
  assert.equal(seatForEvent('turn-ended', 'p1'), 'p1');
  assert.equal(seatForEvent('event-reverted', 'p1'), 'p1');
});

test('appendRemote: продолжение по номерам, повторы пропускаются, пропуск и чужая история — null', () => {
  const base = [ev(1), ev(2)];
  assert.deepEqual(appendRemote(base, [ev(4), ev(3)])?.map((e) => e.seq), [1, 2, 3, 4]);
  assert.deepEqual(appendRemote(base, [ev(2), ev(3)])?.map((e) => e.seq), [1, 2, 3]);
  assert.deepEqual(appendRemote(base, []), base);
  assert.equal(appendRemote(base, [ev(4)]), null);
  assert.equal(appendRemote(base, [ev(2, 'other')]), null);
  assert.deepEqual(appendRemote([], [ev(1)])?.map((e) => e.seq), [1]);
});

test('движок: телефон игрока 1 не может менять игрока 2', () => {
  const r = replay(log(created), catalog);
  assert.ok(r.ok);
  const bad = { id: 'x', seq: r.state.lastSeq + 1, at: '', seat: seatForEvent('player-set', 'p1'), type: 'player-set', target: 'p2', patch: { name: 'Чужой' } } as GameEvent;
  assert.equal(applyEvent(r.state, bad, catalog).ok, false);
  const own = { ...bad, target: 'p1', patch: { name: 'Свой' } } as GameEvent;
  assert.equal(applyEvent(r.state, own, catalog).ok, true);
});
