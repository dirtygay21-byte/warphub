// P1-T3: обновление значений whrules-995-points (scripts/whrules-points.mjs) — цены, ступени, DP, улучшения, снаряжение.
// Сохранённые ростеры не теряют выбор: подписи размеров и названия снаряжения прежние. Запуск: bun test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { addUnit, newRoster } from '../../../client/src/features/roster/engine/roster';
import type { DataIndex, FactionData } from '../../../client/src/features/roster/engine/types';
// @ts-expect-error — .mjs без типов
import { BEFORE_POINTS, data40kAt } from '../scripts/baseline-40k.mjs';
// @ts-expect-error — .mjs без типов
import { loadSnapshot } from '../scripts/updates-40k.mjs';
// @ts-expect-error — .mjs без типов
import { placeWargear, planPoints, rebuildCosts, siteWargear } from '../scripts/whrules-points.mjs';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const NAMES = fs.readdirSync(path.join(DATA, 'f')).filter((f) => f.endsWith('.json')).sort();
const NOW: Record<string, FactionData> = Object.fromEntries(NAMES.map((f) => [f, readJson(path.join(DATA, 'f', f))]));
const SNAP = loadSnapshot('whrules-995.json');
const curated = readJson(path.join(import.meta.dirname, '..', '40k', 'curated.json'));
const U = curated.updates.items.find((u: { id: string }) => u.id === 'whrules-995-points');
const BEFORE = data40kAt(BEFORE_POINTS.rev);
const TB = BEFORE ? test : test.skip;

type Band = { from: number; to: number | null; options: { label: string; models?: number; cost: number }[]; addons: { label: string; cost: number }[]; wargear: { label: string; cost: number; unverified?: boolean }[] };
const ds = (f: string, name: string, group = 'own') => NOW[f].datasheets.find((d) => d.name === name && d.group === group)!;

// ---------- функции обновления ----------

test('rebuildCosts: наши подписи размеров и добавки, цены и ступени сайта; снаряжение — только в последней ступени', () => {
  const ours: Band[] = [{ from: 1, to: null, options: [{ label: '5 models', models: 5, cost: 90 }, { label: '1 Sword Brother, 4 Neophytes', cost: 100 }], addons: [{ label: '1 Platform', cost: 20 }], wargear: [] }];
  const site = [
    { models: 5, points: 85, note: '1st-2nd' },
    { points: 95, note: '1 Sword Brother, 4 Neophytes (1st-2nd)' },
    { models: 5, points: 95, note: '3rd+' },
    { points: 105, note: '1 Sword Brother, 4 Neophytes (3rd+)' },
    { points: 20 },
  ];
  const r = rebuildCosts(ours, site, [{ label: 'Storm Shield', cost: 5 }]);
  assert.deepEqual(r, [
    { from: 1, to: 2, options: [{ label: '5 models', models: 5, cost: 85 }, { label: '1 Sword Brother, 4 Neophytes', cost: 95 }], addons: [{ label: '1 Platform', cost: 20 }], wargear: [] },
    { from: 3, to: null, options: [{ label: '5 models', models: 5, cost: 95 }, { label: '1 Sword Brother, 4 Neophytes', cost: 105 }], addons: [{ label: '1 Platform', cost: 20 }], wargear: [{ label: 'Storm Shield', cost: 5 }] },
  ]);
  // другой размер отряда — не цена, а смена состава: обновление отказывается
  assert.throws(() => rebuildCosts(ours, [{ models: 3, points: 60 }], []), /смена состава/);
  assert.deepEqual(placeWargear([{ wargear: [] }], [{ label: 'X', cost: 5 }]), [{ wargear: [{ label: 'X', cost: 5 }] }]);
});

test('siteWargear: название предмета наше, если он тот же (ручной счётчик в ростере хранится по названию)', () => {
  const ours: Band[] = [{ from: 1, to: null, options: [], addons: [], wargear: [{ label: 'Heavy laser destroyer', cost: 10, unverified: true }] }];
  assert.deepEqual(siteWargear(ours, [{ name: 'Heavy Laser Destroyer', points: 10 }, { name: 'Multi-melta', points: 5 }]), [
    { label: 'Heavy laser destroyer', cost: 10 },
    { label: 'Multi-melta', cost: 5 },
  ]);
});

// ---------- применённое обновление ----------

test('обновление применено целиком: план по текущим данным пуст, кроме пропусков Custodes (кодекс)', () => {
  const plan = planPoints(structuredClone(NOW), SNAP, U);
  assert.deepEqual([plan.units.length, plan.detachments.length, plan.enhancements.length], [0, 0, 0]);
  assert.ok(plan.skipped.length > 0 && plan.skipped.every((x: { army: string }) => x.army === 'AC'));
  const applied = readJson(path.join(import.meta.dirname, '..', '40k', 'whrules-points-applied.json'));
  assert.equal(applied.snapshot.fingerprint, SNAP.fingerprint);
  assert.deepEqual(applied.summary, { units: 239, values: 250, detachments: 8, enhancements: 3, copies: 217, skipped: 29, ambiguous: 0 });
});

