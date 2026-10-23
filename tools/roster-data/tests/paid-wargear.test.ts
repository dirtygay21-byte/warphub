// P1-T5: платное снаряжение — как в конструкторе ростеров wh-rules.ru (снимок 40k/whrules-995-roster.json): платится каждая
// штука итогового снаряжения на каждой копии юнита; стандартные штуки — только у инфолистов с paidDefaults (на сайте dw);
// ручной счётчик — только для предметов, которых снаряжение не видит. Запуск: bun test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup, optionalWargear, paidIsAuto, type ComputedUnit } from '../../../client/src/features/roster/engine/compute';
import { addUnit, newRoster, updateUnit } from '../../../client/src/features/roster/engine/roster';
import { exportGw } from '../../../client/src/features/roster/engine/export';
import { optionsOf, type ParsedOption } from '../../../client/src/features/roster/engine/wargear';
import type { Datasheet, FactionData, Roster, RosterUnit } from '../../../client/src/features/roster/engine/types';
// @ts-expect-error — .mjs без типов
import { loadSnapshot } from '../scripts/updates-40k.mjs';
// @ts-expect-error — .mjs без типов
import { ARMIES, compareArmy, wargearKey } from '../scripts/whrules-compare.mjs';
// @ts-expect-error — .mjs без типов
import { loadRoster } from '../scripts/whrules-wargear.mjs';

const dataDir = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'f');
const load = (id: string): FactionData => JSON.parse(fs.readFileSync(path.join(dataDir, id + '.json'), 'utf8'));
const F: Record<string, FactionData> = {};
const fac = (id: string) => (F[id] ??= load(id));
const sheet = (f: string, name: string, source?: string): Datasheet => {
  const d = fac(f).datasheets.find((x) => x.name === name && x.group === 'own' && (!source || x.source === source));
  assert.ok(d, `нет инфолиста ${name}`);
  return d!;
};
const opt = (ds: Datasheet, to: string): ParsedOption => {
  const o = optionsOf(ds).parsed.find((x) => x.choices.some((c) => c.map((i) => i.weapon).join('+') === to));
  assert.ok(o, `нет варианта → ${to} у ${ds.name}`);
  return o!;
};
const pick = (o: ParsedOption, to: string, n: number) => ({ [o.key]: o.choices.map((c) => (c.map((i) => i.weapon).join('+') === to ? n : 0)) });
const priceOf = (ds: Datasheet, label: string) => ds.costs[0]!.wargear.find((w) => w.label === label)!.cost;

/** Ростер из copies копий инфолиста; patch — для последней копии. */
function build(f: string, ds: Datasheet, patch: Partial<RosterUnit> = {}, copies = 1) {
  const L = makeLookup(fac(f));
  let r: Roster = newRoster(f);
  for (let i = 0; i < copies; i++) r = addUnit(r, ds);
  r = updateUnit(r, r.units[copies - 1]!.uid, patch);
  const cr = computeRoster(r, L);
  return { r, L, cr, first: cr.units[0]!, last: cr.units[copies - 1]! };
}
const extra = (c: ComputedUnit) => c.extras;

test('снаряжение платится на каждой копии: Leman Russ 160 + 5 (1-я), 175 + 5 (3-я); лазпушка снята — без доплаты', () => {
  const ds = sheet('AM', 'Leman Russ Battle Tank');
  assert.equal(ds.paidDefaults, true);
  const a = build('AM', ds, {}, 3);
  assert.deepEqual([a.first.total, a.last.total], [165, 180]);
  const b = build('AM', ds, { picks: pick(opt(ds, 'Heavy bolter'), 'Heavy bolter', 1) });
  assert.equal(b.last.paidAuto['Lascannon'], 0);
  assert.equal(b.last.total, 160);
  assert.deepEqual(b.last.loadoutInfo.problems, []);
  // пара multi-melta: +2 × 5
  const c = build('AM', ds, { picks: pick(opt(ds, 'Multi-melta'), 'Multi-melta', 1) });
  assert.equal(extra(c.last), 5 + 10);
});

