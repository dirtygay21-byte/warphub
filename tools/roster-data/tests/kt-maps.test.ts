import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KtGameData } from '../../../client/src/features/roster/skirmish/types';

// Kill Team Approved Ops 2025 maps (scripts/kt-map-fix.py) and the Wahapedia map key (kt/map-keys.json).
const data = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/kt/game.json'), 'utf8')) as KtGameData;
const inBoard = ([x, y]: [number, number]) => x >= 0 && x <= 30 && y >= 0 && y <= 22;

test('36 карт: рамка, drop zones — полосы у своего края, глубина как на карте', () => {
  assert.equal(data.maps.length, 36);
  for (const m of data.maps) {
    assert.ok(m.frame && m.frame.px[2] > m.frame.px[0] && m.frame.px[3] > m.frame.px[1], m.id);
    assert.deepEqual(new Set(Object.values(m.keyPlayer)), new Set(['p1', 'p2']), m.id);
    assert.equal(m.guides.length, 2, m.id);
    for (const g of m.guides) {
      const [zone] = m.dropZones[g.side];
      assert.equal(m.dropZones[g.side].length, 1, m.id);
      assert.ok(zone!.every(inBoard), `${m.id} ${g.side}`);
      const xs = zone!.map((p) => p[0]);
      const ys = zone!.map((p) => p[1]);
      const depth = g.edge === 'left' ? Math.max(...xs) : g.edge === 'right' ? 30 - Math.min(...xs) : g.edge === 'top' ? Math.max(...ys) : 22 - Math.min(...ys);
      assert.ok(Math.abs(depth - g.d) < 1e-6, `${m.id} ${g.side}: ${depth} vs ${g.d}`);
      if (m.frame.toScale) assert.ok([3, 4, 6].includes(g.d), `${m.id} ${g.side}: ${g.d}″ — на картах Approved Ops 3″, 4″ или 6″`);
      else assert.equal(g.toScale, false, m.id);
      assert.ok(g.d > 2 && g.d < 7, `${m.id} ${g.side}: ${g.d}`);
    }
    assert.deepEqual(m.zones, m.dropZones, m.id);
    assert.deepEqual(m.objectives.map((o) => o.id).sort(), ['centre', 'enemy', 'home'], m.id);
    for (const o of m.objectives) assert.ok(inBoard([o.x, o.y]), `${m.id} ${o.id}`);
  }
});

test('Буквы на картах есть в ключе своей killzone; на каждой карте Volkus — все 14', () => {
  for (const m of data.maps) {
    const zone = data.mapKey.killzones[m.killzone];
    assert.ok(zone, m.killzone);
    const known = new Set((zone.features ?? []).flatMap((f) => f.labels));
    for (const f of m.features) {
      assert.ok(known.has(f.label), `${m.id}: ${f.label}`);
      assert.ok(inBoard([f.x, f.y]), `${m.id}: ${f.label}`);
    }
    if (m.killzone === 'Non-Specific Killzone Maps') assert.equal(m.features.length, 0, m.id);
    else assert.ok(m.features.length >= 8, `${m.id}: ${m.features.length}`);
    if (m.killzone === 'Volkus') assert.deepEqual([...new Set(m.features.map((f) => f.label))].sort(), [...'ABCDEFGHIJKLMN']);
  }
});

test('Ключ карты: Universal Map Key, цвета, типы террейна', () => {
  const key = data.mapKey;
  assert.equal(key.universal.length, 12);
  assert.equal(key.lines.length, 2);
  const types = new Set(key.terrainTypes.map((t) => t.id));
  for (const t of ['Heavy', 'Light', 'Blocking', 'Vantage', 'Accessible', 'Insignificant', 'Exposed', 'Ceiling', 'Wall']) assert.ok(types.has(t), t);
  for (const [name, zone] of Object.entries(key.killzones)) {
    for (const f of zone.features ?? []) for (const t of f.types) assert.ok(types.has(t), `${name} ${f.id}: ${t}`);
    assert.ok(data.missionPack.killzones.includes(name), name);
  }
  for (const palette of Object.values(key.colours)) for (const u of key.universal) assert.match(palette[u.colour], /^#[0-9a-f]{6}$/, u.id);
  assert.match(key.source.checked, /^\d{4}-\d{2}-\d{2}$/);
});

test('Карта с ключом во всех местах игры Kill Team', () => {
  const screen = readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/kt/KtFullGameScreen.tsx'), 'utf8');
  assert.equal(screen.match(/<KtMapPanel map=\{\w+\} mapKey=\{data\.mapKey\} \/>/g)?.length, 3);
  const maps = readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/skirmish/KtMap.tsx'), 'utf8');
  for (const token of ['Разметка WarpHub', 'Universal Map Key', 'нет данных в ключе карты', 'Типы террейна', 'не в масштабе']) assert.ok(maps.includes(token), token);
});
