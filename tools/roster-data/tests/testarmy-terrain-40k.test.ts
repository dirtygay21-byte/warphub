// Test Army, этап 2 «террейн 40K» (27.11.2026): видимость (13.10, 13.11), укрытие (13.08), скрытность (13.09),
// Lone Operative (24.24), [INDIRECT FIRE] по невидимой цели (10.07).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Datasheet } from '../../../client/src/features/roster/engine/types';
import { shootProfile, sightBetween, targetSight, terrainOf, weaponRule, type Placed, type TerrainMap } from '../../../client/src/features/roster/testarmy';

const DATA = join(import.meta.dirname, '../../../backend/roster-data');
const r32 = 32 / 2 / 25.4;
const m = (x: number, y: number): Placed => ({ x, y, rx: r32, ry: r32, angle: 0 });
const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// область 4×4″ в центре; внутри — надёжная руина со стеной по линии x = 22
const t: TerrainMap = { areas: [square(20, 18, 24, 22)], features: [{ dense: true, walls: [[[22, 18], [22, 22]]] }] };

test('13.10: загораживающая область между моделями — не видят; модель внутри области — видят', () => {
  assert.equal(sightBetween(m(10, 20), m(34, 20), t).visible, false, 'область целиком между ними');
  assert.equal(sightBetween(m(10, 20), m(34, 30), t).visible, true, 'линии в обход области');
  // атакующий внутри области: эта область не загораживает, но стена (Solid, 13.11) — загораживает
  assert.equal(sightBetween(m(21, 20), m(34, 20), t).visible, false);
  assert.equal(sightBetween(m(23, 20), m(34, 20), t).visible, true, 'по эту сторону стены');
});

test('13.08: укрытие — INFANTRY в области или видна не полностью; полностью видимая — без укрытия', () => {
  const inside = targetSight([m(34, 20)], [m(23, 20)], t, { ibs: true, hiddenOk: false, loneOperative: null });
  assert.ok(inside.visible && inside.cover);
  const vehicle = targetSight([m(34, 20)], [m(23, 20)], t, { ibs: false, hiddenOk: false, loneOperative: null });
  assert.ok(vehicle.visible);
  const open = targetSight([m(10, 40)], [m(14, 40)], t, { ibs: true, hiddenOk: true, loneOperative: null });
  assert.ok(open.visible && !open.cover, 'чистое поле');
  // частично закрыта лёгким элементом — видна, но не полностью
  const light: TerrainMap = { areas: [], features: [{ dense: false, walls: [[[20, 19.9], [20, 30]]] }] };
  const partial = targetSight([m(10, 20)], [m(30, 20)], light, { ibs: false, hiddenOk: false, loneOperative: null });
  assert.ok(partial.visible && partial.cover);
});

test('13.09: скрытая пехота в укрытии видна только в 15″; стрелявшая — не скрыта', () => {
  const far = targetSight([m(23 + 16.5, 20)], [m(23, 20)], t, { ibs: true, hiddenOk: true, loneOperative: null });
  assert.equal(far.visible, false);
  assert.match(far.notes.join(), /15″/);
  assert.equal(targetSight([m(23 + 14, 20)], [m(23, 20)], t, { ibs: true, hiddenOk: true, loneOperative: null }).visible, true);
  assert.equal(targetSight([m(23 + 16.5, 20)], [m(23, 20)], t, { ibs: true, hiddenOk: false, loneOperative: null }).visible, true, 'стреляла — не скрыта');
});

test('24.24 Lone Operative: виден только в 12″; [INDIRECT FIRE] по невидимой — можно, по Lone Operative — нет', () => {
  const lone = targetSight([m(10, 40)], [m(10 + 14, 40)], t, { ibs: true, hiddenOk: false, loneOperative: 12 });
  assert.ok(!lone.visible && lone.lone);
  assert.ok(targetSight([m(10, 40)], [m(10 + 10, 40)], t, { ibs: true, hiddenOk: false, loneOperative: 12 }).visible);
  const base = { mode: 'normal' as const, attackerMV: false, engagedWithAttacker: false, engagedMV: false, notVisible: true };
  assert.equal(weaponRule({ keywords: 'heavy', melee: false }, base).allowed, false);
  assert.equal(weaponRule({ keywords: 'indirect fire, blast', melee: false }, base).allowed, true);
});

test('данные: Lone Operative, INFANTRY, INDIRECT FIRE из инфолистов; террейн настоящей карты', () => {
  const sheet = (f: string, n: string): Datasheet => JSON.parse(readFileSync(join(DATA, 'f', `${f}.json`), 'utf8')).datasheets.find((d: Datasheet) => d.name === n);
  const ev = shootProfile([{ ds: sheet('AoI', 'Eversor Assassin'), leader: false }], []);
  assert.equal(ev.loneOperative, 12);
  assert.equal(ev.ibs, true);
  assert.equal(shootProfile([{ ds: sheet('AoI', 'Eversor Assassin'), leader: false }, { ds: sheet('AoI', 'Eversor Assassin'), leader: true }], []).loneOperative, null, 'объединённый отряд — без Lone Operative');
  assert.equal(shootProfile([{ ds: sheet('AoI', 'Eversor Assassin'), leader: false }], ['indirect fire, blast']).indirect, true);
  const bf = JSON.parse(readFileSync(join(DATA, 'battlefield.json'), 'utf8'));
  const map = terrainOf(bf.layouts[0].pieces);
  assert.ok(map.areas.length >= bf.layouts[0].pieces.filter((p: { kind: string }) => p.kind === 'area').length);
  assert.ok(map.features.length > 0 && map.features.every((f) => f.walls.length > 0));
  // десять на десять моделей через весь стол — быстро
  const a = Array.from({ length: 10 }, (_, i) => m(5 + i, 5));
  const b = Array.from({ length: 10 }, (_, i) => m(40 + i, 40));
  const t0 = performance.now();
  targetSight(a, b, map, { ibs: true, hiddenOk: false, loneOperative: null });
  assert.ok(performance.now() - t0 < 1500, `${Math.round(performance.now() - t0)} мс`);
});

test('стол и лист атаки: террейн карты передаётся, невидимую цель нельзя выбрать, укрытие включается', () => {
  const ui = (p: string) => readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/testarmy', p), 'utf8');
  assert.ok(ui('TestArmyScreen.tsx').includes('terrain: terrainOf(layout.pieces)'));
  const board = ui('Board.tsx');
  for (const x of ['targetSight(unitsOf(from.uid)', "title: 'Цель не видна'", 'shotPrev', 'turn.shotPrev?.includes(unit.uid)']) assert.ok(board.includes(x), x);
  assert.ok(ui('CombatSheet.tsx').includes('shot?.cover'));
});
