// Test Army для Age of Sigmar (S4, 30.10.2026): базы из Battle Profile, отряды из ростера AoS, территории карт. Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { aosModelSpecs, baseToZone, buildAosUnits, rectsUnionPolys, insidePoly, type Pt } from '../../../client/src/features/roster/testarmy';
import { makeAosLookup } from '../../../client/src/features/roster/aos/engine';
import { newAosRoster } from '../../../client/src/features/roster/aos/roster';

const AOS = join(import.meta.dirname, '../../../backend/roster-data/aos');
const load = (id: string) => JSON.parse(readFileSync(join(AOS, 'f', id + '.json'), 'utf8'));
const bp = JSON.parse(readFileSync(join(AOS, 'battlepack.json'), 'utf8'));

test('базы AoS: простая строка, овал, «Use model», составной юнит по порядку, «OR:» отброшено', () => {
  assert.deepEqual(aosModelSpecs('40mm', 3, 'Liberators').map((m) => m.base.options), Array(3).fill([{ kind: 'circle', d: 40 }]));
  assert.deepEqual(aosModelSpecs('90 × 52mm', 1, 'X')[0]!.base.options, [{ kind: 'oval', w: 90, h: 52 }]);
  assert.deepEqual(aosModelSpecs('Use model', 1, 'X')[0]!.base.options, []);
  const kb = aosModelSpecs('Beastnob: 40mm, 6 x Monsta-killaz: 32mm, Klutcha-grot: 28.5mm', 8, 'Monsta-killaz').map((m) => (m.base.options[0] as { d: number }).d);
  assert.deepEqual(kb, [40, 32, 32, 32, 32, 32, 32, 28.5]);
  const krew = aosModelSpecs('Mannok da Kunnin’ and Torka Tuffskul: 40mm, Gikkit, Shank and Krookgrin: 25mm', 5, 'Da Kunnin’ Krew').map((m) => (m.base.options[0] as { d: number }).d);
  assert.deepEqual(krew, [40, 40, 25, 25, 25]);
  const zombies = aosModelSpecs('Zombies: 25mm', 10, 'Deadwalker Zombies');
  assert.equal(zombies.length, 10);
  assert.ok(zombies.every((m) => (m.base.options[0] as { d: number }).d === 25));
  const tw = aosModelSpecs('1x Swarmsage: 40mm, 2x Twistroot Warden, 1x Twistroot Revenant: 32mm, 3x Twistroot Dryads: 28.5mm, 0-1 Twistroot Revenant: 32mm, OR: , 0-1 Twistroot Spite-Revenant: 40mm', 7, 'The Twistweald');
  assert.deepEqual(tw.map((m) => (m.base.options[0] as { d: number }).d), [40, 32, 32, 32, 28.5, 28.5, 28.5]);
});

test('базы AoS во всех данных: у каждой модели либо размер из строки, либо «размера нет» (строка пустая или без мм)', () => {
  for (const f of readdirSync(join(AOS, 'f'))) {
    const d = JSON.parse(readFileSync(join(AOS, 'f', f), 'utf8'));
    for (const w of [...d.warscrolls, ...d.rorUnits]) {
      const specs = aosModelSpecs(w.bases, w.unitSize, w.name);
      assert.equal(specs.length, w.unitSize, w.name);
      if (/\d\s*mm/i.test(w.bases)) assert.ok(specs.every((m) => m.base.options.length > 0), `${d.id} ${w.name}: ${w.bases}`);
    }
  }
});

test('отряды из ростера AoS: каждый юнит — отряд, усиленный — вдвое больше моделей, очки как в ростере', () => {
  const data = load('SE');
  const L = makeAosLookup(data);
  const lib = data.warscrolls.find((w: { name: string }) => w.name === 'Liberators');
  const hero = data.warscrolls.find((w: { name: string; hero: boolean; kind: string }) => w.hero && w.kind === 'unit' && w.cost);
  const r = newAosRoster('SE');
  r.regiments = [{ uid: 'g1', leader: { uid: 'h1', warscrollId: hero.id, reinforced: false, enhancements: {} }, units: [{ uid: 'u1', warscrollId: lib.id, reinforced: true, enhancements: {} }] }];
  const units = buildAosUnits(r, L, 'foe:');
  assert.equal(units.length, 2);
  assert.equal(units[0]!.uid, 'foe:h1');
  assert.equal(units[1]!.models.length, lib.unitSize * 2);
  assert.equal(units[1]!.points, lib.cost * 2);
  assert.deepEqual(units[1]!.tags, ['усилен']);
  assert.ok(units[1]!.models.every((m) => m.options.length === 1 && m.id.startsWith('foe:u1.')));
});

test('территории карт: контуры объединения прямоугольников (раздельные части — отдельно), база в территории целиком', () => {
  assert.deepEqual(rectsUnionPolys([[0, 0, 15, 33], [15, 11, 15, 22]]), [[[0, 0], [15, 0], [15, 11], [30, 11], [30, 33], [0, 33]]]);
  for (const p of bp.battleplans)
    for (const side of ['A', 'B']) {
      const polys = rectsUnionPolys(p.map.territories[side]) as Pt[][];
      assert.ok(polys.length >= 1 && polys.every((x) => x.length >= 4), `${p.name} ${side}`);
      for (const [x, y, w, h] of p.map.territories[side]) assert.ok(polys.some((poly) => insidePoly([x + w / 2, y + h / 2], poly)), `${p.name} ${side}`);
    }
  // «What's Yours Is Ours»: территория A — две несвязанные части
  assert.equal(rectsUnionPolys(bp.battleplans[4].map.territories.A).length, 2);
  const [a] = rectsUnionPolys(bp.battleplans[0].map.territories.A) as Pt[][];
  // база 32 мм у стыка двух прямоугольников территории A (x = 15, y = 20) — целиком внутри
  assert.equal(baseToZone({ x: 15, y: 20, rx: 0.63, ry: 0.63, angle: 0 }, a!).whollyInside, true);
  assert.equal(baseToZone({ x: 15, y: 5, rx: 0.63, ry: 0.63, angle: 0 }, a!).whollyInside, false);
});