test('Ravager: 3 dark lance — 110 + 15; две заменены на disintegrator — 110 + 5', () => {
  const ds = sheet('DRU', 'Ravager');
  assert.equal(build('DRU', ds).last.total, 125);
  assert.equal(build('DRU', ds, { picks: pick(opt(ds, 'Disintegrator cannon'), 'Disintegrator cannon', 2) }).last.total, 115);
});

test('Shield-Captain: Praesidium Shield в стандартном снаряжении (+25 на каждой копии); Castellan Axe снимает щит и доплату', () => {
  const ds = sheet('AC', 'Shield-Captain');
  const a = build('AC', ds);
  assert.equal(a.last.loadout['Praesidium Shield'], 1);
  assert.equal(extra(a.last), 25);
  const b = build('AC', ds, { picks: pick(opt(ds, 'Castellan Axe'), 'Castellan Axe', 1) });
  assert.deepEqual(b.last.loadoutInfo.problems, [], 'щит есть в снаряжении — замена законна');
  assert.equal(extra(b.last), 0);
});

test('Victrix Honour Guard: Banner of Macragge у необязательного Chapter Ancient (0-1) — ручной счётчик, как в составе сайта по умолчанию (+0)', () => {
  const ds = sheet('SM', 'Victrix Honour Guard', 'Space Marines');
  assert.equal(paidIsAuto(ds, 'Banner of Macragge'), false);
  assert.equal(extra(build('SM', ds).last), 0);
  const a = build('SM', ds, { wargear: { 'Banner of Macragge': 1 } });
  assert.equal(extra(a.last), priceOf(ds, 'Banner of Macragge'));
  // в экспорте предмет один раз (в снаряжении Chapter Ancient), без повтора «(paid)»
  assert.equal(exportGw(a.r, a.L, a.cr, null).match(/Banner of Macragge/g)?.length, 1);
});

test('стандартные штуки: Crisis Fireknife платит за каждый missile pod (+15 за 3 модели), Gladiator Valiant BT — только за третью multi-melta', () => {
  const fk = sheet('TAU', 'Crisis Fireknife Battlesuits');
  assert.equal(extra(build('TAU', fk).last), 15);
  const swap = optionsOf(fk).parsed.find((o) => o.from[0]?.weapon.toLowerCase() === 'plasma rifle')!;
  assert.equal(extra(build('TAU', fk, { picks: pick(swap, swap.choices[0]!.map((i) => i.weapon).join('+'), 2) }).last), 25);
  const gv = sheet('SM', 'Gladiator Valiant', 'Black Templars');
  assert.equal(gv.paidDefaults, undefined);
  assert.equal(extra(build('SM', gv).last), 0, '2 multi-melta в базовой цене');
  assert.equal(extra(build('SM', gv, { picks: pick(opt(gv, 'Multi-melta'), 'Multi-melta', 1) }).last), 10);
});

test('разбор вариантов: «up to two of the following, but cannot take duplicates» (Nemesis Dreadknight)', () => {
  const ds = sheet('GK', 'Nemesis Dreadknight');
  const o = opt(ds, 'Heavy psycannon');
  assert.deepEqual([o.perModel, o.noDup, o.from.length], [2, true, 0]);
  const two = { [o.key]: o.choices.map((c) => (['Heavy psycannon', 'Heavy incinerator'].includes(c[0]!.weapon) ? 1 : 0)) };
  const a = build('GK', ds, { picks: two });
  assert.deepEqual(a.last.loadoutInfo.problems, []);
  assert.equal(a.last.paidAuto['Heavy psycannon'], 1);
  assert.equal(extra(a.last), priceOf(ds, 'Heavy psycannon'));
  assert.ok(build('GK', ds, { picks: pick(o, 'Heavy psycannon', 2) }).last.loadoutInfo.problems.length, 'два одинаковых нельзя');
});

