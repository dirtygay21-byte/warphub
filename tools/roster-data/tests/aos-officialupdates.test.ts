// Правки по официальным документам GW (aos/curated.json → officialUpdates), доработка 17.10.2026:
// полки славы — удалённые (withdrawn), убранные из фракции (allowedRemove), добавленные фракции (allowedAdd), дата Legends;
// дата Legends у лора; переименование и очки улучшения по id; источник текста у официальных правок; index.json по данным.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — .mjs без типов
import { indexEntry, normaliseAosFaction, officialUpdatesReport, warscrollRefs } from '../scripts/import-wahapedia-aos.mjs';
import { computeAos, legendsLabel, loreFit, makeAosLookup, rorFit } from '../../../client/src/features/roster/aos/engine';
import { newAosRoster } from '../../../client/src/features/roster/aos/roster';
import type { AosFactionData, AosIndex } from '../../../client/src/features/roster/aos/types';

const dir = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'aos');
const INDEX: AosIndex = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const load = (id: string): AosFactionData => JSON.parse(fs.readFileSync(path.join(dir, 'f', id + '.json'), 'utf8'));
const ALL = INDEX.factions.map((f) => load(f.id));
const byId = Object.fromEntries(ALL.map((f) => [f.id, f]));
const curated = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'aos', 'curated.json'), 'utf8'));
const ou = curated.officialUpdates;

const STUMBLEFOOT = '000002030';
const GOTREK = '000002216';
const NORGRIMM = '000001837';
const FJORI = '000001984';
const KRITTOK = '000001785';
const VOLT = '000001776';
const filesWith = (id: string) => ALL.filter((f) => f.rors.some((r) => r.id === id)).map((f) => f.id).sort();
const errorsOf = (f: AosFactionData, rorId: string) => {
  const r = { ...newAosRoster(f.id, 2000), ror: { id: rorId, picked: [] } };
  return computeAos(r, makeAosLookup(f)).issues.filter((i) => i.code === 'ror').map((i) => i.message);
};

test('официальные правки: все применены, отложенных нет, у исследованных вопросов есть решение и доказательство', () => {
  const lines = officialUpdatesReport(byId, curated);
  assert.match(lines[0]!, new RegExp(`применено ${ou.items.length} из ${ou.items.length}$`), lines.join('\n'));
  assert.ok(!lines.some((l) => l.startsWith('официальные правки не применены')), lines.join('\n'));
  assert.deepEqual(ou.notApplied, []);
  for (const ref of ['A216', 'A219', 'A228', 'A235', 'A446', 'A448', 'A449', 'A206', 'A438']) assert.ok(ou.items.some((i: { ref: string }) => i.ref === ref), ref);
  for (const r of ou.reviewed) assert.ok(r.ref && r.item && r.decision && r.evidence, JSON.stringify(r));
  for (const r of ou.unresolved) assert.ok(r.ref && r.item && r.reason, JSON.stringify(r));
  for (const ref of ['A262', 'A391', 'A417', 'A419', 'A439', 'F04', 'F05', 'F06']) assert.ok(ou.reviewed.some((r: { ref: string }) => r.ref === ref), ref);
});

test('Stumblefoot Gargant (удалён из Battle Profiles 09.2026): нет ни в одном файле, у 26 фракций запись withdrawnRors', () => {
  assert.deepEqual(filesWith(STUMBLEFOOT), []);
  const gone = ALL.filter((f) => f.withdrawnRors?.some((w) => w.id === STUMBLEFOOT)).map((f) => f.id);
  assert.equal(gone.length, 26);
  assert.ok(!gone.includes('SoB'), 'SoB — владелец полка, в его файле записи полка не было');
  // юнит полка (Mancrusher Gargant) не остался висеть без полка
  for (const f of ALL) {
    const used = new Set(f.rors.flatMap((r) => r.units.map((u) => u.id)));
    for (const w of f.rorUnits) assert.ok(used.has(w.id), `${f.id}: ${w.name} без полка славы`);
  }
  // сохранённый ростер с удалённым полком: ошибка с причиной, а не «не найден»
  const [msg] = errorsOf(byId.CoS!, STUMBLEFOOT);
  assert.match(msg!, /«Stumblefoot Gargant» удалён из Battle Profiles, September 2026 \(2026-09-23, с\. 59\); вместо него — Krong the Club/);
  assert.match(msg!, /уберите его из ростера/);
});

