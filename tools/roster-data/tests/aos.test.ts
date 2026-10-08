// Age of Sigmar 4: данные и движок правил. Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  auxiliaryFit,
  computeAos,
  enhancementFit,
  generalFit,
  leaderFit,
  makeAosLookup,
  matchRegiment,
  pointsOf,
  regimentFit,
  reinforceFit,
  rorFit,
  type AosLookup,
} from '../../../client/src/features/roster/aos/engine';
import {
  addAuxiliary,
  addRegiment,
  addToRegiment,
  decodeAosRoster,
  encodeAosRoster,
  moveAosUnit,
  newAosRoster,
  removeAosUnit,
  sanitizeAosRoster,
  setEnhancement,
  setGeneral,
  setLore,
  updateAosUnit,
  type OpResult,
} from '../../../client/src/features/roster/aos/roster';
import { exportAos, exportAosCompact } from '../../../client/src/features/roster/aos/export';
import { auxiliarySurcharge } from '../../../client/src/features/roster/aos/rules';
import type { AosFactionData, AosIndex, AosRoster, AosWarscroll } from '../../../client/src/features/roster/aos/types';
// @ts-expect-error — .mjs без типов
import { parseNotes, parseOptionTokens } from '../scripts/import-wahapedia-aos.mjs';

const dir = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'aos');
const INDEX: AosIndex = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const load = (id: string): AosFactionData => JSON.parse(fs.readFileSync(path.join(dir, 'f', id + '.json'), 'utf8'));
const ALL = INDEX.factions.map((f) => load(f.id));

function ctx(id: string) {
  const data = ALL.find((f) => f.id === id)!;
  const L = makeAosLookup(data);
  const ws = (name: string): AosWarscroll => {
    const w = data.warscrolls.find((x) => x.name === name);
    assert.ok(w, `${id}: нет варскролла ${name}`);
    return w!;
  };
  return { data, L, ws };
}
const ok = (res: OpResult): AosRoster => {
  assert.ok(res.ok, res.ok ? '' : res.reason);
  return (res as { roster: AosRoster }).roster;
};
const reason = (res: OpResult | { ok: boolean; reason?: string }) => (res.ok ? '' : (res as { reason: string }).reason);
const codes = (r: AosRoster, L: AosLookup) => computeAos(r, L).issues.filter((i) => i.level === 'error').map((i) => i.code);
const lastReg = (r: AosRoster) => r.regiments[r.regiments.length - 1]!;

// ---------- данные ----------

test('данные: все фракции на месте, ссылки внутри файлов целые, служебных полей нет', () => {
  assert.equal(INDEX.system, 'aos');
  assert.equal(INDEX.edition, '4');
  assert.ok(INDEX.factions.length >= 27);
  assert.match(INDEX.credit, /Wahapedia/);
  for (const f of ALL) {
    const L = makeAosLookup(f);
    const raw = JSON.stringify(f);
    assert.ok(!/"_notes"|"_rawOptions"|"exclusiveWithRorNames"/.test(raw), f.id + ': служебные поля в данных');
    for (const w of f.warscrolls) {
      assert.equal(w.faction, f.id);
      for (const o of w.options) for (const id of o.ids) assert.ok(L.ws.has(id), `${f.id} ${w.name}: вариант ${o.label} → ${id}`);
      for (const id of [...w.onlyInIds, ...w.joinLeaderIds, ...w.exclusiveWithIds, ...(w.perUnitOf?.ids ?? []), ...(w.requiresInRegiment?.ids ?? [])]) assert.ok(L.ws.has(id), `${f.id} ${w.name}: ссылка ${id}`);
      if (w.kind === 'unit' && w.cost != null) {
        assert.ok(Number.isInteger(w.cost) && w.cost >= 0, `${f.id} ${w.name}: очки ${w.cost}`);
        assert.ok(w.unitSize >= 1, `${f.id} ${w.name}: размер`);
      }
      if (w.reinforceable) assert.ok((w.unitSize > 1 || /reinforced even though/i.test(w.notes)) && !w.unique && w.kind === 'unit', `${f.id} ${w.name}: усиление`);
      if (w.hero && !w.legends && w.cost != null && w.season !== 'ghyran' && !w.aorOnly) assert.ok(w.keywords.includes('HERO'), `${f.id} ${w.name}: HERO`);
    }
    for (const r of f.rors) {
      assert.ok(r.allowed.includes(f.id), `${f.id}: полк славы ${r.name} не для этой фракции`);
      assert.ok(r.units.length > 0, `${f.id}: ${r.name} без юнитов`);
      for (const u of r.units) assert.ok(L.ws.has(u.id), `${f.id}: ${r.name} → ${u.id}`);
      assert.ok(r.built ? r.units.every((u) => u.points != null) : r.cost != null, `${f.id}: ${r.name} без очков`);
    }
    for (const t of f.enhancementTypes) for (const tb of t.tables) assert.notEqual(tb.season, 'ghyran', `${f.id}: таблица Ghyran ${tb.name}`);
    for (const l of f.lores) assert.notEqual(l.season, 'ghyran');
    assert.equal(INDEX.factions.find((x) => x.id === f.id)!.name, f.name);
  }
});