test('разбор вариантов: составные замены — Knight Crusader и Deathwing / Deathwatch Terminators (Storm Bolter остаётся)', () => {
  const kc = sheet('QI', 'Knight Crusader');
  const a = build('QI', kc, { picks: pick(opt(kc, 'Rapid-fire battle cannon+Questoris heavy stubber'), 'Rapid-fire battle cannon+Questoris heavy stubber', 1) });
  assert.deepEqual(a.last.loadoutInfo.problems, []);
  assert.equal(a.last.loadout['Thermal cannon'] ?? 0, 0);
  assert.equal(a.last.paidAuto['Rapid-fire battle cannon'], 1);
  for (const name of ['Deathwing Terminator Squad', 'Deathwatch Terminator Squad']) {
    const ds = fac('SM').datasheets.find((x) => x.name === name && x.group === 'own')!;
    const o = optionsOf(ds).parsed.find((x) => x.choices.some((c) => c.some((i) => i.weapon === 'Cyclone Missile Launcher')))!;
    const to = o.choices.find((c) => c.some((i) => i.weapon === 'Cyclone Missile Launcher'))!.map((i) => i.weapon).join('+');
    const b = build('SM', ds, { picks: pick(o, to, 1) });
    assert.deepEqual(b.last.loadoutInfo.problems, [], name);
    assert.equal(b.last.loadout['Storm Bolter'], 5, `${name}: у модели с Cyclone Missile Launcher Storm Bolter остаётся`);
    assert.equal(b.last.paidAuto[ds.costs[0]!.wargear.find((w) => /cyclone/i.test(w.label))!.label], 1, name);
  }
  // «one of the following options (you cannot select the same option more than once)» — не «Options»
  assert.ok(optionsOf(sheet('CSM', 'Raptors')).parsed.every((p) => p.choices.flat().every((i) => i.weapon !== 'Options')));
});

test('варианты из конструктора сайта у инфолистов без вариантов в тексте: Impulsor (Orbital Comms Array — автоматически), Repulsor Executioner (замена Heavy Laser Destroyer)', () => {
  const imp = sheet('SM', 'Impulsor', 'Space Marines');
  assert.ok(imp.options.length && imp.options.every((o) => o.source === 'whrules-roster'));
  assert.equal(paidIsAuto(imp, 'Orbital Comms Array'), true);
  assert.equal(extra(build('SM', imp).last), 0);
  assert.equal(extra(build('SM', imp, { picks: pick(opt(imp, 'Orbital Comms Array'), 'Orbital Comms Array', 1) }).last), 10);
  const rx = sheet('SM', 'Repulsor Executioner', 'Space Marines');
  assert.equal(extra(build('SM', rx).last), 10);
  const swapped = build('SM', rx, { picks: pick(opt(rx, 'Macro Plasma Incinerator'), 'Macro Plasma Incinerator', 1) }).last;
  assert.deepEqual([swapped.loadoutInfo.problems, extra(swapped)], [[], 0]);
  for (const [f, name, src] of [['SM', 'Repulsor', 'Space Marines'], ['SM', 'Venerable Dreadnought', 'Space Wolves'], ['SM', 'Wulfen', 'Space Wolves']] as const) {
    const ds = sheet(f, name, src);
    assert.ok(optionsOf(ds).parsed.length && !optionsOf(ds).unparsed.length, name);
  }
});

test('«(that model’s Storm Bolter cannot be replaced)»: закреплённый Storm Bolter не снимает другой вариант (Deathwatch Terminators)', () => {
  const ds = sheet('SM', 'Deathwatch Terminator Squad');
  const cml = opt(ds, 'Cyclone Missile Launcher+Storm Bolter');
  assert.deepEqual(cml.locks?.[cml.choices.findIndex((c) => c.some((i) => i.weapon === 'Cyclone Missile Launcher'))]?.map((i) => i.weapon), ['Storm Bolter']);
  const melee = opt(ds, 'Thunder Hammer+Storm Shield');
  const picks = (n: number) => ({ ...pick(cml, 'Cyclone Missile Launcher+Storm Bolter', 1), ...pick(melee, 'Thunder Hammer+Storm Shield', n) });
  const ok = build('SM', ds, { picks: picks(4) }).last;
  assert.deepEqual(ok.loadoutInfo.problems, []);
  assert.equal(ok.loadoutInfo.max[melee.key]![melee.choices.findIndex((c) => c[0]!.weapon === 'Thunder Hammer')], 4, 'пятый Storm Bolter закреплён');
  const bad = build('SM', ds, { picks: picks(5) }).last;
  assert.ok(bad.loadoutInfo.problems.some((p) => /Storm Bolter заменить нельзя/.test(p)), bad.loadoutInfo.problems.join('; '));
});