test('Gotrek Gurnisson: 220 для 8 фракций (Khazalite Holds BP 10.2026), у Fyreslayers убран с причиной', () => {
  const allowed = ['CoS', 'DoK', 'ID', 'KO', 'LRL', 'SE', 'SN', 'SY'];
  assert.deepEqual(filesWith(GOTREK), allowed);
  for (const fid of allowed) {
    const r = byId[fid]!.rors.find((x) => x.id === GOTREK)!;
    assert.equal(r.cost, 220, fid);
    assert.deepEqual(r.allowed, allowed, fid);
    assert.ok(rorFit(r, newAosRoster(fid, 2000), makeAosLookup(byId[fid]!)).ok, fid);
  }
  assert.ok(!byId.FY!.rorUnits.some((w) => w.name === 'Gotrek Gurnisson'));
  const [msg] = errorsOf(byId.FY!, GOTREK);
  assert.match(msg!, /«Gotrek Gurnisson» больше не разрешён этой фракции: Battle Profiles: Khazalite Holds, October 2026 \(2026-10-14, с\. 3\)/);
  // правила убранных полков Stage A (Bonesplitterz, Beasts of Chaos) тоже дают причину
  assert.match(errorsOf(byId.BS!, '000001935')[0]!, /«Bundo Whalebiter» больше не разрешён этой фракции/);
});

test('Norgrimm’s Rune Throng и Fjori’s Flamebearers: дата перехода в Legends 1 июня 2027 — в данных и в подписи, пока доступны', () => {
  for (const id of [NORGRIMM, FJORI])
    for (const f of ALL.filter((x) => x.rors.some((r) => r.id === id))) {
      const r = f.rors.find((x) => x.id === id)!;
      assert.equal(r.legendsDate, '2027-06-01', `${f.id} ${r.name}`);
      assert.equal(r.legends, undefined);
      assert.equal(legendsLabel(r), 'Уйдёт в Legends 01.06.2027');
      assert.ok(rorFit(r, newAosRoster(f.id, 2000), makeAosLookup(f)).ok, `${f.id} ${r.name}`);
    }
  assert.equal(filesWith(NORGRIMM).length, 8);
  assert.equal(filesWith(FJORI).length, 8);
  // полк, уже ушедший в Legends, без показа Legends не берётся
  const f = clone(byId.SE!);
  const r = f.rors.find((x) => x.id === NORGRIMM)!;
  r.legends = true;
  assert.equal(rorFit(r, newAosRoster('SE', 2000), makeAosLookup(f)).ok, false);
  assert.ok(rorFit(r, { ...newAosRoster('SE', 2000), showLegends: true }, makeAosLookup(f)).ok);
});

test('Krittok’s Clawpack и Volt-Klaw’s Enginecoven: Beasts of Chaos добавлены (BP 09.2026), запись и юниты — копии из других файлов', () => {
  for (const id of [KRITTOK, VOLT]) {
    const files = filesWith(id);
    assert.deepEqual(files, ['BoC', 'BoK', 'DoT', 'HS', 'MoN', 'StD']);
    const ref = JSON.stringify(byId.BoK!.rors.find((r) => r.id === id));
    for (const fid of files) assert.equal(JSON.stringify(byId[fid]!.rors.find((r) => r.id === id)), ref, `${fid}: запись полка отличается`);
    const r = byId.BoC!.rors.find((x) => x.id === id)!;
    for (const u of r.units) {
      const copy = byId.BoC!.rorUnits.find((w) => w.id === u.id);
      assert.ok(copy, `BoC: нет юнита ${u.id}`);
      assert.equal(JSON.stringify(copy), JSON.stringify(byId.BoK!.rorUnits.find((w) => w.id === u.id)), `BoC: копия ${copy!.name} отличается`);
    }
    assert.ok(rorFit(r, newAosRoster('BoC', 2000), makeAosLookup(byId.BoC!)).ok, r.name);
  }
  assert.equal(byId.BoC!.rors.find((r) => r.id === KRITTOK)!.cost, 350);
  assert.equal(byId.BoC!.rors.find((r) => r.id === VOLT)!.cost, 380);
});

