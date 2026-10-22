// Проверка правил формирования армии на реальных данных: по сценарию на каждое правило.
// Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup, type DataLookup } from '../../../client/src/features/roster/engine/compute';
import { addUnit, newRoster, updateUnit } from '../../../client/src/features/roster/engine/roster';
import { BATTLE_SIZES } from '../../../client/src/features/roster/engine/rules';
import type { BattleSize, Datasheet, FactionData, Roster } from '../../../client/src/features/roster/engine/types';

const dir = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'f');
const cache = new Map<string, { F: FactionData; L: DataLookup }>();
function fac(id: string) {
  if (!cache.has(id)) {
    const F = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8')) as FactionData;
    cache.set(id, { F, L: makeLookup(F) });
  }
  return cache.get(id)!;
}
function ds(id: string, name: string, group?: string): Datasheet {
  const { F } = fac(id);
  const d = F.datasheets.find((x) => x.name.toLowerCase() === name.toLowerCase() && (!group || x.group.startsWith(group)) && !x.legends) ??
    F.datasheets.find((x) => x.name.toLowerCase() === name.toLowerCase() && (!group || x.group.startsWith(group)));
  assert.ok(d, `${id}: нет инфолиста «${name}»`);
  return d!;
}
function det(id: string, name: string) {
  const d = fac(id).F.detachments.find((x) => x.name === name);
  assert.ok(d, `${id}: нет детачмента «${name}»`);
  return d!;
}
function roster(id: string, dets: string[], size: BattleSize = 'strike'): Roster {
  const ds_ = dets.map((n) => det(id, n));
  return { ...newRoster(id, size), detachmentIds: ds_.map((d) => d.id), forceDisposition: ds_[0]?.forceDisposition ?? null };
}
const add = (r: Roster, id: string, name: string, n = 1, group?: string) => {
  for (let i = 0; i < n; i++) r = addUnit(r, ds(id, name, group));
  return r;
};
const last = (r: Roster) => r.units[r.units.length - 1].uid;
const run = (r: Roster) => computeRoster(r, fac(r.factionId).L);
const codes = (r: Roster) => run(r).issues.filter((i) => i.level === 'error').map((i) => i.code);
const has = (r: Roster, code: string) => assert.ok(codes(r).includes(code), `ожидалась ошибка ${code}, есть: ${codes(r).join(', ') || 'нет ошибок'}`);
const hasNot = (r: Roster, code: string) => assert.ok(!codes(r).includes(code), `лишняя ошибка ${code}: ${run(r).issues.filter((i) => i.code === code).map((i) => i.message).join(' | ')}`);

// ---------------------------------------------------------------------------
test('каждая фракция: простой законный ростер проходит без ошибок', () => {
  for (const f of fs.readdirSync(dir).map((x) => x.replace('.json', ''))) {
    const { F } = fac(f);
    const d = F.detachments.find((x) => x.dp <= 2 && !x.chapter && !x.requires.length && !x.forbid);
    if (!d) continue;
    const legal = (x: Datasheet) => x.group === 'own' && !x.legends && x.costs.length && x.factionKeywords.some((k) => F.armyKeywords.includes(k));
    const ch = F.datasheets.find((x) => legal(x) && x.character && !x.epicHero && !x.support);
    const bl = F.datasheets.find((x) => legal(x) && x.battleline);
    let r: Roster = { ...newRoster(f), detachmentIds: [d.id], forceDisposition: d.forceDisposition };
    if (ch) r = addUnit(r, ch);
    if (bl) r = addUnit(r, bl);
    if (!ch) continue; // фракции без обычных персонажей (напр. Titanicus)
    const errors = run(r).issues.filter((i) => i.level === 'error');
    assert.equal(errors.length, 0, `${f}: ${errors.map((e) => e.message).join(' | ')}`);
  }
});

test('лимит очков', () => {
  let r = roster('SM', ['Gladius Task Force'], 'incursion');
  r = add(r, 'SM', 'Captain');
  hasNot(r, 'points');
  r = add(r, 'SM', 'Land Raider', 3);
  r = add(r, 'SM', 'Repulsor Executioner', 2);
  has(r, 'points');
});

