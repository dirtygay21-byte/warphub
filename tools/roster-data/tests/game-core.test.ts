// «Начать игру», G1.3: ядро игры — применение событий и проигрывание журнала (game/reducer.ts). Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, createGame, layoutsFor, replay, setupMissing } from '../../../client/src/features/roster/game/reducer';
import type { GameEvent, GameState } from '../../../client/src/features/roster/game/types';
import { catalog, created, log, setupBodies, type Body } from './game-helpers';

const turn = (): Body[] => [{ type: 'command-phase-started' }, { type: 'command-phase-ended' }, { type: 'turn-ended' }] as Body[];

function ok(r: ReturnType<typeof replay>): GameState {
  assert.ok(r.ok, r.ok ? '' : `№${r.seq}: ${r.error}`);
  return r.state;
}
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') for (const v of Object.values(o)) deepFreeze(v);
  return Object.freeze(o);
}

test('создание игры: этап подготовки, два игрока, версия схемы проверяется', () => {
  const s = ok(replay(log(created), catalog));
  assert.equal(s.stage, 'setup');
  assert.deepEqual([s.players.p1.name, s.players.p2.name], ['Аня', 'Борис']);
  assert.deepEqual([s.players.p1.primaryScored, s.players.p1.adjustments, s.players.p1.cp], [[], [], 0]);
  const bad = createGame({ ...log(created)[0]!, schema: 2 } as GameEvent);
  assert.ok(!bad.ok && /версия/.test(bad.error));
  assert.ok(!replay([], catalog).ok);
});

test('подготовка: основные миссии по паре типов армий, раскладка из пары, чего не хватает', () => {
  const bodies = setupBodies();
  const s = ok(replay(log(...bodies.slice(0, 3)), catalog));
  assert.deepEqual(s.primary, { p1: 'immovable-object', p2: 'unstoppable-force' });
  assert.equal(layoutsFor(s, catalog).length, 3);
  assert.ok(setupMissing(s).includes('раскладка'));
  const full = ok(replay(log(...bodies.slice(0, -1)), catalog));
  assert.deepEqual(setupMissing(full), []);
  assert.equal(full.players.p1.role, 'attacker');
  assert.equal(full.players.p2.role, 'defender');
  assert.ok(full.deploymentId);
  assert.deepEqual(full.players.p2.fixed, ['assassination', 'bring-it-down']);
  assert.equal(full.players.p1.roster.name, 'Мои ультрамарины');
});

test('полная битва: 5 раундов по 2 хода, первым ходит p2, в конце — итог по раундам', () => {
  const bodies = [...setupBodies()];
  for (let i = 0; i < 10; i++) bodies.push(...turn());
  const events = log(...bodies);
  let s = ok(replay(events.slice(0, setupBodies().length), catalog));
  assert.deepEqual([s.stage, s.round, s.activeSeat, s.step], ['battle', 1, 'p2', 'start']);
  s = ok(replay(events.slice(0, setupBodies().length + 3), catalog));
  assert.deepEqual([s.round, s.activeSeat], [1, 'p1']);
  s = ok(replay(events.slice(0, setupBodies().length + 6), catalog));
  assert.deepEqual([s.round, s.activeSeat], [2, 'p2']);
  s = ok(replay(events, catalog));
  assert.deepEqual([s.stage, s.endReason, s.activeSeat], ['finished', 'rounds', null]);
  assert.equal(s.lastSeq, events.length);
  const after = applyEvent(s, { ...log(...bodies, ...turn())[events.length]! }, catalog);
  assert.ok(!after.ok && /закончена/.test(after.error));
});

test('отклоняется: порядок журнала, повтор id, чужое место, не тот шаг, не тот этап', () => {
  const base = ok(replay(log(...setupBodies()), catalog));
  const next = (b: Body, seq = base.lastSeq + 1) => ({ seat: null, ...b, id: `x${seq}`, seq, at: 'now' }) as GameEvent;
  const r1 = applyEvent(base, next({ type: 'command-phase-started' } as Body, base.lastSeq + 2), catalog);
  assert.ok(!r1.ok && /порядок/.test(r1.error));
  const r2 = applyEvent(base, next({ type: 'command-phase-started', seat: 'p1' } as Body), catalog);
  assert.ok(!r2.ok && /другого игрока/.test(r2.error), 'первым ходит p2');
  assert.ok(applyEvent(base, next({ type: 'command-phase-started', seat: 'p2' } as Body), catalog).ok);
  const r3 = applyEvent(base, next({ type: 'turn-ended' } as Body), catalog);
  assert.ok(!r3.ok && /Не по порядку/.test(r3.error));
  const r4 = applyEvent(base, next({ type: 'layout-set', layoutId: base.layoutId!, source: 'manual' } as Body), catalog);
  assert.ok(!r4.ok && /до начала битвы/.test(r4.error));
  const r5 = applyEvent(base, next({ type: 'player-set', target: 'p1', seat: 'p2', patch: { name: 'X' } } as Body), catalog);
  assert.ok(!r5.ok && /свои данные/.test(r5.error));
  const dup = log(...setupBodies());
  dup[3] = { ...dup[3]!, id: 'e2' };
  const r6 = replay(dup, catalog);
  assert.ok(!r6.ok && /Повтор/.test(r6.error) && r6.seq === 4);
});