test('Magmic Invocations: дата перехода в Legends у лора, лор доступен; Blade-limbs — имя и 20 очков, героическая черта не тронута', () => {
  const fy = byId.FY!;
  const lore = fy.lores.find((l) => l.name === 'Magmic Invocations')!;
  assert.equal(lore.legendsDate, '2027-06-01');
  assert.ok(loreFit(lore, newAosRoster('FY', 2000), makeAosLookup(fy)).ok);
  assert.equal(fy.lores.filter((l) => l.legendsDate).length, 1);
  const items = byId.BoK!.enhancementTypes.flatMap((t) => t.tables.flatMap((tb) => tb.items.map((it) => ({ table: tb.name, ...it }))));
  const bl = items.find((it) => it.id === '000004483:3')!;
  assert.deepEqual([bl.table, bl.name, bl.points], ['Brazen Mutations', 'BLADE-LIMBS', 20]);
  assert.match(bl.text, /Eruption of Fury/);
  const trait = items.find((it) => it.id === '000002888:3')!;
  assert.deepEqual([trait.table, trait.name, trait.points], ['Slaughterers of Thousands', 'FRENZIED TASKMASTER', 0]);
});

test('Hedonites: три героя из раздела Warhammer Legends Battle Profiles 09.2026 — Legends', () => {
  const hs = byId.HS!.warscrolls;
  for (const name of ['Bladebringer, Herald on Hellflayer', 'Bladebringer, Herald on Seeker Chariot', 'Viceleader, Herald of Slaanesh']) assert.equal(hs.find((w) => w.name === name)!.legends, true, name);
  assert.equal(hs.find((w) => w.name === 'Bladebringer, Herald on Exalted Chariot')!.legends, false);
});

test('DIRTY TRICKS: первое предложение убрано (Rules Updates 09.2026, с. 61), таблица на месте, источник — GW', () => {
  const r = byId.KB!.battleTraits.find((x) => x.name === 'DIRTY TRICKS')! as { text: string; textSource?: string };
  assert.ok(r.text.startsWith('Effect: The success of a dirty trick roll depends on'), r.text);
  assert.doesNotMatch(r.text, /only applied if you make a successful dirty trick roll/);
  assert.match(r.text, /Fourth or subsequent — 5\+$/);
  assert.equal(r.textSource, 'gw-rules-updates');
});

test('официальный текст правила: у всех правил с правкой текста источник — gw-rules-updates (SONG OF THE LOST тоже)', () => {
  for (const it of ou.items.filter((i: { kind: string; field: string }) => i.kind === 'rule' && i.field === 'text'))
    for (const owner of it.owners) {
      const [fid, own] = [owner.split('|')[0], owner.slice(owner.indexOf('|') + 1)];
      const data = byId[fid]!;
      const recs = [] as { text: string; textSource?: string }[];
      for (const [o, r] of rulesWithOwnerLocal(data)) if (o === own && r.name === it.ruleName) recs.push(r);
      assert.ok(recs.length > 0, `${owner} «${it.ruleName}»`);
      for (const r of recs) {
        assert.equal(r.text, it.value, `${owner} «${it.ruleName}»`);
        assert.equal(r.textSource, 'gw-rules-updates', `${owner} «${it.ruleName}»`);
      }
    }
});

