// «Начать игру», G2.1: шаги подготовки в порядке правил, два раскрытия (типы армий, вторичные),
// броски «кто выше» с проверкой по seed (game/setup.ts, game/reducer.ts). Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../../../client/src/features/roster/game/reducer';
import { layoutPick, rollOff } from '../../../client/src/features/roster/game/rng';
import { layoutsFor } from '../../../client/src/features/roster/game/reducer';
import { currentSetupStep, setupMissing, setupSteps } from '../../../client/src/features/roster/game/setup';
import type { GameState } from '../../../client/src/features/roster/game/types';
import { catalog, created, log, ROSTER_P1, setupBodies, type Body } from './game-helpers';

const ok = (r: ReturnType<typeof replay>): GameState => {
  assert.ok(r.ok, r.ok ? '' : `№${r.seq}: ${r.error}`);
  return r.state;
};
const err = (r: ReturnType<typeof replay>, re: RegExp) => assert.ok(!r.ok && re.test(r.error), r.ok ? 'принято' : r.error);
const B = (b: object) => b as Body;
const upTo = (n: number, ...extra: Body[]) => replay(log(...setupBodies().slice(0, n), ...extra), catalog);
const R = (attempt: number) => ({ attempt });
const ROLES = rollOff('seed-1', 'roles', 0);
const FIRST = rollOff('seed-1', 'first-turn', 0);

test('шаги подготовки идут в порядке правил колоды миссий', () => {
  const steps = [
    [1, 'players'], [2, 'players'], [3, 'dispositions'], [4, 'layout'], [5, 'roles'], [6, 'secondaries'],
    [8, 'secondaries'], [9, 'first-turn'], [10, null],
  ] as const;
  for (const [n, exp] of steps) assert.equal(currentSetupStep(ok(upTo(n))), exp, `после ${n} событий`);
  assert.deepEqual(setupSteps(ok(upTo(1))).map((x) => x.id), ['players', 'dispositions', 'layout', 'roles', 'secondaries', 'first-turn']);
  assert.deepEqual(setupMissing(ok(upTo(3))), ['раскрытие типов армий', 'раскладка', 'атакующий и защитник', 'Аня: режим вторичных миссий', 'Борис: режим вторичных миссий', 'кто ходит первым']);
  assert.deepEqual(setupMissing(ok(upTo(10))), []);
});

test('раскрытия: после раскрытия выбор не меняется', () => {
  err(upTo(4, B({ type: 'player-set', target: 'p1', patch: { disposition: 'disruption' } })), /уже раскрыт/);
  err(upTo(4, B({ type: 'dispositions-revealed' })), /уже раскрыты/);
  err(upTo(9, B({ type: 'secondary-chosen', target: 'p1', mode: 'tactical', fixed: null })), /уже раскрыт/);
  err(upTo(9, B({ type: 'secondaries-revealed' })), /уже раскрыты/);
  err(upTo(9, B({ type: 'roles-set', attacker: 'p2', source: 'manual' })), /не поменять/);
  err(upTo(3, B({ type: 'dispositions-revealed', seat: 'p1' })), /общее событие/);
  // до раскрытия вторичных атакующего можно переопределить
  assert.equal(ok(upTo(6, B({ type: 'roles-set', attacker: 'p2', source: 'manual' }))).players.p2.role, 'attacker');
});

test('бросок за атакующего: кубики по seed, победитель выбирает; номер броска ведёт движок', () => {
  const s = ok(upTo(5, B({ type: 'roles-set', attacker: 'p2', source: 'random', roll: R(0) })));
  assert.deepEqual(s.rolls.roles, { attempt: 0, rolls: ROLES.rolls, winner: ROLES.winner });
  assert.equal(s.rollCount.roles, 1);
  assert.equal(s.rolesSource, 'random');
  assert.equal(ok(upTo(6)).rolesSource, 'manual');
  assert.equal(s.players.p2.role, 'attacker', 'победитель вправе выбрать любую роль для любого');
  err(upTo(5, B({ type: 'roles-set', attacker: 'p1', source: 'random', roll: R(1) })), /Ожидался бросок №1/);
  err(upTo(5, B({ type: 'roles-set', attacker: 'p1', source: 'random' })), /нужен бросок/);
  err(upTo(5, B({ type: 'roles-set', attacker: 'p1', source: 'manual', roll: R(0) })), /ручной/);
  const loser = ROLES.winner === 'p1' ? 'p2' : 'p1';
  err(upTo(5, B({ type: 'roles-set', attacker: 'p1', source: 'random', roll: R(0), seat: loser })), /победитель броска/);
  ok(upTo(5, B({ type: 'roles-set', attacker: 'p1', source: 'random', roll: R(0), seat: ROLES.winner })));
  // переброс по договорённости — следующий номер, новые кубики
  const again = ok(upTo(5, B({ type: 'roles-set', attacker: 'p1', source: 'random', roll: R(0) }), B({ type: 'roles-set', attacker: 'p1', source: 'random', roll: R(1) })));
  assert.deepEqual(again.rolls.roles?.rolls, rollOff('seed-1', 'roles', 1).rolls);
});

