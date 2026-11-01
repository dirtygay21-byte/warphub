#!/usr/bin/env node
/**
 * Глоссарий правил 40K из wh-rules.ru для всплывающих подсказок карточек юнитов (01.11.2026).
 *
 *   node scripts/whrules-glossary.mjs --save <файл>  — проверить снимок (scripts/whrules-extract-glossary.js: JSON или
 *                                                     gzip+base64) по fingerprint и сохранить 40k/whrules-<версия>-glossary.json;
 *   node scripts/whrules-glossary.mjs --build        — из последнего снимка собрать backend/roster-data/glossary.json.
 *
 * Файл приложения (схема warphub-glossary/1) — только русский текст (как показывает wh-rules.ru), английский остаётся в снимке:
 *   abilities — раздел 24 основных правил по ключу (имя без скобок, ВЕРХНИЙ РЕГИСТР): num, name, type (weapon | unit), text, example;
 *   weapon    — особые способности оружия фракций по ключу: варианты текста (у некоторых их несколько);
 *   terms     — термины правил по id: term (англ. название), text; в текстах ссылки вида [gloss:id:текст] и **жирный**.
 * Ничего не дописывается вручную: всё — из снимка; источник, версия и fingerprint — в поле source.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, '40k');
const OUT = path.resolve(ROOT, '..', '..', 'backend', 'roster-data', 'glossary.json');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Ключ способности: «[RAPID FIRE]» → «RAPID FIRE», «Deep Strike» → «DEEP STRIKE». */
export const abilityKey = (name) => name.replace(/^\[|\]$/g, '').trim().toUpperCase();

function readSnapshot(file) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  const text = raw.startsWith('{') ? raw : zlib.gunzipSync(Buffer.from(raw, 'base64')).toString('utf8');
  const r = JSON.parse(text);
  if (r.schema !== 'whrules-glossary/1') throw new Error(`глоссарий: схема ${r.schema}`);
  const { fingerprint, ...content } = r;
  if (sha256(JSON.stringify(content)) !== fingerprint) throw new Error('глоссарий: fingerprint не совпадает');
  return r;
}

function latestSnapshot() {
  const files = fs.readdirSync(DIR).filter((f) => /^whrules-\d+-glossary\.json$/.test(f));
  if (!files.length) throw new Error('нет снимка 40k/whrules-<версия>-glossary.json — сначала --save');
  const file = files.sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1])).at(-1);
  return { file, snap: readSnapshot(path.join(DIR, file)) };
}

export function buildGlossary(snap, file) {
  const abilities = {};
  for (const a of snap.coreAbilities) {
    const key = abilityKey(a.name);
    if (abilities[key]) throw new Error(`глоссарий: способность ${key} дважды`);
    abilities[key] = { num: a.num || null, name: a.name, type: a.type, text: a.ru.fullText, ...(a.ru.example ? { example: a.ru.example } : {}) };
  }
  const weapon = {};
  for (const [name, variants] of Object.entries(snap.weaponAbilities)) {
    const key = abilityKey(name);
    if (abilities[key]) continue; // уже есть в разделе 24
    weapon[key] = variants.map((v) => v.ru);
  }
  // термины без текста на wh-rules (Other, You) не берутся: ссылки на них показываются обычным текстом
  const terms = Object.fromEntries(Object.entries(snap.glossary).filter(([, g]) => g.ru).map(([id, g]) => [id, { term: g.term, text: g.ru }]));
  return {
    schema: 'warphub-glossary/1',
    source: { ...snap.source, snapshot: `tools/roster-data/40k/${file}`, fingerprint: snap.fingerprint, language: 'ru' },
    abilities,
    weapon,
    terms,
  };
}

const args = process.argv.slice(2);
if (args[0] === '--save') {
  const r = readSnapshot(args[1]);
  const out = path.join(DIR, `whrules-${r.source.dataVersion}-glossary.json`);
  fs.writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
  console.log(
    `глоссарий wh-rules ${r.source.dataVersion} (MFM ${r.source.mfm}, ${r.source.date}): способностей ${r.coreAbilities.length}, терминов ${Object.keys(r.glossary).length}, оружия фракций ${Object.keys(r.weaponAbilities).length}; fingerprint ${r.fingerprint.slice(0, 16)}… → ${path.relative(process.cwd(), out)}`,
  );
} else if (args[0] === '--build') {
  const { file, snap } = latestSnapshot();
  const g = buildGlossary(snap, file);
  fs.writeFileSync(OUT, JSON.stringify(g) + '\n');
  console.log(`glossary.json: способностей ${Object.keys(g.abilities).length}, оружия фракций ${Object.keys(g.weapon).length}, терминов ${Object.keys(g.terms).length} (из ${file}) → ${path.relative(process.cwd(), OUT)}`);
} else if (import.meta.main) {
  console.log('usage: node scripts/whrules-glossary.mjs --save <файл> | --build');
}
