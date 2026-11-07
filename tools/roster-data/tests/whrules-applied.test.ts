// Обновления 40K применены: данные в backend/roster-data ровно те, что дают одобренный сухой прогон whrules-981-space-marines
// на данных до обновления (история git, scripts/baseline-40k.mjs) и поверх него whrules-995-points (P1-T3), и ничего сверх этого.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — модуль .mjs без типов
import { baseline40k } from '../scripts/baseline-40k.mjs';
// @ts-expect-error — модуль .mjs без типов
import { dryRun } from '../scripts/whrules-convert.mjs';
// @ts-expect-error — модуль .mjs без типов
import { WHRULES_APPLIERS } from '../scripts/whrules-points.mjs';
// @ts-expect-error — модуль .mjs без типов
import { apply40kUpdates, loadSnapshot } from '../scripts/updates-40k.mjs';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const BASE = baseline40k();
const TB = BASE ? test : test.skip;
const R = BASE ? dryRun({ files: BASE.files }) : null;
const disk = (f: string) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const curated = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '40k', 'curated.json'), 'utf8'));
const POINTS = curated.updates.items.find((u: { id: string }) => u.id === 'whrules-995-points');
// ожидаемые файлы: сухой прогон 981 на данных до обновления, затем остальные обновления curated по порядку
// (полная конвертация Custodes 995, значения 995) — тем же механизмом, что импорт и repair
const EXPECT: Record<string, unknown> | null = BASE ? structuredClone({ ...BASE.files, ...R._files.files }) : null;
const EXPECT_INDEX = BASE ? structuredClone(BASE.index) : null;
if (EXPECT) apply40kUpdates(EXPECT, EXPECT_INDEX, curated, { appliers: WHRULES_APPLIERS });

TB('изменённые файлы совпадают с одобренным сухим прогоном; остальные файлы — как до обновления', () => {
  const names = fs.readdirSync(path.join(DATA, 'f')).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(names, Object.keys(BASE.files).sort(), 'состав файлов');
  const changed = Object.keys(R._files.files).sort();
  assert.deepEqual(changed, ['AC.json', 'AM.json', 'AS.json', 'AdM.json', 'AoI.json', 'GK.json', 'QI.json', 'SM.json', 'TL.json']);
  for (const f of names) assert.equal(JSON.stringify(disk(`f/${f}`)), JSON.stringify(EXPECT![f]), f);
});

TB('index.json: добавлены только записи updates — 981 из одобренного отчёта, 995-custodes, 995-points и 995-wargear', () => {
  const { updates, ...rest } = disk('index.json');
  assert.deepEqual(rest, BASE.index);
  assert.deepEqual(updates.map((u: { id: string }) => u.id), curated.updates.items.filter((u: { enabled: boolean }) => u.enabled).map((u: { id: string }) => u.id));
  assert.deepEqual(updates[0], R.scope.indexUpdate);
  assert.deepEqual(updates, EXPECT_INDEX!.updates);
  const snap = loadSnapshot(POINTS.snapshot);
  assert.deepEqual(updates.find((u: { id: string }) => u.id === POINTS.id), { id: POINTS.id, kind: POINTS.kind, scope: POINTS.scope, note: POINTS.note, source: { site: snap.source.site, dataVersion: 995, mfm: '1.6', date: '2026-10-16', snapshot: POINTS.snapshot, fingerprint: snap.fingerprint } });
});
