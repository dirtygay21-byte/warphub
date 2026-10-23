#!/usr/bin/env node
/**
 * Сохранение снимка wh-rules.ru (результат scripts/whrules-extract.js) в tools/roster-data/40k/whrules-<dataVersion>.json,
 * снимка ростера (scripts/whrules-extract-roster.js, схема whrules-roster/1) — в 40k/whrules-<dataVersion>-roster.json.
 *
 *   node scripts/whrules-save.mjs <файл>
 *
 * Файл — компактный JSON снимка (window.__whrulesSnapshot) или он же, сжатый gzip, в base64 (window.__whrulesSnapshotGz).
 * Проверяет схему и fingerprint (SHA-256 от JSON.stringify(снимок без fingerprint)) и пишет файл с отступом 1.
 * Отступ не меняет fingerprint: проверка всегда идёт по JSON.stringify разобранного объекта (порядок ключей сохраняется).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ROSTER_SCHEMA, checkRosterSnapshot, checkWhrulesSnapshot } from './updates-40k.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) {
  console.error('Укажите файл со снимком (window.__whrulesSnapshot или window.__whrulesSnapshotGz из scripts/whrules-extract.js).');
  process.exit(2);
}
const text = fs.readFileSync(src, 'utf8').trim();
const json = text.startsWith('{') ? text : zlib.gunzipSync(Buffer.from(text.replace(/^"|"$/g, ''), 'base64')).toString('utf8');
const snap = JSON.parse(json);
// снимок ростера (scripts/whrules-extract-roster.js) — свой файл 40k/whrules-<версия>-roster.json
const roster = snap.schema === ROSTER_SCHEMA;
if (roster) checkRosterSnapshot(snap);
else checkWhrulesSnapshot(snap);
const out = path.join(HERE, '..', '40k', `whrules-${snap.source.dataVersion}${roster ? '-roster' : ''}.json`);
fs.writeFileSync(out, JSON.stringify(snap, null, 1) + '\n');
console.log(`снимок wh-rules ${snap.source.dataVersion} (MFM ${snap.source.mfm}, ${snap.source.date}, ${snap.schema}, фракций ${Object.keys(snap.factions).length}), fingerprint ${snap.fingerprint.slice(0, 16)}… → ${path.relative(process.cwd(), out)}`);
