// Регрессии аудита данных 40K (отчёт «Аудит данных Warhammer 40,000», W40-xx). Запуск: bun test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bandFor, computeRoster, costsFor, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { addUnit, newRoster } from '../../../client/src/features/roster/engine/roster';
import { applyPicks, optionsOf } from '../../../client/src/features/roster/engine/wargear';
import type { Datasheet, FactionData, Roster } from '../../../client/src/features/roster/engine/types';
// @ts-expect-error — .mjs без типов
import { parseCosts, parseDetachmentRules, parseLoadout, compositionRange } from '../scripts/import-wahapedia.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'backend', 'roster-data');
const CSV = path.join(import.meta.dirname, '..', 'wahapedia-csv');
const load = (id: string): FactionData => JSON.parse(fs.readFileSync(path.join(DATA, 'f', id + '.json'), 'utf8'));
const FILES = fs.readdirSync(path.join(DATA, 'f')).filter((f) => f.endsWith('.json'));
const ALL = FILES.map((f) => load(f.replace('.json', '')));
const own = (F: FactionData, name: string, source?: string) => {
  const d = F.datasheets.find((x) => x.name === name && x.group === 'own' && (!source || x.source === source));
  assert.ok(d, `${F.id}: нет инфолиста ${name}`);
  return d!;
};
const withDet = (F: FactionData, det: string): Roster => {
  // апостроф: у сайта (wh-rules 995) — прямой «'», в прежних данных — «’»
  const ap = (n: string) => n.replace(/[’']/g, "'");
  const d = F.detachments.find((x) => ap(x.name) === ap(det))!;
  assert.ok(d, `${F.id}: нет детачмента ${det}`);
  return { ...newRoster(F.id), detachmentIds: [d.id], forceDisposition: d.forceDisposition };
};
const copiesErrors = (r: Roster, F: FactionData) => computeRoster(r, makeLookup(F)).issues.filter((i) => i.code === 'copies');

// ---------- W40-02: Battleline из правил детачмента ----------

test('W40-02: строка «… units from your army gain/have the BATTLELINE keyword» даёт Battleline (и с маркером списка)', () => {
  const r = parseDetachmentRules(['TRAVELLING PLAYERS\n• Troupe units from your army gain the BATTLELINE keyword.', '• WAR DOG units from your army have the BATTLELINE keyword.'], new Set(['WAR DOG', 'TROUPE']), new Set());
  assert.deepEqual(r.battleline, ['TROUPE', 'WAR DOG']);
  // во всех детачментах всех фракций: такая строка в правилах → battleline не пустой
  for (const F of ALL)
    for (const d of F.detachments) {
      const text = d.abilities.map((a) => a.text).join('\n');
      if (/units? from your army (?:gain|have) the BATTLELINE keyword/i.test(text)) assert.ok(d.battleline.length, `${F.id} «${d.name}»: Battleline не разобран`);
    }
});

test('W40-02: 4 копии War Dog Karnivore в Houndpack Lance и Troupe в Ghosts of the Webway — законно (Battleline ×2)', () => {
  const QT = load('QT');
  let r = withDet(QT, 'Houndpack Lance');
  for (let i = 0; i < 4; i++) r = addUnit(r, own(QT, 'War Dog Karnivore'));
  assert.deepEqual(copiesErrors(r, QT), []);
  const AE = load('AE');
  for (const det of ['Ghosts of the Webway', 'Serpent’s Brood']) {
    let a = withDet(AE, det);
    for (let i = 0; i < 4; i++) a = addUnit(a, own(AE, 'Troupe'));
    assert.deepEqual(copiesErrors(a, AE), [], det);
  }
});

// ---------- W40-03: лимит копий по названию ----------

test('W40-03: одноимённые инфолисты (Space Marines и Black Templars) делят лимит копий', () => {
  // wh-rules.ru 981: Sternguard Veteran Squad у Black Templars — общий инфолист; одноимённая пара — Gladiator Lancer
  const SM = load('SM');
  const det = SM.detachments.find((d) => d.dp === 2 && !d.chapter)!;
  let r: Roster = { ...newRoster('SM'), detachmentIds: [det.id], forceDisposition: det.forceDisposition, chapter: 'Black Templars' };
  for (let i = 0; i < 3; i++) r = addUnit(r, own(SM, 'Gladiator Lancer', 'Space Marines'));
  assert.deepEqual(copiesErrors(r, SM), []);
  r = addUnit(r, own(SM, 'Gladiator Lancer', 'Black Templars'));
  const e = copiesErrors(r, SM);
  assert.equal(e.length, 1);
  assert.equal(e[0]!.unitUids!.length, 4);
  // ступени цены за копии тоже общие: 4-я копия (любой версии) — 4-я
  const cr = computeRoster(r, makeLookup(SM));
  assert.deepEqual(cr.units.map((c) => c.copy), [1, 2, 3, 4]);
});

// ---------- W40-01: цены орденов ----------

test('W40-01: все таблицы цен сохраняются; дубли таблиц убираются; первая — обычная цена', () => {
  const rows = (list: [string, string][]) => list.map(([description, cost], i) => ({ line: String(i + 1), description, cost }));
  const c = parseCosts(rows([
    ['YOUR 1ST TO 2ND UNITS COST', ''], ['YOUR 1ST TO 2ND UNITS COST', ''], ['3 models', '80'], ['3 models', '80'], ['6 models', '160'], ['6 models', '160'],
    ['YOUR 3RD + UNIT COSTS', ''], ['YOUR 3RD + UNIT COSTS', ''], ['3 models', '90'], ['6 models', '170'],
    ['YOUR 1ST TO 2ND UNITS COST', ''], ['3 models', '85'], ['6 models', '170'], ['YOUR 3RD + UNIT COSTS', ''], ['3 models', '95'], ['6 models', '180'],
    ['YOUR 1ST TO 2ND UNITS COST', ''], ['3 models', '80'], ['6 models', '160'], ['YOUR 3RD + UNIT COSTS', ''], ['3 models', '90'], ['6 models', '170'],
  ]));
  assert.deepEqual(c.default.map((b: { options: { cost: number }[] }) => b.options.map((o) => o.cost)), [[80, 160], [90, 170]]);
  assert.equal(c.variants.default.length, 1);
  assert.deepEqual(c.variants.default[0].map((b: { options: { cost: number }[] }) => b.options.map((o) => o.cost)), [[85, 170], [95, 180]]);
});

test('W40-01: цена берётся по ордену армии, если таблица ордена известна; без привязки — обычная', () => {
  const SM = load('SM');
  // wh-rules.ru 981: цены орденов — pointsOverrides снимка (Centurion Devastator Squad у 4 орденов)
  const cds = own(SM, 'Centurion Devastator Squad');
  assert.deepEqual(cds.costVariants!.map((v) => v.chapter), ['Black Templars', 'Blood Angels', 'Dark Angels', 'Space Wolves']);
  assert.equal(costsFor(cds, 'Blood Angels'), cds.costVariants![1]!.costs);
  assert.equal(costsFor(cds, 'Ultramarines'), cds.costs, 'орден без своей таблицы — обычная цена');
  const ai = own(SM, 'Assault Intercessor Squad');
  assert.equal(ai.costVariants, undefined, 'без таблицы ордена в источнике');
  assert.equal(costsFor(ai, 'Blood Angels'), ai.costs);
  // механизм: таблица ордена с другой ценой
  const other = ai.costs.map((b) => ({ ...b, options: b.options.map((o) => ({ ...o, cost: o.cost + 5 })) }));
  const mapped: Datasheet = { ...ai, costVariants: [{ chapter: 'Blood Angels', costs: other }] };
  const F: FactionData = { ...SM, datasheets: SM.datasheets.map((d) => (d.id === ai.id ? mapped : d)) };
  const L = makeLookup(F);
  const price = (chapter: string | null) => {
    let r: Roster = { ...newRoster('SM'), chapter };
    r = addUnit(r, mapped);
    return computeRoster(r, L).units[0]!.base;
  };
  assert.equal(price(null), ai.costs[0]!.options[0]!.cost);
  assert.equal(price('Blood Angels'), other[0]!.options[0]!.cost);
  assert.notEqual(price(null), price('Blood Angels'));
  assert.equal(bandFor(mapped, 1, 'Dark Angels'), bandFor(mapped, 1));
});

// ---------- W40-05: снаряжение по умолчанию ----------

test('W40-05: именное оружие («the Axe Mortalis», «Perdition» → Perdition Pistol) попадает в снаряжение по умолчанию', () => {
  const w = (...names: string[]) => names.map((name) => ({ name, profiles: [] }));
  assert.deepEqual(
    parseLoadout('This model is equipped with: Perdition; the Axe Mortalis.', w('Perdition Pistol', 'The Axe Mortalis'))[0].items.map((i: { weapon: string }) => i.weapon),
    ['Perdition Pistol', 'The Axe Mortalis'],
  );
  // сокращение не угадывается, если подходит несколько видов оружия
  assert.equal(parseLoadout('This model is equipped with: bolt.', w('Bolt pistol', 'Bolt rifle')).length, 0);
  const has = (F: FactionData, n: string) => assert.ok(own(F, n).defaultLoadout.length, `${F.id} ${n}`);
  const SM = load('SM');
  has(SM, 'Commander Dante');
  has(SM, 'Astorath');
  has(load('AE'), 'Avatar of Khaine');
  has(load('CD'), 'Skulltaker');
  // у каждого инфолиста с оружием и строкой «equipped with: …» (не «nothing») снаряжение разобрано
  for (const F of ALL)
    for (const d of F.datasheets.filter((x) => x.group === 'own'))
      if (d.weapons.length && /equipped with:(?!\s*nothing)/i.test(d.loadout)) assert.ok(d.defaultLoadout.length, `${F.id} «${d.name}»: ${d.loadout.slice(0, 60)}`);
});

// ---------- W40-06, W40-08, W40-13, W40-20: импорт ----------

test('W40-06: фракция без детачментов не показывается как армия; её юниты остаются союзниками', () => {
  const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
  assert.ok(index.factions.every((f: { detachments: number }) => f.detachments > 0));
  assert.ok(!index.factions.some((f: { id: string }) => f.id === 'TL'));
  assert.ok(load('SM').datasheets.some((d) => d.group === 'ally:titanicus'), 'Titanic Support у Space Marines');
});

test('W40-08: стратагемы правил армии Aeldari есть в данных фракции', () => {
  const AE = load('AE');
  const army = AE.stratagems.filter((s) => s.army);
  assert.deepEqual(army.map((s) => s.name).sort(), ['FADE BACK', 'FLITTING SHADOWS', 'OPPORTUNITY SEIZED', 'STAR ENGINES', 'SUDDEN STRIKE', 'SWIFT AS THE WIND']);
  assert.ok(army.every((s) => s.detachment === '' && s.text.length > 20));
});

test('W40-13, W40-20: нет оружия без названия; заглушка схемы помечена как неполный текст', () => {
  for (const F of ALL) for (const d of F.datasheets) for (const w of d.weapons) assert.ok(w.name.trim(), `${F.id} «${d.name}»: оружие без названия`);
  // wh-rules.ru 981 даёт полный текст Drop Pod (в выгрузке Wahapedia была заглушка схемы): пометки «неполный» нет
  const pod = own(load('SM'), 'Drop Pod');
  assert.ok(pod.abilities.every((a) => !a.incomplete));
  assert.ok(pod.abilities.find((a) => a.name === 'Drop Pod Assault')!.text.length > 100);
  for (const F of ALL) for (const d of F.datasheets) for (const a of d.abilities) assert.ok(!/\$\d{6,}/.test(a.text), `${d.name}: заглушка в тексте`);
});

test('W40-04: состав отряда разбирается; размеры из цен вне состава попадают в отчёт импорта', () => {
  assert.deepEqual(compositionRange(['1 Biker Sergeant', '2-5 Space Marine Bikers', '0-1 Attack Bike']), { lo: 3, hi: 7 });
  assert.deepEqual(compositionRange(['1 Master of Ordnance, 1 Officer of the Fleet and 1 Astropath.']), { lo: 3, hi: 3 });
  assert.equal(compositionRange(['One of the following:', '10 Grenadiers']), null);
  const report = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '40k', 'import-report.json'), 'utf8'));
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.some((w: string) => w.includes('Bike Squad') && w.includes('вне состава')));
  assert.ok(report.warnings.some((w: string) => w.includes('Shadow Spectres') && w.includes('вне состава')));
});

