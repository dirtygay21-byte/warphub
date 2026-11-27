#!/usr/bin/env node
// Размеры баз бойцов Warcry (решение владельца 27.11.2026). В warcry_data размера базы нет, поэтому база берётся
// из варскролла AoS 4 с тем же названием модели (данные приложения backend/roster-data/aos — выгрузка Wahapedia).
// Сопоставление — только по названию и в том же великом альянсе:
//   exact  — название бойца = название варскролла;
//   base   — название без снаряжения («Killaboss with Stab-grot» → «Killaboss»);
//   plural — множественное число варскролла («Crypt Ghoul» → «Crypt Ghouls»): самое неуверенное, все — в отчёте.
// Не придумываем: разные размеры у одноимённых варскроллов или несколько подписанных частей («Killaboss: 40mm,
// Stab-grot: 25mm») без однозначной части для бойца — в отчёт, без базы. Без совпадения — «нет данных».
// Результат: tools/roster-data/warcry/bases.json (кураторский файл, его читает import-warcry.mjs) и bases-report.md.
// --apply дополнительно записывает base/baseFrom в backend/roster-data/warcry/f/*.json (без повторного импорта).
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DATA = path.join(HERE, '../../../backend/roster-data');
const OUT = path.join(HERE, '../warcry/bases.json');
const REPORT = path.join(HERE, '../warcry/bases-report.md');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const lc = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

const aosIndex = read(path.join(DATA, 'aos/index.json'));
/** название варскролла (lc) + альянс → [{ id, name, faction, bases }] */
const scrolls = new Map();
for (const file of fs.readdirSync(path.join(DATA, 'aos/f')).sort()) {
  const fac = read(path.join(DATA, 'aos/f', file));
  for (const w of fac.warscrolls) {
    const bases = (w.bases ?? '').trim();
    if (!bases || !/\d\s*mm/i.test(bases)) continue;
    const key = `${String(fac.grandAlliance).toLowerCase()}|${lc(w.name)}`;
    if (!scrolls.has(key)) scrolls.set(key, []);
    scrolls.get(key).push({ id: w.id, name: w.name, faction: fac.name, bases });
  }
}