test('«you cannot select the same option more than once» — каждый вариант не больше раза (Raptors, как лимит конструктора сайта)', () => {
  const ds = sheet('CSM', 'Raptors');
  const o = optionsOf(ds).parsed.find((x) => x.oncePerUnit)!;
  const flamer = o.choices.findIndex((c) => c[0]!.weapon.toLowerCase() === 'flamer');
  const two = build('CSM', ds, { picks: { [o.key]: o.choices.map((_, i) => (i === flamer ? 2 : 0)) } }).last;
  assert.ok(two.loadoutInfo.problems.some((p) => /не больше одного раза/.test(p)));
  const one = build('CSM', ds, { picks: { [o.key]: o.choices.map((_, i) => (i === flamer ? 1 : 0)) } }).last;
  assert.deepEqual(one.loadoutInfo.problems, []);
  assert.equal(one.loadoutInfo.max[o.key]![flamer], 1);
});

test('предмет необязательной модели: счётчик Banner of Macragge — не больше одного (0-1 Chapter Ancient)', () => {
  const ds = sheet('SM', 'Victrix Honour Guard', 'Space Marines');
  assert.deepEqual(optionalWargear(ds, 'Banner of Macragge'), { subject: 'Chapter Ancient', max: 1 });
  assert.equal(optionalWargear(sheet('AM', 'Leman Russ Battle Tank'), 'Lascannon'), null);
});

test('сохранённый ручной счётчик не удваивает цену; расхождение с автоматическим — предупреждение', () => {
  const ds = sheet('AM', 'Leman Russ Battle Tank');
  const same = build('AM', ds, { wargear: { Lascannon: 1 } });
  assert.equal(extra(same.last), 5);
  assert.ok(!same.cr.issues.some((i) => i.code === 'wargear-auto'));
  const diff = build('AM', ds, { wargear: { Lascannon: 3 } });
  assert.equal(extra(diff.last), 5, 'в цене — снаряжение, а не счётчик');
  assert.ok(diff.cr.issues.some((i) => i.code === 'wargear-auto' && i.unitUids?.includes(diff.last.unit.uid)));
});

// ---------- сверка с конструктором ростеров сайта ----------

const ROSTER = loadRoster('whrules-995-roster.json');
const POINTS = loadSnapshot('whrules-995.json');
type SiteOpt = [unknown, number?];
type SiteGear = { m?: number; o: SiteOpt[]; rep?: number[]; keep?: number[]; dr?: number };
type SiteUnit = { id: string; name: string; dw?: [number, number][]; defaults?: [number, [number, number?][]][]; gear?: SiteGear[]; sizes: { per: number[]; comp?: number[][]; default?: number }[] };
const itemsOf = (o: SiteOpt): [number, number][] => {
  let t = o[0] as unknown;
  if (t == null) return [];
  if (!Array.isArray(t)) return [[t as number, 1]];
  if (Array.isArray(t[0]) && Array.isArray((t[0] as unknown[])[0])) t = t[0];
  return (t as [number, number?][]).map(([i, q]) => [i, q || 1]);
};
const pairs = () => {
  const out: { army: string; ds: Datasheet; unit: SiteUnit }[] = [];
  for (const [army, slugs] of Object.entries(ARMIES as Record<string, string[]>)) {
    const f = fac(army);
    for (const p of compareArmy(f, POINTS, slugs).pairs as { id: string; siteFaction: string; siteId: string }[]) {
      const unit = (ROSTER.factions[p.siteFaction]?.units as SiteUnit[] | undefined)?.find((u) => u.id === p.siteId);
      const ds = f.datasheets.find((d) => d.id === p.id && d.group === 'own' && d.faction === f.id);
      if (unit && ds) out.push({ army, ds, unit });
    }
  }
  return out;
};

