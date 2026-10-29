// Test Army, этап 4: линейка (точки и края баз), ближайшая цель и дальность 3″, расстояние до зоны. Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtInches, nearestObjective, objectiveRadius, resolveRuler, snapEnd, unitToZone, closestPoints, type Placed } from '../../../client/src/features/roster/testarmy';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const c = (x: number, y: number, r = 0.5): Placed => ({ x, y, rx: r, ry: r, angle: 0 });

test('линейка: точка–точка, точка–база (до края), база–база (между краями)', () => {
  const bases: Record<string, Placed> = { a: c(0, 0), b: c(10, 0) };
  const of = (id: string) => bases[id] ?? null;
  near(resolveRuler({ kind: 'pt', at: [0, 0] }, { kind: 'pt', at: [3, 4] }, of)!.d, 5);
  near(resolveRuler({ kind: 'pt', at: [5, 0] }, { kind: 'base', modelId: 'b' }, of)!.d, 4.5);
  const bb = resolveRuler({ kind: 'base', modelId: 'a' }, { kind: 'base', modelId: 'b' }, of)!;
  near(bb.d, 9);
  near(bb.from[0], 0.5);
  near(bb.to[0], 9.5);
  assert.equal(resolveRuler({ kind: 'base', modelId: 'x' }, { kind: 'pt', at: [0, 0] }, of), null);
});

test('snapEnd: база рядом — к базе; иначе к цели/углу террейна в пределах допуска', () => {
  const bases = [{ modelId: 'm1', base: c(5, 5) }];
  assert.deepEqual(snapEnd([5.7, 5], bases, []), { kind: 'base', modelId: 'm1' });
  assert.deepEqual(snapEnd([20.2, 10], bases, [[20, 10]]), { kind: 'pt', at: [20, 10] });
  assert.deepEqual(snapEnd([30, 30], bases, [[20, 10]]), { kind: 'pt', at: [30, 30] });
});

test('ближайшая цель: от края базы до края маркера 40 мм, в пределах 3″ или нет', () => {
  const objs = [
    { x: 10, y: 0, role: 'center' },
    { x: 30, y: 0, role: 'home' },
  ];
  const r = nearestObjective([c(0, 0), c(5, 0)], objs)!;
  assert.equal(r.index, 0);
  near(r.d, 5 - 0.5 - objectiveRadius);
  assert.equal(r.inRange, false);
  assert.equal(nearestObjective([c(7, 0)], objs)!.inRange, true);
  assert.equal(nearestObjective([], objs), null);
});

test('до зоны: 0 внутри, иначе до ближайшей точки края; формат дюймов', () => {
  const zone: [number, number][] = [
    [0, 0],
    [12, 0],
    [12, 44],
    [0, 44],
  ];
  near(unitToZone([c(20, 10), c(15, 10)], zone)!.d, 2.5);
  assert.equal(unitToZone([c(6, 10)], zone)!.d, 0);
  assert.equal(fmtInches(12.44), '12,4″');
  assert.equal(fmtInches(3), '3,0″');
  const [p, q] = closestPoints({ x: 0, y: 0, rx: 2, ry: 1, angle: 0 }, c(6, 0));
  near(p[0], 2, 0.02);
  near(q[0], 5.5, 0.02);
});

test('до ближайшего врага: от края до края, какой отряд', async () => {
  const { nearestEnemy } = await import('../../../client/src/features/roster/testarmy');
  const r = nearestEnemy([c(0, 0), c(2, 0)], [{ uid: 'e1', base: c(10, 0) }, { uid: 'e2', base: c(6, 0) }])!;
  assert.equal(r.uid, 'e2');
  near(r.d, 3);
  assert.equal(nearestEnemy([c(0, 0)], []), null);
});
