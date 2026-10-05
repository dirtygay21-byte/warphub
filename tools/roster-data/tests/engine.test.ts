// Запуск: npm test  (node --import tsx --test tests/*.test.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup, bandFor } from '../../../client/src/features/roster/engine/compute';
import { addUnit, newRoster, updateUnit, encodeRoster, decodeRoster } from '../../../client/src/features/roster/engine/roster';
import { exportGw } from '../../../client/src/features/roster/engine/export';
import type { FactionData, Roster } from '../../../client/src/features/roster/engine/types';
// @ts-expect-error — .mjs без типов
import { parseCosts, parseBandHeader, parseDetachmentRules } from '../scripts/import-wahapedia.mjs';

const dataDir = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'f');
const loadFaction = (id: string): FactionData => JSON.parse(fs.readFileSync(path.join(dataDir, id + '.json'), 'utf8'));
const SM = loadFaction('SM');
const L = makeLookup(SM);
const byName = (n: string) => {
  const d = SM.datasheets.find((x) => x.name === n && x.group === 'own');
  assert.ok(d, 'нет инфолиста ' + n);
  return d!;
};
const codes = (r: Roster) => computeRoster(r, L).issues.map((i) => i.code);

test('заголовки полос стоимости', () => {
  assert.deepEqual(parseBandHeader('YOUR UNIT COSTS'), { from: 1, to: null });
  assert.deepEqual(parseBandHeader('YOUR 1ST TO 2ND UNITS COST'), { from: 1, to: 2 });
  assert.deepEqual(parseBandHeader('YOUR 3RD + UNIT COSTS'), { from: 3, to: null });
  assert.deepEqual(parseBandHeader('YOUR 1ST UNIT COSTS'), { from: 1, to: 1 });
  assert.deepEqual(parseBandHeader('YOUR 4TH + UNIT COSTS'), { from: 4, to: null });
  assert.equal(parseBandHeader('5 models'), null);
});

test('разбор стоимости: варианты таблиц, дубли, апгрейды, AoI', () => {
  const rows = (list: [string, string][]) => list.map(([description, cost], i) => ({ line: String(i + 1), description, cost }));
  const c = parseCosts(rows([
    ['YOUR UNIT COSTS', ''], ['YOUR UNIT COSTS', ''], ['3 models', '70'], ['3 models', '70'], ['6 models', ' 140'],
    ['+ <!-- -->1 Invader ATV', '60'], ['YOUR UNIT COSTS', ''], ['3 models', '75'],
  ]));
  assert.equal(c.default.length, 1);
  assert.deepEqual(c.default[0].options.map((o: { cost: number }) => o.cost), [70, 140]);
  assert.deepEqual(c.default[0].addons, [{ label: '1 Invader ATV', cost: 60 }]);
  const a = parseCosts(rows([
    ['<div class="dsHeaderAoI">AGENTS OF THE IMPERIUM Detachment</div>', ''], ['YOUR UNIT COSTS', ''], ['1 model', '110'],
    ['<div class="dsHeaderAoI">Assigned Agent</div>', ''], ['YOUR UNIT COSTS', ''], ['1 model', '125'],
  ]));
  assert.equal(a.default[0].options[0].cost, 110);
  assert.equal(a.assigned[0].options[0].cost, 125);
  const w = parseCosts(rows([['YOUR UNIT COSTS', ''], ['5 models', '155'], ['WARGEAR OPTIONS', ''], ['per Thunder Hammer', '5']]));
  assert.deepEqual(w.default[0].wargear, [{ label: 'Thunder Hammer', cost: 5 }]);
});