test('сверка с конструктором сайта: каждый вариант с очками даёт ту же доплату (цены предметов + paidDefaults)', () => {
  const name = (i: number) => ROSTER.items[i] as string;
  let checked = 0;
  const bad: string[] = [];
  for (const { army, ds, unit } of pairs()) {
    const priced = (unit.gear ?? []).some((g) => g.o.some((o) => o[1])) || !!unit.dw?.length;
    if (!priced) continue;
    assert.equal(!!ds.paidDefaults, !!unit.dw?.some(([, p]) => p > 0), `${army}/${ds.name}: paidDefaults`);
    const price = new Map(ds.costs[0]!.wargear.map((w) => [wargearKey(w.label), w.cost]));
    const p = (i: number) => price.get(wargearKey(name(i))) ?? 0;
    const defaults = new Set((unit.defaults ?? []).flatMap(([, l]) => l.map(([i]) => i)));
    for (const g of unit.gear ?? []) {
      const keep = new Set(g.keep ?? []);
      for (const o of g.o) {
        const site = (o[1] ?? 0) - (g.dr ?? 0);
        const added = itemsOf(o).reduce((s, [i, q]) => s + (keep.has(i) ? 0 : p(i) * q), 0);
        const removed = (g.rep ?? []).reduce((s, i) => s + (keep.has(i) || (!ds.paidDefaults && defaults.has(i)) ? 0 : p(i)), 0);
        checked++;
        if (added - removed !== site) bad.push(`${army}/${ds.name}: ${itemsOf(o).map(([i]) => name(i)).join('+')} — сайт ${site}, у нас ${added - removed}`);
      }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(checked >= 380, `проверено вариантов: ${checked}`);
});

test('сверка с конструктором сайта: стандартное снаряжение юнитов с paidDefaults стоит столько же (1-я копия)', () => {
  const bad: string[] = [];
  let n = 0;
  for (const { army, ds, unit } of pairs()) {
    if (!unit.dw?.length) continue;
    const size = unit.sizes.find((s) => s.default) ?? unit.sizes[0]!;
    const per = new Map((size.comp ?? [[0, size.per[0]!]]).map(([m, c]) => [m, c]));
    const site = unit.dw.reduce((s, [m, pts]) => s + pts * (per.get(m) ?? 0), 0);
    const c = build(army, ds).last;
    n++;
    if (c.extras !== site) bad.push(`${army}/${ds.name}: сайт +${site}, у нас +${c.extras}`);
  }
  assert.deepEqual(bad, []);
  assert.equal(n, 15);
});

test('сверка с конструктором сайта: каждый «keep» (предмет остаётся у модели) — закреплён в нашем варианте (locks)', () => {
  const name = (i: number) => ROSTER.items[i] as string;
  const missing: string[] = [];
  let n = 0;
  for (const { army, ds, unit } of pairs())
    for (const g of (unit.gear ?? []) as (SiteGear & { keep?: number[] })[]) {
      if (!g.keep?.length) continue;
      n++;
      const want = g.keep.map((i) => wargearKey(name(i)));
      // название предмета у сайта бывает короче текста варианта: «Chainsword» ↔ «Astartes Chainsword»
      const has = optionsOf(ds).parsed.some((o) => (o.locks ?? []).some((l) => want.every((w) => l.some((it) => wargearKey(it.weapon) === w || wargearKey(it.weapon).endsWith(' ' + w)))));
      if (!has) missing.push(`${army}/${ds.name}: ${g.keep.map(name).join(', ')}`);
    }
  assert.deepEqual(missing, []);
  assert.ok(n > 0);
});

// ---------- P1-T5c: варианты, которые есть только в конструкторе сайта ----------

test('Watcher in the Dark — выбирается у Deathwing Terminator Squad, Deathwing Knights и Deathwing Command Squad (0 очков)', () => {
  for (const name of ['Deathwing Terminator Squad', 'Deathwing Knights', 'Deathwing Command Squad']) {
    const ds = fac('SM').datasheets.find((d) => d.name === name && d.group === 'own')!;
    const o = optionsOf(ds).parsed.find((x) => x.choices.some((c) => c.some((i) => i.weapon === 'Watcher in the Dark')));
    assert.ok(o, `${name}: нет варианта Watcher in the Dark`);
    const c = build('SM', ds, { picks: pick(o!, 'Watcher in the Dark', 1) }).last;
    assert.deepEqual(c.loadoutInfo.problems, [], name);
    assert.equal(c.loadout['Watcher in the Dark'], 1, name);
    assert.equal(c.extras, 0, name);
  }
});

test('опечатки и чужое оружие в вариантах заменены формулировкой конструктора: Kâhl, Ynnari Incubi, Kroot War Shaper, Secutarii Peltasts', () => {
  const cases: [string, string, string, string][] = [
    ['LoV', 'Kâhl', 'Autoch-pattern combi-bolter', 'Volkanite disintegrator'],
    ['AE', 'Ynnari Incubi', 'Klaive', 'Demiklaives'],
    ['TAU', 'Kroot War Shaper', 'Dart-bow and tri-blade', 'Bladestave and prey-hook'],
    ['AdM', 'Secutarii Peltasts', 'Galvanic caster', 'Archeotech pistol'],
  ];
  for (const [f, name, from, to] of cases) {
    const ds = sheet(f, name);
    const o = opt(ds, to);
    assert.equal(o.from[0]!.weapon, from, name);
    const c = build(f, ds, { picks: pick(o, to, 1) }).last;
    assert.deepEqual(c.loadoutInfo.problems, [], name);
    assert.equal(c.loadout[to], 1, name);
    assert.ok(ds.weapons.some((w) => w.name.toLowerCase() === to.toLowerCase()), `${name}: у ${to} есть профиль`);
  }
});

test('каждый вариант конструктора сайта есть у нас или разобран в 40k/whrules-995-roster-options-review.json', () => {
  const review = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '40k', 'whrules-995-roster-options-review.json'), 'utf8')) as { items: { army: string; id: string; site: string; verdict: string }[] };
  const n = (t: string) => t.toLowerCase().replace(/[’‘]/g, "'").replace(/[‑‐-]/g, '-').replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim();
  const accepted = new Set(review.items.map((x) => `${x.army}|${x.id}|${x.site}`));
  const missing: string[] = [];
  const used = new Set<string>();
  for (const { army, ds, unit } of pairs())
    for (const g of (unit.gear ?? []) as (SiteGear & { t?: number })[]) {
      const t = ROSTER.texts[g.t!] as string | undefined;
      if (!t) continue;
      const head = t.split('\n')[0]!;
      if (n(ds.options.map((o) => o.text).join(' ')).includes(n(head.replace(/\*.*$/, '')).slice(0, 60))) continue;
      const k = `${army}|${ds.id}|${head}`;
      if (accepted.has(k)) used.add(k);
      else missing.push(`${army}/${ds.name}: ${head}`);
    }
  assert.deepEqual(missing, []);
  assert.deepEqual([...accepted].filter((k) => !used.has(k)), [], 'в разборе нет устаревших записей');
  assert.ok(review.items.every((x) => ['wording', 'not-option', 'conflict'].includes(x.verdict)));
});

