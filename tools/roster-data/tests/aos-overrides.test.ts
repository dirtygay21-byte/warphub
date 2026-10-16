// Правки варскроллов AoS из aos/curated.json → warscrollOverrides и предупреждения об устаревших правилах (stale).
// 1) механизм (normaliseAosFaction / warscrollOverrides / missingPointsNote) — на маленьких искусственных данных;
// 2) регрессия по настоящим данным: Legends у героев Darkwater, Grombrindal CoS/KO = Fyreslayers, Auto-Endrin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — .mjs без типов
import { missingPointsNote, normaliseAosFaction, rulesNoticeOf, warscrollOverrides, warscrollRefs } from '../scripts/import-wahapedia-aos.mjs';
import { makeAosLookup, rorFit, warscrollFit } from '../../../client/src/features/roster/aos/engine';
import { newAosRoster } from '../../../client/src/features/roster/aos/roster';
import type { AosFactionData, AosIndex, AosWarscroll } from '../../../client/src/features/roster/aos/types';

const dir = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'aos');
const INDEX: AosIndex = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const load = (id: string): AosFactionData => JSON.parse(fs.readFileSync(path.join(dir, 'f', id + '.json'), 'utf8'));
const ALL = INDEX.factions.map((f) => load(f.id));
const curated = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'aos', 'curated.json'), 'utf8'));
const byId = (f: AosFactionData, id: string) => [...f.warscrolls, ...f.rorUnits, ...f.universalManifestations].filter((w) => w.id === id);
const ws = (fid: string, id: string): AosWarscroll => load(fid).warscrolls.find((w) => w.id === id)!;

const DARKWATER = ['000002663', '000002664', '000002665', '000002666', '000002667', '000002668', '000002669', '000003138'];
const GROMBRINDAL = { FY: '000002684', CoS: '000002685', KO: '000002686' };
const AUTO_ENDRIN = '000002427';

// ---------- механизм на искусственных данных ----------

const unit = (id: string, over: Record<string, unknown> = {}) => ({
  id, faction: 'T', name: 'Hero', kind: 'unit', hero: true, unitSize: 1, cost: null, keywords: ['HERO'], factionKeywords: ['ORDER'], regimentKeywords: [],
  params: {}, stats: { move: '"' }, weapons: [], abilities: [], bases: '', legends: false, legendsDate: null, notes: '', link: 'own', options: [], ...over,
});
const fac = (id: string, warscrolls: unknown[]) => ({ id, warscrolls, rorUnits: [], universalManifestations: [], battleTraits: [], formations: [], enhancementTypes: [], lores: [], rors: [], rulesNotice: null });
const cur = (items: unknown[]) => ({ warscrollOverrides: { items }, stale: { factions: { T: 'notice' } } });

test('правки: set.legends и setUpBy применяются по id; повторная обработка ничего не меняет', () => {
  const data = fac('T', [unit('a'), unit('b', { name: 'Gadget', hero: false })]);
  const c = cur([
    { ids: ['a'], set: { legends: true }, why: 'w', source: 's' },
    { ids: ['b'], set: { setUpBy: { warscroll: 'Dock', ability: 'Release' } }, why: 'w', source: 's' },
  ]);
  normaliseAosFaction(data, c);
  const once = JSON.stringify(data);
  normaliseAosFaction(data, c);
  assert.equal(JSON.stringify(data), once);
  assert.equal((data.warscrolls[0] as { legends: boolean }).legends, true);
  assert.deepEqual((data.warscrolls[1] as { setUpBy: unknown }).setUpBy, { warscroll: 'Dock', ability: 'Release' });
  assert.equal(data.rulesNotice, 'notice');
});

