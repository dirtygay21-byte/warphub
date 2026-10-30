// Warcry из открытого репозитория krisling049/warcry_data (data/<альянс>/<варбанда>/*.json) → backend/roster-data/warcry.
// W4 30.10.2026, решение владельца: источник данных Warcry — warcry_data (лицензии в репозитории нет — записано в README).
// Запуск: node scripts/import-warcry.mjs <путь к клону warcry_data> [--check]
// Тексты правил — как в источнике (английский); идентификаторы warcry_data (_id) сохраняются.
// Папки альянсов (chaos/chaos, death/death…) — общие союзники, траллы и монстры альянса: generic: true.
// Способности подфракций (bladeborn) в источнике лежат с warband = рунмарка подфракции; здесь — в файле родительской фракции с полем subfaction.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = process.argv[2];
if (!SRC || !fs.existsSync(path.join(SRC, 'data/universal/universal_abilities.json'))) {
  console.error('Укажите путь к клону https://github.com/krisling049/warcry_data');
  process.exit(2);
}
const OUT = path.join(HERE, '../../../backend/roster-data/warcry');
const REPORT = path.join(HERE, '../warcry/import-report.json');
const git = (...a) => execFileSync('git', ['-C', SRC, ...a], { encoding: 'utf8' }).trim();
const commit = git('log', '-1', '--format=%h');
const date = git('log', '-1', '--format=%cs');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const str = (v) => (v == null ? '' : String(v)).replace(/\r\n/g, '\n').trim();

const report = { errors: [], warnings: [], info: [] };
const ALLIANCES = ['chaos', 'death', 'destruction', 'order'];
const COSTS = new Set(['battletrait', 'passive', 'reaction', 'double', 'triple', 'quad']);
const seenIds = new Set();
const uniq = (id, where) => {
  if (!/^[0-9a-z]{8}$/.test(id)) report.errors.push(`${where}: неверный _id ${id}`);
  if (seenIds.has(id)) report.errors.push(`${where}: повтор _id ${id}`);
  seenIds.add(id);
};

const ability = (a, where, subfaction) => {
  uniq(a._id, where);
  if (!COSTS.has(a.cost)) report.errors.push(`${where}: способность ${a._id} — неизвестная стоимость ${a.cost}`);
  if (!str(a.description)) report.errors.push(`${where}: способность ${a._id} без текста`);
  const r = { id: a._id, name: str(a.name), cost: a.cost, text: str(a.description), runemarks: a.runemarks ?? [] };
  if (subfaction) r.subfaction = subfaction;
  if (a.monster) r.monster = str(a.monster);
  return r;
};

const fighter = (f, where, subs) => {
  uniq(f._id, where);
  for (const k of ['movement', 'toughness', 'wounds']) if (!(Number.isInteger(f[k]) && f[k] > 0)) report.errors.push(`${where}: ${f._id} — ${k}=${f[k]}`);
  // 0 очков бывает у бойцов, которые появляются по ходу боя (Brimstone Horrors) — сохраняется как в источнике
  if (!(Number.isInteger(f.points) && f.points >= 0)) report.errors.push(`${where}: ${f._id} — points=${f.points}`);
  else if (f.points === 0) report.info.push(`${where}: ${f._id} «${f.name}» — 0 очков в источнике`);
  if (f.subfaction && !subs.has(f.subfaction)) report.errors.push(`${where}: ${f._id} — подфракция «${f.subfaction}» не описана в faction.json`);
  if (!f.weapons?.length) report.warnings.push(`${where}: ${f._id} «${f.name}» без оружия`);
  return {
    id: f._id,
    name: str(f.name),
    subfaction: str(f.subfaction),
    movement: f.movement,
    toughness: f.toughness,
    wounds: f.wounds,
    points: f.points,
    runemarks: f.runemarks ?? [],
    weapons: (f.weapons ?? []).map((w) => {
      for (const k of ['attacks', 'strength', 'dmg_hit', 'dmg_crit', 'max_range', 'min_range']) if (!Number.isInteger(w[k])) report.errors.push(`${where}: ${f._id} — оружие ${k}=${w[k]}`);
      return { runemark: str(w.runemark), minRange: w.min_range, maxRange: w.max_range, attacks: w.attacks, strength: w.strength, dmgHit: w.dmg_hit, dmgCrit: w.dmg_crit };
    }),
  };
};