test('проверочные значения: цены, ступени, улучшения, снаряжение и копии в других армиях', () => {
  const opts = (f: string, name: string, group = 'own') => (ds(f, name, group).costs as Band[]).map((b) => `${b.from}-${b.to ?? '+'}: ${b.options.map((o) => o.cost).join(',')}`).join(' | ');
  assert.equal(opts('AC.json', 'Telemon Heavy Dreadnought'), '1-1: 280 | 2-+: 310');
  assert.equal(opts('ORK.json', 'Boyz'), '1-3: 85,170 | 4-+: 95,180');
  assert.equal(opts('TYR.json', 'Termagants'), '1-+: 55,110');
  assert.equal(opts('AM.json', 'Basilisk'), '1-2: 115 | 3-+: 145');
  assert.equal(NOW['ORK.json'].enhancements.find((e) => e.name === 'Dreadherder')!.cost, 30);
  // Custodes: юниты со сменой состава не тронуты (Wardens по-прежнему 4/5 моделей)
  assert.deepEqual((ds('AC.json', 'Custodian Wardens').costs as Band[])[0].options.map((o) => o.models), [4, 5]);
  // снаряжение: Storm Shield вместо Thunder Hammer, только с 3-й копии; Black Templars — своя цена
  const tas = ds('SM.json', 'Terminator Assault Squad').costs as Band[];
  assert.deepEqual(tas.map((b) => b.wargear), [[], [{ label: 'Storm Shield', cost: 5 }]]);
  const bt = NOW['SM.json'].datasheets.find((d) => d.name === 'Gladiator Lancer' && d.source === 'Black Templars')!.costs as Band[];
  assert.deepEqual(bt.at(-1)!.wargear, [{ label: 'Multi-melta', cost: 10 }]);
  // копии: демоны у CSM и Chaos Lord в детачменте демонов — те же цены, что у исходных юнитов
  assert.deepEqual(ds('CSM.json', 'Skarbrand', 'ally:daemons').costs, ds('CD.json', 'Skarbrand').costs);
  assert.deepEqual(NOW['CD.json'].datasheets.find((d) => d.name === 'Chaos Lord' && d.group.startsWith('det:'))!.costs, ds('CSM.json', 'Chaos Lord').costs);
});

test('платное снаряжение у своих юнитов — только в последней ступени цены (решение 2026-10-23)', () => {
  const bad: string[] = [];
  for (const F of Object.values(NOW))
    for (const d of F.datasheets) {
      if (d.group !== 'own' || d.faction !== F.id) continue;
      const bands = d.costs as Band[];
      bands.slice(0, -1).forEach((b) => b.wargear.length && bad.push(`${F.id}/${d.name}`));
      if (bands.some((b) => b.wargear.some((w) => w.unverified)) && F.id !== 'AC') bad.push(`${F.id}/${d.name}: unverified`);
    }
  assert.deepEqual(bad, []);
});

TB('сохранённые ростеры не теряют выбор: подписи размеров прежние, снаряжение убрано только у пяти предметов Space Marines', () => {
  const lost: string[] = [];
  const removed = new Set<string>();
  for (const f of NAMES) {
    const before = new Map(BEFORE.files[f].datasheets.map((d: { id: string; group: string }) => [`${d.group}|${d.id}`, d]));
    for (const d of NOW[f].datasheets) {
      const b = before.get(`${d.group}|${d.id}`) as { costs: Band[] } | undefined;
      if (!b) continue;
      const now = new Set((d.costs as Band[]).flatMap((x) => x.options.map((o) => o.label)));
      for (const o of b.costs.flatMap((x) => x.options)) if (!now.has(o.label)) lost.push(`${f}/${d.name}: ${o.label}`);
      const wNow = new Set((d.costs as Band[]).flatMap((x) => x.wargear.map((w) => w.label)));
      for (const w of b.costs.flatMap((x) => x.wargear)) if (!wNow.has(w.label)) removed.add(`${w.label}`);
    }
  }
  assert.deepEqual(lost, []);
  assert.deepEqual([...removed].sort(), ['Blades of honour', 'Heavy laser destroyer', 'Thunder Hammer', 'Twin lascannon']);
});

TB('итог ростера меняется ровно на изменение цены (Orks: 10 Boyz 90 → 85), выбранный размер сохраняется', () => {
  const lookupOf = (files: Record<string, FactionData>, idx: DataIndex) => makeLookup(files['ORK.json'], idx);
  const idx = readJson(path.join(DATA, 'index.json')) as DataIndex;
  const build = (files: Record<string, FactionData>) => {
    const L = lookupOf(files, idx);
    let r = newRoster('ORK', 'strike', 'test');
    r = addUnit(r, L.faction.datasheets.find((d) => d.name === 'Boyz' && d.group === 'own')!);
    return { r, L };
  };
  const a = build(BEFORE.files);
  const b = build(NOW);
  const ua = computeRoster(a.r, a.L).units[0];
  const ub = computeRoster(b.r, b.L).units[0];
  assert.equal(a.r.units[0].size, b.r.units[0].size);
  assert.deepEqual([ua.total, ub.total], [90, 85]);
  // доплата Killsaw с 3-й копии Meganobz по выбранным заменам — tests/wargear.test.ts
});
