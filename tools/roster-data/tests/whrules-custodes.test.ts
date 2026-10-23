// P1-T4a: полный снимок Adeptus Custodes (wh-rules 995) и сопоставление с армией AC. Только чтение данных. Запуск: bun test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — .mjs без типов
import { checkFull, fullFileName, loadFull, mapFaction } from '../scripts/whrules-map.mjs';
// @ts-expect-error — .mjs без типов
import { loadSnapshot } from '../scripts/updates-40k.mjs';

const DIR = path.join(import.meta.dirname, '..', '40k');
const FULL_FILE = 'whrules-995-full-adeptus-custodes.json';
const FULL = loadFull(FULL_FILE, DIR, ['adeptus-custodes']);
const SNAP = loadSnapshot('whrules-995.json');
const MAP = JSON.parse(fs.readFileSync(path.join(DIR, 'whrules-995-map-adeptus-custodes.json'), 'utf8'));

test('полный снимок Custodes 995: схема, версия, fingerprint, имя файла; без фракции из списка — ошибка', () => {
  assert.equal(FULL.source.dataVersion, 995);
  assert.equal(FULL.source.mfm, '1.6');
  assert.equal(FULL.fingerprint, '48cc0464bd8886d55c6b81f2d187d02bfb32e185d3dba3f6d0ff3c8985b8718b');
  assert.equal(fullFileName(FULL), FULL_FILE);
  const f = FULL.factions['adeptus-custodes'];
  assert.deepEqual([f.datasheets.length, f.detachments.length, !!f.armyRule], [36, 13, true]);
  assert.throws(() => checkFull(FULL), /space-marines/); // по умолчанию обязательны 7 фракций обновления Space Marines
  // одни и те же инфолисты в полном снимке и в снимке очков
  assert.deepEqual(f.datasheets.map((d: { id: string }) => d.id).sort(), SNAP.factions['adeptus-custodes'].datasheets.map((d: { id: string }) => d.id).sort());
});

test('сопоставление Custodes: 22 тех же, 9 переименованных по таблице сайта (id прежние), 5 новых; без догадок', () => {
  assert.deepEqual(MAP.counts, { ours: 31, site: 36, matched: 22, renamed: 9, new: 5, removed: 0, unmatched: 0, ambiguous: 0, review: 0 });
  assert.equal(MAP.snapshot.fingerprint, SNAP.fingerprint);
  const ren = Object.fromEntries(MAP.renamed.map((x: { ours: { name: string }; site: { name: string } }) => [x.ours.name, x.site.name]));
  assert.equal(ren['Custodian Guard'], 'Custodian Guard Sodality');
  assert.equal(ren['Venatari Custodians'], 'Venatari with Verutum Lances');
  assert.ok(MAP.new.every((x: { proposedId: string }) => x.proposedId.startsWith('whr:adeptus-custodes:')));
  assert.deepEqual(MAP.detachments.removed.map((x: { name: string }) => x.name), ['Shield Host', 'Talons Of The Emperor', 'Solar Spearhead', 'Silent Hunters', 'Tharanatoi Hammerblow']);
  assert.equal(MAP.detachments.new.length, 9);
});

test('сохранённое сопоставление совпадает с пересчётом по данным до конвертации', () => {
  // данные AC ещё не конвертированы — пересчёт по текущему AC.json даёт то же
  const ac = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'f', 'AC.json'), 'utf8'));
  const { counts, renamed, new: added, detachments } = mapFaction(SNAP, 'adeptus-custodes', ac);
  assert.deepEqual({ counts, renamed, new: added, detachments }, { counts: MAP.counts, renamed: MAP.renamed, new: MAP.new, detachments: MAP.detachments });
});