const files = {};
const bySubfaction = new Map(); // рунмарка подфракции → id фракции
for (const ga of ALLIANCES) {
  for (const dir of fs.readdirSync(path.join(SRC, 'data', ga)).sort()) {
    const base = path.join(SRC, 'data', ga, dir);
    const fac = read(path.join(base, `${dir}_faction.json`));
    const id = dir.replace(/_/g, '-');
    if (fac.grand_alliance !== ga) report.errors.push(`${id}: альянс ${fac.grand_alliance} ≠ папка ${ga}`);
    const subs = new Set((fac.subfactions ?? []).map((s) => s.runemark));
    for (const s of subs) bySubfaction.set(s, id);
    const fighters = read(path.join(base, `${dir}_fighters.json`));
    for (const f of fighters) if (f.warband !== fac.warband) report.errors.push(`${id}: боец ${f._id} — warband «${f.warband}»`);
    files[id] = {
      system: 'warcry',
      id,
      name: str(fac.warband),
      grandAlliance: ga,
      generic: fac.warband === ga,
      bladeborn: !!fac.bladeborn,
      heroesAll: !!fac.heroes_all,
      singleton: !!fac.singleton,
      subfactions: (fac.subfactions ?? []).map((s) => ({ name: str(s.runemark), bladeborn: !!s.bladeborn, heroesAll: !!s.heroes_all, singleton: !!s.singleton })),
      fighters: fighters.map((f) => fighter(f, id, subs)),
      abilities: [],
      _abilitiesFile: path.join(base, `${dir}_abilities.json`),
    };
  }
}
const byWarband = new Map(Object.values(files).map((f) => [f.name, f.id]));
// способности: файл фракции может содержать и способности её подфракций; привязка — по warband
for (const f of Object.values(files)) {
  const list = fs.existsSync(f._abilitiesFile) ? read(f._abilitiesFile) : [];
  if (!list.length) report.warnings.push(`${f.id}: нет способностей`);
  for (const a of list) {
    const owner = byWarband.get(a.warband) ?? bySubfaction.get(a.warband);
    if (!owner) {
      report.errors.push(`${f.id}: способность ${a._id} — неизвестный warband «${a.warband}»`);
      continue;
    }
    if (owner !== f.id) report.warnings.push(`${f.id}: способность ${a._id} относится к ${owner} — перенесена`);
    files[owner].abilities.push(ability(a, owner, byWarband.has(a.warband) ? undefined : a.warband));
  }
  delete f._abilitiesFile;
}
for (const f of Object.values(files)) {
  if (!f.generic && !f.abilities.some((a) => a.cost === 'battletrait' && !a.subfaction)) report.info.push(`${f.id}: нет боевых черт (battletrait) фракции`);
  for (const s of f.subfactions) {
    if (!f.fighters.some((x) => x.subfaction === s.name)) report.warnings.push(`${f.id}: у подфракции «${s.name}» нет бойцов`);
  }
  // рунмарки способностей, которых нет ни у одного бойца фракции (возможны для союзников/монстров — только информация)
  const marks = new Set(f.fighters.flatMap((x) => x.runemarks));
  const missing = [...new Set(f.abilities.filter((a) => !a.monster).flatMap((a) => a.runemarks))].filter((r) => !marks.has(r));
  if (missing.length) report.info.push(`${f.id}: рунмарки способностей без бойцов: ${missing.join(', ')}`);
}

const universal = read(path.join(SRC, 'data/universal/universal_abilities.json')).map((a) => ability(a, 'universal'));
const factions = Object.values(files).sort((a, b) => a.grandAlliance.localeCompare(b.grandAlliance) || Number(b.generic) - Number(a.generic) || a.name.localeCompare(b.name));
const index = {
  system: 'warcry',
  edition: 'Warcry (Matched Play, данные warcry_data)',
  source: {
    name: 'warcry_data (krisling049)',
    url: 'https://github.com/krisling049/warcry_data',
    folder: 'data/',
    commit,
    date,
    license: 'в репозитории лицензии нет (решение владельца 30.10.2026 — использовать)',
  },
  grandAlliances: ALLIANCES,
  factions: factions.map((f) => ({
    id: f.id,
    name: f.name,
    grandAlliance: f.grandAlliance,
    generic: f.generic,
    subfactions: f.subfactions.map((s) => s.name),
    fighters: f.fighters.length,
  })),
  universal,
};
const nF = factions.reduce((s, f) => s + f.fighters.length, 0);
const nA = factions.reduce((s, f) => s + f.abilities.length, 0) + universal.length;
report.info.unshift(`warcry_data ${commit} (${date}): фракций ${factions.filter((f) => !f.generic).length} + ${factions.filter((f) => f.generic).length} общих альянса, бойцов ${nF}, способностей ${nA} (универсальных ${universal.length})`);

const out = new Map([[path.join(OUT, 'index.json'), index], ...factions.map((f) => [path.join(OUT, 'f', `${f.id}.json`), f])]);
if (process.argv.includes('--check')) {
  const stale = [...out].filter(([f, v]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== JSON.stringify(v) + '\n').map(([f]) => path.basename(f));
  console.log(stale.length ? `устарело: ${stale.join(', ')}` : 'данные актуальны');
  process.exit(stale.length ? 1 : 0);
}
fs.mkdirSync(path.join(OUT, 'f'), { recursive: true });
for (const f of fs.readdirSync(path.join(OUT, 'f'))) if (!out.has(path.join(OUT, 'f', f))) fs.rmSync(path.join(OUT, 'f', f));
for (const [f, v] of out) fs.writeFileSync(f, JSON.stringify(v) + '\n');
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(`Warcry: ${factions.length} фракций, ${nF} бойцов, warcry_data ${commit} (${date}); отчёт: ${report.errors.length} ошибок, ${report.warnings.length} предупреждений`);