// ---------- W40-09: варианты снаряжения ----------

test('W40-09: «two different weapons from the following list» — пары разных пунктов по сноске', () => {
  const SM = load('SM');
  const sgt = optionsOf(own(SM, 'Tactical Squad')).parsed.find((o) => o.pairs)!;
  assert.ok(sgt, 'вариант сержанта разобран');
  const ds = own(SM, 'Tactical Squad');
  const ranged = (w: string) => ds.weapons.find((x) => x.name === w)?.profiles.some((p) => p.type === 'Ranged');
  const pistol = (w: string) => ds.weapons.find((x) => x.name === w)?.profiles.some((p) => /pistol/i.test(p.keywords));
  assert.equal(sgt.choices[0]!.map((i) => i.weapon).join(), 'Twin lightning claws');
  for (const c of sgt.choices.slice(1)) {
    assert.equal(c.length, 2);
    assert.notEqual(c[0]!.weapon, c[1]!.weapon);
    const r = c.filter((i) => ranged(i.weapon));
    if (r.length === 2) assert.equal(r.filter((i) => pistol(i.weapon)).length, 1, c.map((i) => i.weapon).join(' + '));
  }
  // Wolf Guard Pack Leader in Terminator Armour: два дальнобойных — только cyclone + storm bolter / combi-weapon
  const term = optionsOf(own(SM, 'Wolf Guard Pack Leader in Terminator Armour')).parsed.find((o) => o.pairs)!;
  const names = term.choices.map((c) => c.map((i) => i.weapon).join(' + '));
  assert.ok(names.some((n) => n.startsWith('Cyclone missile launcher + Storm bolter + ')), 'cyclone+storm bolter с оружием ближнего боя');
  assert.ok(!names.includes('Assault cannon + Heavy flamer'));
  // взятая пара снимает оба предмета и даёт оба новых
  const base = { 'Bolt pistol': 1, Boltgun: 1 };
  const ci = sgt.choices.findIndex((c) => c.map((i) => i.weapon).join() === 'Astartes chainsword,Plasma pistol');
  assert.ok(ci > 0);
  const res = applyPicks(ds, base, { [sgt.key]: sgt.choices.map((_, i) => (i === ci ? 1 : 0)) }, 1);
  assert.deepEqual(res.problems, []);
  assert.deepEqual(res.loadout, { 'Astartes chainsword': 1, 'Plasma pistol': 1 });
});

