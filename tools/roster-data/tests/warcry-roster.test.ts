// Варбанда Warcry (W5 30.10.2026): правила построения warcrier.net на реальных данных warcry_data. Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WarcryFaction } from '../../../client/src/features/roster/warcry/types';
import {
  abilitiesFor,
  addFighter,
  autoGroups,
  checkWarcryRoster,
  decodeWarcryRoster,
  encodeWarcryRoster,
  makeLeader,
  newWarcryRoster,
  rolesFor,
  universalFor,
  updateFighter,
  warcryPoints,
  type WarcryRole,
  type WarcryRoster,
} from '../../../client/src/features/roster/warcry/roster';

const F = join(import.meta.dirname, '../../../backend/roster-data/warcry/f');
const load = (id: string): WarcryFaction => JSON.parse(readFileSync(join(F, `${id}.json`), 'utf8'));
const KHORNE = load('blades-of-khorne-bloodbound');
const CHAOS = load('chaos');
const SKAVEN = load('skaven');
const THUNDER = load('stormcast-eternals-thunderstrike-stormcast');
const QUESTOR = load('stormcast-eternals-questor-soulsworn');
const ORDER = load('order');
const data = new Map([KHORNE, CHAOS, SKAVEN, THUNDER, QUESTOR, ORDER].map((f) => [f.id, f]));
const fid = (f: WarcryFaction, name: string) => {
  const x = f.fighters.find((y) => y.name.startsWith(name));
  assert.ok(x, `${f.id}: ${name}`);
  return x;
};
const add = (r: WarcryRoster, f: WarcryFaction, name: string, role: WarcryRole = 'warband') => addFighter(r, f.id, fid(f, name), role);
const msgs = (r: WarcryRoster) => checkWarcryRoster(r, data).map((i) => i.message);
const errors = (r: WarcryRoster) => checkWarcryRoster(r, data).filter((i) => i.level === 'error').map((i) => i.message);

function khorneBase() {
  let r = newWarcryRoster(KHORNE, 'test');
  r = add(r, KHORNE, 'Bloodreaver Chieftain');
  r = add(r, KHORNE, 'Bloodreaver with Meatripper');
  r = add(r, KHORNE, 'Bloodreaver with Reaver');
  return r;
}

test('легальная варбанда: 3 бойца, лидер-герой, группы ровно — без замечаний', () => {
  const r = autoGroups(khorneBase());
  assert.deepEqual(msgs(r), []);
  assert.equal(warcryPoints(r, data), 120 + 65 + 65);
  assert.deepEqual(r.fighters.map((x) => x.group), ['dagger', 'shield', 'hammer']);
});

test('численность, очки, лидер', () => {
  let r = newWarcryRoster(KHORNE, null);
  r = add(r, KHORNE, 'Bloodreaver with Meatripper');
  r = add(r, KHORNE, 'Bloodreaver Chieftain');
  assert.ok(errors(r).some((m) => m.includes('от 3 до 15')));
  assert.ok(errors(r).some((m) => m.startsWith('Лидер')));
  r = makeLeader(r, r.fighters[1].uid);
  assert.ok(!errors(r).some((m) => m.startsWith('Лидер')));
  for (let i = 0; i < 6; i++) r = add(r, KHORNE, 'Mighty Skullcrusher with Blo');
  assert.ok(errors(r).some((m) => m.includes('больше 1000')));
});

test('герои: не больше 3, союзник-герой считается и не может быть лидером', () => {
  let r = khorneBase();
  r = add(r, KHORNE, 'Chaos Champion');
  r = add(r, KHORNE, 'Bloodsecrator');
  assert.deepEqual(errors(r), []);
  r = add(r, KHORNE, 'Skullseeker');
  assert.ok(errors(r).some((m) => m.startsWith('Героев 4')));
  let a = khorneBase();
  const skHero = SKAVEN.fighters.find((x) => x.runemarks.includes('hero') && !x.subfaction)!;
  a = addFighter(a, SKAVEN.id, skHero, 'ally');
  a = makeLeader(a, a.fighters[3].uid);
  assert.ok(errors(a).some((m) => m.startsWith('Лидер')));
});

test('союзники, траллы, монстр: роли и лимиты', () => {
  const thrall = CHAOS.fighters.find((x) => x.runemarks.includes('thrall'))!;
  const ally = CHAOS.fighters.find((x) => x.runemarks.includes('ally'))!;
  const monster = CHAOS.fighters.find((x) => x.runemarks.includes('monster'))!;
  assert.deepEqual(rolesFor(KHORNE, CHAOS, thrall), ['thrall']);
  assert.deepEqual(rolesFor(KHORNE, CHAOS, monster), ['monster']);
  assert.deepEqual(rolesFor(KHORNE, KHORNE, fid(KHORNE, 'Chaos Champion')), ['warband']);
  assert.deepEqual(rolesFor(KHORNE, ORDER, ORDER.fighters[0]), [], 'другой альянс');
  let r = khorneBase();
  for (let i = 0; i < 4; i++) r = addFighter(r, CHAOS.id, thrall, 'thrall');
  assert.ok(errors(r).some((m) => m.startsWith('Траллов 4')));
  r = khorneBase();
  for (let i = 0; i < 3; i++) r = addFighter(r, CHAOS.id, ally, 'ally');
  assert.ok(errors(r).some((m) => m.startsWith('Союзников 3')));
  r = addFighter(khorneBase(), CHAOS.id, thrall, 'monster');
  assert.ok(errors(r).some((m) => m.includes('не может быть в варбанде')));
});

