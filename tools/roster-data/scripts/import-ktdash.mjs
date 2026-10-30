// Kill Team (редакция 2024) из открытого репозитория ktdash-v4-public (prisma/seed-data.json) → backend/roster-data/kt.
// W2 30.10.2026, решение владельца: источник данных Kill Team — ktdash (лицензии в репозитории нет — записано в README).
// Запуск: node scripts/import-ktdash.mjs <путь к клону ktdash-v4-public> [--check]
// Тексты правил — как в источнике (Markdown: **жирный**, таблицы |…|, списки); идентификаторы ktdash сохраняются.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = process.argv[2];
if (!SRC || !fs.existsSync(path.join(SRC, 'prisma/seed-data.json'))) {
  console.error('Укажите путь к клону https://github.com/vjosset/ktdash-v4-public');
  process.exit(2);
}
const OUT = path.join(HERE, '../../../backend/roster-data/kt');
const REPORT = path.join(HERE, '../kt/import-report.json');
const d = JSON.parse(fs.readFileSync(path.join(SRC, 'prisma/seed-data.json'), 'utf8'));
const git = (...a) => execFileSync('git', ['-C', SRC, ...a], { encoding: 'utf8' }).trim();
const commit = git('log', '-1', '--format=%h');
const date = git('log', '-1', '--format=%cs');

const report = { errors: [], warnings: [], info: [] };
const num = (v) => (v === '' || v == null || v === 'None' ? null : Number(v));
const bool = (v) => v === true || v === 'True';
const str = (v) => (v == null || v === 'None' ? '' : String(v)).replace(/\r\n/g, '\n').trim();
const bySeq = (a, b) => num(a.seq) - num(b.seq);
const group = (list, key) => list.reduce((m, x) => m.set(x[key], [...(m.get(x[key]) ?? []), x]), new Map());

const WEP = { R: 'ranged', M: 'melee', E: 'equipment' };
const PLOY = { S: 'strategy', T: 'firefight', F: 'rule' };
const profilesBy = group(d.weaponprofiles, 'wepId');
const weaponsBy = group(d.weapons, 'opTypeId');
const abilitiesBy = group(d.abilities, 'opTypeId');
const optionsBy = group(d.options, 'opTypeId');
const opsBy = group(d.optypes, 'killteamId');
const equipBy = group(d.equipments, 'killteamId');
const ploysBy = group(d.ploys, 'killteamId');

const operative = (o) => {
  const weapons = (weaponsBy.get(o.opTypeId) ?? []).sort(bySeq).map((w) => {
    if (!WEP[w.wepType]) report.errors.push(`${o.opTypeId}: оружие ${w.wepId} — неизвестный тип ${w.wepType}`);
    const profiles = (profilesBy.get(w.wepId) ?? []).sort(bySeq).map((p) => ({
      name: str(p.profileName),
      atk: str(p.ATK),
      hit: str(p.HIT),
      dmg: str(p.DMG),
      rules: str(p.WR), // как в источнике: «Rng 6", Lethal 5+» или фраза правила
    }));
    if (!profiles.length) report.warnings.push(`${o.opTypeId}: у оружия «${w.wepName}» нет профиля`);
    return { id: w.wepId, name: str(w.wepName), type: WEP[w.wepType] ?? 'ranged', default: bool(w.isDefault), profiles };
  });
  const stats = { move: str(o.MOVE), apl: num(o.APL), save: str(o.SAVE), wounds: num(o.WOUNDS) };
  for (const [k, v] of Object.entries(stats)) if (v === '' || v == null || Number.isNaN(v)) report.errors.push(`${o.opTypeId}: нет характеристики ${k}`);
  return {
    id: o.opTypeId,
    name: str(o.opTypeName),
    keywords: str(o.keywords).split(/\s*,\s*/).filter(Boolean),
    stats,
    baseMm: num(o.basesize),
    weapons,
    abilities: (abilitiesBy.get(o.opTypeId) ?? []).map((a) => ({ id: a.abilityId, name: str(a.abilityName), text: str(a.description), ap: num(a.AP), factionRule: bool(a.isFactionRule) })),
    options: (optionsBy.get(o.opTypeId) ?? []).sort(bySeq).map((x) => ({ id: x.optionId, name: str(x.optionName), text: str(x.description), effects: str(x.effects) })),
  };
};