test('правила детачментов из текста', () => {
  const r = parseDetachmentRules(
    [
      'This detachment has the ARMOURY tag and cannot be taken with another ARMOURY detachment.',
      'KEYWORDS\nWRAITHBLADES and WRAITHGUARD units from your army gain the BATTLELINE keyword.',
      'Restrictions: Your army can include SPACE WOLVES units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
      'You can include Plague Legions units in your army, even though they do not have the DEATH GUARD Faction keyword. The combined points cost of such units you can include in your army is:\n• Incursion: Up to 500 pts\n• Strike Force: Up to 1000 pts\n• Onslaught: Up to 1500 pts\nNo PLAGUE LEGIONS models from your army can be your WARLORD.',
    ],
    new Set(['PLAGUE LEGIONS']),
    new Set(),
  );
  assert.equal(r.tag, 'ARMOURY');
  assert.deepEqual(r.battleline, ['WRAITHBLADES', 'WRAITHGUARD']);
  assert.equal(r.chapter, 'Space Wolves');
  assert.deepEqual(r.grants[0].keywords, [['PLAGUE LEGIONS']]);
  assert.deepEqual(r.grants[0].caps, [500, 1000, 1500]);
  assert.equal(r.grants[0].noWarlord, 'PLAGUE LEGIONS');
});

test('ступени стоимости по номеру копии', () => {
  const ds = SM.datasheets.find((d) => d.costs.length > 1)!;
  assert.ok(ds);
  const b1 = bandFor(ds, 1)!;
  const b3 = bandFor(ds, ds.costs[1].from)!;
  assert.notEqual(b1, b3);
  let r = newRoster('SM');
  for (let i = 0; i < ds.costs[1].from; i++) r = addUnit(r, ds);
  const cr = computeRoster(r, L);
  assert.equal(cr.units[0].base, b1.options[0].cost);
  assert.equal(cr.units[cr.units.length - 1].base, b3.options[0].cost);
});

function baseRoster() {
  const det = SM.detachments.find((d) => d.dp === 2 && !d.chapter)!;
  let r = newRoster('SM');
  r = { ...r, detachmentIds: [det.id], forceDisposition: det.forceDisposition };
  return r;
}

test('валидный минимальный ростер без ошибок', () => {
  let r = baseRoster();
  r = addUnit(r, byName('Captain'));
  r = addUnit(r, byName('Intercessor Squad'));
  const cr = computeRoster(r, L);
  assert.equal(cr.errors, 0, JSON.stringify(cr.issues));
  assert.ok(r.warlordUid, 'первый персонаж становится Warlord автоматически');
});

test('ошибки: DP, лимит копий, Epic Hero, очки', () => {
  let r = baseRoster();
  const big = SM.detachments.filter((d) => !d.chapter && d.dp >= 2).slice(0, 2);
  r = { ...r, detachmentIds: big.map((d) => d.id) };
  assert.ok(codes(r).includes('dp'));

  r = baseRoster();
  const cap = byName('Captain');
  for (let i = 0; i < 4; i++) r = addUnit(r, cap);
  assert.ok(codes(r).includes('copies'));

  r = baseRoster();
  const epic = SM.datasheets.find((d) => d.epicHero && d.group === 'own' && !d.legends)!;
  r = addUnit(addUnit(r, epic), epic);
  assert.ok(codes(r).includes('copies'));

  r = baseRoster();
  const tank = SM.datasheets.filter((d) => d.group === 'own' && !d.legends).sort((a, b) => b.costs[0].options[0].cost - a.costs[0].options[0].cost)[0];
  for (let i = 0; i < 8; i++) r = addUnit(r, tank);
  assert.ok(codes(r).includes('points'));
});

test('Incursion: один детачмент за 3 DP допустим', () => {
  const three = SM.detachments.find((d) => d.dp === 3 && !d.chapter)!;
  let r = newRoster('SM', 'incursion');
  r = { ...r, detachmentIds: [three.id], forceDisposition: three.forceDisposition };
  assert.ok(!codes(r).includes('dp'));
});

test('Leader/Support и улучшения', () => {
  let r = baseRoster();
  const cap = byName('Captain');
  const bodyguardId = cap.leads.find((id) => L.ds.get(id)?.group === 'own' && !L.ds.get(id)?.legends)!;
  const bg = L.ds.get(bodyguardId)!;
  r = addUnit(r, cap);
  r = addUnit(r, bg);
  r = addUnit(r, cap);
  const [c1, b, c2] = r.units;
  r = updateUnit(r, c1.uid, { attachedTo: b.uid });
  assert.ok(!codes(r).some((c) => c.startsWith('attach')));
  r = updateUnit(r, c2.uid, { attachedTo: b.uid });
  assert.ok(codes(r).includes('attach-leader'));
  r = updateUnit(r, c2.uid, { attachedTo: null });

  const enh = SM.enhancements.find((e) => e.detachment === r.detachmentIds[0] && !e.upgrade && cap.enhancements.includes(e.id));
  if (enh) {
    r = updateUnit(r, c1.uid, { enhancementId: enh.id });
    r = updateUnit(r, c2.uid, { enhancementId: enh.id });
    assert.ok(codes(r).includes('enh-dup'));
  }
});

