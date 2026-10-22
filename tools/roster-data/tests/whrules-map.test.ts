// SM-0: сопоставление инфолистов wh-rules.ru (данные 981) с данными приложения. Только чтение данных. Запуск: bun test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { addUnit, decodeRoster, encodeRoster, newRoster, sanitizeRoster } from '../../../client/src/features/roster/engine/roster';
import type { Datasheet, FactionData } from '../../../client/src/features/roster/engine/types';
// @ts-expect-error — .mjs без типов
import { checkFull, checkRenames, loadFull, loadRenames, mapSpaceMarines, newId, slugify } from '../scripts/whrules-map.mjs';
// @ts-expect-error — .mjs без типов
import { loadSnapshot } from '../scripts/updates-40k.mjs';
// @ts-expect-error — модуль .mjs без типов
import { baseline40k } from '../scripts/baseline-40k.mjs';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
// данные до обновления whrules-981 (история git): сопоставление проверяется на выводе импорта Wahapedia
const BASE = baseline40k();
const TB = BASE ? test : test.skip;
void DATA;
const load = (f: string): FactionData => structuredClone(BASE?.files[f] ?? { id: f, datasheets: [], detachments: [], enhancements: [], stratagems: [], rules: {} }) as FactionData;
const FILES = Object.keys(BASE?.files ?? {}).filter((f) => f.endsWith('.json')).sort();
const SM = load('SM.json');
const AOI = load('AoI.json');
const OTHERS = FILES.filter((f) => f !== 'SM.json' && f !== 'AoI.json').map(load);
const SNAP = loadSnapshot('whrules-981.json');
const REN = loadRenames('whrules-981-renames.json');
const MAP = mapSpaceMarines(SNAP, REN, SM, AOI, OTHERS);
const OWN = SM.datasheets.filter((d) => d.group === 'own');
const ALL_IDS = new Set(FILES.flatMap((f) => load(f).datasheets.map((d) => d.id)));

TB('снимок переименований wh-rules 981: fingerprint и SHA-256 модуля сайта записаны', () => {
  assert.equal(REN.source.dataVersion, 981);
  assert.equal(REN.source.date, '2026-10-14');
  assert.equal(REN.source.asset, 'datasheetRenames-CExx-zXU.js');
  assert.equal(REN.source.assetSha256, '4dade1ba42adc6b74c9cc0f85dedfaa5033af294a5a9fd5710e8344116d33539');
  assert.equal(REN.fingerprint, 'f5d0dfa7fbfc27705953f87325be2b4a3be74181eadec355d3b9aa2deb4ca57f');
  const broken = JSON.parse(JSON.stringify(REN));
  broken.renames['space-marines']['tactical-squad'] = 'intercessor-squad';
  assert.throws(() => checkRenames(broken), /fingerprint/);
});

TB('slug названия совпадает с id сайта у всех 268 инфолистов снимка (сопоставление по slug надёжно)', () => {
  let n = 0;
  for (const f of Object.values(SNAP.factions) as { datasheets: { id: string; name: string }[] }[])
    for (const w of f.datasheets) {
      assert.equal(slugify(w.name), w.id, w.name);
      n++;
    }
  assert.equal(n, 268);
  assert.deepEqual(MAP.review.filter((r: { kind: string }) => r.kind === 'slug'), []);
});

TB('каждый инфолист сайта и приложения отнесён ровно к одной группе; итоги сопоставления', () => {
  const count = (k: string) => MAP[k].length;
  assert.deepEqual(
    { matched: count('matched'), renamed: count('renamed'), new: count('new'), removed: count('removed'), unmatched: count('unmatched'), ambiguous: count('ambiguous') },
    { matched: 217, renamed: 3, new: 2, removed: 67, unmatched: 4, ambiguous: 0 },
  );
  const site = [...MAP.matched, ...MAP.renamed, ...MAP.new].map((x: { site: { faction: string; id: string } }) => `${x.site.faction}|${x.site.id}`);
  assert.equal(site.length, 222);
  assert.equal(new Set(site).size, 222);
  const ours = [...MAP.matched, ...MAP.renamed, ...MAP.removed, ...MAP.unmatched].map((x: { ours: { id: string } }) => x.ours.id);
  assert.equal(ours.length, OWN.length);
  assert.equal(new Set(ours).size, OWN.length);
});

TB('сопоставленные пары отличаются только регистром и апострофами; переименования — только из таблицы сайта', () => {
  for (const x of MAP.matched) assert.equal(slugify(x.ours.name), slugify(x.site.name), x.ours.name);
  assert.deepEqual(
    MAP.renamed.map((x: { ours: { id: string }; site: { id: string } }) => [x.ours.id, x.site.id]),
    [
      ['000000103', 'eradicator-squad-with-melta-rifles'],
      ['000001158', 'invader-atvs'],
      ['000004183', 'marneus-calgar'],
    ],
  );
});