// ---------- P1-T5e: конфликты инфолиста и конструктора сайта ----------

test('Chaos Acastus Knight Porphyrion: обе пушки вместе — на 2 lascannons или на 1 autocannon и 1 lascannon (во всех армиях с копиями)', () => {
  for (const f of ['QT', 'CSM', 'CD', 'DG', 'EC', 'TS', 'WE']) {
    const ds = fac(f).datasheets.find((d) => d.name === 'Chaos Acastus Knight Porphyrion')!;
    const o = opt(ds, 'Lascannon');
    assert.deepEqual(o.from, [{ weapon: 'Acastus Autocannon', qty: 2 }], f);
    const c = build(f, ds, { picks: pick(o, 'Lascannon', 1) }).last;
    assert.deepEqual([c.loadout['Lascannon'], c.loadout['Acastus Autocannon'] ?? 0, c.loadoutInfo.problems], [2, 0, []], f);
  }
});

test('Wolf Scouts (решение владельца): plasma pistol и combat knife одной модели — на bolt pistol, Thunderclap и runic stave вместе', () => {
  const ds = sheet('SM', 'Wolf Scouts', 'Space Wolves');
  const o = opt(ds, 'Bolt Pistol+Thunderclap+Runic Stave');
  assert.equal(o.choices.length, 1);
  const c = build('SM', ds, { picks: pick(o, 'Bolt Pistol+Thunderclap+Runic Stave', 1) }).last;
  assert.deepEqual(c.loadoutInfo.problems, []);
  assert.deepEqual([c.loadout['Bolt Pistol'], c.loadout['Thunderclap'], c.loadout['Runic Stave']], [1, 1, 1]);
});

