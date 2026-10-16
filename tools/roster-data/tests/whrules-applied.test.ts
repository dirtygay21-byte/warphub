// Обновление whrules-981-space-marines применено: данные в backend/roster-data ровно те, что даёт одобренный
// сухой прогон на данных до обновления (история git, scripts/baseline-40k.mjs), и ничего сверх этого.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — модуль .mjs без типов
import { baseline40k } from '../scripts/baseline-40k.mjs';
// @ts-expect-error — модуль .mjs без типов
import { dryRun } from '../scripts/whrules-convert.mjs';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const BASE = baseline40k();
const TB = BASE ? test : test.skip;
const R = BASE ? dryRun({ files: BASE.files }) : null;
const disk = (f: string) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

TB('изменённые файлы совпадают с одобренным сухим прогоном; остальные файлы — как до обновления', () => {
  const names = fs.readdirSync(path.join(DATA, 'f')).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(names, Object.keys(BASE.files).sort(), 'состав файлов');
  const changed = Object.keys(R._files.files).sort();
  assert.deepEqual(changed, ['AC.json', 'AM.json', 'AS.json', 'AdM.json', 'AoI.json', 'GK.json', 'QI.json', 'SM.json', 'TL.json']);
  for (const f of names) {
    const want = R._files.files[f] ?? BASE.files[f];
    assert.equal(JSON.stringify(disk(`f/${f}`)), JSON.stringify(want), f);
  }
});

TB('index.json: добавлена только запись updates — та, что в одобренном отчёте', () => {
  const { updates, ...rest } = disk('index.json');
  assert.deepEqual(rest, BASE.index);
  assert.deepEqual(updates, [R.scope.indexUpdate]);
});
