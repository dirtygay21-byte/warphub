import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { WARCRY_TERRAIN_CARDS, generateAlternativeTerrain, validateAlternativeTerrain, type WarcryTerrainFeature } from '../../../client/src/features/roster/skirmish/terrain';
import { parseSave } from '../../../client/src/features/roster/testarmy/state';

const readJson = (path: string) => JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));
const hash = (path: string) => createHash('sha256').update(readFileSync(new URL(`../../../${path}`, import.meta.url))).digest('hex');
const feature = (id: string, x: number, y: number): WarcryTerrainFeature => ({ id, type: 'ruin', x, y, w: 2, h: 2, angle: 0 });
const valid = [feature('a', 7, 7), feature('b', 10, 9), feature('c', 20, 7), feature('d', 23, 9), feature('e', 7, 15), feature('f', 10, 17), feature('g', 20, 15), feature('h', 23, 17)];

test('24 официальные terrain cards существуют и совпадают с проверенными SHA-256', () => {
  const expected = readJson('tools/roster-data/tests/official-terrain-hashes.json').files as Record<string, string>;
  assert.equal(WARCRY_TERRAIN_CARDS.length, 24);
  assert.equal(Object.keys(expected).length, 24);
  for (const card of WARCRY_TERRAIN_CARDS) {
    const name = `HoGTerrain${card.number}.png`;
    assert.equal(hash(`client/public/roster-maps/warcry-terrain/${name}`), expected[name], card.id);
  }
});

test('alternative rules: минимум два элемента в каждой четверти', () => {
  assert.deepEqual(validateAlternativeTerrain(valid), []);
  const issues = validateAlternativeTerrain(valid.slice(0, 4));
  assert.ok(issues.some((issue) => issue.includes('четверти')));
  assert.ok(issues.length > 0);
});

test('alternative rules: граница 4″ учитывает поворот контура', () => {
  assert.ok(validateAlternativeTerrain([feature('edge', 3.5, 7)]).some((issue) => issue.includes('4″')));
  const rotated = { ...feature('rotated', 7, 6.5), w: 6, h: 2, angle: 90 };
  assert.ok(validateAlternativeTerrain([rotated]).some((issue) => issue.includes('4″')));
  const same = { ...feature('same', 7, 6.5), w: 6, h: 2, angle: 0 };
  assert.ok(!validateAlternativeTerrain([same]).some((issue) => issue.includes('4″')));
  assert.ok(!validateAlternativeTerrain([feature('pixel-rounding', 23, 17.000000464)]).some((issue) => issue.includes('4″')));
});

test('декоративная сетка не перехватывает добавление terrain features', () => {
  const text = readFileSync(new URL('../../../client/src/features/roster/ui/skirmish/WarcryTerrainSetup.tsx', import.meta.url), 'utf8');
  const grid = text.split('function BoardGrid()')[1]?.split('function AlternativeEditor')[0] ?? '';
  assert.ok(grid.includes('<g pointerEvents="none">'));
});

test('генератор создаёт повторяемые по seed играбельные расстановки без наложений', () => {
  const first = generateAlternativeTerrain('seed-A');
  assert.deepEqual(first, generateAlternativeTerrain('seed-A'));
  assert.notDeepEqual(first, generateAlternativeTerrain('seed-B'));
  for (let i = 0; i < 100; i++) {
    const features = generateAlternativeTerrain(`seed-${i}`);
    assert.equal(features.length, 8);
    assert.deepEqual(validateAlternativeTerrain(features), [], `seed-${i}`);
    for (let a = 0; a < features.length; a++) {
      for (let b = a + 1; b < features.length; b++) {
        const one = features[a]!, two = features[b]!;
        const overlap = Math.abs(one.x - two.x) < (one.w + two.w) / 2 + 0.25 && Math.abs(one.y - two.y) < (one.h + two.h) / 2 + 0.25;
        assert.ok(!overlap, `seed-${i}: наложение ${one.id} и ${two.id}`);
      }
    }
  }
});

test('сохранение Test Army возвращает выбранный terrain setup', () => {
  const terrain = { mode: 'alternative' as const, cardId: 'hog-3', features: valid };
  const saved = parseSave(JSON.stringify({ v: 2, rosterId: 'wc-1', layoutId: 'battleplan:first-blood:red', side: 'attacker', savedAt: 'now', armies: [], terrain }));
  assert.deepEqual(saved?.terrain, terrain);
});
