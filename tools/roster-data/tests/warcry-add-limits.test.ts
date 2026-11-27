// Warcry (27.11.2026): лимиты варбанды блокируют добавление бойца (warcrier.net Warbands / Allies, Thralls and Monsters / Bladeborn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WarcryFaction, WarcryIndex } from '../../../client/src/features/roster/warcry/types';
import { addBlockReason, addFighter, checkWarcryRoster, newWarcryRoster, rolesFor, WARCRY_LIMITS, type WarcryRoster } from '../../../client/src/features/roster/warcry/roster';

const D = join(import.meta.dirname, '../../../backend/roster-data/warcry');
const load = (id: string): WarcryFaction => JSON.parse(readFileSync(join(D, 'f', `${id}.json`), 'utf8'));
const index = JSON.parse(readFileSync(join(D, 'index.json'), 'utf8')) as WarcryIndex;
const all = new Map(index.factions.map((f) => [f.id, load(f.id)]));
const KHORNE = all.get('blades-of-khorne-bloodbound')!;
const CHAOS = all.get('chaos')!;
const f = (fac: WarcryFaction, name: string) => fac.fighters.find((x) => x.name === name)!;

test('Первым — герой своей фракции (лидер)', () => {
  const r = newWarcryRoster(KHORNE, null);
  assert.match(addBlockReason(r, all, KHORNE.id, f(KHORNE, 'Bloodreaver with Meatripper Axe'), 'warband')!, /героя/);
  assert.equal(addBlockReason(r, all, KHORNE.id, f(KHORNE, 'Bloodreaver Chieftain'), 'warband'), null);
});

test('Лимиты: 15 бойцов, 1000 очков, 3 героя, союзники / монстр', () => {
  let r = addFighter(newWarcryRoster(KHORNE, null), KHORNE.id, f(KHORNE, 'Bloodreaver Chieftain'), 'warband');
  const reaver = f(KHORNE, 'Bloodreaver with Meatripper Axe');
  for (let i = 0; i < 14; i++) r = addFighter(r, KHORNE.id, reaver, 'warband'); // 15 бойцов, 120 + 14×65 = 1030 > 1000
  assert.match(addBlockReason(r, all, KHORNE.id, reaver, 'warband')!, /не больше 15/);
  let p = addFighter(newWarcryRoster(KHORNE, null), KHORNE.id, f(KHORNE, 'Mighty Lord of Khorne on Juggernaut'), 'warband');
  p = addFighter(p, KHORNE.id, f(KHORNE, 'Skullhunter'), 'warband');
  p = addFighter(p, KHORNE.id, f(KHORNE, 'Mighty Skullcrusher with Bloodglaive'), 'warband');
  p = addFighter(p, KHORNE.id, f(KHORNE, 'Skullgrinder'), 'warband'); // 280 + 260 + 210 + 180 = 930
  assert.equal(addBlockReason(p, all, KHORNE.id, reaver, 'warband'), null, '930 + 65 = 995');
  assert.equal(addBlockReason(p, all, KHORNE.id, f(KHORNE, 'Khorgorath'), 'warband'), 'Будет 1135 очков из 1000');
  let h = newWarcryRoster(KHORNE, null);
  for (const n of ['Bloodreaver Chieftain', 'Chaos Champion', 'Bloodsecrator']) h = addFighter(h, KHORNE.id, f(KHORNE, n), 'warband');
  assert.match(addBlockReason(h, all, KHORNE.id, f(KHORNE, 'Skullseeker'), 'warband')!, /Героев будет 4/);
  assert.equal(addBlockReason(h, all, KHORNE.id, reaver, 'warband'), null);
  // монстр — один
  const monster = CHAOS.fighters.find((x) => rolesFor(KHORNE, CHAOS, x).includes('monster'));
  if (monster) {
    const lead = addFighter(newWarcryRoster(KHORNE, null), KHORNE.id, f(KHORNE, 'Bloodreaver Chieftain'), 'warband');
    const m1 = addFighter(lead, CHAOS.id, monster, 'monster');
    assert.equal(addBlockReason(lead, all, CHAOS.id, monster, 'monster'), null);
    assert.match(addBlockReason(m1, all, CHAOS.id, monster, 'monster')!, /Монстров будет 2/);
  }
});

test('Добавление, которое пропускает addBlockReason, не добавляет ошибок лимитов', () => {
  let r = addFighter(newWarcryRoster(KHORNE, null), KHORNE.id, f(KHORNE, 'Bloodreaver Chieftain'), 'warband');
  for (const x of KHORNE.fighters) {
    if (addBlockReason(r, all, KHORNE.id, x, 'warband') == null) r = addFighter(r, KHORNE.id, x, 'warband');
  }
  const errs = checkWarcryRoster(r, all).filter((i) => i.level === 'error').map((i) => i.message);
  assert.deepEqual(errs, []);
  assert.ok(r.fighters.length <= WARCRY_LIMITS.maxFighters);
});

test('Каждую фракцию можно собрать по правилам: герой-лидер + ещё 2 бойца, ≤ 1000 очков', () => {
  const bad: string[] = [];
  for (const meta of index.factions.filter((x) => !x.generic)) {
    const own = all.get(meta.id)!;
    const mine = own.fighters.filter((x) => rolesFor(own, own, x).includes('warband')).sort((a, b) => a.points - b.points);
    const leader = mine.find((x) => x.runemarks.includes('hero'));
    if (!leader) {
      bad.push(`${own.id}: нет героя`);
      continue;
    }
    let r: WarcryRoster = addFighter(newWarcryRoster(own, null), own.id, leader, 'warband');
    for (const x of mine) {
      if (r.fighters.length >= 3) break;
      if (addBlockReason(r, all, own.id, x, 'warband') == null) r = addFighter(r, own.id, x, 'warband');
      if (r.fighters.length < 3 && addBlockReason(r, all, own.id, x, 'warband') == null) r = addFighter(r, own.id, x, 'warband');
    }
    const errs = checkWarcryRoster(r, all).filter((i) => i.level === 'error');
    if (errs.length) bad.push(`${own.id}: ${errs.map((e) => e.message).join('; ')}`);
  }
  assert.deepEqual(bad, []);
});

test('Редактор: кнопки добавления блокируются с причиной, счётчик лимитов', () => {
  const ui = readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/warcry/WarcryEditor.tsx'), 'utf8');
  for (const t of ['addBlockReason(roster, data, src.id, f, role)', 'disabled={!!why}', 'Бойцов {roster.fighters.length}/{WARCRY_LIMITS.maxFighters}']) assert.ok(ui.includes(t), t);
});