test('подготовка: проверки выбора', () => {
  const s = ok(replay(log(created), catalog));
  const next = (b: Body) => ({ seat: null, ...b, id: 'n', seq: s.lastSeq + 1, at: 'now' }) as GameEvent;
  const bad = (b: Body, re: RegExp) => {
    const r = applyEvent(s, next(b), catalog);
    assert.ok(!r.ok && re.test(r.error), r.ok ? 'принято' : r.error);
  };
  bad({ type: 'player-set', target: 'p1', patch: { disposition: 'nope' } } as Body, /Неизвестный тип армии/);
  bad({ type: 'secondary-chosen', target: 'p1', mode: 'fixed', fixed: ['assassination', 'assassination'] } as Body, /две разные/);
  bad({ type: 'secondary-chosen', target: 'p1', mode: 'fixed', fixed: ['assassination', 'cleanse'] } as Body, /нельзя взять фиксированной/);
  bad({ type: 'secondary-chosen', target: 'p1', mode: 'fixed', fixed: ['assassination', 'death-trap'] } as Body, /Нет вторичной/);
  bad({ type: 'choices-revealed' } as Body, /не выбран тип армии/);
  bad({ type: 'layout-set', layoutId: 'bm-take-vs-take-01', source: 'manual' } as Body, /Сначала выберите типы армий/);
  bad({ type: 'battle-started' } as Body, /Не готово/);
  bad({ type: 'battle-ended', reason: 'manual' } as Body, /не идёт/);
});

test('после раскрытия тип армии не меняется; смена пары сбрасывает раскладку', () => {
  const bodies = setupBodies();
  const revealed = ok(replay(log(...bodies.slice(0, 6)), catalog));
  const r = applyEvent(revealed, { seat: null, type: 'player-set', target: 'p1', patch: { disposition: 'disruption' }, id: 'z', seq: revealed.lastSeq + 1, at: 'now' } as GameEvent, catalog);
  assert.ok(!r.ok && /раскрыт/.test(r.error));
  // до раскрытия: раскладка выбрана, затем меняется тип армии — раскладка сбрасывается
  const pre = log(created, bodies[1]!, bodies[2]!, { type: 'layout-set', layoutId: bodies[6]!.layoutId, source: 'manual' } as Body, { type: 'player-set', target: 'p2', patch: { disposition: 'disruption' } } as Body);
  const s = ok(replay(pre, catalog));
  assert.equal(s.layoutId, null);
  assert.deepEqual(s.primary, { p1: 'determined-acquisition', p2: 'death-trap' });
});

test('сдача: битва заканчивается досрочно', () => {
  const s = ok(replay(log(...setupBodies(), { type: 'battle-ended', reason: 'concede' } as Body), catalog));
  assert.deepEqual([s.stage, s.endReason], ['finished', 'concede']);
  const r = replay(log(...setupBodies(), { type: 'battle-ended', reason: 'rounds' } as Body), catalog);
  assert.ok(!r.ok && /сама/.test(r.error));
});

test('чистота: исходное состояние не меняется (замороженный объект)', () => {
  const s = deepFreeze(ok(replay(log(...setupBodies()), catalog)));
  const before = JSON.stringify(s);
  const r = applyEvent(s, { seat: null, type: 'command-phase-started', id: 'q', seq: s.lastSeq + 1, at: 'now' } as GameEvent, catalog);
  assert.ok(r.ok);
  assert.equal(JSON.stringify(s), before);
  assert.notEqual(r.state, s);
});

test('отмена через applyEvent напрямую не применяется — только при проигрывании журнала (G1.7)', () => {
  const s = ok(replay(log(...setupBodies()), catalog));
  const r = applyEvent(s, { seat: null, type: 'event-reverted', target: 'e5', id: 'q', seq: s.lastSeq + 1, at: 'now' } as GameEvent, catalog);
  assert.ok(!r.ok && /при проигрывании журнала/.test(r.error));
});