test('экспорт в формате приложения GW и код ростера', () => {
  let r = baseRoster();
  r = addUnit(r, byName('Captain'));
  r = addUnit(r, byName('Intercessor Squad'));
  r = { ...r, name: 'Тест' };
  const text = exportGw(r, L, computeRoster(r, L), '2026-09-28');
  assert.match(text, /^Тест \(\d+ Points\)/);
  assert.match(text, /Strike Force \(2,000 Points\)/);
  assert.match(text, /CHARACTERS\nCaptain \(\d+ Points\)\n• Warlord/);
  const back = decodeRoster(encodeRoster(r));
  assert.equal(back.units.length, 2);
  assert.equal(back.name, 'Тест');
});

test('все фракции загружаются и считаются без исключений', () => {
  for (const f of fs.readdirSync(dataDir)) {
    const fd = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')) as FactionData;
    const LL = makeLookup(fd);
    let r = newRoster(fd.id);
    for (const ds of fd.datasheets.slice(0, 15)) r = addUnit(r, ds);
    r = { ...r, detachmentIds: fd.detachments.slice(0, 1).map((d) => d.id) };
    const cr = computeRoster(r, LL);
    assert.ok(cr.points > 0, f);
  }
});

test('стандартное снаряжение по инфолисту', async () => {
  const { unitLoadout } = await import('../../../client/src/features/roster/engine/compute');
  const isq = byName('Intercessor Squad');
  let r = addUnit(baseRoster(), isq);
  const u = r.units[0];
  assert.equal(unitLoadout(isq, u, 5)['Bolt rifle'], 5);
  assert.equal(unitLoadout(isq, u, 10)['Bolt rifle'], 10);
  const out = byName('Outrider Squad');
  const ou = { ...newRoster('SM').units, ...addUnit(newRoster('SM'), out).units[0] };
  assert.equal(unitLoadout(out, ou, 3)['Onslaught gatling cannon'] ?? 0, 0);
  assert.equal(unitLoadout(out, { ...ou, addons: { '1 Invader ATV': 1 } }, 3)['Onslaught gatling cannon'], 1);
  r = updateUnit(r, u.uid, { weapons: { 'Bolt rifle': 4, 'Hand flamer': 1 } });
  const cr = computeRoster(r, L);
  assert.equal(cr.units[0].loadout['Hand flamer'], 1);
  assert.ok(cr.units[0].loadoutCustom);
  assert.match(exportGw(r, L, cr, null), /◦ 1x Hand flamer/);
});

test('союзники: Assigned Agents и Daemonic Pact', () => {
  const agents = SM.datasheets.filter((d) => d.group === 'ally:agents' && d.keywords.includes('Character') && !d.epicHero);
  let r = baseRoster();
  for (const d of agents.slice(0, 3)) r = addUnit(r, d);
  assert.ok(computeRoster(r, L).issues.some((i) => i.code === 'agents'), 'больше 2 персонажей-агентов в Strike Force');

  const CSM = loadFaction('CSM');
  const LC = makeLookup(CSM);
  const det = CSM.detachments[0];
  let c = { ...newRoster('CSM'), detachmentIds: [det.id], forceDisposition: det.forceDisposition };
  const nonBl = CSM.datasheets.filter((d) => d.group === 'ally:daemons' && !d.battleline && d.keywords.includes('Khorne') && !d.legends);
  c = addUnit(c, nonBl[0]);
  const codesC = computeRoster(c, LC).issues.map((i) => i.code);
  assert.ok(codesC.includes('daemons-ratio'));
});
