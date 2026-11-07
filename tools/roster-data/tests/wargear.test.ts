// Варианты снаряжения, платное снаряжение, совместные отряды. Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup, defaultLoadout } from '../../../client/src/features/roster/engine/compute';
import { addUnit, newRoster, updateUnit } from '../../../client/src/features/roster/engine/roster';
import { exportGw } from '../../../client/src/features/roster/engine/export';
import { groupDetRules, groupOf } from '../../../client/src/features/roster/engine/group';
import { applyPicks, hasPicks, modelGroups, optionsOf, type ParsedOption } from '../../../client/src/features/roster/engine/wargear';
import type { Datasheet, FactionData, Roster } from '../../../client/src/features/roster/engine/types';

const dataDir = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'f');
const loadFaction = (id: string): FactionData => JSON.parse(fs.readFileSync(path.join(dataDir, id + '.json'), 'utf8'));
const ORK = loadFaction('ORK');
const L = makeLookup(ORK);
const ork = (n: string) => {
  const d = ORK.datasheets.find((x) => x.name === n && x.group === 'own');
  assert.ok(d, 'нет инфолиста ' + n);
  return d!;
};
const optWith = (ds: Datasheet, from: string, to: string): ParsedOption => {
  const o = optionsOf(ds).parsed.find((x) => x.from.map((f) => f.weapon).join('+') === from && x.choices.some((c) => c.map((i) => i.weapon).join('+') === to));
  assert.ok(o, `нет варианта ${from} → ${to} у ${ds.name}`);
  return o!;
};
const pick = (o: ParsedOption, to: string, n: number) => ({ [o.key]: o.choices.map((c) => (c.map((i) => i.weapon).join('+') === to ? n : 0)) });
const roster = (): Roster => {
  const det = ORK.detachments.find((d) => d.name === 'Wreckas') ?? ORK.detachments[0]!;
  return { ...newRoster('ORK'), detachmentIds: [det.id], forceDisposition: det.forceDisposition };
};

test('стандартное снаряжение по типам моделей: Boyz — у Nob своё оружие, у Boy своё', () => {
  const boyz = ork('Boyz');
  const g10 = modelGroups(boyz, 10);
  assert.deepEqual(g10.map((g) => [g.name, g.count]), [['Nob', 1], ['Boy', 9]]);
  assert.deepEqual(modelGroups(boyz, 20).map((g) => g.count), [2, 18]);
  const d = defaultLoadout(boyz, { addons: {} }, 10);
  assert.equal(d['Kustom Choppa'], 1);
  assert.equal(d['Kombi-skorcha'], 1);
  assert.equal(d['Shoota'], 9);
  assert.equal(d['Choppa'], 9);
  assert.equal(d['Slugga'], 9);
  assert.equal(d['Big Shoota'] ?? 0, 0, 'Big Shoota по умолчанию нет');
});

test('лимиты замен: «1 на каждые 10 моделей», «любое число Nob», нет лишнего оружия', () => {
  const boyz = ork('Boyz');
  const big = optWith(boyz, 'Shoota', 'Big Shoota');
  const base10 = defaultLoadout(boyz, { addons: {} }, 10);
  // законно: 1 Big Shoota на 10 моделей
  let r = applyPicks(boyz, base10, pick(big, 'Big Shoota', 1), 10);
  assert.deepEqual(r.problems, []);
  assert.equal(r.loadout['Big Shoota'], 1);
  assert.equal(r.loadout['Shoota'], 8);
  assert.equal(r.max[big.key]![0], 1);
  // незаконно: 2 Big Shoota на 10 моделей
  r = applyPicks(boyz, base10, pick(big, 'Big Shoota', 2), 10);
  assert.ok(r.problems.some((p) => /не больше 1/.test(p)), r.problems.join('; '));
  // 20 моделей — уже 2
  r = applyPicks(boyz, defaultLoadout(boyz, { addons: {} }, 20), pick(big, 'Big Shoota', 2), 20);
  assert.deepEqual(r.problems, []);
  // Nob: Power Klaw только у Nob (1 на 10 моделей)
  const klaw = optWith(boyz, 'Kustom Choppa', 'Power Klaw');
  r = applyPicks(boyz, base10, pick(klaw, 'Power Klaw', 2), 10);
  assert.ok(r.problems.length, 'у 1 Nob не может быть 2 Power Klaw');
});

test('общий источник: Meganobz — Killsaw и Twin Killsaws расходуют одни и те же Power Klaw', () => {
  const mega = ork('Meganobz');
  const ks = optWith(mega, 'Power Klaw', 'Killsaw');
  const tks = optWith(mega, 'Power Klaw+Kustom Shoota', 'Twin Killsaws');
  const base = defaultLoadout(mega, { addons: {} }, 3);
  const ok = applyPicks(mega, base, { ...pick(ks, 'Killsaw', 2), ...pick(tks, 'Twin Killsaws', 1) }, 3);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.loadout['Power Klaw'] ?? 0, 0);
  assert.equal(ok.loadout['Killsaw'], 2);
  assert.equal(ok.loadout['Twin Killsaws'], 1);
  // максимум счётчика Killsaw с учётом Twin Killsaws = 2, а не 3
  assert.equal(ok.max[ks.key]![0], 2);
  const bad = applyPicks(mega, base, { ...pick(ks, 'Killsaw', 3), ...pick(tks, 'Twin Killsaws', 1) }, 3);
  assert.ok(bad.problems.some((p) => /нет .*Power Klaw/.test(p)), bad.problems.join('; '));
});

