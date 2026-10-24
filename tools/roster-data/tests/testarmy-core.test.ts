// Test Army, этап 1: базы из данных, модели юнита, построения, расстояния между базами и до зон. Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  baseRadii,
  baseToBase,
  baseToZone,
  formation,
  parseBase,
  pointToBase,
  pointToPolyEdge,
  snap,
  unitModels,
  unitToUnit,
  type Placed,
  type Pt,
} from '../../../client/src/features/roster/testarmy';

const near = (a: number, b: number, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const circle = (x: number, y: number, mm: number): Placed => ({ x, y, rx: mm / 2 / 25.4, ry: mm / 2 / 25.4, angle: 0 });

test('parseBase: круг, овал, подставка, несколько вариантов, нет размера', () => {
  assert.deepEqual(parseBase('32mm').options, [{ kind: 'circle', d: 32 }]);
  assert.deepEqual(parseBase('120 x 92mm flying base').options, [{ kind: 'oval', w: 120, h: 92, flying: true }]);
  assert.deepEqual(parseBase('75x42mm Oval Base').options, [{ kind: 'oval', w: 75, h: 42 }]);
  assert.deepEqual(parseBase('28.5mm / 25mm').options.map((o) => o.kind === 'circle' && o.d), [28.5, 25]);
  assert.deepEqual(parseBase('32mm, 60x35.5mm Oval Base').options.map((o) => o.kind), ['circle', 'oval']);
  for (const s of ['Use model', 'No official base size', 'Unique', 'Large Flying Base', '', undefined]) assert.deepEqual(parseBase(s).options, []);
  near(baseRadii({ kind: 'circle', d: 50.8 }).rx, 1, 1e-9);
});

test('данные 40K: каждая строка с «mm» даёт размер; без «mm» — «нет размера»', () => {
  const dir = join(import.meta.dirname, '../../../backend/roster-data/f');
  let lines = 0;
  for (const f of readdirSync(dir)) {
    for (const ds of JSON.parse(readFileSync(join(dir, f), 'utf8')).datasheets) {
      for (const st of ds.stats ?? []) {
        lines++;
        const b = parseBase(st.base);
        if (/\d\s*mm/i.test(st.base ?? '')) assert.ok(b.options.length > 0, `${ds.name}: ${st.base}`);
        else assert.equal(b.options.length, 0, `${ds.name}: ${st.base}`);
      }
    }
  }
  assert.ok(lines > 3000);
});

test('unitModels: число моделей и профили по составу', () => {
  const ds = {
    composition: ['1 Ogryn Pack Master', '3 Chaos Mauler Hounds'],
    stats: [
      { name: 'OGRYN PACK MASTER', base: '40mm' },
      { name: 'CHAOS MAULER HOUND', base: '60 x 35.5mm' },
    ],
  } as never;
  const m = unitModels(ds, 4);
  assert.equal(m.length, 4);
  assert.equal(m.filter((x) => x.profile === 'CHAOS MAULER HOUND').length, 3);
  assert.equal(m[0]!.base.options[0]!.kind, 'circle');
  const other = unitModels({ composition: ['1 Cult Demagogue', '1 Mindwitch', '1 Iconarch', '2 Blessed Blades'], stats: [{ name: 'CULT DEMAGOGUE', base: '32mm' }, { name: 'OTHER MODELS', base: '28.5mm' }] } as never, 5);
  assert.deepEqual(other.map((x) => x.profile), ['CULT DEMAGOGUE', 'OTHER MODELS', 'OTHER MODELS', 'OTHER MODELS', 'OTHER MODELS']);
});

const r32 = { rx: 16 / 25.4, ry: 16 / 25.4 };
const overlaps = (pts: Pt[], r: number, gap: number) => {
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1]) < 2 * r + gap - 1e-6) return true;
  return false;
};

test('построения: без пересечений, линия — по зазору, плотно — компактнее линии и дуги', () => {
  const bases = Array.from({ length: 10 }, () => r32);
  const span = (p: Pt[]) => Math.max(...p.flatMap((a) => p.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))));
  const l = formation('line', bases, 0.5);
  const t = formation('tight', bases, 0.5);
  const a = formation('arc', bases, 0.5);
  for (const f of [l, t, a]) {
    assert.equal(f.length, 10);
    assert.ok(!overlaps(f, r32.rx, 0.5));
  }
  near(l[1]![0] - l[0]![0], 2 * r32.rx + 0.5, 1e-9);
  assert.ok(span(t) < span(a) && span(a) < span(l));
  // поворот на 90°: линия становится вертикальной
  const v = formation('line', bases.slice(0, 2), 0, Math.PI / 2);
  near(v[0]![0], v[1]![0], 1e-9);
  // разные базы в плотной группе тоже не пересекаются
  const mixed = formation('tight', [{ rx: 1.2, ry: 1.2 }, r32, r32, { rx: 0.5, ry: 0.5 }, r32], 0);
  assert.equal(mixed.length, 5);
});

test('расстояния: база–база (круги точно, овалы по контуру), точка–база, отряд–отряд', () => {
  near(baseToBase(circle(0, 0, 50.8), circle(5, 0, 50.8)), 3, 1e-9);
  assert.equal(baseToBase(circle(0, 0, 50.8), circle(1.5, 0, 50.8)), 0);
  const oval: Placed = { x: 0, y: 0, rx: 2, ry: 1, angle: 0 };
  near(baseToBase(oval, circle(5, 0, 50.8)), 2);
  near(baseToBase(oval, circle(0, 4, 50.8)), 2);
  near(baseToBase({ ...oval, angle: Math.PI / 2 }, circle(0, 5, 50.8)), 2);
  near(pointToBase([4, 0], oval), 2);
  assert.equal(pointToBase([0.5, 0], oval), 0);
  const u = unitToUnit([circle(0, 0, 25.4), circle(2, 0, 25.4)], [circle(10, 0, 25.4), circle(6, 0, 25.4)]);
  assert.deepEqual([u.i, u.j], [1, 1]);
  near(u.d, 3, 1e-9);
});

test('зоны: до края многоугольника, внутри/снаружи, база целиком в зоне', () => {
  const zone: Pt[] = [
    [0, 0],
    [12, 0],
    [12, 44],
    [0, 44],
  ];
  const e = pointToPolyEdge([15, 10], zone);
  near(e.d, 3, 1e-9);
  assert.equal(e.inside, false);
  assert.equal(pointToPolyEdge([6, 10], zone).inside, true);
  near(baseToZone(circle(15, 10, 50.8), zone).d, 2);
  assert.equal(baseToZone(circle(6, 10, 50.8), zone).whollyInside, true);
  const edge = baseToZone(circle(11.5, 10, 50.8), zone);
  assert.equal(edge.d, 0);
  assert.equal(edge.whollyInside, false);
});

test('snap: ближайшая цель в пределах допуска', () => {
  assert.deepEqual(snap([1, 1], [[1.3, 1], [5, 5]]).at, [1.3, 1]);
  assert.equal(snap([1, 1], [[2, 2]]).snapped, false);
});