test('Kill Tank по инфолисту сайта: Dual Big Shoota и Skorcha в стандартном снаряжении; Deff Rolla и три из Kannon / Lobba / Zzap Gun; с Deff Rolla — до 5 Big Shootas', () => {
  const ds = sheet('ORK', 'Kill Tank');
  assert.ok(ds.weapons.some((w) => w.name === 'Dual Big Shoota'));
  const base = build('ORK', ds).last;
  assert.deepEqual([base.loadout['Dual Big Shoota'], base.loadout['Skorcha'], base.loadout['Tank Kannon']], [1, 1, 1]);
  const rolla = optionsOf(ds).parsed.find((x) => x.choices.some((c) => c.some((i) => i.weapon === 'Deff Rolla')))!;
  assert.equal(rolla.choices.length, 10, 'наборы из трёх с повторами');
  const zzap = rolla.choices.findIndex((c) => c.some((i) => i.weapon === 'Zzap Gun' && i.qty === 3));
  const shootas = opt(ds, 'Big Shoota');
  assert.equal(shootas.perModel, 5);
  const with5 = build('ORK', ds, { picks: { [rolla.key]: rolla.choices.map((_, i) => (i === zzap ? 1 : 0)), ...pick(shootas, 'Big Shoota', 5) } }).last;
  assert.deepEqual(with5.loadoutInfo.problems, []);
  assert.deepEqual([with5.loadout['Deff Rolla'], with5.loadout['Zzap Gun'], with5.loadout['Big Shoota'], with5.loadout['Tank Kannon'] ?? 0], [1, 3, 5, 0]);
  assert.ok(build('ORK', ds, { picks: pick(shootas, 'Big Shoota', 1) }).last.loadoutInfo.problems.length, 'Big Shoota — только с Deff Rolla');
});

test('Gargantuan Squiggoth: Kannon в стандартном снаряжении, замена на Supa-kannon (как конструктор сайта)', () => {
  const ds = sheet('ORK', 'Gargantuan Squiggoth');
  assert.equal(build('ORK', ds).last.loadout['Kannon'], 1);
  assert.equal(optionsOf(ds).parsed.length, 1);
  const c = build('ORK', ds, { picks: pick(opt(ds, 'Supa-kannon'), 'Supa-kannon', 1) }).last;
  assert.deepEqual([c.loadout['Kannon'] ?? 0, c.loadout['Supa-kannon'], c.loadoutInfo.problems], [0, 1, []]);
});

test('сохранённые выборы у инфолистов с изменёнными вариантами: таблица перевода wh-rules 995 wargear (Kill Tank — прежние замены откладываются)', () => {
  const F = fac('ORK');
  const mig = (Array.isArray(F.migrations) ? F.migrations : [F.migrations]).find((m) => m?.source === 'wh-rules 995 wargear')!;
  const kt = sheet('ORK', 'Kill Tank');
  assert.ok(mig.options?.[kt.id], 'есть перевод для Kill Tank');
  assert.equal(mig.options![kt.id]!.keys['0'], null, 'прежняя «+ Big Shoota» без Deff Rolla — не переводится');
});

// ---------- P1-T5d: варианты, которые снимают отсутствующий предмет ----------

