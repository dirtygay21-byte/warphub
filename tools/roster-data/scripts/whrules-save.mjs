#!/usr/bin/env node
/**
 * Сохранение снимка wh-rules.ru (результат scripts/whrules-extract.js) в tools/roster-data/40k/whrules-<dataVersion>.json.
 *
 *   node scripts/whrules-save.mjs <файл с компактным JSON снимка>
 *
 * Проверяет схему и fingerprint (SHA-256 от JSON.stringify(снимок без fingerprint)) и пишет файл с отступом 1.
 * Отступ не меняет fingerprint: проверка всегда идёт по JSON.stringify разобранного объекта (порядок ключей сохраняется).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWhrulesSnapshot } from './updates-40k.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) {
  console.error('Укажите файл со снимком (window.__whrulesSnapshot из scripts/whrules-extract.js).');
  process.exit(2);
}
const snap = JSON.parse(fs.readFileSync(src, 'utf8'));
checkWhrulesSnapshot(snap);
const out = path.join(HERE, '..', '40k', `whrules-${snap.source.dataVersion}.json`);
fs.writeFileSync(out, JSON.stringify(snap, null, 1) + '\n');
console.log(`снимок wh-rules ${snap.source.dataVersion} (MFM ${snap.source.mfm}, ${snap.source.date}), fingerprint ${snap.fingerprint.slice(0, 16)}… → ${path.relative(process.cwd(), out)}`);