test('монстр один в группе; остальные ровно по двум группам', () => {
  const monster = CHAOS.fighters.find((x) => x.runemarks.includes('monster') && x.points <= 500)!;
  let r = add(khorneBase(), KHORNE, 'Blood Warrior with Goreaxe');
  r = autoGroups(addFighter(r, CHAOS.id, monster, 'monster'));
  assert.deepEqual(msgs(r), []);
  assert.deepEqual(r.fighters.map((x) => x.group), ['dagger', 'shield', 'dagger', 'shield', 'hammer']);
  r = updateFighter(r, r.fighters[0].uid, { group: 'hammer' });
  assert.ok(msgs(r).includes('Монстр должен быть один в своей группе'));
});

test('Bladeborn: каждый боец один раз; герой-союзник открывает спутников вне лимита союзников', () => {
  let r = add(khorneBase(), KHORNE, 'Arnulf');
  r = add(r, KHORNE, 'Arnulf');
  assert.ok(errors(r).some((m) => m.startsWith('Arnulf: можно взять только один раз')));
  // Skaven bladeborn: герой + 2 спутника-союзника + ещё 1 союзник — в лимите 2 только герой и обычный союзник
  const sub = SKAVEN.subfactions.find((s) => s.bladeborn)!;
  const crew = SKAVEN.fighters.filter((x) => x.subfaction === sub.name);
  const hero = crew.find((x) => x.runemarks.includes('hero'))!;
  let a = addFighter(khorneBase(), SKAVEN.id, hero, 'ally');
  for (const c of crew.filter((x) => x !== hero && !x.runemarks.includes('hero')).slice(0, 2)) a = addFighter(a, SKAVEN.id, c, 'ally');
  a = addFighter(a, CHAOS.id, CHAOS.fighters.find((x) => x.runemarks.includes('ally'))!, 'ally');
  assert.ok(!errors(a).some((m) => m.startsWith('Союзников')), errors(a).join('; '));
});

test('Heroes All: Questor Soulsworn без лимита своих героев; Gladiatorium — без лимита и по одному', () => {
  let q = newWarcryRoster(QUESTOR, null);
  for (const x of QUESTOR.fighters.slice(0, 5)) q = addFighter(q, QUESTOR.id, x, 'warband');
  assert.deepEqual(errors(q), []);
  let g = newWarcryRoster(THUNDER, null);
  for (const x of THUNDER.fighters.filter((y) => y.subfaction === 'Gladitorium').slice(0, 4)) g = addFighter(g, THUNDER.id, x, 'warband');
  assert.deepEqual(errors(g), []);
  g = addFighter(g, THUNDER.id, fid(THUNDER, 'Numara'), 'warband');
  assert.ok(errors(g).some((m) => m.startsWith('Numara') && m.includes('один раз')));
  g = add(g, THUNDER, 'Vindictor-Prime');
  assert.ok(errors(g).some((m) => m.startsWith('Героев')), 'не только Gladiatorium — обычный лимит');
});

test('способности: по рунмаркам и подфракции; монстру — свои и монстровые универсальные', () => {
  const champ = fid(KHORNE, 'Chaos Champion');
  const ab = abilitiesFor(KHORNE, champ);
  assert.ok(ab.length > 0 && ab.every((a) => a.cost !== 'battletrait' && !a.subfaction && a.runemarks.every((r) => champ.runemarks.includes(r))));
  const arnulf = fid(KHORNE, 'Arnulf');
  assert.ok(abilitiesFor(KHORNE, arnulf).some((a) => a.subfaction === "Garrek's Reavers"));
  const monster = CHAOS.fighters.find((x) => x.runemarks.includes('monster'))!;
  const mab = abilitiesFor(CHAOS, monster);
  assert.ok(mab.every((a) => a.monster === monster.name));
  const universal = JSON.parse(readFileSync(join(F, '../index.json'), 'utf8')).universal;
  assert.ok(universalFor(universal, monster).every((a: { runemarks: string[] }) => a.runemarks.includes('monster')));
  assert.ok(!universalFor(universal, arnulf).some((a: { name: string }) => a.name === 'Inspiring Presence'));
  assert.ok(universalFor(universal, champ).some((a: { name: string }) => a.name === 'Inspiring Presence'));
});

test('код WC1.: туда и обратно, чужие фракции отклоняются', () => {
  const r = autoGroups(addFighter(khorneBase(), CHAOS.id, CHAOS.fighters[0], 'thrall'));
  const back = decodeWarcryRoster(encodeWarcryRoster(r), [KHORNE.id, CHAOS.id]);
  assert.deepEqual(back.fighters.map(({ factionId, fighterId, role, group }) => ({ factionId, fighterId, role, group })), r.fighters.map(({ factionId, fighterId, role, group }) => ({ factionId, fighterId, role, group })));
  assert.notEqual(back.id, r.id);
  assert.throws(() => decodeWarcryRoster(encodeWarcryRoster(r), [KHORNE.id]), /Фракция не найдена/);
  assert.throws(() => decodeWarcryRoster('KT1.abc'), /WC1\./);
});