test('каждый разобранный вариант снимает предмет, который у юнита есть (стандартный или из другого варианта); исключение — один инфолист Legends', () => {
  const dir = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'f');
  const k = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'");
  const bad: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const F = fac(f.replace(/\.json$/, ''));
    for (const d of F.datasheets) {
      if (d.group !== 'own' || d.faction !== F.id) continue;
      const have = new Set([...d.defaultLoadout.flatMap((r) => r.items.map((i) => k(i.weapon))), ...optionsOf(d).parsed.flatMap((o) => o.choices.flat().map((i) => k(i.weapon)))]);
      for (const o of optionsOf(d).parsed) for (const it of o.from) if (!have.has(k(it.weapon))) bad.push(`${F.id}/${d.name}${d.legends ? ' (Legends)' : ''}: ${it.weapon}`);
    }
  }
  // Venerable Dreadnought (Space Marines, Legends, Wahapedia): в снаряжении Dreadnought Fist, а вариант заменяет
  // Dreadnought combat weapon — текст инфолиста противоречит сам себе, на сайте этого инфолиста нет
  assert.deepEqual([...new Set(bad)], ['SM/Venerable Dreadnought (Legends): Dreadnought combat weapon']);
});

test('предметы снаряжения без профиля оружия — в стандартном снаряжении и заменяются: Bullgryn slabshield, Wraithknight scattershield, Kâhl rampart crest', () => {
  for (const [f, name, to] of [['AM', 'Bullgryn Squad', 'Brute shield'], ['AE', 'Wraithknight', 'Heavy wraithcannon'], ['LoV', 'Kâhl', 'Teleport crest']] as const) {
    const ds = sheet(f, name);
    const c = build(f, ds, { picks: pick(opt(ds, to), to, 1) }).last;
    assert.deepEqual(c.loadoutInfo.problems, [], name);
    assert.ok((c.loadout[to] ?? 0) >= 1, name);
  }
});

test('«X or Y» — заменяется то, что есть у модели, общий лимит (Hearthkyn Warriors: Autoch-pattern bolter или ion blaster)', () => {
  const ds = sheet('LoV', 'Hearthkyn Warriors');
  const subs = optionsOf(ds).parsed.filter((o) => o.choices.some((c) => c[0]!.weapon === 'Plasma knife'));
  assert.deepEqual(subs.map((o) => o.from[0]!.weapon).sort(), ['Autoch-pattern bolter', 'Ion blaster']);
  assert.ok(subs[0]!.share && subs[0]!.share === subs[1]!.share);
  const ok = build('LoV', ds, { picks: pick(subs.find((o) => o.from[0]!.weapon === 'Autoch-pattern bolter')!, 'Plasma knife', 1) }).last;
  assert.deepEqual(ok.loadoutInfo.problems, []);
});

test('исправленное стандартное снаряжение: Cultist Mob with Firearms (по конструктору сайта), Knight Preceptor (Questoris multi-laser), Knight Paladin (rapid-fire battle cannon)', () => {
  const cm = build('CSM', sheet('CSM', 'Cultist Mob with Firearms')).last;
  assert.deepEqual([cm.loadout['Autopistol'], cm.loadout['Autogun'], cm.loadout['Close combat weapon']], [1, 9, 9]);
  const kp = sheet('QI', 'Knight Preceptor');
  assert.equal(build('QI', kp, { picks: pick(opt(kp, 'Meltagun'), 'Meltagun', 1) }).last.loadoutInfo.problems.length, 0);
  assert.equal(build('QI', sheet('QI', 'Knight Paladin')).last.loadout['Rapid-fire battle cannon'], 1);
  // устаревшие/повторные варианты убраны: у Thunderhawk Gunship нет «cluster bombs», у Astraeus — одна замена las-rippers
  assert.ok(!sheet('SM', 'Thunderhawk Gunship', 'Space Marines').options.some((o) => /cluster bombs/i.test(o.text)));
  assert.equal(sheet('SM', 'Astraeus').options.filter((o) => /las-rippers/i.test(o.text)).length, 1);
});
