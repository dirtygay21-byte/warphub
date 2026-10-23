// P1-T1: снимок очков всех фракций wh-rules.ru (схема /2, данные 995) и отчёт свежести данных 40K. Только чтение данных.
// Запуск: bun test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — .mjs без типов
import { checkWhrulesSnapshot, loadSnapshot } from '../scripts/updates-40k.mjs';
// @ts-expect-error — .mjs без типов
import { ARMIES, bareSlug, buildReport, compareArmy, compareDetachments, costDiff, costKey } from '../scripts/whrules-compare.mjs';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const SNAP = loadSnapshot('whrules-995.json');
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

// ---------- снимок ----------

test('снимок wh-rules 995: схема /2, fingerprint, версия источника, все 30 фракций', () => {
  assert.equal(SNAP.schema, 'whrules-points-snapshot/2');
  assert.equal(SNAP.source.dataVersion, 995);
  assert.equal(SNAP.source.mfm, '1.6');
  assert.equal(SNAP.source.date, '2026-10-16');
  assert.equal(SNAP.fingerprint, 'ec8b68f3b2e21d6417ed26433fd02d5a40dafaeeb72b850717c94ae3f8190fde');
  assert.equal(Object.keys(SNAP.factions).length, 30);
  assert.equal(SNAP.factions['adeptus-custodes'].datasheets.length, 36);
  assert.equal(SNAP.factions['adeptus-custodes'].detachments.length, 13);
  assert.equal(SNAP.factions['adeptus-custodes'].renames['custodian-guard'], 'custodian-guard-sodality');
  // любое изменение содержимого ловится fingerprint
  const broken = structuredClone(SNAP);
  broken.factions.orks.datasheets[0].points[0].points += 5;
  assert.throws(() => checkWhrulesSnapshot(broken), /fingerprint/);
});

test('проверка схемы /2: у фракции обязательны name, detachments и renames; снимок /1 (981) по-прежнему читается', () => {
  const { fingerprint: _f, ...rest } = SNAP;
  void _f;
  const noDet = structuredClone(rest);
  delete noDet.factions.orks.detachments;
  assert.throws(() => checkWhrulesSnapshot({ ...noDet, fingerprint: 'x' }), /detachments/);
  assert.equal(loadSnapshot('whrules-981.json').schema, 'whrules-points-snapshot/1');
});

// ---------- сравнение цен и названий ----------

const band = (from: number, to: number | null, ...opts: [number, number][]) => ({ from, to, options: opts.map(([models, cost]) => ({ label: `${models} models`, models, cost })), addons: [], wargear: [] });

test('costKey/costDiff: points, sizes, tiers; снаряжение и строки без числа моделей не сравниваются', () => {
  const ours = [band(1, 2, [5, 75], [10, 150]), band(3, null, [5, 85], [10, 160])];
  assert.equal(costKey(ours), '1-2: 5=75,10=150 | 3-+: 5=85,10=160');
  assert.equal(costDiff(ours, structuredClone(ours)), null);
  assert.equal(costDiff(ours, [band(1, 2, [5, 80], [10, 150]), band(3, null, [5, 85], [10, 160])]).kind, 'points');
  assert.equal(costDiff(ours, [band(1, 2, [3, 75], [6, 150]), band(3, null, [3, 85], [6, 160])]).kind, 'sizes');
  assert.equal(costDiff(ours, [band(1, null, [5, 75], [10, 150])]).kind, 'tiers');
  const withExtra = [{ ...band(1, null, [1, 85]), options: [{ label: '1 model', models: 1, cost: 85 }, { label: 'Shield', cost: 20 }] }];
  assert.equal(costDiff([band(1, null, [1, 85])], withExtra), null);
});

test('bareSlug: пометка в скобках и артикль The не мешают сопоставлению', () => {
  assert.equal(bareSlug("'Ardboyz (Upgrade)"), bareSlug("'Ardboyz"));
  assert.equal(bareSlug('False Majesty (Aura)'), bareSlug('False Majesty'));
  assert.equal(bareSlug('The Ephemeral Tome'), bareSlug('Ephemeral Tome'));
});

// ---------- сравнение армии на искусственных данных ----------

const site = (id: string, name: string, points: { models: number; points: number; note?: string }[], legends = false) => ({ id, name, legends, points });
const SYN = {
  factions: {
    alpha: {
      name: 'Alpha',
      datasheets: [site('guard-sodality', 'Guard Sodality', [{ models: 3, points: 240 }]), site('tank', 'Tank', [{ models: 1, points: 160 }]), site('walker', 'Walker', [{ models: 1, points: 100 }], true), site('brand-new', 'Brand New', [{ models: 1, points: 50 }])],
      detachments: [{ id: 'host', name: 'Host', dp: 2, enhancements: [{ name: 'Blade (Upgrade)', points: 20 }, { name: 'Ephemeral Tome', points: 15 }] }],
      renames: { guard: 'guard-sodality', 'old-thing': null },
    },
    beta: { name: 'Beta', datasheets: [site('berzerkers', 'Berzerkers', [{ models: 10, points: 170 }])], detachments: [], renames: {} },
  },
};
const ds = (id: string, name: string, costs: unknown[], extra: Record<string, unknown> = {}) => ({ id, name, faction: 'A', group: 'own', legends: false, costs, ...extra });
const OURS = {
  id: 'A',
  datasheets: [
    ds('1', 'Guard', [band(1, null, [4, 170])]),
    ds('2', 'Tank', [band(1, null, [1, 150])]),
    ds('3', 'Walker', [band(1, null, [1, 100])]),
    ds('4', 'Old Thing', [band(1, null, [1, 10])]),
    ds('5', 'Berzerkers', [band(1, null, [10, 170])]),
    ds('6', 'Relic Tank', [band(1, null, [1, 300])], { legends: true }),
    ds('7', 'Mystery', [band(1, null, [1, 1])]),
    ds('8', 'Ally Copy', [band(1, null, [1, 1])], { group: 'ally:x', faction: 'X' }),
  ],
  detachments: [
    { id: 'd1', faction: 'A', name: 'Host', dp: 1 },
    { id: 'd2', faction: 'A', name: 'Gone', dp: 1 },
    { id: 'd3', faction: 'A', name: 'Kept', dp: 1, outdated: '*' },
  ],
  enhancements: [
    { id: 'e1', detachment: 'd1', name: 'Blade', cost: 15 },
    { id: 'e2', detachment: 'd1', name: 'The Ephemeral Tome', cost: 15 },
  ],
};