test('данные: в каждой фракции есть кем командовать и что взять', () => {
  for (const f of ALL) {
    const meta = INDEX.factions.find((x) => x.id === f.id)!;
    if (meta.legendsOnly) continue;
    const L = makeAosLookup(f);
    const r = newAosRoster(f.id, 2000);
    const leaders = f.warscrolls.filter((w) => leaderFit(w, r, L).ok);
    assert.ok(leaders.length >= 1, `${f.id}: героев-лидеров ${leaders.length}`);
    if (f.rulesNotice) continue; // правила фракции устарели в выгрузке — показываем предупреждение
    assert.ok(f.battleTraits.length > 0, `${f.id}: нет боевых черт`);
    assert.ok(f.formations.length > 0, `${f.id}: нет построений`);
  }
});

test('импорт: варианты полка и заметки Battle Profiles', () => {
  assert.deepEqual(
    parseOptionTokens('0-1 %000014407 Eternus % or %000011658Ruinous Champion%, Any %000002488Slaves to Darkness%').map((o: { q: string; alts: string[] }) => [o.q, o.alts]),
    [
      ['max1', ['Eternus', 'Ruinous Champion']],
      ['any', ['Slaves to Darkness']],
    ],
  );
  const neave = parseOptionTokens('%000012022 Neave’s Companions % (required), %000012118 Lorai % (required), Any %000012114Vanguard Chamber%');
  assert.deepEqual(neave.map((o: { q: string; required: boolean }) => [o.q, o.required]), [['max1', true], ['max1', true], ['any', false]]);
  const n = parseNotes('This HERO can join eligible regiment as a Voice of the Everwinter. This unit does not count towards the number of friendly units that can accompany a HERO.', '2026-08-25');
  assert.deepEqual(n.joinAs, ['voice of the everwinter']);
  assert.equal(n.freeSlot, true);
  assert.equal(parseNotes('This unit will move to Warhammer Legends on 1 June 2025.', '2026-08-25').legends, true);
  assert.equal(parseNotes('This unit will move to Warhammer Legends on 1 June 2027.', '2026-08-25').legends, false);
  assert.equal(parseNotes('This unit cannot be included in an army with any other UNIQUE units.', '2026-08-25').noOtherUnique, true);
});

// ---------- полки ----------

test('полк: 3 юнита, у генерала 4; лишний юнит не добавляется', () => {
  const { L, ws } = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE'), ws('Lord-Celestant'), L));
  const reg = r.regiments[0]!;
  assert.equal(r.generalUid, reg.leader.uid, 'первый лидер — генерал');
  for (let i = 0; i < 4; i++) r = ok(addToRegiment(r, reg.uid, ws('Liberators'), L));
  const fifth = addToRegiment(r, reg.uid, ws('Liberators'), L);
  assert.equal(fifth.ok, false);
  assert.match(reason(fifth), /заполнен/);
  // второй полк — уже не генеральский: 3 юнита
  r = ok(addRegiment(r, ws('Lord-Vigilant on Gryph-Stalker'), L));
  const second = lastReg(r);
  const ruin = ws('Lord-Vigilant on Gryph-Stalker').options.find((o) => o.q === 'any')!;
  const unit = L.ws.get(ruin.ids.find((id) => !L.ws.get(id)!.hero && L.ws.get(id)!.cost && !L.ws.get(id)!.legends)!)!;
  for (let i = 0; i < 3; i++) r = ok(addToRegiment(r, second.uid, unit, L));
  assert.match(reason(addToRegiment(r, second.uid, unit, L)), /заполнен.*у генерала — 4/);
  assert.deepEqual(codes(r, L).filter((c) => c !== 'formation'), []);
  // генерала перенесли в полк с 4 юнитами нельзя «за бесплатно»: первый полк теперь переполнен
  r = setGeneral(r, second.leader.uid);
  assert.ok(codes(r, L).includes('regiment-size'));
});

