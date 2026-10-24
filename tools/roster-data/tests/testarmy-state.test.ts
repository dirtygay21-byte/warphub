// Test Army, этап 2: отряды из ростера (персонажи — вместе с отрядом), выставление построением, сдвиг, уборка. Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { buildUnits, modelBase, moveUnit, placeUnit, placedBases, removeUnit, unitCenter, baseToBase } from '../../../client/src/features/roster/testarmy';

const faction = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/f/GK.json'), 'utf8'));
const L = makeLookup(faction);
const ds = (name: string) => faction.datasheets.find((d: { name: string }) => d.name === name)!;

function roster() {
  const terms = ds('Paladin Squad') ?? faction.datasheets.find((d: { stats: unknown[]; character: boolean }) => !d.character);
  const hero = faction.datasheets.find((d: { character: boolean; leads: string[] }) => d.character && d.leads.length);
  const units = [
    { uid: 'u1', datasheetId: terms.id, size: terms.costs[0].options.at(-1).label, addons: {}, wargear: {}, enhancementId: null, attachedTo: null },
    { uid: 'u2', datasheetId: hero.id, size: hero.costs[0].options[0].label, addons: {}, wargear: {}, enhancementId: null, attachedTo: 'u1' },
  ];
  return { id: 'r', name: 'Тест', factionId: 'GK', battleSize: 'strike', detachmentIds: [], forceDisposition: null, chapter: null, units, warlordUid: null, showLegends: false, dataVersion: null } as never;
}

test('buildUnits: присоединённый персонаж — в отряде, модели с базами из данных', () => {
  const units = buildUnits(computeRoster(roster(), L));
  assert.equal(units.length, 1);
  const u = units[0]!;
  assert.equal(u.leaders.length, 1);
  assert.ok(u.models.length >= 2);
  assert.ok(u.models.every((m) => modelBase(m).known), 'у этих моделей размер базы есть в данных');
  assert.equal(new Set(u.models.map((m) => m.id)).size, u.models.length);
});

test('placeUnit / moveUnit / removeUnit: центр в точке, базы не пересекаются, сдвиг и уборка', () => {
  const u0 = buildUnits(computeRoster(roster(), L))[0]!;
  for (const f of ['line', 'tight', 'arc'] as const) {
    const u = placeUnit(u0, [30, 22], f);
    const c = unitCenter(u)!;
    assert.ok(Math.abs(c[0] - 30) < 3 && Math.abs(c[1] - 22) < 3, f);
    const b = placedBases(u).filter((x) => !!x);
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) assert.ok(baseToBase(b[i]!, b[j]!) >= 0.49, `${f}: ${i}-${j}`);
  }
  const moved = moveUnit(placeUnit(u0, [30, 22]), 5, -2);
  const c = unitCenter(moved)!;
  assert.ok(Math.abs(c[0] - 35) < 3);
  const gone = removeUnit(moved);
  assert.equal(gone.placed, false);
  assert.equal(unitCenter(gone), null);
});

test('база без размера: 60 мм как стартовое значение, свой размер — из customMm', () => {
  const m = { id: 'x', profile: 'X', options: [], source: 'Use model', pick: 0, customMm: null, at: null };
  assert.deepEqual(modelBase(m), { shape: { kind: 'circle', d: 60 }, known: false });
  assert.deepEqual(modelBase({ ...m, customMm: 100 }), { shape: { kind: 'circle', d: 100 }, known: true });
});

test('rotateUnit: поворот вокруг центра, ручные сдвиги сохраняются; setProfileBase: свой размер и перестройка', async () => {
  const { rotateUnit, setProfileBase, moveModel, unitProfiles } = await import('../../../client/src/features/roster/testarmy');
  const u0 = placeUnit(buildUnits(computeRoster(roster(), L))[0]!, [30, 22], 'line');
  const c0 = unitCenter(u0)!;
  const r = rotateUnit(u0, Math.PI / 2);
  const c1 = unitCenter(r)!;
  assert.ok(Math.hypot(c0[0] - c1[0], c0[1] - c1[1]) < 1e-9);
  // модель на расстоянии d от центра остаётся на том же расстоянии
  const d = (u: typeof u0, i: number) => Math.hypot(u.models[i]!.at![0] - c0[0], u.models[i]!.at![1] - c0[1]);
  assert.ok(Math.abs(d(u0, 0) - d(r, 0)) < 1e-9);
  const nudged = moveModel(u0, u0.models[0]!.id, [10, 10]);
  assert.deepEqual(rotateUnit(nudged, 0).models[0]!.at, [10, 10]);
  const p = unitProfiles(u0)[0]!;
  const big = setProfileBase(u0, p.profile, { customMm: 100 });
  assert.equal(big.models.filter((m) => m.profile === p.profile).every((m) => m.customMm === 100), true);
  assert.ok(big.placed);
});

test('restoreUnits: позиции и настройки возвращаются по uid и id модели; новые отряды — не выставлены', async () => {
  const { restoreUnits, parseSave } = await import('../../../client/src/features/roster/testarmy');
  const fresh = buildUnits(computeRoster(roster(), L));
  const placed = [{ ...placeUnit(fresh[0]!, [20, 20], 'arc'), gap: 1 }];
  const back = restoreUnits(fresh, placed);
  assert.deepEqual(back[0]!.models.map((m) => m.at), placed[0]!.models.map((m) => m.at));
  assert.equal(back[0]!.formation, 'arc');
  assert.equal(back[0]!.placed, true);
  assert.equal(restoreUnits(fresh, [])[0]!.placed, false);
  assert.equal(parseSave('{битое'), null);
  assert.equal(parseSave(JSON.stringify({ v: 1, rosterId: 'r', layoutId: 'l', side: 'attacker', savedAt: '', units: [] }))!.layoutId, 'l');
});