test('index.json: строки фракций = данные (indexEntry), Bonesplitterz — только Legends', () => {
  for (const f of INDEX.factions) assert.deepEqual(f, indexEntry(byId[f.id], curated), f.id);
  assert.equal(INDEX.factions.find((f) => f.id === 'BS')!.legendsOnly, true);
});

test('повторная обработка готовых данных ничего не меняет (стабильность repair)', () => {
  const files = Object.fromEntries(ALL.map((f) => [f.id, clone(f)]));
  const refs = warscrollRefs(files);
  for (const f of ALL) assert.equal(JSON.stringify(normaliseAosFaction(files[f.id], curated, refs)), JSON.stringify(f), f.id);
});

test('механизм: allowedAdd вставляет полк и юниты один раз, withdrawn убирает полк и оставляет причину', () => {
  const unit = { id: 'u1', faction: 'A', name: 'Rat', kind: 'unit', abilities: [], weapons: [], notes: '', options: [], legends: false, source: null };
  const ror = { id: 'r1', name: 'Pack', owner: 'A', cost: 100, built: false, units: [{ id: 'u1', count: 1, models: 1, optional: false, points: null }], abilities: [], notes: '', allowed: ['B'], link: '', source: null };
  const mk = (id: string, rors: unknown[], rorUnits: unknown[]) => ({ id, warscrolls: id === 'A' ? [unit] : [], rorUnits, rors, battleTraits: [], formations: [], enhancementTypes: [], lores: [], universalManifestations: [] });
  const cur = {
    officialUpdates: {
      sources: { S: { title: 'Doc', date: '2026-01-01' } },
      items: [
        { ref: 'X1', kind: 'ror', id: 'r1', name: 'Pack', field: 'allowedAdd', previous: ['B'], value: ['B', 'C'], add: ['C'], source: 'S', why: 't' },
        { ref: 'X2', kind: 'ror', id: 'r2', name: 'Old', field: 'withdrawn', previous: ['B'], value: [], remove: ['B'], source: 'S', page: 3, why: 't' },
      ],
    },
  };
  const old = { ...ror, id: 'r2', name: 'Old' };
  const files: Record<string, any> = { A: mk('A', [], []), B: mk('B', [clone(ror), old], [clone(unit)]), C: mk('C', [], []) };
  const refs = warscrollRefs(files);
  for (let run = 0; run < 2; run++) for (const id of ['B', 'C']) normaliseAosFaction(files[id], cur, refs);
  assert.deepEqual(files.C.rors.map((r: { id: string; allowed: string[] }) => [r.id, r.allowed]), [['r1', ['B', 'C']]]);
  assert.deepEqual(files.C.rorUnits.map((w: { id: string }) => w.id), ['u1']);
  assert.deepEqual(files.B.rors.map((r: { id: string; allowed: string[] }) => [r.id, r.allowed]), [['r1', ['B', 'C']]]);
  assert.deepEqual(files.B.withdrawnRors, [{ id: 'r2', name: 'Old', reason: 'удалён из Doc (2026-01-01, с. 3)', ref: 'X2' }]);
  assert.match(officialUpdatesReport(files, cur)[0], /применено 2 из 2$/);
});

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
function* rulesWithOwnerLocal(data: AosFactionData): Generator<[string, { name: string; text: string; textSource?: string }]> {
  for (const w of [...data.warscrolls, ...data.rorUnits, ...data.universalManifestations]) for (const r of w.abilities) yield [`ws:${w.name}`, r];
  for (const r of data.battleTraits) yield ['trait', r];
  for (const f of data.formations) for (const r of f.rules) yield [`form:${f.name}`, r];
  for (const t of data.enhancementTypes) for (const tb of t.tables) for (const r of tb.items) yield [`enh:${tb.name}`, r];
  for (const l of data.lores) for (const r of l.items) yield [`lore:${l.name}`, r];
  for (const r0 of data.rors) for (const r of r0.abilities) yield [`ror:${r0.name}`, r];
}