test('полк: только юниты из вариантов лидера, с причиной', () => {
  const { L, ws } = ctx('SE');
  const r = ok(addRegiment(newAosRoster('SE'), ws('Lord-Celestant'), L));
  const vanguard = L.faction.warscrolls.find((w) => !w.hero && w.factionKeywords.includes('VANGUARD CHAMBER') && !w.factionKeywords.includes('WARRIOR CHAMBER') && w.cost && !w.legends)!;
  const f = regimentFit(r.regiments[0]!, vanguard, r, L);
  assert.equal(f.ok, false);
  assert.match(reason(f), /Нет среди вариантов полка «Lord-Celestant»/);
  // а вспомогательным — можно
  assert.ok(auxiliaryFit(vanguard, r, L).ok);
});

test('полк: лимит «0-1» и «A или B» — один слот на двоих', () => {
  const { L, ws } = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE'), ws('Lord-Celestant'), L));
  const reg = r.regiments[0]!;
  r = ok(addToRegiment(r, reg.uid, ws('Gryph-hounds'), L));
  assert.match(reason(addToRegiment(r, reg.uid, ws('Gryph-hounds'), L)), /Лимит варианта/);
  const s = ctx('StD');
  let b = ok(addRegiment(newAosRoster('StD'), s.ws('Be’lakor, the Dark Master'), s.L));
  const breg = b.regiments[0]!;
  b = ok(addToRegiment(b, breg.uid, s.ws('Eternus, Blade of the First Prince'), s.L));
  const champ = s.L.faction.warscrolls.find((w) => w.hero && w.joinAs.includes('ruinous champion') && w.cost && !w.legends && !w.unique)!;
  assert.ok(champ, 'есть Ruinous Champion');
  assert.match(reason(addToRegiment(b, breg.uid, champ, s.L)), /Лимит варианта/);
});

test('полк: обязательные юниты добавляются сами; без них — ошибка', () => {
  const { L, ws } = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE'), ws('Neave Blacktalon'), L));
  const names = r.regiments[0]!.units.map((u) => L.ws.get(u.warscrollId)!.name).sort();
  assert.deepEqual(names, ['Lorai, Child of the Abyss', 'Neave’s Companions']);
  assert.ok(!codes(r, L).includes('regiment-required'));
  const lorai = r.regiments[0]!.units.find((u) => L.ws.get(u.warscrollId)!.name.startsWith('Lorai'))!;
  r = removeAosUnit(r, lorai.uid, L);
  assert.ok(codes(r, L).includes('regiment-required'));
  // Лорай нельзя взять в чужой полк и вспомогательным
  let r2 = ok(addRegiment(newAosRoster('SE'), ws('Lord-Celestant'), L));
  assert.match(reason(regimentFit(r2.regiments[0]!, ws('Lorai, Child of the Abyss'), r2, L)), /Только в полку: Neave Blacktalon/);
  assert.match(reason(auxiliaryFit(ws('Lorai, Child of the Abyss'), r2, L)), /Только в полку/);
  // UNIQUE: второй Neave — нельзя
  r2 = ok(addRegiment(r2, ws('Neave Blacktalon'), L));
  assert.match(reason(leaderFit(ws('Neave Blacktalon'), r2, L)), /UNIQUE/);
});

test('армия: от 1 до 5 полков', () => {
  const { L, ws } = ctx('SE');
  let r = newAosRoster('SE');
  assert.ok(codes(r, L).includes('no-regiment'));
  for (let i = 0; i < 5; i++) r = ok(addRegiment(r, ws('Lord-Celestant'), L));
  assert.match(reason(addRegiment(r, ws('Lord-Celestant'), L)), /5 полков/);
});

test('вспомогательные юниты: накопительная доплата 20 очков', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(auxiliarySurcharge), [0, 0, 20, 60, 120]);
  const { L, ws } = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE'), ws('Lord-Celestant'), L));
  const lib = ws('Liberators');
  r = ok(addAuxiliary(r, lib, L));
  r = ok(addAuxiliary(r, lib, L));
  r = ok(addAuxiliary(r, lib, L));
  const p = pointsOf(r, L);
  assert.equal(p.auxiliary, 60);
  assert.equal(p.total, 100 + 3 * lib.cost! + 60);
  // перенос в полк убирает доплату
  r = ok(moveAosUnit(r, r.auxiliaries[0]!.uid, r.regiments[0]!.uid, L));
  assert.equal(pointsOf(r, L).auxiliary, 20);
});

test('усиление: вдвое дороже; героя и одиночную модель — нельзя', () => {
  const { L, ws } = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE'), ws('Lord-Celestant'), L));
  r = ok(addToRegiment(r, r.regiments[0]!.uid, ws('Liberators'), L));
  const lib = r.regiments[0]!.units[0]!;
  assert.ok(reinforceFit(lib, r, L).ok);
  const before = pointsOf(r, L).total;
  r = updateAosUnit(r, lib.uid, { reinforced: true });
  assert.equal(pointsOf(r, L).total - before, ws('Liberators').cost!);
  assert.match(reason(reinforceFit(r.regiments[0]!.leader, r, L)), /одной модели|нельзя/);
  // «усиленный» герой из подделанного ростера — ошибка проверки
  const forged = updateAosUnit(r, r.regiments[0]!.leader.uid, { reinforced: true });
  assert.ok(codes(forged, L).includes('reinforce'));
});