test('правки: copyFrom копирует поля источника, свои id/фракция/ссылка остаются, варианты полка — по своей фракции', () => {
  const src = unit('src', { faction: 'S', cost: 100, stats: { move: '4"' }, legends: true, notes: 'Legends Warscroll', link: 'src',
    options: [{ q: 'any', required: false, label: 'ORDER DUARDIN', kind: 'keyword', ids: ['s1'] }] });
  const mine = unit('dst');
  const duardin = unit('d1', { hero: false, keywords: ['INFANTRY'], factionKeywords: ['ORDER', 'DUARDIN'] });
  const aelf = unit('a1', { hero: false, keywords: ['INFANTRY'], factionKeywords: ['ORDER', 'AELF'] });
  const files = { S: fac('S', [src]), T: fac('T', [mine, duardin, aelf]) };
  normaliseAosFaction(files.T, cur([{ ids: ['dst'], copyFrom: 'src', why: 'w', source: 's' }]), warscrollRefs(files));
  const w = files.T.warscrolls[0] as ReturnType<typeof unit>;
  assert.equal(w.id, 'dst');
  assert.equal(w.link, 'own');
  assert.equal(w.cost, 100);
  assert.equal(w.legends, true);
  assert.deepEqual((w.options as { ids: string[] }[])[0].ids, ['d1']);
  assert.deepEqual((src.options as { ids: string[] }[])[0].ids, ['s1'], 'источник не меняется');
});

test('правки: ошибки схемы и неподдерживаемые случаи останавливают обработку', () => {
  const base = { ids: ['a'], why: 'w', source: 's' };
  assert.throws(() => warscrollOverrides(cur([{ ...base, set: { cost: 100 } }])), /неизвестные поля cost/);
  assert.throws(() => warscrollOverrides(cur([{ ...base, revised: true, set: { legends: true } }])), /неизвестные поля revised/);
  assert.throws(() => warscrollOverrides(cur([{ ids: ['a'], set: { legends: true }, source: 's' }])), /неполная правка/);
  assert.throws(() => warscrollOverrides(cur([{ ...base, set: { legends: false } }])), /только true/);
  assert.throws(() => normaliseAosFaction(fac('T', [unit('a')]), cur([{ ...base, copyFrom: 'missing' }]), new Map()), /нет варскролла-источника/);
  const src = unit('src', { options: [{ q: 'any', required: false, label: 'Cogsmith', kind: 'unit', ids: ['x'] }] });
  const files = { S: fac('S', [src]), T: fac('T', [unit('a')]) };
  assert.throws(() => normaliseAosFaction(files.T, cur([{ ...base, copyFrom: 'src' }]), warscrollRefs(files)), /не поддерживается/);
});

test('отчёт импорта: юнит без очков отмечается, кроме Legends-правок и юнитов, которые ставит другой варскролл', () => {
  const c = cur([
    { ids: ['leg'], set: { legends: true }, why: 'w', source: 's' },
    { ids: ['tok'], set: { setUpBy: { warscroll: 'Zontari Endrin Dock', ability: 'Release The Auto-Endrins' } }, why: 'w', source: 's' },
  ]);
  assert.match(missingPointsNote('T', unit('x', { name: 'X' }), c), /нет очков в Battle Profiles/);
  assert.equal(missingPointsNote('T', unit('leg'), c), null);
  const note = missingPointsNote('KO', unit('tok', { name: 'Auto-Endrin' }), c);
  assert.match(note, /очков нет по правилам: ставится способностью «Release The Auto-Endrins» \(Zontari Endrin Dock\)/);
  assert.doesNotMatch(note, /нельзя добавить/);
  assert.equal(missingPointsNote('T', unit('y', { cost: 100 }), c), null);
});

// ---------- регрессия по настоящим данным ----------

test('curated.warscrollOverrides: схема в порядке, у каждой правки есть обоснование и источник', () => {
  const map = warscrollOverrides(curated);
  assert.deepEqual([...map.keys()].sort(), [...DARKWATER, GROMBRINDAL.CoS, GROMBRINDAL.KO, AUTO_ENDRIN].sort());
});

test('Darkwater Heroes (7 героев и Wisper) — Legends во всех файлах, где встречаются; очков у самих варскроллов нет', () => {
  let seen = 0;
  for (const f of ALL)
    for (const id of DARKWATER)
      for (const w of byId(f, id)) {
        seen++;
        assert.equal(w.legends, true, `${f.id} ${w.name}`);
        assert.equal(w.cost, null, `${f.id} ${w.name}`);
      }
  assert.equal(seen, 8 + 56);
  const L = makeAosLookup(load('CoS'));
  const edmark = ws('CoS', '000002663');
  assert.equal(warscrollFit(edmark, { ...newAosRoster('CoS'), showLegends: true }, L).ok, false, 'без очков юнит отдельно не берётся');
});

