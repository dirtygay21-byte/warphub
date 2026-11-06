#!/usr/bin/env node
/**
 * Перевод WarpHub — команды (логика — ru-warphub-lib.mjs; описание и формат — там же).
 *   node scripts/ru-warphub.mjs --gaps [ID…]   — английские исходники того, чего нет по-русски → 40k/ru-warphub/_source/<ID>.json;
 *   node scripts/ru-warphub.mjs --prefill [ID…] — из памяти переводов wh-rules.ru (тот же английский текст у других
 *                                               инфолистов/фракций) — в 40k/ru-warphub/<ID>.json с пометкой by: "wh-rules";
 *   node scripts/ru-warphub.mjs --check [ID…]  — проверка переводов 40k/ru-warphub/<ID>.json.
 * Применение — node scripts/whrules-ru.mjs --apply.
 */
import fs from 'node:fs';
import path from 'node:path';
import { latestRuSnapshot, matchFaction } from './whrules-ru.mjs';
import { buildMemory, checkTranslation, collectGaps, DATA, forEachEntry, readTranslation, recall, WARPHUB_DIR } from './ru-warphub-lib.mjs';

// ---------------------------------------------------------------- команды

function main() {
  const [cmd, ...ids] = process.argv.slice(2);
  const { snap } = latestRuSnapshot();
  const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
  const list = index.factions.filter((f) => !ids.length || ids.includes(f.id));
  if (cmd === '--gaps') {
    const dir = path.join(WARPHUB_DIR, '_source');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of list) {
      const faction = JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${f.id}.json`), 'utf8'));
      const gaps = collectGaps(faction, matchFaction(snap, faction).ru);
      let n = 0;
      let words = 0;
      forEachEntry(gaps, (_w, x) => {
        n++;
        words += `${x.source.name ?? ''} ${x.source.text ?? (x.source.items ?? []).join(' ')}`.split(/\s+/).filter(Boolean).length;
      });
      fs.writeFileSync(path.join(dir, `${f.id}.json`), JSON.stringify({ schema: 'warphub-ru-translation/1', faction: f.id, name: f.name, ...gaps }, null, 1) + '\n');
      console.log(`${f.id.padEnd(4)} ${f.name.padEnd(26)} текстов ${String(n).padStart(4)}, слов ${words}`);
    }
  } else if (cmd === '--prefill') {
    const all = index.factions.map((f) => {
      const faction = JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${f.id}.json`), 'utf8'));
      return { f, faction, ru: matchFaction(snap, faction).ru };
    });
    const tm = buildMemory(all);
    fs.mkdirSync(WARPHUB_DIR, { recursive: true });
    for (const { f, faction, ru } of all.filter((x) => list.includes(x.f))) {
      const gaps = collectGaps(faction, ru);
      const t = readTranslation(f.id) ?? { schema: 'warphub-ru-translation/1', faction: f.id, name: f.name };
      let n = 0;
      const put = (obj, key, gap) => {
        if (obj[key]) return; // уже переведено — не трогать
        const hit = recall(tm, gap.source);
        if (!hit) return;
        obj[key] = { en: gap.en, ...hit, by: 'wh-rules' };
        n++;
      };
      for (const [id, gap] of Object.entries(gaps.rules)) put((t.rules ??= {}), id, gap);
      for (const [dsId, d] of Object.entries(gaps.datasheets))
        for (const [name, gap] of Object.entries(d.abilities ?? {})) put((((t.datasheets ??= {})[dsId] ??= { name: d.name }).abilities ??= {}), name, gap);
      for (const [detId, d] of Object.entries(gaps.detachments))
        for (const [aid, gap] of Object.entries(d.rules ?? {})) put((((t.detachments ??= {})[detId] ??= { detachment: d.detachment }).rules ??= {}), aid, gap);
      for (const k of ['stratagems', 'enhancements']) for (const [id, gap] of Object.entries(gaps[k])) put((t[k] ??= {}), id, gap);
      // пустые разделы не храним
      for (const [dsId, d] of Object.entries(t.datasheets ?? {})) if (!d.abilities || !Object.keys(d.abilities).length) if (Object.keys(d).length <= 1) delete t.datasheets[dsId];
      if (n) fs.writeFileSync(path.join(WARPHUB_DIR, `${f.id}.json`), JSON.stringify(t, null, 1) + '\n');
      console.log(`${f.id.padEnd(4)} из памяти wh-rules: ${n}`);
    }
  } else if (cmd === '--check') {
    let bad = 0;
    for (const f of list) {
      const t = readTranslation(f.id);
      if (!t) continue;
      const faction = JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${f.id}.json`), 'utf8'));
      const res = checkTranslation(faction, matchFaction(snap, faction).ru, t);
      bad += res.length;
      console.log(`${f.id}: ${res.length ? `${res.length} замечаний` : 'порядок'}`);
      for (const r of res) console.log(`  ${r.where}: ${r.problems.join('; ')}`);
    }
    process.exitCode = bad ? 1 : 0;
  } else console.log('usage: node scripts/ru-warphub.mjs --gaps [ID…] | --check [ID…]');
}
if (import.meta.main) main();