test('очки: лимит и «не больше половины на один юнит»', () => {
  const { L, ws } = ctx('BS');
  const r = newAosRoster('BS', 1000);
  const k = ws('Kragnos, the End of Empires');
  assert.match(reason(leaderFit(k, r, L)), /половины лимита \(500/);
  const r2 = newAosRoster('BS', 2000);
  assert.ok(leaderFit(k, r2, L).ok);
  // лимит очков не превышается при добавлении
  const s = ctx('SE');
  let a = newAosRoster('SE', 1000);
  a = ok(addRegiment(a, s.ws('Lord-Celestant'), s.L));
  let guard = 0;
  while (guard++ < 40) {
    const res = addAuxiliary(a, s.ws('Liberators'), s.L);
    if (!res.ok) {
      assert.match(res.reason, /Не хватает очков/);
      break;
    }
    a = res.roster;
  }
  assert.ok(pointsOf(a, s.L).total <= 1000);
  // если лимит уменьшили вручную — ошибка проверки
  const big = { ...ok(addRegiment(newAosRoster('SE', 2000), s.ws('Lord-Celestant'), s.L)) };
  let b = big;
  for (let i = 0; i < 4; i++) b = ok(addToRegiment(b, b.regiments[0]!.uid, s.ws('Liberators'), s.L));
  for (let i = 0; i < 6; i++) b = ok(addAuxiliary(b, s.ws('Liberators'), s.L));
  assert.ok(codes({ ...b, pointsLimit: 1000 }, s.L).includes('points'));
});

test('генерал: должен вести полк; WARMASTER обязан быть генералом', () => {
  const { L, ws } = ctx('StD');
  let r = ok(addRegiment(newAosRoster('StD'), ws('Chaos Lord'), L));
  const lord = r.generalUid;
  r = ok(addRegiment(r, ws('Be’lakor, the Dark Master'), L));
  const bel = lastReg(r);
  assert.equal(r.generalUid, bel.leader.uid, 'WARMASTER стал генералом автоматически');
  assert.match(reason(generalFit(r.regiments[0]!, r, L)), /WARMASTER/);
  r = setGeneral(r, lord!);
  assert.ok(codes(r, L).includes('general'));
});

test('улучшения: одно на таблицу, не UNIQUE, по условиям таблицы; Scourge of Aqshy делит слот', () => {
  const { L, ws } = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE'), ws('Lord-Celestant'), L));
  r = ok(addRegiment(r, ws('Lord-Vigilant on Gryph-Stalker'), L));
  r = ok(addToRegiment(r, r.regiments[0]!.uid, ws('Liberators'), L));
  const [a, b] = r.regiments;
  const heroic = L.faction.enhancementTypes.find((t) => t.key === 'heroic')!.tables[0]!.items;
  assert.ok(enhancementFit(a!.leader, heroic[0]!.id, r, L).ok);
  r = setEnhancement(r, a!.leader.uid, 'heroic', heroic[0]!.id);
  assert.match(reason(enhancementFit(b!.leader, heroic[1]!.id, r, L)), /одно улучшение на таблицу/);
  // артефакты: обычная таблица и таблица Scourge of Aqshy — один слот
  const art = L.faction.enhancementTypes.find((t) => t.key === 'artefact')!;
  const std = art.tables.find((t) => t.season === 'standard')!.items[0]!;
  const aq = art.tables.find((t) => t.season === 'aqshy')!.items[0]!;
  r = setEnhancement(r, a!.leader.uid, 'artefact', std.id);
  assert.match(reason(enhancementFit(b!.leader, aq.id, r, L)), /одно улучшение на таблицу/);
  // таблица для не-героев: героя нельзя, Liberators можно
  const scars = L.faction.enhancementTypes.find((t) => t.key.startsWith('x:'))!.tables[0]!.items[0]!;
  assert.match(reason(enhancementFit(b!.leader, scars.id, r, L)), /только: non-HERO/);
  assert.ok(enhancementFit(r.regiments[0]!.units[0]!, scars.id, r, L).ok);
  // UNIQUE — нельзя
  let u = ok(addRegiment(newAosRoster('SE'), ws('Neave Blacktalon'), L));
  assert.match(reason(enhancementFit(u.regiments[0]!.leader, heroic[0]!.id, u, L)), /UNIQUE/);
  // подделка: одно и то же улучшение двум героям
  u = ok(addRegiment(u, ws('Lord-Celestant'), L));
  u = ok(addRegiment(u, ws('Lord-Celestant'), L));
  u = setEnhancement(setEnhancement(u, u.regiments[1]!.leader.uid, 'heroic', heroic[0]!.id), u.regiments[2]!.leader.uid, 'heroic', heroic[0]!.id);
  assert.ok(codes(u, L).includes('enh-dup'));
  assert.ok(codes(u, L).includes('enh-slot'));
});

test('ограничения из Battle Profiles: «1 на каждый», «нельзя вместе», версии Scourge of Aqshy, капы Skryre', () => {
  const se = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE'), se.ws('Lord-Celestant'), se.L));
  assert.match(reason(auxiliaryFit(se.ws('Stormdrake Guard (1 model)'), r, se.L)), /на каждый «knight-draconis»/);
  const sg = ctx('SG');
  let g = ok(addRegiment(newAosRoster('SG'), sg.ws('Radukar the Wolf'), sg.L));
  assert.match(reason(leaderFit(sg.ws('Radukar the Beast'), g, sg.L)), /Нельзя вместе/);
  const sn = ctx('SN');
  let s = ok(addRegiment(newAosRoster('SN'), sn.ws('Slann Starmaster'), sn.L));
  assert.match(reason(leaderFit(sn.ws('Scourge of Aqshy Slann Starmaster'), s, sn.L)), /одной версии|UNIQUE/);
  const st = ctx('ST');
  const lead = st.L.faction.warscrolls.find((w) => w.hero && w.cost && !w.legends && !w.keywords.includes('SKRYRE') && !w.factionKeywords.includes('SKRYRE') && w.options.some((o) => o.ids.includes(st.ws('Doomwheel').id)) && w.options.some((o) => o.ids.includes(st.ws('Warp-Grinder').id)))!;
  assert.ok(lead, 'есть лидер без SKRYRE, которому доступны машины Skryre');
  let k = ok(addRegiment(newAosRoster('ST'), lead, st.L));
  k = ok(addToRegiment(k, k.regiments[0]!.uid, st.ws('Doomwheel'), st.L));
  assert.match(reason(addToRegiment(k, k.regiments[0]!.uid, st.ws('Warp-Grinder'), st.L)), /Не больше 1 × SKRYRE WAR MACHINE/);
  void r;
  void g;
  void s;
});

test('Command Corps: юнит только в полку с Adjutants и не занимает место', () => {
  const { L, ws } = ctx('CoS');
  const lead = L.faction.warscrolls.find((w) => w.hero && w.cost && !w.legends && w.options.some((o) => o.ids.includes(ws('Freeguild Command Corps Adjutants').id)) && w.options.some((o) => o.ids.includes(ws('Freeguild Command Corps Auxiliaries').id)))!;
  assert.ok(lead, 'лидер для Command Corps');
  let r = ok(addRegiment(newAosRoster('CoS'), lead, L));
  const reg = () => r.regiments[0]!;
  assert.match(reason(addToRegiment(r, reg().uid, ws('Freeguild Command Corps Auxiliaries'), L)), /Сначала добавьте/);
  r = ok(addToRegiment(r, reg().uid, ws('Freeguild Command Corps Adjutants'), L));
  r = ok(addToRegiment(r, reg().uid, ws('Freeguild Command Corps Auxiliaries'), L));
  assert.equal(r.regiments[0]!.units.length, 2);
  assert.deepEqual(codes(r, L).filter((c) => c !== 'formation'), []);
});

test('лоры, построение, террейн, полк славы', () => {
  const { L, ws, data } = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE'), ws('Lord-Celestant'), L));
  assert.ok(codes(r, L).includes('formation'));
  r = { ...r, formationId: data.formations[0]!.id };
  assert.ok(!codes(r, L).includes('formation'));
  const forbidden = data.lores.find((l) => l.name === 'Forbidden Power')!;
  r = setLore(r, 'manifestation', forbidden.id);
  assert.equal(pointsOf(r, L).lores, 20);
  const terrain = data.warscrolls.find((w) => w.kind === 'terrain')!;
  r = { ...r, terrainId: terrain.id };
  assert.equal(pointsOf(r, L).terrain, terrain.cost);
  const fixed = data.rors.find((x) => !x.built && x.cost)!;
  assert.ok(rorFit(fixed, r, L).ok);
  r = { ...r, ror: { id: fixed.id, picked: [] } };
  assert.equal(pointsOf(r, L).ror, fixed.cost);
  const built = data.rors.find((x) => x.built)!;
  const r2 = { ...r, ror: { id: built.id, picked: [] } };
  assert.ok(codes(r2, L).includes('ror'));
  const pick = built.units.filter((u) => u.optional).slice(0, 2);
  const r3 = { ...r, ror: { id: built.id, picked: pick.map((u) => u.id) } };
  assert.equal(pointsOf(r3, L).ror, pick.reduce((s, u) => s + u.points!, 0));
  assert.ok(!codes(r3, L).includes('ror'));
  const foreign = ALL.flatMap((f) => f.rors).find((x) => !x.allowed.includes('SE'))!;
  assert.match(reason(rorFit(foreign, r, L)), /нельзя взять/);
});

test('экспорт, код переноса и защита от подделки', () => {
  const { L, ws, data } = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE', 2000, '2026-08-25'), ws('Lord-Celestant'), L));
  r = ok(addToRegiment(r, r.regiments[0]!.uid, ws('Liberators'), L));
  r = ok(addAuxiliary(r, ws('Vindictors'), L));
  r = { ...r, name: 'Тест', formationId: data.formations[0]!.id };
  const text = exportAos(r, L);
  assert.match(text, /^Тест \d+\/2000 pts/);
  assert.match(text, /General's Regiment\nLord-Celestant \(100 pts\)\n• General/);
  assert.match(text, /Auxiliary Units\nVindictors/);
  assert.match(text, /Drops: 2/);
  assert.match(exportAosCompact(r, L), /Lord-Celestant \(General\) — 100/);
  const back = decodeAosRoster(encodeAosRoster(r), ['SE']);
  assert.deepEqual(back.regiments, r.regiments);
  assert.equal(back.generalUid, r.generalUid);
  assert.throws(() => decodeAosRoster('AOS1.мусор'), /Неверный код/);
  assert.throws(() => decodeAosRoster(encodeAosRoster(r), ['CoS']), /неизвестной фракции/);
  assert.equal(sanitizeAosRoster({ system: '40k', factionId: 'SE' }), null);
  // подделанный ростер: чужой юнит в полку, лимит «0-1» нарушен, генерал не лидер
  const forged = JSON.parse(JSON.stringify(r)) as AosRoster;
  forged.regiments[0]!.units.push({ uid: 'x1', warscrollId: ws('Gryph-hounds').id, reinforced: false, enhancements: {} });
  forged.regiments[0]!.units.push({ uid: 'x2', warscrollId: ws('Gryph-hounds').id, reinforced: false, enhancements: {} });
  forged.generalUid = 'x1';
  const clean = sanitizeAosRoster(forged)!;
  assert.equal(clean.generalUid, null, 'генерал не лидер — сброшен');
  const c = codes(clean, L);
  assert.ok(c.includes('regiment-options'));
  assert.ok(c.includes('general'));
});

// ---------- полный перебор ----------

test('перебор по всем фракциям: всё, что интерфейс разрешает, проходит полную проверку', () => {
  let checked = 0;
  for (const f of ALL) {
    const L = makeAosLookup(f);
    const base = (lim: 1000 | 2000) => ({ ...newAosRoster(f.id, lim), formationId: f.formations[0]?.id ?? null });
    const ignore = new Set(['regiment-required', 'stale-rules']);
    const errs = (r: AosRoster) => computeAos(r, L).issues.filter((i) => i.level === 'error' && !ignore.has(i.code));
    for (const leader of f.warscrolls.filter((w) => w.hero)) {
      const r0 = base(2000);
      const lf = leaderFit(leader, r0, L);
      if (!lf.ok) continue;
      const r1 = ok(addRegiment(r0, leader, L));
      assert.deepEqual(errs(r1), [], `${f.id}: полк «${leader.name}»`);
      const reg = r1.regiments[0]!;
      for (const w of f.warscrolls) {
        if (w.kind !== 'unit') continue;
        const fit = regimentFit(reg, w, r1, L);
        if (fit.ok) {
          const r2 = ok(addToRegiment(r1, reg.uid, w, L));
          assert.deepEqual(errs(r2), [], `${f.id}: «${w.name}» в полку «${leader.name}»: ${errs(r2).map((i) => i.message).join('; ')}`);
          const u = r2.regiments[0]!.units.at(-1)!;
          if (reinforceFit(u, r2, L).ok) {
            const r3 = updateAosUnit(r2, u.uid, { reinforced: true });
            assert.deepEqual(errs(r3), [], `${f.id}: усиленный «${w.name}»`);
            assert.equal(pointsOf(r3, L).units - pointsOf(r2, L).units, w.cost);
          }
          checked++;
        } else assert.ok(fit.reason.length > 5, `${f.id}: пустая причина для «${w.name}»`);
      }
      // все улучшения, которые интерфейс разрешает лидеру, проходят проверку
      for (const ref of L.enh.values()) {
        if (enhancementFit(reg.leader, ref.item.id, r1, L).ok) {
          const r4 = setEnhancement(r1, reg.leader.uid, ref.type.key, ref.item.id);
          assert.deepEqual(errs(r4), [], `${f.id}: «${ref.item.name}» у «${leader.name}»`);
          checked++;
        }
      }
    }
    // каждый допустимый юнит фракции можно взять вспомогательным или в чей-то полк
    const r0 = base(2000);
    for (const w of f.warscrolls.filter((x) => x.kind === 'unit' && x.cost != null && !x.legends && x.season !== 'ghyran' && !x.aorOnly)) {
      if (auxiliaryFit(w, r0, L).ok || leaderFit(w, r0, L).ok) continue;
      // остаются юниты «только в полку X» — проверяем, что X существует и принимает их
      assert.ok(w.onlyInIds.length || w.requiresInRegiment || w.perUnitOf || (w.cost ?? 0) > 1000, `${f.id}: «${w.name}» нельзя взять никак`);
    }
    const anyLeaderOf = () => f.warscrolls.find((w) => leaderFit(w, base(2000), L).ok);
    // полки славы: каждый допустимый проходит проверку
    for (const ror of anyLeaderOf() ? f.rors : []) {
      const r = { ...base(2000) };
      const r1 = f.warscrolls.find((w) => leaderFit(w, r, L).ok) ? ok(addRegiment(r, f.warscrolls.find((w) => leaderFit(w, r, L).ok)!, L)) : r;
      const picked = ror.built ? [ror.units.find((u) => u.optional)!.id] : [];
      if (!rorFit(ror, r1, L, picked).ok) continue;
      const r2 = { ...r1, ror: { id: ror.id, picked } };
      assert.deepEqual(errs(r2), [], `${f.id}: полк славы «${ror.name}»`);
      checked++;
    }
    // лоры и построения
    const anyLeader = f.warscrolls.find((w) => leaderFit(w, base(2000), L).ok);
    for (const lore of anyLeader ? f.lores : []) {
      const r = ok(addRegiment(base(2000), anyLeader!, L));
      const r2 = setLore(r, lore.kind, lore.id);
      if (lore.points == null) assert.ok(codes(r2, L).includes('lore'));
      else assert.ok(!codes(r2, L).includes('lore'), `${f.id}: лора ${lore.name}`);
    }
  }
  assert.ok(checked > 8000, `проверено ${checked}`);
});

// ---------- найденное при независимом ревью ----------

test('перенос во вспомогательные учитывает очки самого юнита', () => {
  const { L, ws } = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE', 1000), ws('Lord-Celestant'), L));
  r = ok(addToRegiment(r, r.regiments[0]!.uid, ws('Liberators'), L));
  for (let i = 0; i < 4; i++) r = ok(addAuxiliary(r, ws('Vindictors'), L));
  // 100 + 90 + 4×90 + (20+40+60) = 670; ещё два вспомогательных выходят за 1000 — проверим, что перенос не обходит лимит
  while (true) {
    const res = addAuxiliary(r, ws('Vindictors'), L);
    if (!res.ok) break;
    r = res.roster;
  }
  const lib = r.regiments[0]!.units[0]!;
  const res = moveAosUnit(r, lib.uid, 'aux', L);
  if (res.ok) assert.ok(pointsOf(res.roster, L).total <= 1000, `после переноса ${pointsOf(res.roster, L).total}`);
  else assert.match(res.reason, /Не хватает очков/);
});

test('смена генерала не оставляет прежний полк с 4 юнитами', () => {
  const { L, ws } = ctx('SE');
  let r = ok(addRegiment(newAosRoster('SE'), ws('Lord-Celestant'), L));
  const first = r.regiments[0]!;
  for (let i = 0; i < 4; i++) r = ok(addToRegiment(r, first.uid, ws('Liberators'), L));
  r = ok(addRegiment(r, ws('Lord-Celestant'), L));
  assert.match(reason(generalFit(lastReg(r), r, L)), /не больше 3/);
  // WARMASTER-лидер стал бы генералом — его тоже нельзя, пока в полку генерала 4 юнита
  const prime = L.faction.warscrolls.find((w) => w.warmaster && w.cost && !w.legends && w.season !== 'ghyran')!;
  assert.match(reason(leaderFit(prime, r, L)), /станет генералом/);
});

test('полк славы: UNIQUE и «без других UNIQUE» проверяются в обе стороны', () => {
  const { L, data } = ctx('StD');
  const athol = data.warscrolls.find((w) => w.noOtherUnique)!;
  let r = ok(addRegiment({ ...newAosRoster('StD'), showLegends: true }, athol, L));
  const withUnique = data.rors.find((x) => !x.built && x.units.some((u) => L.ws.get(u.id)?.unique) && rorFit(x, { ...newAosRoster('StD') }, L).ok);
  if (withUnique) assert.match(reason(rorFit(withUnique, r, L)), /UNIQUE/);
  void r;
});

test('обязательный юнит, который не по карману, не создаёт незаконный полк', () => {
  const { L, ws } = ctx('SE');
  const r = newAosRoster('SE', 1000);
  // Neave + обязательные юниты: если лимит позволяет только лидера — полк не создаётся
  const res = addRegiment(r, ws('Neave Blacktalon'), L);
  if (res.ok) assert.ok(!codes(res.roster, L).includes('regiment-required'));
});

test('подделанный код с огромным полком обрабатывается быстро', () => {
  const { L, data } = ctx('LRL');
  const leader = data.warscrolls.find((w) => w.hero && w.options.filter((o) => o.q === 'any').length >= 2 && w.cost && !w.legends) ?? data.warscrolls.find((w) => w.hero && w.cost)!;
  const any = leader.options.find((o) => o.q === 'any')!.ids[0]!;
  const bad = data.warscrolls.find((w) => !w.hero && !leader.options.some((o) => o.ids.includes(w.id)))!;
  const units = Array.from({ length: 60 }, (_, i) => ({ uid: 'u' + i, warscrollId: i === 59 ? bad.id : any, reinforced: false, enhancements: {} }));
  const raw = { ...newAosRoster('LRL'), regiments: Array.from({ length: 20 }, (_, g) => ({ uid: 'g' + g, leader: { uid: 'l' + g, warscrollId: leader.id, reinforced: false, enhancements: {} }, units })) };
  const t = Date.now();
  const clean = sanitizeAosRoster(JSON.parse(JSON.stringify(raw)))!;
  assert.ok(clean.regiments.length <= 8 && clean.regiments.every((g) => g.units.length <= 8));
  const c = computeAos(clean, L);
  assert.ok(c.errors > 0);
  assert.ok(Date.now() - t < 1500, `проверка заняла ${Date.now() - t} мс`);
  const m = matchRegiment(leader, Array.from({ length: 8 }, () => L.ws.get(any)!));
  assert.equal(m.fits, true);
});

test('перебор: два полка, перенос, удаление, смена генерала — разрешённое всегда законно', () => {
  let checked = 0;
  for (const f of ALL) {
    const L = makeAosLookup(f);
    const ignore = new Set(['regiment-required', 'stale-rules', 'formation']);
    const errs = (r: AosRoster) => computeAos(r, L).issues.filter((i) => i.level === 'error' && !ignore.has(i.code));
    const leaders = f.warscrolls.filter((w) => leaderFit(w, newAosRoster(f.id), L).ok).slice(0, 8);
    for (const a of leaders) {
      let r = ok(addRegiment(newAosRoster(f.id), a, L));
      const units = f.warscrolls.filter((w) => w.kind === 'unit');
      // заполняем первый полк до отказа
      for (const w of units) {
        const res = addToRegiment(r, r.regiments[0]!.uid, w, L);
        if (res.ok) r = res.roster;
      }
      assert.deepEqual(errs(r), [], `${f.id}: полный полк «${a.name}»`);
      for (const b of leaders) {
        const res = addRegiment(r, b, L);
        if (!res.ok) continue;
        let r2 = res.roster;
        assert.deepEqual(errs(r2), [], `${f.id}: «${a.name}» + «${b.name}»: ${errs(r2).map((i) => i.message).join('; ')}`);
        for (const w of units.slice(0, 40)) {
          const x = addAuxiliary(r2, w, L);
          if (x.ok) r2 = x.roster;
        }
        assert.deepEqual(errs(r2), [], `${f.id}: вспомогательные`);
        // перенос каждого юнита во второй полк и во вспомогательные
        for (const u of [...r2.regiments[0]!.units, ...r2.auxiliaries]) {
          for (const t of [r2.regiments[1]!.uid, 'aux']) {
            const mv = moveAosUnit(r2, u.uid, t, L);
            if (mv.ok) assert.deepEqual(errs(mv.roster), [], `${f.id}: перенос`);
            checked++;
          }
        }
        // смена генерала, если разрешена
        if (generalFit(r2.regiments[1]!, r2, L).ok) assert.deepEqual(errs(setGeneral(r2, r2.regiments[1]!.leader.uid)), [], `${f.id}: смена генерала`);
        checked++;
      }
    }
  }
  assert.ok(checked > 2000, `проверено ${checked}`);
});