test('«Вернуть стандартное»: после возврата к стандарту замен нет', () => {
  const mega = ork('Meganobz');
  const ks = optWith(mega, 'Power Klaw', 'Killsaw');
  assert.equal(hasPicks(pick(ks, 'Killsaw', 1)), true);
  assert.equal(hasPicks(pick(ks, 'Killsaw', 0)), false, 'счётчик вернули на 0 — снаряжение стандартное');
  assert.equal(hasPicks({}), false);
  assert.equal(hasPicks(undefined), false);
  let r = addUnit(roster(), mega);
  const uid = r.units[0]!.uid;
  r = updateUnit(r, uid, { picks: pick(ks, 'Killsaw', 1) });
  assert.ok(computeRoster(r, L).units[0]!.loadoutCustom);
  r = updateUnit(r, uid, { picks: pick(ks, 'Killsaw', 0) });
  const c = computeRoster(r, L).units[0]!;
  assert.equal(c.loadoutCustom, false);
  assert.deepEqual(c.loadout, defaultLoadout(mega, { addons: {} }, c.models));
});

test('платное снаряжение считается по заменам: Killsaw +5 за штуку на каждой копии Meganobz (как в конструкторе wh-rules)', () => {
  const mega = ork('Meganobz');
  const ks = optWith(mega, 'Power Klaw', 'Killsaw');
  let r = roster();
  for (let i = 0; i < 3; i++) r = addUnit(r, mega);
  const third = r.units[2]!.uid;
  const before = computeRoster(r, L);
  r = updateUnit(r, third, { picks: pick(ks, 'Killsaw', 2) });
  const after = computeRoster(r, L);
  const cost = after.units[2]!.band!.wargear.find((w) => w.label === 'Killsaw')!.cost;
  assert.equal(after.units[2]!.total - before.units[2]!.total, 2 * cost);
  assert.equal(after.points - before.points, 2 * cost, 'итог ростера изменился сразу');
  assert.equal(after.units[2]!.paidAuto['Killsaw'], 2);
  // первая копия платит так же (ступень цены за копии меняет только базовую цену)
  r = updateUnit(r, r.units[0]!.uid, { picks: pick(ks, 'Killsaw', 2) });
  assert.equal(computeRoster(r, L).units[0]!.total, before.units[0]!.total + 2 * cost);
  assert.match(exportGw(r, L, computeRoster(r, L), null), /2x Killsaw/);
});

test('совместный отряд: правило детачмента Tankbustas действует и на присоединённого Big Mek', () => {
  const tb = ork('Tankbustas');
  const mek = ork('Big Mek');
  let r = roster();
  r = addUnit(r, tb);
  r = addUnit(r, mek);
  r = updateUnit(r, r.units[1]!.uid, { attachedTo: r.units[0]!.uid });
  const cr = computeRoster(r, L);
  const mekC = cr.units[1]!;
  const members = groupOf(mekC, cr);
  assert.deepEqual(members.map((m) => m.ds!.name), ['Tankbustas', 'Big Mek']);
  const rules = groupDetRules(members, L, r.detachmentIds);
  const wl = rules.find((x) => /Wreckin/.test(x.name));
  assert.ok(wl, 'правило Wreckas для Tankbustas');
  // с 07.11.2026 (Task C, партия 4) Orks сконвертированы из wh-rules 995: правила детачмента привязаны ко всем инфолистам фракции
  // (как у остальных сконвертированных армий), поэтому правило есть и у самого Big Mek
  assert.ok(wl!.via.includes('Tankbustas'), 'правило действует через Tankbustas');
  // без присоединения у Big Mek этого правила нет
  const alone = computeRoster(updateUnit(r, r.units[1]!.uid, { attachedTo: null }), L);
  assert.equal(groupOf(alone.units[1]!, alone).length, 0);
});

test('разбор вариантов по всем фракциям: максимум каждого счётчика всегда законен', () => {
  let checked = 0;
  for (const f of fs.readdirSync(dataDir)) {
    const fac: FactionData = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    for (const ds of fac.datasheets) {
      const info = optionsOf(ds);
      if (!info.parsed.length || !ds.costs.length) continue;
      for (const opt of ds.costs[0]!.options) {
        const base = defaultLoadout(ds, { addons: {} }, opt.models);
        const free = applyPicks(ds, base, undefined, opt.models);
        for (const o of info.parsed) {
          o.choices.forEach((_, ci) => {
            const m = free.max[o.key]![ci]!;
            if (!m) return;
            const r = applyPicks(ds, base, { [o.key]: o.choices.map((__, j) => (j === ci ? m : 0)) }, opt.models);
            assert.deepEqual(r.problems, [], `${fac.id} ${ds.name} (${opt.label}) [${o.key}] ×${m}: ${r.problems.join('; ')}`);
            assert.ok(Object.values(r.loadout).every((n) => n > 0));
            // на один больше максимума — уже нельзя
            const over = applyPicks(ds, base, { [o.key]: o.choices.map((__, j) => (j === ci ? m + 1 : 0)) }, opt.models);
            assert.ok(over.problems.length, `${fac.id} ${ds.name} [${o.key}] ×${m + 1} должно быть нельзя`);
            checked++;
          });
        }
      }
    }
  }
  assert.ok(checked > 5000, `проверено ${checked}`);
});
