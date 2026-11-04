import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../../../backend/roster-data/warcry/game.json', import.meta.url), 'utf8'));
const allPoints = data.deployments.flatMap((d) => d.points);
const inside = (x: number, y: number) => x >= 0 && x <= 30 && y >= 0 && y <= 22;

test('24 deployment maps: all 144 points have both safe and original coordinates', () => {
  assert.equal(data.deployments.length, 24);
  assert.equal(allPoints.length, 144);
  assert.deepEqual(data.mapImportV2.problems, []);
  for (const p of allPoints) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'safe position must be finite');
    assert.ok(Number.isFinite(p.sourceX) && Number.isFinite(p.sourceY), 'original position must be finite');
    assert.ok(inside(p.x, p.y), `safe point was not clamped correctly: ${p.x},${p.y}`);
    if (p.offboard) assert.ok(!inside(p.sourceX, p.sourceY), `off-board source was lost: ${p.sourceX},${p.sourceY}`);
    else assert.ok(inside(p.sourceX, p.sourceY), `on-board point was moved off board: ${p.sourceX},${p.sourceY}`);
    assert.ok(p.reserve === null || p.reserve === 2 || p.reserve === 3, `invalid reserve ${p.reserve}`);
  }
});

test('source-verified reserve corrections and raw off-board reserves are preserved', () => {
  const standOff = data.deployments.find((d) => d.id === 'stand-off');
  const redShield = standOff.points.find((p) => p.side === 'red' && p.group === 'shield');
  assert.equal(redShield.reserve, 2);
  const unseen = data.deployments.find((d) => d.id === 'the-unseen-blade');
  const blueDagger = unseen.points.find((p) => p.side === 'blue' && p.group === 'dagger');
  assert.equal(blueDagger.reserve, 2);
  const first = data.deployments.find((d) => d.id === 'first-blood');
  assert.equal(first.points.find((p) => p.side === 'red' && p.group === 'shield').sourceX, -2.845);
  assert.equal(first.points.find((p) => p.side === 'blue' && p.group === 'shield').sourceX, 32.73);
  assert.equal(first.points.find((p) => p.side === 'blue' && p.group === 'hammer').sourceY, 22.088);
  assert.equal(first.points.find((p) => p.side === 'red' && p.group === 'hammer').sourceY, -0.088);
});

test('orientation marks and centre-line guides are valid for all deployments', () => {
  for (const d of data.deployments) {
    assert.equal(d.orientation.kind, 'double-arrow');
    assert.ok(d.orientation.at[0] < 0 && d.orientation.at[1] < 0, `${d.id}: orientation must be in the upper-left outside the board`);
    for (const g of d.guides) {
      assert.ok([4, 6, 8, 9].includes(g.d), `${d.id}: invalid guide distance ${g.d}`);
      assert.ok(['red', 'blue'].includes(g.side), `${d.id}: invalid guide side`);
      assert.ok(['dagger', 'shield', 'hammer'].includes(g.group), `${d.id}: invalid guide group`);
      for (const p of [g.from, g.to, g.at]) assert.ok(p.length === 2 && p.every(Number.isFinite), `${d.id}: invalid guide point`);
    }
  }
  const first = data.deployments.find((d) => d.id === 'first-blood');
  assert.equal(first.guides.length, 2);
  assert.ok(first.guides.every((g) => g.d === 9 && g.group === 'dagger'), 'First Blood must have 9-inch dagger guides');
});