test('Detachment Points: бюджет, исключение Incursion, теги, Force Disposition', () => {
  const sm = fac('SM').F.detachments.filter((d) => !d.chapter);
  const two = sm.filter((d) => d.dp === 2);
  const three = sm.find((d) => d.dp === 3)!;
  const one = sm.find((d) => d.dp === 1)!;
  let r: Roster = { ...newRoster('SM'), detachmentIds: [two[0].id, two[1].id], forceDisposition: two[0].forceDisposition };
  has(r, 'dp'); // 4 DP > 3
  r = { ...newRoster('SM', 'incursion'), detachmentIds: [three.id], forceDisposition: three.forceDisposition };
  hasNot(r, 'dp'); // один детачмент за 3 DP в Incursion
  r = { ...r, detachmentIds: [three.id, one.id] };
  has(r, 'dp');
  r = roster('AE', ['Fateful Performance', 'Twilight Flickers']);
  has(r, 'det-tag'); // оба ACROBATIC
  r = { ...roster('SM', ['Gladius Task Force']), forceDisposition: null };
  has(r, 'fd-missing');
  const other = ['Take and Hold', 'Disruption', 'Purge the Foe', 'Priority Assets', 'Reconnaissance'].find((x) => x !== det('SM', 'Gladius Task Force').forceDisposition)!;
  r = { ...r, forceDisposition: other };
  has(r, 'fd');
  r = { ...newRoster('SM') };
  has(r, 'no-detachment');
});

test('Space Marines: один орден и орденские детачменты, DP по ордену', () => {
  let r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Ragnar Blackmane');
  r = add(r, 'SM', 'Death Company Marines');
  has(r, 'chapter');
  r = roster('SM', ['Champions of Fenris']);
  r = add(r, 'SM', 'Death Company Marines');
  has(r, 'chapter');
  // wh-rules.ru 981: Stormlance Task Force — 1 DP для любого ордена (особой цены для орденов в источнике нет)
  r = { ...roster('SM', ['Stormlance Task Force']), chapter: 'Black Templars' };
  assert.equal(run(r).dp, 1);
  r = { ...r, chapter: null };
  assert.equal(run(r).dp, 1);
  // DP по ордену (chapterDp) — у сохранённого устаревшего Bastion Task Force: 2 DP, для Black Templars 3
  r = { ...roster('SM', ['Bastion Task Force']), chapter: 'Black Templars' };
  assert.equal(run(r).dp, 3);
  r = { ...r, chapter: null };
  assert.equal(run(r).dp, 2);
});

test('лимит копий: 3 / 2 в Incursion, Battleline ×2, Epic Hero 1, BATTLELINE от детачмента', () => {
  let r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Captain', 3);
  hasNot(r, 'copies');
  r = add(r, 'SM', 'Captain');
  has(r, 'copies');
  r = roster('SM', ['Gladius Task Force'], 'incursion');
  r = add(r, 'SM', 'Captain', 3);
  has(r, 'copies');
  r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Intercessor Squad', 6);
  hasNot(r, 'copies');
  r = add(r, 'SM', 'Intercessor Squad');
  has(r, 'copies');
  r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Marneus Calgar', 2);
  has(r, 'copies');
  // Company of Hunters: OUTRIDER SQUAD получает BATTLELINE → можно 6
  r = { ...roster('SM', ['Company of Hunters']), chapter: 'Dark Angels' };
  r = add(r, 'SM', 'Outrider Squad', 6);
  hasNot(r, 'copies');
  r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Outrider Squad', 4);
  has(r, 'copies');
});

test('цена растёт с номером копии (ступени 11-й редакции)', () => {
  const d = ds('SM', 'Wolf Guard Headtakers');
  assert.ok(d.costs.length > 1);
  let r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Wolf Guard Headtakers', 3);
  const cr = run(r);
  assert.ok(cr.units[2].base > cr.units[0].base, '3-я копия дороже');
  assert.equal(cr.units[0].base, cr.units[1].base);
});

