// «Поле боя»: стороны атакующего и защитника на картах деплоя (P2-T0b). Запуск: npm test
// Эталон — официальные карты деплоя Mission Deck 2026-27, сверено с game-datamissions.com
// (tools/roster-data/battlefield-review.json). В системе координат 40kdc (x вдоль 60″, y вдоль 44″)
// атакующий: Hammer and Anvil / Tipping Point / Crucible of Battle / Search and Destroy — край x = 60,
// Dawn of War / Sweeping Engagement — край y = 0 (в 40kdc-data 1.4.5 было перепутано, правится импортом).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const bf = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'roster-data', 'battlefield.json'), 'utf8'));
type Pt = [number, number];
type Region = { player: string; poly: Pt[] };
const dep = (id: string) => bf.deployments.find((d: { id: string }) => d.id === id) as { zones: Region[]; territories: Region[] };
const zone = (id: string, player: string) => dep(id).zones.find((z) => z.player === player)!.poly;
const touches = (poly: Pt[], axis: 0 | 1, v: number) => poly.filter((p) => Math.abs(p[axis] - v) < 0.01).length >= 2;

test('у каждой карты деплоя одна зона и одна территория каждой стороны', () => {
  for (const d of bf.deployments) {
    for (const k of ['zones', 'territories'] as const)
      assert.deepEqual(d[k].map((z: Region) => z.player).sort(), ['attacker', 'defender'], `${d.id} ${k}`);
  }
});

test('атакующий — у того края, что на официальной карте деплоя', () => {
  for (const id of ['hammer-and-anvil', 'tipping-point', 'crucible-of-battle', 'search-and-destroy'])
    assert.ok(touches(zone(id, 'attacker'), 0, 60) && !touches(zone(id, 'attacker'), 0, 0), id);
  for (const id of ['dawn-of-war', 'sweeping-engagement']) {
    assert.ok(touches(zone(id, 'attacker'), 1, 0), `${id}: атакующий у края y = 0`);
    assert.ok(touches(zone(id, 'defender'), 1, 44), `${id}: защитник у края y = 44`);
  }
});

test('Sweeping Engagement: зона атакующего 14″ на половине x > 30 и 8″ на другой (как на карте)', () => {
  const a = zone('sweeping-engagement', 'attacker');
  const depth = (x: number) => Math.max(...a.filter((p) => Math.abs(p[0] - x) < 0.01).map((p) => p[1]));
  assert.equal(depth(60), 14);
  assert.equal(depth(0), 8);
});

test('территория атакующего содержит его зону деплоя', () => {
  for (const d of bf.deployments) {
    const t = d.territories.find((z: Region) => z.player === 'attacker')!.poly as Pt[];
    const z = d.zones.find((r: Region) => r.player === 'attacker')!.poly as Pt[];
    const inside = (p: Pt) => {
      let c = false;
      for (let i = 0, j = t.length - 1; i < t.length; j = i++) {
        const [xi, yi] = t[i]!, [xj, yj] = t[j]!;
        if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const cx = z.reduce((s, p) => s + p[0], 0) / z.length, cy = z.reduce((s, p) => s + p[1], 0) / z.length;
    assert.ok(inside([cx, cy]), d.id);
  }
});