test('compareArmy: переименование по таблице сайта, убранный, Legends, другая фракция, без пары, новый; союзники не сравниваются', () => {
  const r = compareArmy(OURS, SYN, ['alpha']);
  assert.deepEqual(r.renamed.map((x: { name: string; to: string }) => `${x.name}→${x.to}`), ['Guard→Guard Sodality']);
  assert.equal(r.sizesChanged[0].name, 'Guard');
  assert.equal(r.pointsChanged[0].name, 'Tank');
  assert.deepEqual(r.legendsChanged.map((x: { name: string }) => x.name), ['Walker']);
  assert.deepEqual(r.removedOnSite.map((x: { name: string }) => x.name), ['Old Thing']);
  assert.deepEqual(r.otherFactionOnSite.map((x: { name: string; siteFactions: string[] }) => `${x.name}@${x.siteFactions}`), ['Berzerkers@beta']);
  assert.deepEqual(r.legendsNotOnSite.map((x: { name: string }) => x.name), ['Relic Tank']);
  assert.deepEqual(r.unmatched.map((x: { name: string }) => x.name), ['Mystery']);
  assert.deepEqual(r.newOnSite.map((x: { name: string }) => x.name), ['Brand New']);
  assert.deepEqual(r.counts, { ours: 7, site: 4, matched: 3 });
});

test('compareDetachments: DP, пропавшие (кроме помеченных устаревшими), очки улучшений, «The» и пометки в скобках', () => {
  const r = compareDetachments(OURS, SYN, ['alpha']);
  assert.deepEqual(r.dpChanged, [{ id: 'd1', name: 'Host', ours: 1, site: 2 }]);
  assert.deepEqual(r.missingOnSite.map((x: { name: string }) => x.name), ['Gone']);
  assert.deepEqual(r.outdated.map((x: { name: string }) => x.name), ['Kept']);
  assert.deepEqual(r.enhancements.pointsChanged, [{ detachment: 'Host', name: 'Blade', ours: 15, site: 20 }]);
  assert.equal(r.enhancements.same, 1);
});

// ---------- отчёт по данным приложения ----------

const index = readJson(path.join(DATA, 'index.json'));
const files = Object.fromEntries(fs.readdirSync(path.join(DATA, 'f')).filter((f) => f.endsWith('.json')).map((f) => [f, readJson(path.join(DATA, 'f', f))]));
const REP = buildReport(files, index, SNAP, 'whrules-995.json');

test('отчёт свежести: все 23 армии приложения, у каждого нашего инфолиста есть категория, без «не сопоставлено»', () => {
  assert.equal(Object.keys(ARMIES).length, 23);
  for (const [id, a] of Object.entries(REP.armies) as [string, { missingInApp?: boolean; summary: { datasheets: Record<string, number> } }][]) {
    assert.ok(!a.missingInApp, `${id} нет в приложении`);
    const s = a.summary.datasheets;
    const sum = s.same + s.points + s.sizes + s.tiers + s.removedOnSite + s.outdated + s.otherFactionOnSite + s.legendsNotOnSite + s.unmatched + s.noPointsOnSite;
    assert.equal(sum, s.ours, `${id}: каждый инфолист в одной категории`);
    assert.equal(s.unmatched, 0, `${id}: есть инфолисты без пары`);
  }
  assert.deepEqual(REP.notInApp, ['chaos-titan-legions']);
});

test('отчёт свежести: проверочные расхождения видны (Custodes, Orks, Death Guard, Tyranids), источник SM — wh-rules 981', () => {
  const find = (army: string, name: string) => {
    const d = REP.armies[army].datasheets;
    return [...d.pointsChanged, ...d.sizesChanged, ...d.tiersChanged].find((x: { name: string }) => x.name === name);
  };
  assert.equal(find('AC', 'Telemon Heavy Dreadnought').site, '1-1: 1=280 | 2-+: 1=310');
  assert.equal(find('AC', 'Trajann Valoris').site, '1-+: 1=265');
  assert.equal(find('ORK', 'Boyz').site, '1-3: 10=85,20=170 | 4-+: 10=95,20=180');
  assert.equal(find('DG', 'Plague Marines').site, '1-+: 5=90,7=125,10=175');
  assert.equal(find('TYR', 'Termagants').site, '1-+: 10=55,20=110');
  assert.equal(REP.armies.AC.summary.datasheets.renamed, 9);
  assert.equal(REP.armies.SM.ourSource.dataVersion, 981);
  assert.equal(REP.armies.ORK.ourSource.site, 'wahapedia');
});

test('сохранённый отчёт 40k/freshness-report.json построен по этому снимку', () => {
  const saved = readJson(path.join(import.meta.dirname, '..', '40k', 'freshness-report.json'));
  assert.equal(saved.schema, 'whrules-freshness/1');
  assert.equal(saved.snapshot.fingerprint, SNAP.fingerprint);
  assert.equal(Object.keys(saved.armies).length, 23);
});