TB('id: существующие id сохраняются, новые whr:<фракция>:<slug> уникальны и не пересекаются с данными', () => {
  for (const x of [...MAP.matched, ...MAP.renamed]) assert.ok(ALL_IDS.has(x.ours.id), x.ours.id);
  assert.ok(![...ALL_IDS].some((id) => id.startsWith('whr:')), 'в данных ещё нет id whr:');
  const proposed = MAP.new.map((x: { proposedId: string }) => x.proposedId);
  assert.deepEqual(proposed, ['whr:space-marines:kaius-konorius', 'whr:space-marines:sicaran']);
  assert.equal(new Set(proposed).size, proposed.length);
  for (const p of proposed) assert.ok(!ALL_IDS.has(p));
  // один и тот же slug в разных фракциях сайта даёт разные id (Repulsor Executioner есть и у SM, и у Black Templars)
  assert.notEqual(newId('space-marines', 'repulsor-executioner'), newId('black-templars', 'repulsor-executioner'));
});

TB('сопоставление детерминировано: повторный запуск даёт тот же результат', () => {
  const again = mapSpaceMarines(loadSnapshot('whrules-981.json'), loadRenames('whrules-981-renames.json'), load('SM.json'), load('AoI.json'), FILES.filter((f) => f !== 'SM.json' && f !== 'AoI.json').map(load));
  assert.deepEqual(again, MAP);
});

TB('сохранённые ростеры: id вида whr:… проходит проверку, код ростера и поиск инфолиста', () => {
  const base = OWN.find((d) => d.name === 'Captain')!;
  const fake: Datasheet = { ...base, id: 'whr:space-marines:kaius-konorius', name: 'Kaius Konorius' };
  const F: FactionData = { ...SM, datasheets: [...SM.datasheets, fake] };
  const r = addUnit(newRoster('SM'), fake);
  const back = decodeRoster(encodeRoster(r), ['SM']);
  assert.equal(back.units[0]!.datasheetId, 'whr:space-marines:kaius-konorius');
  assert.equal(sanitizeRoster(JSON.parse(JSON.stringify(r)))!.units[0]!.datasheetId, 'whr:space-marines:kaius-konorius');
  const c = computeRoster(back, makeLookup(F));
  assert.ok(!c.issues.some((i) => i.code === 'missing'), 'инфолист с новым id находится');
});

TB('Imperial Agents: 46 инфолистов сайта ↔ AoI.json; копии в 8 фракциях', () => {
  assert.equal(MAP.agents.matched.length, 46);
  assert.deepEqual(MAP.agents.new, []);
  assert.deepEqual(MAP.agents.unmatched, []);
  for (const id of ['000003814', '000003815', '000003816', '000003817', '000003821', '000003822'])
    assert.deepEqual(MAP.agents.copies[id], ['AC', 'AM', 'AS', 'AdM', 'GK', 'QI', 'SM', 'TL'], id);
});

// SM-1: полный снимок wh-rules 981 (инфолисты, построения, правило армии) — проверка целостности и согласованности
const FULL = loadFull('whrules-981-full.json');

TB('полный снимок wh-rules 981: источник, fingerprint, SHA модулей; порча обнаруживается', () => {
  assert.equal(FULL.source.dataVersion, 981);
  assert.equal(FULL.source.mfm, '1.6');
  assert.equal(FULL.source.date, '2026-10-14');
  assert.equal(FULL.fingerprint, 'aebb093d50e8a4d7a5ab2fa315d7e13dd63bf0d79d23e2756e3f9c4d4ee49361');
  const broken = JSON.parse(JSON.stringify(FULL));
  broken.factions['space-marines'].datasheets[0].points[0].points += 5;
  assert.throws(() => checkFull(broken), /fingerprint/);
  const noSha = JSON.parse(JSON.stringify(FULL));
  delete noSha.assets[noSha.factions['deathwatch'].datasheetsFile];
  assert.throws(() => checkFull(noSha), /SHA-256/);
});

TB('полный снимок совпадает со снимком очков: те же 268 инфолистов и те же очки', () => {
  const counts = Object.fromEntries(Object.entries(FULL.factions).map(([k, f]) => [k, (f as { datasheets: unknown[] }).datasheets.length]));
  assert.deepEqual(counts, { 'space-marines': 115, 'black-templars': 15, 'blood-angels': 24, 'dark-angels': 19, deathwatch: 10, 'space-wolves': 39, 'imperial-agents': 46 });
  for (const [f, x] of Object.entries(SNAP.factions) as [string, { datasheets: { id: string; points: unknown }[] }][]) {
    const full = new Map((FULL.factions[f].datasheets as { id: string; points: unknown }[]).map((d) => [d.id, d]));
    assert.equal(full.size, x.datasheets.length, f);
    for (const d of x.datasheets) assert.deepEqual(full.get(d.id)?.points, d.points, `${f}/${d.id}`);
  }
});

TB('полный снимок: у каждого инфолиста есть профили, способности, состав, ключевые слова; у построений — правило', () => {
  for (const [f, x] of Object.entries(FULL.factions) as [string, { datasheets: Record<string, unknown[]>[]; detachments: Record<string, unknown>[] }][]) {
    for (const d of x.datasheets) for (const k of ['profiles', 'abilities', 'composition', 'keywords', 'factionKeywords', 'points']) assert.ok(Array.isArray(d[k]) && d[k].length, `${f}/${d.id}: ${k}`);
    for (const d of x.detachments) assert.ok(d.rule && d.name, `${f}/${d.id}`);
  }
  // ордена Black Templars используют общие инфолисты Space Marines: Sternguard, Terminator Squad, Land Raider Crusader
  for (const id of ['sternguard-veteran-squad', 'terminator-squad', 'land-raider-crusader']) assert.ok(FULL.factions['black-templars'].sharedUnitIds.includes(id), id);
});