test('улучшения: лимит, повторы, детачмент, Epic Hero, допустимые юниты', () => {
  const g = det('SM', 'Gladius Task Force');
  const enh = fac('SM').F.enhancements.filter((e) => e.detachment === g.id && !e.upgrade);
  let r = roster('SM', ['Gladius Task Force'], 'incursion');
  r = add(r, 'SM', 'Captain', 2);
  r = add(r, 'SM', 'Lieutenant');
  const cap = ds('SM', 'Captain');
  const ok = enh.filter((e) => cap.enhancements.includes(e.id) && ds('SM', 'Lieutenant').enhancements.includes(e.id));
  assert.ok(ok.length >= 3, 'нужно 3 улучшения для теста');
  r = updateUnit(r, r.units[0].uid, { enhancementId: ok[0].id });
  r = updateUnit(r, r.units[1].uid, { enhancementId: ok[0].id });
  has(r, 'enh-dup');
  r = updateUnit(r, r.units[1].uid, { enhancementId: ok[1].id });
  hasNot(r, 'enh-dup');
  hasNot(r, 'enh-cap');
  r = updateUnit(r, r.units[2].uid, { enhancementId: ok[2].id });
  has(r, 'enh-cap'); // 3 > 2 в Incursion
  // улучшение невыбранного детачмента
  const foreign = fac('SM').F.enhancements.find((e) => e.detachment !== g.id && cap.enhancements.includes(e.id))!;
  r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Captain');
  r = updateUnit(r, r.units[0].uid, { enhancementId: foreign.id });
  has(r, 'enh-det');
  // Epic Hero
  r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Marneus Calgar');
  r = updateUnit(r, r.units[0].uid, { enhancementId: enh[0].id });
  has(r, 'enh-epic');
  // недопустимый инфолист
  r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Intercessor Squad');
  r = updateUnit(r, r.units[0].uid, { enhancementId: enh[0].id });
  has(r, 'enh-elig');
});

test('Upgrade: до 3 не-персонажей, одно улучшение в лимите, оплата за каждый', () => {
  const sm = fac('SM').F;
  const up = sm.enhancements.find((e) => e.upgrade && sm.datasheets.filter((d) => d.enhancements.includes(e.id) && !d.character && d.group === 'own' && !d.legends).length)!;
  assert.ok(up, 'нет Upgrade в данных SM');
  const target = sm.datasheets.find((d) => d.enhancements.includes(up.id) && !d.character && d.group === 'own' && !d.legends && !d.epicHero)!;
  const d = sm.detachments.find((x) => x.id === up.detachment)!;
  let r: Roster = { ...newRoster('SM'), detachmentIds: [d.id], forceDisposition: d.forceDisposition, chapter: d.chapter };
  for (let i = 0; i < 4; i++) r = addUnit(r, target);
  for (const u of r.units.slice(0, 3)) r = updateUnit(r, u.uid, { enhancementId: up.id });
  let cr = run(r);
  assert.equal(cr.enhancementsUsed, 1);
  assert.equal(cr.units.filter((c) => c.enhancementCost === up.cost).length, 3);
  hasNot(r, 'upg-count');
  r = updateUnit(r, r.units[3].uid, { enhancementId: up.id });
  has(r, 'upg-count');
  // на персонажа нельзя
  const charTarget = sm.datasheets.find((x) => x.character && x.enhancements.includes(up.id));
  if (charTarget) {
    r = addUnit(r, charTarget);
    r = updateUnit(r, last(r), { enhancementId: up.id });
    has(r, 'upg-char');
  }
  cr = run(r);
  void cr;
});

test('Warlord: обязателен, только персонаж, не союзник', () => {
  let r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Captain');
  r = { ...r, warlordUid: null };
  has(r, 'warlord');
  r = add(r, 'SM', 'Intercessor Squad');
  r = { ...r, warlordUid: last(r) };
  has(r, 'warlord-char');
  r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Inquisitor', 1, 'ally:agents');
  r = { ...r, warlordUid: r.units[0].uid };
  has(r, 'warlord-ally');
});

test('Leader / Support: пары из инфолиста, 1 Leader + 1 Support, Support обязан быть присоединён', () => {
  const sm = fac('SM').F;
  let r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Captain');
  r = add(r, 'SM', 'Intercessor Squad');
  r = add(r, 'SM', 'Captain');
  r = add(r, 'SM', 'Land Raider');
  r = add(r, 'SM', 'Lieutenant');
  const [cap, isq, cap2, lr, lt] = r.units;
  r = updateUnit(r, cap.uid, { attachedTo: lr.uid });
  has(r, 'attach-pair'); // капитан не ведёт Land Raider
  r = updateUnit(r, cap.uid, { attachedTo: isq.uid });
  hasNot(r, 'attach-pair');
  r = updateUnit(r, lt.uid, { attachedTo: isq.uid });
  hasNot(r, 'attach-leader'); // Lieutenant в 11-й — SUPPORT: Captain + Lieutenant законно
  hasNot(r, 'attach-support');
  r = updateUnit(r, cap2.uid, { attachedTo: isq.uid });
  has(r, 'attach-leader'); // два Leader
  // Support без отряда
  const sup = sm.datasheets.find((d) => d.support && d.group === 'own' && !d.legends && d.leads.length)!;
  r = roster('SM', ['Gladius Task Force']);
  r = addUnit(r, sup);
  has(r, 'support');
  // Leader + Support на одном отряде — можно
  const bg = sm.datasheets.find((d) => sup.leads.includes(d.id) && !d.legends && sm.datasheets.some((l) => !l.support && !l.legends && l.group === 'own' && l.leads.includes(d.id)))!;
  const leader = sm.datasheets.find((l) => !l.support && !l.legends && l.group === 'own' && l.leads.includes(bg.id) && !l.epicHero)!;
  r = roster('SM', ['Gladius Task Force']);
  r = addUnit(addUnit(addUnit(r, bg), sup), leader);
  r = updateUnit(r, r.units[1].uid, { attachedTo: r.units[0].uid });
  r = updateUnit(r, r.units[2].uid, { attachedTo: r.units[0].uid });
  hasNot(r, 'attach-leader');
  hasNot(r, 'attach-support');
  hasNot(r, 'support');
});