const shortName = (n) => n.split(/ with | armed with | \(/i)[0].trim();
const plurals = (s) => [...new Set([s + 's', s + 'es', s.endsWith('y') ? s.slice(0, -1) + 'ies' : '', s.replace(/man$/, 'men'), s.replace(/f$/, 'ves')])].filter((x) => x && x !== s);

/** Подписанные части «Killaboss: 40mm, Stab-grot: 25mm»: берётся часть, чья подпись — ровно название бойца без снаряжения. */
function pickPart(bases, fighterName) {
  const parts = bases.split(/\s*,\s*(?=[^,:]+:)/).map((p) => p.match(/^([^:]+):\s*(.+)$/));
  if (parts.length === 1 && !parts[0]) return { base: bases };
  const own = lc(shortName(fighterName));
  const names = new Set([own, lc(fighterName), ...plurals(own)]);
  const label = (s) => lc(s).replace(/^\d+\s*[xх×]\s*/, '');
  const labelled = parts.filter(Boolean);
  const hits = labelled.filter((m) => names.has(label(m[1])));
  if (hits.length === 1) return { base: hits[0][2].trim() };
  // «40mm, Memorian: 25mm»: первая часть без подписи — сама модель, подписанные — спутники/жетоны
  if (!parts[0] && labelled.length === parts.length - 1) return { base: bases.match(/^[^,]*?\d[^,]*?mm/i)[0].trim(), note: `спутники/жетоны не учтены: «${bases}»` };
  // одна подпись или у всех частей одна база — выбирать нечего
  if (parts.every(Boolean) && new Set(parts.map((m) => m[2].trim())).size === 1) return { base: parts[0][2].trim() };
  return { problem: `несколько частей базы «${bases}»` };
}

const result = {};
const report = { plural: [], problems: [], notes: [], none: new Map() };
const stats = { exact: 0, base: 0, plural: 0, problem: 0, none: 0 };
const index = read(path.join(DATA, 'warcry/index.json'));
for (const ref of index.factions) {
  const fac = read(path.join(DATA, 'warcry/f', `${ref.id}.json`));
  const ga = String(fac.grandAlliance).toLowerCase();
  for (const f of fac.fighters) {
    const n = lc(f.name);
    const b = lc(shortName(f.name));
    let hit = null;
    for (const [match, names] of [['exact', [n]], ['base', [b]], ['plural', plurals(b)]]) {
      const found = names.map((x) => scrolls.get(`${ga}|${x}`)).find(Boolean);
      if (found) { hit = { match, list: found }; break; }
    }
    if (!hit) {
      stats.none++;
      if (!report.none.has(fac.name)) report.none.set(fac.name, []);
      report.none.get(fac.name).push(f.name);
      continue;
    }
    const values = [...new Set(hit.list.map((w) => w.bases))];
    let base = null;
    let problem = values.length > 1 ? `разные базы у варскроллов: ${hit.list.map((w) => `${w.name} (${w.faction}) — ${w.bases}`).join('; ')}` : null;
    if (!problem) {
      const p = pickPart(values[0], f.name);
      base = p.base ?? null;
      problem = p.problem ?? null;
      if (p.note) report.notes.push(`${fac.name} — ${f.name} → ${hit.list[0].name}: ${base} (${p.note})`);
    }
    const w = hit.list[0];
    if (problem) {
      stats.problem++;
      report.problems.push(`${fac.name} — ${f.name} → ${w.name}: ${problem}`);
      continue;
    }
    stats[hit.match]++;
    result[f.id] = { name: f.name, base, from: w.name, fromId: w.id, fromFaction: w.faction, match: hit.match };
    if (hit.match === 'plural') report.plural.push(`${fac.name} — ${f.name} → ${w.name} (${w.faction}): ${base}`);
  }
}

const total = Object.values(stats).reduce((s, x) => s + x, 0);
const out = {
  note: 'Размеры баз бойцов Warcry из варскроллов AoS 4 (сопоставление по названию, тот же альянс). Генерирует scripts/warcry-bases.mjs; правки — точечно с пояснением.',
  source: { name: 'Wahapedia AoS 4 (данные приложения backend/roster-data/aos)', lastUpdate: aosIndex.lastUpdate, decision: 'решение владельца 27.11.2026' },
  stats: { fighters: total, ...stats },
  fighters: result,
};
if (process.argv.includes('--check')) {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === JSON.stringify(out, null, 1) + '\n';
  console.log(same ? 'bases.json актуален' : 'bases.json устарел');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');

const md = [
  '# Warcry: размеры баз — отчёт сопоставления',
  '',
  `Источник: варскроллы AoS 4 (Wahapedia, выгрузка ${aosIndex.lastUpdate}), сопоставление по названию в том же альянсе. Генерирует \`scripts/warcry-bases.mjs\`.`,
  '',
  `Бойцов: ${total}. С базой: ${stats.exact + stats.base + stats.plural} (точно ${stats.exact}, без снаряжения ${stats.base}, мн. число ${stats.plural}). Неоднозначно: ${stats.problem}. Нет данных: ${stats.none}.`,
  '',
  `## Проверить: совпадение по множественному числу (${report.plural.length})`,
  '',
  ...report.plural.map((x) => `- ${x}`),
  '',
  `## Взята база самой модели (${report.notes.length})`,
  '',
  ...report.notes.map((x) => `- ${x}`),
  '',
  `## Неоднозначно — база не задана (${report.problems.length})`,
  '',
  ...report.problems.map((x) => `- ${x}`),
  '',
  `## Нет данных (${stats.none})`,
  '',
  ...[...report.none].map(([fac, list]) => `- **${fac}** (${list.length}): ${list.join(', ')}`),
  '',
].join('\n');
fs.writeFileSync(REPORT, md);

if (process.argv.includes('--apply')) {
  let changed = 0;
  for (const ref of index.factions) {
    const file = path.join(DATA, 'warcry/f', `${ref.id}.json`);
    const before = fs.readFileSync(file, 'utf8');
    const fac = JSON.parse(before);
    for (const f of fac.fighters) {
      delete f.base;
      delete f.baseFrom;
      const r = result[f.id];
      if (r) Object.assign(f, { base: r.base, baseFrom: r.from });
    }
    const after = JSON.stringify(fac) + '\n';
    if (after !== before) { fs.writeFileSync(file, after); changed++; }
  }
  console.log(`--apply: обновлено файлов фракций ${changed}`);
}
console.log(`Warcry базы: ${total} бойцов — точно ${stats.exact}, без снаряжения ${stats.base}, мн. число ${stats.plural}, неоднозначно ${stats.problem}, нет данных ${stats.none}`);
