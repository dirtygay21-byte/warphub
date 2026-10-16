#!/usr/bin/env node
/**
 * Повторная последняя обработка готовых данных AoS — без CSV выгрузки Wahapedia.
 *
 *   node scripts/repair-aos-data.mjs [--dir ../../backend/roster-data/aos] [--check]
 *
 * Применяет к backend/roster-data/aos/f/*.json ту же функцию normaliseAosFaction, что и импорт
 * (scripts/import-wahapedia-aos.mjs): чистка служебной разметки во всех текстовых полях правил
 * и сезон у построений. Нужна, когда исправлена последняя обработка, а свежей выгрузки под рукой нет.
 * Порядок ключей и формат файлов сохраняются, меняются только исправленные значения.
 * --check — ничего не записывать, только показать, что изменилось бы (код выхода 1, если есть изменения).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMarkup, fullTextReport, normaliseAosFaction, warscrollRefs } from './import-wahapedia-aos.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf('--dir');
const DIR = path.resolve(at >= 0 ? args[at + 1] : path.join(HERE, '../../../backend/roster-data/aos'));
const CHECK = args.includes('--check');
const curated = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'aos', 'curated.json'), 'utf8'));

let changedFiles = 0;
let changedValues = 0;
const files = fs.readdirSync(path.join(DIR, 'f')).filter((f) => f.endsWith('.json')).sort();
const parsed = files.map((file) => {
  const p = path.join(DIR, 'f', file);
  const before = fs.readFileSync(p, 'utf8');
  return { file, p, before, data: JSON.parse(before) };
});
// правкам copyFrom (curated.warscrollOverrides) нужен варскролл другой фракции — сначала читаются все файлы
const refs = warscrollRefs(Object.fromEntries(parsed.map((l) => [l.file, l.data])));
const loaded = parsed.map((l) => ({ ...l, data: normaliseAosFaction(l.data, curated, refs) }));
// без CSV длина исходного HTML неизвестна: обрыв по лимиту 1024 символа точно отмечает только импорт;
// здесь отмечаются лишь видимые признаки (обрывок тега, заглушка таблицы) — см. normaliseAosFaction
for (const { file, p, before, data } of loaded) {
  const after = JSON.stringify(data);
  const left = findMarkup(data);
  if (left.length) console.log(`  ✗ ${file}: разметка осталась — ${left.slice(0, 3).join(', ')}`);
  if (after === before) continue;
  const a = before.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
  const b = after.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
  const diff = Math.abs(b.length - a.length) + a.filter((x, i) => x !== b[i]).length;
  changedFiles++;
  changedValues += diff;
  console.log(`  ${CHECK ? '~' : '✓'} ${file}: изменений ~${diff}`);
  if (!CHECK) fs.writeFileSync(p, after);
}
for (const line of fullTextReport(Object.fromEntries(loaded.map((l) => [l.file, l.data])), curated)) console.log(`  · ${line}`);
console.log(changedFiles ?`${CHECK ? 'Нужно обновить' : 'Обновлено'}: ${changedFiles} файлов, ~${changedValues} значений.` : 'Данные уже в порядке.');
if (CHECK && changedFiles) process.exitCode = 1;