test('союзники: Assigned Agents, Freeblades, Titanic Support', () => {
  let r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Captain');
  r = add(r, 'SM', 'Inquisitor', 1, 'ally:agents');
  r = add(r, 'SM', 'Inquisitor Coteaz', 1, 'ally:agents');
  hasNot(r, 'agents');
  r = add(r, 'SM', 'Inquisitor Draxus', 1, 'ally:agents');
  has(r, 'agents'); // 3 CHARACTER > 2
  r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Captain');
  const kn = fac('SM').F.datasheets.filter((d) => d.group === 'ally:freeblades' && !d.legends);
  r = addUnit(r, kn.find((d) => d.titanic)!);
  hasNot(r, 'freeblades');
  r = addUnit(r, kn.find((d) => !d.titanic)!);
  has(r, 'freeblades'); // TITANIC + ARMIGER вместе
  r = roster('SM', ['Gladius Task Force']);
  r = add(r, 'SM', 'Captain');
  const tl = fac('SM').F.datasheets.filter((d) => d.group === 'ally:titanicus');
  r = addUnit(addUnit(r, tl[0]), tl[0]);
  has(r, 'titanicus');
});

test('союзники: Daemonic Pact (очки и правило BATTLELINE по богам)', () => {
  const csm = fac('CSM').F;
  let r = roster('CSM', [csm.detachments.find((d) => !d.requires.length)!.name]);
  r = add(r, 'CSM', 'Chaos Lord');
  r = add(r, 'CSM', 'Bloodletters', 1, 'ally:daemons');
  hasNot(r, 'daemons-ratio'); // BATTLELINE
  r = add(r, 'CSM', 'Flesh Hounds', 1, 'ally:daemons');
  hasNot(r, 'daemons-ratio'); // 1 не-BL на 1 BL
  r = add(r, 'CSM', 'Bloodcrushers', 1, 'ally:daemons');
  has(r, 'daemons-ratio'); // 2 не-BL > 1 BL
  r = add(r, 'CSM', 'Bloodthirster', 1, 'ally:daemons');
  has(r, 'daemons-pts');
});

test('Drukhari: Corsairs and Travelling Players и Reaper’s Wager', () => {
  const dru = fac('DRU').F;
  const base = dru.detachments.find((d) => d.name !== 'Reaper’s Wager' && !d.requires.length)!;
  let r = roster('DRU', [base.name]);
  r = add(r, 'DRU', 'Archon');
  const corsair = dru.datasheets.filter((d) => d.group === 'ally:corsairs' && !d.legends);
  r = addUnit(r, corsair.find((d) => d.name === 'Troupe')!);
  hasNot(r, 'corsairs-pts');
  for (const n of ['Solitaire', 'Voidweaver', 'Skyweavers', 'Troupe Master', 'Death Jester']) r = addUnit(r, corsair.find((d) => d.name === n)!);
  has(r, 'corsairs-pts'); // > 500 в Strike Force
  // с Reaper’s Wager правило Corsairs недоступно, Harlequins — через детачмент
  r = roster('DRU', ['Reaper’s Wager']);
  r = add(r, 'DRU', 'Archon');
  r = addUnit(r, corsair.find((d) => d.name === 'Corsair Voidreavers')!); // Anhrathe — только по правилу Corsairs
  r = add(r, 'DRU', 'Troupe', 1, 'det:'); // Harlequins — через Reaper’s Wager
  const cr = run(r);
  assert.ok(cr.issues.some((i) => i.code === 'ally-disabled'));
  assert.ok(!cr.issues.some((i) => i.code === 'det-unit'));
});

