// P1-T1/P1-T2: снимок очков всех фракций wh-rules.ru (схема /3, данные 995) и отчёт свежести данных 40K, включая платное
// снаряжение. Только чтение данных.
// Запуск: bun test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — .mjs без типов
import { checkWhrulesSnapshot, loadSnapshot } from '../scripts/updates-40k.mjs';
// @ts-expect-error — .mjs без типов
// @ts-expect-error — .mjs без типов
import { BEFORE_POINTS, data40kAt } from '../scripts/baseline-40k.mjs';
// @ts-expect-error — .mjs без типов
import { ARMIES, bareSlug, buildReport, compareArmy, compareDetachments, compareWargear, costDiff, costKey, siteCosts, wargearKey } from '../scripts/whrules-compare.mjs';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const SNAP = loadSnapshot('whrules-995.json');
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

// ---------- снимок ----------

test('снимок wh-rules 995: схема /3, fingerprint, версия источника, все 30 фракций, платное снаряжение', () => {
  assert.equal(SNAP.schema, 'whrules-points-snapshot/3');
  assert.equal(SNAP.source.dataVersion, 995);
  assert.equal(SNAP.source.mfm, '1.6');
  assert.equal(SNAP.source.date, '2026-10-16');
  assert.equal(SNAP.fingerprint, '79a26d70ca87852ab8aabc06fb9f93d28a907a6c1b2a724e25af59b794c02aa4');
  const withWargear = Object.values(SNAP.factions).flatMap((f: { datasheets: { wargearPoints?: unknown[] }[] }) => f.datasheets.filter((d) => d.wargearPoints?.length));
  assert.equal(withWargear.length, 68);
  assert.deepEqual(SNAP.factions['space-marines'].datasheets.find((d: { id: string }) => d.id === 'terminator-assault-squad').wargearPoints, [{ name: 'Storm Shield', points: 5 }]);
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
  const badWg = structuredClone(rest);
  badWg.factions['space-marines'].datasheets.find((d: { id: string }) => d.id === 'terminator-assault-squad').wargearPoints = [{ name: 'Storm Shield' }];
  assert.throws(() => checkWhrulesSnapshot({ ...badWg, fingerprint: 'x' }), /снаряжение/);
  assert.equal(loadSnapshot('whrules-981.json').schema, 'whrules-points-snapshot/1');
});

// ---------- сравнение цен и названий ----------

const band = (from: number, to: number | null, ...opts: [number, number][]) => ({ from, to, options: opts.map(([models, cost]) => ({ label: `${models} models`, models, cost })), addons: [], wargear: [] });

test('costKey/costDiff: points, sizes, tiers; размер без числа моделей сравнивается по подписи', () => {
  const ours = [band(1, 2, [5, 75], [10, 150]), band(3, null, [5, 85], [10, 160])];
  assert.equal(costKey(ours), '1-2: 5=75,10=150 | 3-+: 5=85,10=160');
  assert.equal(costDiff(ours, structuredClone(ours)), null);
  assert.equal(costDiff(ours, [band(1, 2, [5, 80], [10, 150]), band(3, null, [5, 85], [10, 160])]).kind, 'points');
  assert.equal(costDiff(ours, [band(1, 2, [3, 75], [6, 150]), band(3, null, [3, 85], [6, 160])]).kind, 'sizes');
  assert.equal(costDiff(ours, [band(1, null, [5, 75], [10, 150])]).kind, 'tiers');
  const withLabel = [{ ...band(1, null, [1, 85]), options: [{ label: '1 model', models: 1, cost: 85 }, { label: 'Retinue', cost: 20 }] }];
  assert.equal(costDiff([band(1, null, [1, 85])], withLabel)?.kind, 'sizes');
});

test('размеры по подписи состава сравниваются (Crusader Squad), запись очков без моделей и пометки — добавка (Tidewall)', () => {
  const crusader = [{ from: 1, to: null, options: [{ label: '1 Sword Brother, 4 Neophytes, 5 Initiates', cost: 160 }], addons: [], wargear: [] }];
  assert.equal(costKey(crusader), '1-+: [1 sword brother, 4 neophytes, 5 initiates]=160');
  assert.equal(costDiff(crusader, siteCosts([{ points: 160, note: '1 Sword Brother, 4 Neophytes, 5 Initiates' }]).bands), null);
  assert.equal(costDiff(crusader, siteCosts([{ points: 170, note: '1 Sword Brother, 4 Neophytes, 5 Initiates' }]).bands)?.kind, 'points');
  const tidewall = siteCosts([{ models: 1, points: 85 }, { points: 20 }]);
  assert.equal(costKey(tidewall.bands), '1-+: 1=85');
  assert.deepEqual(tidewall.addons, [20]);
});

