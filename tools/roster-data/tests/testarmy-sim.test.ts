import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkMove, clampShift, parseInches, parseTarget, rollDice, rules40k, startMove, type SimContext } from '../../../client/src/features/roster/testarmy/sim';
import type { TAUnit } from '../../../client/src/features/roster/testarmy/state';

// Test Army, этап 2 (27.11.2026): фазы и действия 40K по основным правилам 11-й ред. (wh-rules.ru, данные 995).
const unit = (uid: string, pts: [number, number][]): TAUnit => ({
  uid,
  name: uid,
  leaders: [],
  datasheetIds: [],
  points: 0,
  models: pts.map((at, i) => ({ id: `${uid}.${i}`, profile: 'x', options: [{ kind: 'circle', d: 32 }], source: '32mm', pick: 0, customMm: null, at })),
  formation: 'tight',
  angle: 0,
  gap: 0.5,
  placed: true,
});
const ctx = (over: Partial<SimContext>): SimContext => ({ phase: 'movement', active: true, placed: true, flags: {}, engaged: false, nearestEnemy: 20, move: 6, leadership: 7, ...over });
const act = (c: Partial<SimContext>, id: string) => rules40k.actions(ctx(c)).find((a) => a.id === id)!;

test('Характеристики: M и Ld из строк инфолиста', () => {
  assert.equal(parseInches('6"'), 6);
  assert.equal(parseInches('20+"'), 20);
  assert.equal(parseInches('-'), null);
  assert.equal(parseTarget('7+'), 7);
  assert.ok(rollDice(2).every((d) => d >= 1 && d <= 6));
});

test('Фаза движения: обычный манёвр / продвижение только не связанным боем, отступление — только связанным', () => {
  assert.equal(act({}, 'normal').blocked, undefined);
  assert.match(act({ engaged: true }, 'normal').blocked!, /связан боем/);
  assert.match(act({}, 'fallback').blocked!, /связанного боем/);
  assert.equal(act({ engaged: true }, 'fallback').blocked, undefined);
  assert.match(act({ flags: { moved: 'normal' } }, 'advance').blocked!, /уже выбран/);
  assert.match(act({ active: false }, 'normal').blocked!, /ход другой армии/);
  assert.equal(rules40k.engagement, 2, '11-я ред.: радиус связывания 2″');
});

test('Нападение: в пределах 12″, не после продвижения/отступления, не связанным боем', () => {
  const c = { phase: 'charge' };
  assert.equal(act({ ...c, nearestEnemy: 11.5 }, 'charge').blocked, undefined);
  assert.match(act({ ...c, nearestEnemy: 12.5 }, 'charge').blocked!, /12″/);
  assert.match(act({ ...c, nearestEnemy: 8, flags: { moved: 'advance' } }, 'charge').blocked!, /продвижения/);
  assert.match(act({ ...c, nearestEnemy: 8, flags: { moved: 'fallback' } }, 'charge').blocked!, /отступления/);
  // бой: сражаться может связанный боем или нападавший
  assert.match(act({ phase: 'fight' }, 'fight').blocked!, /не связан/);
  assert.equal(act({ phase: 'fight', flags: { charged: true } }, 'fight').blocked, undefined);
  assert.equal(act({ phase: 'fight', engaged: true }, 'pilein').distance?.fixed, 3);
  assert.match(act({ phase: 'shooting', flags: { moved: 'fallback' } }, 'shoot').blocked!, /отступления/);
});

test('Манёвр: модель не уходит дальше своей дистанции; продвижение = M + D6', () => {
  const u = unit('a', [[10, 10], [12, 10]]);
  const am = startMove(u, act({}, 'advance'), [6, 5], [4])!;
  assert.equal(am.max['a.0'], 10);
  assert.equal(am.max['a.1'], 9);
  const from = { 'a.0': [10, 10] as [number, number], 'a.1': [12, 10] as [number, number] };
  // тянем на 20″ вправо: отряд целиком — по самой короткой дистанции (9″)
  const k = clampShift(am, from, ['a.0', 'a.1'], 20, 0);
  assert.ok(Math.abs(k * 20 - 9) < 1e-3, String(k * 20));
  // одна модель — своя дистанция
  assert.ok(Math.abs(clampShift(am, from, ['a.0'], 20, 0) * 20 - 10) < 1e-3);
  // нападение: дистанция — бросок 2D6
  const ch = startMove(u, act({ phase: 'charge', nearestEnemy: 8 }, 'charge'), [6, 6], [3, 4])!;
  assert.equal(ch.max['a.0'], 7);
});

test('Конец манёвра: обычный — не ближе 2″ к врагу; нападение — связан со всеми целями и ни с кем больше', () => {
  const me = unit('me', [[10, 10]]);
  const near = { uid: 'e1', name: 'E1', bases: [{ x: 12.5, y: 10, rx: 0.63, ry: 0.63, angle: 0 }] };
  const far = { uid: 'e2', name: 'E2', bases: [{ x: 30, y: 10, rx: 0.63, ry: 0.63, angle: 0 }] };
  const mine = [{ x: 10, y: 10, rx: 0.63, ry: 0.63, angle: 0 }];
  const normal = startMove(me, act({}, 'normal'), [6])!;
  assert.match(checkMove(normal, rules40k, mine, [near])[0]!, /ближе 2″/);
  assert.deepEqual(checkMove(normal, rules40k, mine, [far]), []);
  const charge = { ...startMove(me, act({ phase: 'charge', nearestEnemy: 5 }, 'charge'), [6], [5, 5])!, targets: ['e1', 'e2'] };
  assert.match(checkMove(charge, rules40k, mine, [near, far]).join(' '), /не связан боем с целью: E2/);
  const charge1 = { ...charge, targets: ['e2'] };
  assert.match(checkMove(charge1, rules40k, mine, [near, far]).join(' '), /не с целью: E1/);
});

test('Стол: режим «Фазы» только с правилами; 40K передаёт правила, M/Ld и ближний бой', () => {
  const board = readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/testarmy/Board.tsx'), 'utf8');
  for (const token of ['<PhaseBar', '<ActionPanel', '<MovePanel', '<ChargePanel', 'clampShift(active', 'checkMove(active']) assert.ok(board.includes(token), token);
  const screen = readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/testarmy/TestArmyScreen.tsx'), 'utf8');
  for (const token of ['rules={rules40k}', 'melee={c.melee}', 'parseInches(', 'parseTarget(']) assert.ok(screen.includes(token), token);
});