test('детачменты, разрешающие чужие юниты: Brood Brothers, Plague Legions, Shadow Legion', () => {
  // Brood Brother Auxilia
  let r = roster('GC', [fac('GC').F.detachments.find((d) => !d.grants.length && !d.requires.length)!.name]);
  r = add(r, 'GC', 'Primus');
  r = add(r, 'GC', 'Cadian Shock Troops', 1, 'det:');
  has(r, 'det-unit'); // без детачмента нельзя
  r = roster('GC', ['Brood Brother Auxilia']);
  r = add(r, 'GC', 'Primus');
  r = add(r, 'GC', 'Cadian Shock Troops', 1, 'det:');
  hasNot(r, 'det-unit');
  hasNot(r, 'grant-cap');
  r = add(r, 'GC', 'Rogal Dorn Battle Tank', 3, 'det:');
  r = add(r, 'GC', 'Leman Russ Battle Tank', 3, 'det:');
  has(r, 'grant-cap'); // > 1000 очков
  r = roster('GC', ['Brood Brother Auxilia']);
  r = add(r, 'GC', 'Cadian Castellan', 1, 'det:');
  r = { ...r, warlordUid: r.units[0].uid };
  has(r, 'warlord-must'); // Warlord должен быть GENESTEALER CULTS
  // Plague Legions у Death Guard: нельзя Warlord
  r = roster('DG', ['Tallyband Summoners']);
  const pl = fac('DG').F.datasheets.find((d) => d.factionKeywords.includes('Plague Legions') && d.character && !d.legends)!;
  r = addUnit(r, pl);
  r = { ...r, warlordUid: r.units[0].uid };
  has(r, 'warlord-grant');
  // Shadow Legion: Daemon Prince запрещён, Chaos Lord разрешён
  r = roster('CD', ['Shadow Legion']);
  r = add(r, 'CD', 'Be’lakor');
  r = add(r, 'CD', 'Chaos Lord', 1, 'det:');
  hasNot(r, 'det-unit');
  hasNot(r, 'det-forbid');
  const dp = fac('CD').F.datasheets.find((d) => /^Daemon Prince of/.test(d.name) && d.group === 'own' && !d.legends);
  if (dp) {
    r = addUnit(r, dp);
    has(r, 'det-forbid');
  }
});

test('обязательные юниты и повышенные лимиты из детачментов', () => {
  // Devoted of Ynnead: Yvraine / The Yncarne обязательны и Warlord
  let r = roster('AE', ['Devoted of Ynnead']);
  r = add(r, 'AE', 'Autarch');
  has(r, 'det-requires');
  r = add(r, 'AE', 'Yvraine');
  hasNot(r, 'det-requires');
  r = { ...r, warlordUid: r.units[0].uid };
  has(r, 'det-warlord');
  // Houndpack Lance: 3+ War Dog
  r = roster('QT', ['Houndpack Lance']);
  const dog = fac('QT').F.datasheets.find((d) => d.keywords.includes('War Dog') && d.group === 'own' && !d.legends)!;
  r = addUnit(addUnit(r, dog), dog);
  has(r, 'det-requires');
  r = addUnit(r, dog);
  hasNot(r, 'det-requires');
  // Ghosts of the Webway: до 3 Death Jester даже в Incursion
  r = roster('AE', ['Ghosts of the Webway'], 'incursion');
  r = add(r, 'AE', 'Death Jester', 3);
  hasNot(r, 'copies');
});

test('Legends — предупреждение, не ошибка', () => {
  let r = roster('SM', ['Gladius Task Force']);
  const leg = fac('SM').F.datasheets.find((d) => d.legends && d.character && !d.epicHero)!;
  r = addUnit(r, leg);
  const cr = run(r);
  assert.ok(cr.issues.some((i) => i.code === 'legends' && i.level === 'warning'));
});

test('размеры боя совпадают с правилами', () => {
  assert.deepEqual([BATTLE_SIZES.incursion.points, BATTLE_SIZES.incursion.dp, BATTLE_SIZES.incursion.enhancements, BATTLE_SIZES.incursion.unitLimit], [1000, 2, 2, 2]);
  assert.deepEqual([BATTLE_SIZES.strike.points, BATTLE_SIZES.strike.dp, BATTLE_SIZES.strike.enhancements, BATTLE_SIZES.strike.unitLimit], [2000, 3, 4, 3]);
  assert.equal(BATTLE_SIZES.onslaught.points, 3000);
});
