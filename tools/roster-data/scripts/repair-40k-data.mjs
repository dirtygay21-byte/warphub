#!/usr/bin/env node
/**
 * Применить проверенные обновления 40K (40k/curated.json → updates) к готовым данным — без CSV выгрузки Wahapedia.
 *
 *   bun scripts/repair-40k-data.mjs [--dir ../../backend/roster-data] [--check]
 *   (или node --import tsx scripts/repair-40k-data.mjs …)
 *
 * Та же функция repair40kData вызывается в конце scripts/import-wahapedia.mjs, поэтому переимпорт даёт тот же
 * результат. Пишет только изменившиеся файлы, в формате импорта. --check — ничего не записывать
 * (код выхода 1, если что-то изменилось бы).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repair40kData } from './updates-40k.mjs';
// обработчик whrules-faction использует движок клиента (TypeScript): запуск через bun или node --import tsx
const { WHRULES_APPLIERS } = await import('./whrules-convert.mjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf('--dir');
const DIR = path.resolve(at >= 0 ? args[at + 1] : path.join(HERE, '../../../backend/roster-data'));
const CHECK = args.includes('--check');
const curated = JSON.parse(fs.readFileSync(path.join(HERE, '..', '40k', 'curated.json'), 'utf8'));

const { changedFiles, lines } = repair40kData(DIR, curated, { check: CHECK, appliers: WHRULES_APPLIERS });
for (const l of lines) console.log(`  · ${l}`);
for (const f of changedFiles) console.log(`  ${CHECK ? '~' : '✓'} ${f}`);
console.log(changedFiles.length ? `${CHECK ? 'Нужно обновить' : 'Обновлено'}: ${changedFiles.length} файлов.` : 'Данные уже в порядке.');
if (CHECK && changedFiles.length) process.exitCode = 1;
