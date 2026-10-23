// «Начать игру», G1.7: отмена (как стек), сохранение и загрузка журнала, версия схемы, отпечаток данных.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, undoTarget } from '../../../client/src/features/roster/game/reducer';
import { catalogFingerprint, loadGame, MIGRATIONS, serializeGame } from '../../../client/src/features/roster/game/serialize';
import { nextDraw } from '../../../client/src/features/roster/game/decks';
import type { GameEvent, GameState } from '../../../client/src/features/roster/game/types';
import { catalog, log, setupBodies, type Body } from './game-helpers';

const ok = (r: ReturnType<typeof replay>): GameState => {
  assert.ok(r.ok, r.ok ? '' : `№${r.seq}: ${r.error}`);
  return r.state;
};
const err = (r: ReturnType<typeof replay>, re: RegExp) => assert.ok(!r.ok && re.test(r.error), r.ok ? 'принято' : r.error);
const B = (b: object) => b as Body;
const P1_COMMAND = [...setupBodies(), B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' }), B({ type: 'turn-ended' }), B({ type: 'command-phase-started' })];
const strip = (s: GameState) => ({ ...s, lastSeq: 0, reverted: [] });
const undo = (target: string, seat: string | null = null) => B({ type: 'event-reverted', target, seat });

test('отмена последнего взятия: состояние как до него, повторное взятие даёт те же карты', () => {
  const before = ok(replay(log(...P1_COMMAND), catalog));
  const top = nextDraw(before, 'p1');
  const draw = B({ type: 'cards-drawn', target: 'p1', cards: top, source: 'random' });
  const drawn = log(...P1_COMMAND, draw);
  const drawId = drawn.at(-1)!.id;
  const undone = ok(replay(log(...P1_COMMAND, draw, undo(drawId)), catalog));
  assert.deepEqual(strip(undone), strip(before));
  assert.deepEqual(undone.reverted, [drawId]);
  assert.equal(undone.lastSeq, drawn.length + 1, 'номера журнала идут дальше');
  const again = ok(replay(log(...P1_COMMAND, draw, undo(drawId), draw), catalog));
  assert.deepEqual(again.players.p1.active.map((a) => a.id), top);
});

test('отмена как стек: две отмены снимают два последних действия', () => {
  const evs = log(...P1_COMMAND, B({ type: 'cards-drawn', target: 'p1', cards: ['plunder'], source: 'manual' }), B({ type: 'cp-changed', target: 'p1', delta: -1, reason: 'stratagem' }));
  const [draw, cp] = [evs.at(-2)!, evs.at(-1)!];
  const s = ok(replay(log(...evs.map((e) => B(e)), undo(cp.id), undo(draw.id)), catalog));
  assert.deepEqual(strip(s), strip(ok(replay(log(...P1_COMMAND), catalog))));
  err(replay(log(...evs.map((e) => B(e)), undo(draw.id)), catalog), /только последнее/);
  err(replay(log(...evs.map((e) => B(e)), undo(cp.id), undo(cp.id)), catalog), /только последнее/);
});

test('отмена: только своё или общее; создание игры не отменяется', () => {
  const evs = log(...P1_COMMAND, B({ type: 'cp-changed', target: 'p1', seat: 'p1', delta: -1, reason: 'stratagem' }));
  const last = evs.at(-1)!;
  err(replay(log(...evs.map((e) => B(e)), undo(last.id, 'p2')), catalog), /своё действие/);
  ok(replay(log(...evs.map((e) => B(e)), undo(last.id, 'p1')), catalog));
  ok(replay(log(...evs.map((e) => B(e)), undo(last.id, null)), catalog));
  err(replay(log(B({ type: 'game-created', schema: 1, seed: 's', names: { p1: 'A', p2: 'B' } }), undo('e1')), catalog), /нечего/);
});

test('undoTarget: что снимет следующая отмена', () => {
  const evs = log(...P1_COMMAND, B({ type: 'cp-changed', target: 'p1', seat: 'p1', delta: -1, reason: 'stratagem' }));
  assert.equal(undoTarget(evs)?.type, 'cp-changed');
  assert.equal(undoTarget(evs, 'p2'), null, 'чужое — нельзя');
  const afterUndo = [...evs, { ...log(...evs.map((e) => B(e)), undo(evs.at(-1)!.id)).at(-1)! }];
  assert.equal(undoTarget(afterUndo)?.type, 'command-phase-started');
  assert.equal(undoTarget(log(B({ type: 'game-created', schema: 1, seed: 's', names: { p1: 'A', p2: 'B' } }))), null);
});

test('сохранение → загрузка → то же состояние; отпечаток данных', () => {
  const events = log(...P1_COMMAND, B({ type: 'cards-drawn', target: 'p1', cards: ['plunder', 'cleanse'], source: 'manual' }));
  const text = serializeGame(events, catalog);
  const loaded = loadGame(text, catalog);
  assert.ok(loaded.ok, loaded.ok ? '' : loaded.error);
  assert.deepEqual(loaded.state, ok(replay(events, catalog)));
  assert.deepEqual(loaded.warnings, []);
  assert.match(catalogFingerprint(catalog), /^[0-9a-f]{8}$/);
  // данные миссий изменились — предупреждение, журнал всё равно проигрывается
  const changed = { ...catalog, caps: { ...catalog.caps, primaryRound: 16 } };
  assert.notEqual(catalogFingerprint(changed), catalogFingerprint(catalog));
  const w = loadGame(text, changed);
  assert.ok(w.ok);
  assert.equal(w.warnings.length, 1);
});

test('загрузка: повреждённое, чужое, без версии, более новая схема, пустой журнал, миграция', () => {
  const e = (t: string, re: RegExp) => {
    const r = loadGame(t, catalog);
    assert.ok(!r.ok && re.test(r.error), r.ok ? 'принято' : r.error);
  };
  e('{', /не JSON/);
  e(JSON.stringify({ format: 'other' }), /не сохранённая игра/);
  e(JSON.stringify({ format: 'warphub-game', events: [] }), /версии схемы/);
  e(JSON.stringify({ format: 'warphub-game', schema: 99, events: [{}] }), /более новой версией/);
  e(JSON.stringify({ format: 'warphub-game', schema: 1, events: [] }), /нет журнала/);
  // механизм миграции: старая схема без перевода — понятная ошибка
  e(JSON.stringify({ format: 'warphub-game', schema: 0, catalog: '', events: [{}] }), /версии схемы/);
  assert.deepEqual(MIGRATIONS, {}, 'пока схема одна — миграций нет');
});

test('журнал с отменами сохраняется и загружается без потерь', () => {
  const evs = log(...P1_COMMAND, B({ type: 'cards-drawn', target: 'p1', cards: ['plunder'], source: 'manual' }));
  const full: GameEvent[] = log(...evs.map((x) => B(x)), undo(evs.at(-1)!.id));
  const r = loadGame(serializeGame(full, catalog), catalog);
  assert.ok(r.ok);
  assert.deepEqual(r.state.reverted, [evs.at(-1)!.id]);
  assert.equal(r.events?.length, full.length);
});