test('W40-09: War Walkers меняют каждую пушку; Chaos Bikers — общий лимит двух вариантов; опечатка Tarantula', () => {
  const AE = load('AE');
  const ww = own(AE, 'War Walkers');
  const o = optionsOf(ww).parsed[0]!;
  assert.equal(o.perModel, 2);
  const lance = o.choices.findIndex((c) => c[0]!.weapon === 'Bright lance');
  const res = applyPicks(ww, { 'Shuriken cannon': 2, 'War Walker feet': 1 }, { [o.key]: o.choices.map((_, i) => (i === lance ? 2 : 0)) }, 1);
  assert.deepEqual(res.problems, []);
  assert.equal(res.loadout['Bright lance'], 2);
  const bikers = optionsOf(own(load('CSM'), 'Chaos Bikers')).parsed.filter((x) => x.share);
  assert.equal(bikers.length, 2);
  assert.equal(bikers[0]!.share, bikers[1]!.share);
  assert.equal(optionsOf(own(load('SM'), 'Tarantula Sentry Battery')).unparsed.length, 0);
  // не разобран остаётся только Cadian Recon Squad («form a weapons team»)
  const left = ALL.flatMap((F) => F.datasheets.filter((d) => d.group === 'own').flatMap((d) => optionsOf(d).unparsed.map(() => `${F.id} ${d.name}`)));
  assert.deepEqual(left, ['AM Cadian Recon Squad']);
});

// ---------- W40-19: данные = свежий импорт ----------

test('W40-19: повторный импорт выгрузки не меняет данные приложения', { skip: !fs.existsSync(path.join(CSV, 'Datasheets.csv')) && 'нет CSV выгрузки (tools/roster-data/wahapedia-csv)' }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'w40k-'));
  const report = path.join(import.meta.dirname, '..', '40k', 'import-report.json');
  const before = fs.readFileSync(report, 'utf8');
  try {
    execFileSync(process.execPath.endsWith('bun') ? 'node' : process.execPath, [path.join(import.meta.dirname, '..', 'scripts', 'import-wahapedia.mjs'), '--src', CSV, '--out', out], { stdio: 'pipe' });
    for (const f of FILES) assert.equal(fs.readFileSync(path.join(out, 'f', f), 'utf8'), fs.readFileSync(path.join(DATA, 'f', f), 'utf8'), `${f}: нужен переимпорт`);
    const a = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8'));
    const b = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
    delete a.generatedAt;
    delete b.generatedAt;
    assert.deepEqual(a, b);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
    fs.writeFileSync(report, before);
  }
});