test('compareWargear: та же цена, другая цена, только у нас, только на сайте; ключ как в движке (регистр, окончание s)', () => {
  assert.equal(wargearKey('Storm Shields'), wargearKey('storm shield'));
  const ds = { options: [], composition: ['1 model'], loadout: '', weapons: [], defaultLoadout: [], stats: [], costs: [{ from: 1, to: null, options: [], addons: [], wargear: [{ label: 'Thunder Hammer', cost: 5, unverified: true }, { label: 'Lascannon', cost: 5 }, { label: 'Multi-melta', cost: 10 }] }] };
  const r = compareWargear(ds, [{ name: 'Storm Shield', points: 5 }, { name: 'lascannon', points: 5 }, { name: 'Multi-melta', points: 15 }]);
  assert.deepEqual(r.same.map((x: { name: string }) => x.name), ['lascannon']);
  assert.deepEqual(r.priceChanged.map((x: { name: string; ours: number; site: number }) => `${x.name} ${x.ours}→${x.site}`), ['Multi-melta 10→15']);
  assert.deepEqual(r.onlyOurs, [{ name: 'Thunder Hammer', ours: 5, unverified: true }]);
  assert.deepEqual(r.onlySite.map((x: { name: string }) => x.name), ['Storm Shield']);
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
  assert.deepEqual(r.enhancements.pointsChanged, [{ id: 'e1', detachment: 'Host', name: 'Blade', ours: 15, site: 20 }]);
  assert.equal(r.enhancements.same, 1);
});

// ---------- отчёт по данным приложения ----------

const index = readJson(path.join(DATA, 'index.json'));
const files = Object.fromEntries(fs.readdirSync(path.join(DATA, 'f')).filter((f) => f.endsWith('.json')).map((f) => [f, readJson(path.join(DATA, 'f', f))]));
const NOW = buildReport(files, index, SNAP, 'whrules-995.json');
// отчёт P1-T2 — по данным до обновления whrules-995-points (история git); без git эти проверки пропускаются
const BEFORE = data40kAt(BEFORE_POINTS.rev);
const REP = BEFORE ? buildReport(BEFORE.files, BEFORE.index, SNAP, 'whrules-995.json') : null;
const TB = BEFORE ? test : test.skip;

TB('отчёт свежести (до P1-T3): все 23 армии приложения, у каждого нашего инфолиста есть категория, без «не сопоставлено»', () => {
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

TB('отчёт свежести (до P1-T3): проверочные расхождения видны (Custodes, Orks, Death Guard, Tyranids), источник SM — wh-rules 981', () => {
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

TB('отчёт свежести (до P1-T3): снаряжение — версии орденов сравниваются со своими инфолистами сайта', () => {
  const w = REP.armies.SM.datasheets.wargear;
  const row = (unit: string, name: string) => w.onlySite.find((x: { unit: string; name: string }) => x.unit === unit && x.name === name);
  assert.equal(row('Gladiator Lancer (Black Templars)', 'Multi-melta').site, 10);
  assert.equal(row('Terminator Assault Squad', 'Storm Shield').site, 5);
  assert.ok(w.onlyOurs.some((x: { unit: string; name: string; unverified: boolean }) => x.unit === 'Terminator Assault Squad' && x.name === 'Thunder Hammer' && x.unverified));
  assert.ok(!w.onlySite.some((x: { unit: string }) => x.unit === 'Gladiator Lancer'), 'версия Space Marines не путается с Black Templars');
  // у Gladiator Lancer Black Templars своя цена отряда (165), у Space Marines — 160: обе совпадают с сайтом
  const pts = REP.armies.SM.datasheets.pointsChanged.map((x: { name: string }) => x.name);
  assert.ok(!pts.includes('Gladiator Lancer'));
  assert.equal(REP.armies.SM.datasheets.newOnSite.length, 0);
  assert.equal(REP.armies.AM.summary.wargear.same, 27);
  assert.deepEqual(REP.armies.TAU.datasheets.addons, { same: 1, changed: [] });
});

test('отчёт свежести по текущим данным (после P1-T3): в обновлённом объёме расхождений нет, остались только исключения', () => {
  for (const [id, a] of Object.entries(NOW.armies) as [string, { summary: Record<string, Record<string, number>> }][]) {
    const s = a.summary;
    if (id === 'AC') continue;
    assert.equal(s.datasheets.points + s.datasheets.tiers + s.datasheets.sizes + s.datasheets.legends, 0, `${id}: цены отряда`);
    assert.equal(s.detachments.dp, 0, `${id}: DP`);
    assert.equal(s.enhancements.points, 0, `${id}: улучшения`);
    assert.equal(s.wargear.priceChanged + s.wargear.onlyOurs + s.wargear.onlySite, 0, `${id}: снаряжение`);
    assert.equal(s.datasheets.unmatched, 0, `${id}: без пары`);
  }
  // Custodes: цены обновлены только у юнитов без смены состава; кодекс — в полной конвертации
  const ac = NOW.armies.AC.summary;
  assert.deepEqual([ac.datasheets.points, ac.datasheets.sizes, ac.datasheets.tiers, ac.datasheets.legends, ac.datasheets.renamed, ac.datasheets.newOnSite], [0, 5, 10, 6, 9, 5]);
  assert.equal(NOW.armies.ORK.ourSource.dataVersion, 995);
});

test('сохранённый отчёт 40k/freshness-report.json построен по этому снимку', () => {
  const saved = readJson(path.join(import.meta.dirname, '..', '40k', 'freshness-report.json'));
  assert.equal(saved.schema, 'whrules-freshness/1');
  assert.equal(saved.snapshot.fingerprint, SNAP.fingerprint);
  assert.equal(Object.keys(saved.armies).length, 23);
});
