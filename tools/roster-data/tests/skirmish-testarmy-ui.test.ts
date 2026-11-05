import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nearestObjective } from '../../../client/src/features/roster/testarmy/measure';
import { initialWarcryDeploymentPoints } from '../../../client/src/features/roster/skirmish/deployment';

const readJson = (path: string) => JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));
const source = (path: string) => readFileSync(new URL(`../../../client/src/features/roster/ui/${path}`, import.meta.url), 'utf8');

test('objective range учитывает правила системы: 3″ по умолчанию и 1″ для Kill Team', () => {
  const base = { x: 2, y: 0, rx: 0, ry: 0, angle: 0 };
  const objectives = [{ x: 0, y: 0, role: null }];
  assert.equal(nearestObjective([base], objectives)?.inRange, true);
  assert.equal(nearestObjective([base], objectives, 1)?.inRange, false);
  assert.equal(nearestObjective([base], objectives, 2)?.inRange, true);
  const board = source('testarmy/Board.tsx');
  assert.ok(board.includes('field.objectiveRange ?? OBJECTIVE_RANGE'));
  assert.ok(board.includes('field.objectives.length ? `Цели ${field.objectiveRange ?? OBJECTIVE_RANGE}″`'));
  assert.ok(board.includes("orientation === 'landscape'"));
});

test('поля skirmish используют landscape, а Warcry не создаёт objectives из deployment points', () => {
  const text = source('skirmish/SkirmishTestArmyScreen.tsx');
  assert.ok(text.includes('objectiveRange: 1'));
  assert.ok(text.includes("orientation: 'landscape'"));
  assert.ok(text.includes('objectives: []'));
  assert.ok(text.includes('snapPoints: initialPoints.map'));
});

test('все 24 расстановки Warcry исключают RND-резервы из начальных точек и зон', () => {
  const game = readJson('backend/roster-data/warcry/game.json');
  assert.equal(game.deployments.length, 24);
  for (const deployment of game.deployments) {
    const initial = initialWarcryDeploymentPoints(deployment);
    assert.ok(initial.length > 0, `${deployment.id}: нет начальных точек`);
    assert.ok(initial.every((point) => point.reserve === null), `${deployment.id}: резерв попал в начальную расстановку`);
    assert.equal(initial.length, deployment.points.filter((point) => point.reserve === null).length, deployment.id);
  }
});