test('отмена броска возвращает счётчик: повторный бросок даёт те же кубики', () => {
  const evs = log(...setupBodies().slice(0, 5), B({ type: 'roles-set', attacker: 'p1', source: 'random', roll: R(0) }));
  const undone = ok(replay(log(...evs.map((e) => B(e)), B({ type: 'event-reverted', target: evs.at(-1)!.id })), catalog));
  assert.deepEqual([undone.rollCount.roles, undone.rolls.roles], [0, undefined]);
  err(replay(log(...evs.map((e) => B(e)), B({ type: 'event-reverted', target: evs.at(-1)!.id }), B({ type: 'roles-set', attacker: 'p1', source: 'random', roll: R(1) })), catalog), /Ожидался бросок №1/);
});

test('бросок за первый ход: победитель ходит первым', () => {
  const s = ok(upTo(9, B({ type: 'first-turn-set', first: FIRST.winner, source: 'random', roll: R(0) })));
  assert.equal(s.firstTurn, FIRST.winner);
  assert.equal(s.firstTurnSource, 'random');
  assert.deepEqual(s.rolls['first-turn']?.rolls, FIRST.rolls);
  err(upTo(9, B({ type: 'first-turn-set', first: FIRST.winner === 'p1' ? 'p2' : 'p1', source: 'random', roll: R(0) })), /победитель броска/);
  // вручную (договорились) — любой
  assert.equal(ok(upTo(9, B({ type: 'first-turn-set', first: 'p1', source: 'manual' }))).firstTurn, 'p1');
});

test('случайная раскладка: по seed и номеру выбора, проверяется движком; после ролей — не меняется', () => {
  const s4 = ok(upTo(4));
  const opts = layoutsFor(s4, catalog);
  assert.equal(opts.length, 3);
  const pick = opts[layoutPick('seed-1', 0, 3)]!;
  const other = opts.find((l) => l.id !== pick.id)!;
  const s = ok(upTo(4, B({ type: 'layout-set', layoutId: pick.id, source: 'random', roll: R(0) })));
  assert.deepEqual([s.layoutId, s.layoutDraws], [pick.id, 1]);
  err(upTo(4, B({ type: 'layout-set', layoutId: other.id, source: 'random', roll: R(0) })), /не совпадает с жребием/);
  err(upTo(4, B({ type: 'layout-set', layoutId: pick.id, source: 'random', roll: R(1) })), /Ожидался случайный выбор №1/);
  err(upTo(4, B({ type: 'layout-set', layoutId: pick.id, source: 'random' })), /номер выбора/);
  err(upTo(4, B({ type: 'layout-set', layoutId: pick.id, source: 'manual', roll: R(0) })), /ручной/);
  // повторный жребий — следующий номер; вручную — любая из трёх
  const again = ok(upTo(4, B({ type: 'layout-set', layoutId: pick.id, source: 'random', roll: R(0) }), B({ type: 'layout-set', layoutId: opts[layoutPick('seed-1', 1, 3)]!.id, source: 'random', roll: R(1) })));
  assert.equal(again.layoutDraws, 2);
  assert.equal(ok(upTo(4, B({ type: 'layout-set', layoutId: other.id, source: 'manual' }))).layoutId, other.id);
  err(upTo(6, B({ type: 'layout-set', layoutId: other.id, source: 'manual' })), /не поменять/);
  // отмена возвращает номер выбора
  const evs = log(...setupBodies().slice(0, 4), B({ type: 'layout-set', layoutId: pick.id, source: 'random', roll: R(0) }));
  assert.equal(ok(replay(log(...evs.map((e) => B(e)), B({ type: 'event-reverted', target: evs.at(-1)!.id })), catalog)).layoutDraws, 0);
});

test('ростеры (G2.12): без ростера тип армии не выбрать; только типы детачментов ростера; новый ростер сбрасывает чужой тип', () => {
  const none = ok(replay(log(created), catalog));
  assert.deepEqual(setupSteps(none)[0]!.missing, ['Аня: ростер', 'Борис: ростер']);
  err(replay(log(created, B({ type: 'player-set', target: 'p1', patch: { disposition: 'take-and-hold' } })), catalog), /Сначала выберите ростер/);
  err(replay(log(created, B({ type: 'player-set', target: 'p1', patch: { roster: { ...ROSTER_P1, dispositions: [] } } })), catalog), /нет детачмента/);
  err(replay(log(created, B({ type: 'player-set', target: 'p1', patch: { roster: { ...ROSTER_P1, dispositions: ['nope'] } } })), catalog), /Неизвестный тип армии/);
  const withRoster = B({ type: 'player-set', target: 'p1', patch: { roster: ROSTER_P1 } });
  err(replay(log(created, withRoster, B({ type: 'player-set', target: 'p1', patch: { disposition: 'purge-the-foe' } })), catalog), /не даёт ни один детачмент/);
  const s = ok(replay(log(created, withRoster, B({ type: 'player-set', target: 'p1', patch: { disposition: 'disruption' } })), catalog));
  assert.equal(s.players.p1.disposition, 'disruption');
  // другой ростер без Disruption — тип армии сбрасывается
  const other = ok(replay(log(created, withRoster, B({ type: 'player-set', target: 'p1', patch: { disposition: 'disruption' } }), B({ type: 'player-set', target: 'p1', patch: { roster: { ...ROSTER_P1, dispositions: ['take-and-hold'] } } })), catalog));
  assert.equal(other.players.p1.disposition, null);
  // после раскрытия ростер не меняется
  err(upTo(4, B({ type: 'player-set', target: 'p1', patch: { roster: ROSTER_P1 } })), /уже раскрыты/);
});