const teams = [];
const files = {};
for (const k of [...d.killteams].sort((a, b) => a.killteamName.localeCompare(b.killteamName))) {
  if (!bool(k.isPublished)) {
    report.info.push(`${k.killteamId}: не опубликована в ktdash — пропущена`);
    continue;
  }
  const ops = (opsBy.get(k.killteamId) ?? []).sort(bySeq).map(operative);
  if (!ops.length) report.errors.push(`${k.killteamId}: нет оперативников`);
  const ploys = (ploysBy.get(k.killteamId) ?? []).sort(bySeq).map((p) => {
    if (!PLOY[p.ployType]) report.errors.push(`${k.killteamId}: уловка ${p.ployId} — неизвестный тип ${p.ployType}`);
    return { id: p.ployId, type: PLOY[p.ployType] ?? 'rule', name: str(p.ployName), text: str(p.description), effects: str(p.effects) };
  });
  // SPEC — не команды для игры, а наборы миссий и неигровые оперативники (Ambull, Archivist, Titus, NPO, Nemesis)
  const special = k.factionId === 'SPEC';
  const warn = special ? report.info : report.warnings;
  const team = {
    system: 'kt',
    special,
    id: k.killteamId,
    factionId: k.factionId,
    name: str(k.killteamName),
    description: str(k.description),
    composition: str(k.composition),
    archetypes: str(k.archetypes).split('/').map((s) => s.trim()).filter(Boolean),
    operatives: ops,
    equipment: (equipBy.get(k.killteamId) ?? []).sort(bySeq).map((e) => ({ id: e.eqId, name: str(e.eqName), text: str(e.description), effects: str(e.effects) })),
    ploys,
  };
  if (!team.composition) warn.push(`${k.killteamId}: нет состава команды`);
  if (!team.equipment.length) warn.push(`${k.killteamId}: нет снаряжения команды`);
  if (!ploys.some((p) => p.type === 'strategy') || !ploys.some((p) => p.type === 'firefight')) warn.push(`${k.killteamId}: нет стратегических или боевых уловок`);
  files[k.killteamId] = team;
  teams.push({ id: team.id, factionId: team.factionId, name: team.name, group: null, special, archetypes: team.archetypes, operatives: ops.length });
}
// Группа команды внутри фракции ktdash (R1 30.10.2026) — по ключевым словам самих оперативников, без внешних списков:
// общие для всех оперативников команды ключевые слова, кроме слова самой команды и слова фракции ktdash
// (Kasrkin → ASTRA MILITARUM, Legionaries → HERETIC ASTARTES). Если таких несколько — то, что встречается у большего
// числа команд фракции (при равенстве — длиннее). Нет — group: null (в списке «Другие команды»).
const letters = (s) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/s/g, '');
const near = (a, b) => {
  const x = letters(a), y = letters(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i >= Math.min(x.length, y.length) - 2 && i >= 5;
};
const candidates = new Map();
for (const t of teams) {
  const ops = files[t.id].operatives;
  const common = ops.length ? ops[0].keywords.filter((k) => ops.every((o) => o.keywords.includes(k))) : [];
  const fName = d.factions.find((f) => f.factionId === t.factionId)?.factionName ?? '';
  candidates.set(t.id, common.filter((k) => !near(k, t.name) && !near(k, fName)));
}
const groupKey = (k) => letters(k);
const freq = new Map();
for (const t of teams) for (const k of candidates.get(t.id)) freq.set(`${t.factionId}|${groupKey(k)}`, (freq.get(`${t.factionId}|${groupKey(k)}`) ?? 0) + 1);
const title = (k) => k.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/'([A-Z])/g, (m, c) => "'" + c.toLowerCase());
// Команды без группового ключевого слова в данных ktdash — группа по меню команд Wahapedia (wahapedia.ru/kill-team3,
// тот же источник, что и список команд формы записи: backend/src/config/booking.ts → killTeamGroups). Только когда
// по ключевым словам группа не нашлась; иначе ключевые слова важнее.
const GROUP_FALLBACK = { 'IMP-TEMPAQ': 'Astra Militarum', 'IMP-INQ': 'Agents of the Imperium', 'IMP-ESS': 'Agents of the Imperium' };
const labelOf = new Map();
for (const t of teams) {
  const list = candidates.get(t.id).sort((a, b) => (freq.get(`${t.factionId}|${groupKey(b)}`) ?? 0) - (freq.get(`${t.factionId}|${groupKey(a)}`) ?? 0) || b.length - a.length);
  const k = list[0];
  if (!k) {
    t.group = GROUP_FALLBACK[t.id] ?? null;
    if (t.group) report.info.push(`${t.id}: группа «${t.group}» — по меню Wahapedia (в ключевых словах ktdash группы нет)`);
    continue;
  }
  // одна подпись на группу (GENESTEALER CULT / GENESTEALER CULTS → первая встреченная)
  const key = `${t.factionId}|${groupKey(k)}`;
  if (!labelOf.has(key)) labelOf.set(key, title(k));
  t.group = labelOf.get(key);
}
report.info.push(`группы команд по ключевым словам: ${teams.filter((t) => !t.special).map((t) => `${t.id}→${t.group ?? '—'}`).join(', ')}`);
const usedFactions = new Set(teams.map((t) => t.factionId));
const index = {
  system: 'kt',
  edition: 'Kill Team (2024)',
  source: {
    name: 'ktdash-v4-public (KTDash.app)',
    url: 'https://github.com/vjosset/ktdash-v4-public',
    file: 'prisma/seed-data.json',
    commit,
    date,
    license: 'в репозитории лицензии нет (решение владельца 30.10.2026 — использовать)',
  },
  factions: [...d.factions].sort(bySeq).filter((f) => usedFactions.has(f.factionId)).map((f) => ({ id: f.factionId, name: str(f.factionName) })),
  teams,
  weaponRules: d.weaponrules.map((r) => ({ code: str(r.code), name: str(r.ruleName), text: str(r.description) })),
};
report.info.push(`ktdash ${commit} (${date}): фракций ${index.factions.length}, команд ${teams.length}, оперативников ${teams.reduce((s, t) => s + t.operatives, 0)}`);
report.info.push('универсального снаряжения в источнике нет — только снаряжение команд');

const out = new Map([[path.join(OUT, 'index.json'), index], ...Object.entries(files).map(([id, t]) => [path.join(OUT, 't', `${id}.json`), t])]);
if (process.argv.includes('--check')) {
  const stale = [...out].filter(([f, v]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== JSON.stringify(v) + '\n').map(([f]) => path.basename(f));
  console.log(stale.length ? `устарело: ${stale.join(', ')}` : 'данные актуальны');
  process.exit(stale.length ? 1 : 0);
}
fs.mkdirSync(path.join(OUT, 't'), { recursive: true });
for (const f of fs.readdirSync(path.join(OUT, 't'))) if (!out.has(path.join(OUT, 't', f))) fs.rmSync(path.join(OUT, 't', f));
for (const [f, v] of out) fs.writeFileSync(f, JSON.stringify(v) + '\n');
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(`Kill Team: ${teams.length} команд, ktdash ${commit} (${date}); отчёт: ${report.errors.length} ошибок, ${report.warnings.length} предупреждений`);
