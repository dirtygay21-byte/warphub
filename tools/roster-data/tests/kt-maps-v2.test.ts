import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../../../backend/roster-data/kt/game.json', import.meta.url), 'utf8'));
const area = (poly: [number, number][]) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const totalArea = (polys: [number, number][][]) => polys.reduce((s, p) => s + area(p), 0);
const expected = {
  'Non-Specific Killzone Maps': [],
  Volkus: 'ABCDEFGHIJKLMN'.split(''),
  Gallowdark: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3'], // A4 is on every Gallowdark card (pass 3)
  'Tomb World': ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'C5', 'T'],
  Octarius: 'ABCDEFGHI'.split(''),
  'Bheta-Decima': ['A', 'B', 'C', 'D'],
};
const expectedByMap = { 'octarius-4': 'ABCDEFGH'.split('') };

test('36 maps: territory, actual nested drop zones and source labels are complete', () => {
  assert.equal(data.maps.length, 36);
  assert.deepEqual(data.mapImportV2.problems, []);
  for (const m of data.maps) {
    assert.deepEqual(m.zones, m.dropZones, `${m.id}: legacy zones must equal dropZones`);
    assert.ok(m.territories.p1.length && m.territories.p2.length, `${m.id}: territory missing`);
    assert.ok(m.dropZones.p1.length && m.dropZones.p2.length, `${m.id}: drop zone missing`);
    assert.ok(totalArea(m.dropZones.p1) < totalArea(m.territories.p1), `${m.id}: p1 drop zone is whole territory`);
    assert.ok(totalArea(m.dropZones.p2) < totalArea(m.territories.p2), `${m.id}: p2 drop zone is whole territory`);
    const wanted = expectedByMap[m.id] ?? expected[m.killzone];
    // pass 3 (kt-map-fix.py): one feature per label box on the card, so a letter can repeat; Octarius 1 has no F on the card
    for (const f of m.features) assert.ok(wanted.includes(f.label), `${m.id}: unexpected label ${f.label}`);
  }
});

test('drop-zone guides exist for all maps, use source distances and valid coordinates', () => {
  for (const m of data.maps) {
    assert.ok(m.guides.length >= 2, `${m.id}: expected guides for both drop zones`);
    for (const g of m.guides) {
      assert.ok(['left', 'right', 'top', 'bottom'].includes(g.edge), `${m.id}: guide edge`);
      assert.ok(['p1', 'p2'].includes(g.side), `${m.id}: guide side`);
      assert.ok(g.d > 0 && g.d < 30, `${m.id}: guide distance ${g.d}`);
      assert.ok(g.at[0] >= 0 && g.at[0] <= 30 && g.at[1] >= 0 && g.at[1] <= 22, `${m.id}: guide point ${g.at}`);
    }
  }
});

test('features, walls and doors are finite in-board geometry, not null or NaN', () => {
  for (const m of data.maps) {
    for (const f of m.features) {
      assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), `${m.id}: feature position`);
      assert.ok(f.x >= 0 && f.x <= 30 && f.y >= 0 && f.y <= 22, `${m.id}: feature ${f.label} outside board`);
    }
    for (const [kind, lines] of [['wall', m.walls], ['door', m.doors]]) {
      for (const line of lines) {
        assert.ok(Array.isArray(line) && line.length >= 2, `${m.id}: ${kind} must have endpoints`);
        for (const p of line) {
          assert.ok(p.length === 2 && p.every(Number.isFinite), `${m.id}: invalid ${kind} point`);
          assert.ok(p[0] >= 0 && p[0] <= 30 && p[1] >= 0 && p[1] <= 22, `${m.id}: ${kind} outside board ${p}`);
        }
      }
    }
  }
});

test('legacy objective markers and terrain polygons are preserved', () => {
  for (const m of data.maps) {
    assert.equal(m.objectives.length, 3, `${m.id}: objective count`);
    assert.deepEqual(m.objectives.map((o) => o.id).sort(), ['centre', 'enemy', 'home'], `${m.id}: objective roles`);
    assert.ok(Array.isArray(m.terrain), `${m.id}: legacy terrain is not array`);
  }
});