test('Heroes of The Jade Abbey не изменён: собираемый полк, очки героев 110–150, доступен как раньше', () => {
  for (const f of ALL)
    for (const r of f.rors.filter((x) => x.id === '000002671')) {
      assert.equal(r.cost, null);
      assert.equal(r.built, true);
      assert.ok(!('legends' in r), 'у полка нет флага Legends');
      assert.deepEqual(r.units.map((u) => u.points), [110, 120, 120, 100, 150, 130, 150]);
    }
  const data = load('CoS');
  const ror = data.rors.find((x) => x.id === '000002671')!;
  assert.ok(rorFit(ror, newAosRoster('CoS'), makeAosLookup(data), ['000002663']).ok);
});

test('Grombrindal CoS и KO = варскролл Fyreslayers, кроме своих id, фракции, ссылки и вариантов полка', () => {
  const src = ws('FY', GROMBRINDAL.FY);
  for (const fid of ['CoS', 'KO'] as const) {
    const w = ws(fid, GROMBRINDAL[fid]);
    const diff = Object.keys(src).filter((k) => JSON.stringify(src[k as keyof AosWarscroll]) !== JSON.stringify(w[k as keyof AosWarscroll]));
    assert.deepEqual(diff, ['id', 'faction', 'link', 'options'], fid);
    assert.equal(w.faction, fid);
    assert.match(w.link, fid === 'CoS' ? /cities-of-sigmar/ : /kharadron-overlords/);
    assert.deepEqual(w.stats, { move: '4"', save: '4+', control: '2', health: '8', ward: '3+' });
    assert.equal(w.cost, 360);
    assert.equal(w.legends, true);
    assert.deepEqual(w.abilities.map((a) => a.name), ['Armour of Glimril Scales', 'Rune Axe of Grimnir', 'As Stern as Stone', 'Living Legend']);
    // вариант полка «Any ORDER DUARDIN» — юниты своей фракции
    const data = load(fid);
    const own = new Set(data.warscrolls.map((x) => x.id));
    assert.equal(w.options.length, 1);
    assert.equal(w.options[0].label, 'ORDER DUARDIN');
    assert.ok(w.options[0].ids.length && w.options[0].ids.every((id) => own.has(id)), fid);
    for (const id of w.options[0].ids) {
      const u = data.warscrolls.find((x) => x.id === id)!;
      const kw = new Set([...u.keywords, ...u.factionKeywords, ...u.regimentKeywords]);
      assert.ok(kw.has('ORDER') && kw.has('DUARDIN') && !u.hero, `${fid} ${u.name}`);
    }
    // Legends: без показа Legends не берётся, с показом — берётся
    const L = makeAosLookup(data);
    assert.equal(warscrollFit(w, newAosRoster(fid), L).ok, false);
    assert.equal(warscrollFit(w, { ...newAosRoster(fid), showLegends: true }, L).ok, true);
  }
});

test('Auto-Endrin: ставится Zontari Endrin Dock, очков нет и не придумано, в отчёт как «нельзя добавить» не попадает', () => {
  const w = ws('KO', AUTO_ENDRIN) as AosWarscroll & { setUpBy?: { warscroll: string; ability: string } };
  assert.equal(w.cost, null);
  assert.deepEqual(w.setUpBy, { warscroll: 'Zontari Endrin Dock', ability: 'Release The Auto-Endrins' });
  const dock = load('KO').warscrolls.find((x) => x.name === 'Zontari Endrin Dock')!;
  assert.ok(dock.abilities.some((a) => a.name === 'Release The Auto-Endrins' && /Auto-Endrin warscroll/.test(a.text)));
  assert.doesNotMatch(missingPointsNote('KO', w, curated) ?? '', /нельзя добавить/);
});

test('устаревшие правила OM и SoB: предупреждение в данных = curated, даты исправлены', () => {
  for (const f of ALL) assert.equal(f.rulesNotice ?? null, rulesNoticeOf(curated, f.id), f.id);
  assert.match(load('OM').rulesNotice!, /Ogor Mawtribes \(июль 2026\)/);
  assert.match(load('SoB').rulesNotice!, /Sons of Behemat \(сентябрь 2026\)/);
});
