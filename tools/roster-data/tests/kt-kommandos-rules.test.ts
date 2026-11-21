import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addOperative,
  allowedWeaponCombos,
  checkKtRoster,
  compositionTotal,
  isLeaderOperative,
  newKtRoster,
  nextWeaponsForToggle,
  removeOperative,
  rosterSelectionCount,
  updateOperative,
} from '../../../client/src/features/roster/kt/roster';
import type { KtTeam } from '../../../client/src/features/roster/kt/types';

const team: KtTeam = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/kt/t/ORK-KOM.json'), 'utf8'));
const boss = team.operatives.find((o) => o.id === 'ORK-KOM-NOB')!;
const boy = team.operatives.find((o) => o.id === 'ORK-KOM-BOY')!;
const grot = team.operatives.find((o) => o.id === 'ORK-KOM-GROT')!;
const squig = team.operatives.find((o) => /bomb squig/i.test(o.name))!;
const slugga = boss.weapons.find((w) => w.id === 'ORK-KOM-NOB-SLG')!;
const bigChoppa = boss.weapons.find((w) => w.id === 'ORK-KOM-NOB-BC')!;
const powerClaw = boss.weapons.find((w) => w.id === 'ORK-KOM-NOB-PC')!;

function bossWithPair(pair: 'big' | 'power') {
  let roster = addOperative(newKtRoster(team, 'test'), boss);
  roster = updateOperative(roster, roster.operatives[0]!.uid, {
    weapons: pair === 'big' ? [slugga.id, bigChoppa.id] : [slugga.id, powerClaw.id],
  });
  return roster;
}

function fullKommandoRoster() {
  let roster = bossWithPair('big');
  for (const operative of [grot, squig, ...Array.from({ length: 8 }, () => boy)]) {
    roster = addOperative(roster, operative);
  }
  return roster;
}

test('Kommandos: Boss Nob is a leader from composition, not an extra leader allowance', () => {
  assert.equal(compositionTotal(team.composition), 10);
  assert.equal(isLeaderOperative(team, boss), true);
  assert.equal(isLeaderOperative(team, boy), false);
  const withoutLeader = addOperative(newKtRoster(team, 'test'), boy);
  assert.ok(checkKtRoster(withoutLeader, team).some((issue) => issue.level === 'error' && /лидер/i.test(issue.message)));
  assert.ok(!checkKtRoster(fullKommandoRoster(), team).some((issue) => /лидер/i.test(issue.message)));
});

test('Kommandos: 11 models can be 10 selections because Grot + Bomb Squig share one', () => {
  const roster = fullKommandoRoster();
  assert.equal(roster.operatives.length, 11);
  assert.equal(rosterSelectionCount(roster, team), 10);
  assert.deepEqual(checkKtRoster(roster, team), []);

  const withoutSquig = removeOperative(roster, roster.operatives[2]!.uid);
  assert.equal(rosterSelectionCount(withoutSquig, team), 9.5);
  assert.ok(checkKtRoster(withoutSquig, team).some((issue) => issue.level === 'warning' && /Не хватает/.test(issue.message)));
});

test('Boss Nob wargear: only Slugga + Big Choppa or Slugga + Power Claw', () => {
  assert.deepEqual(allowedWeaponCombos(team, boss), [
    [slugga.id, bigChoppa.id],
    [slugga.id, powerClaw.id],
  ]);
  assert.equal(nextWeaponsForToggle(team, boss, [slugga.id], bigChoppa).length, 2);
  assert.deepEqual(nextWeaponsForToggle(team, boss, [slugga.id, bigChoppa.id], powerClaw), [slugga.id, powerClaw.id]);
  assert.deepEqual(nextWeaponsForToggle(team, boss, [slugga.id, powerClaw.id], bigChoppa), [slugga.id, bigChoppa.id]);

  const valid = bossWithPair('big');
  assert.ok(!checkKtRoster(valid, team).some((issue) => /комбинации/.test(issue.message)));
  const invalid = updateOperative(valid, valid.operatives[0]!.uid, { weapons: [slugga.id, bigChoppa.id, powerClaw.id] });
  assert.ok(checkKtRoster(invalid, team).some((issue) => issue.level === 'error' && /комбинации/.test(issue.message)));
});

test('weapon IDs not present in the operative data are rejected instead of being hidden', () => {
  const roster = bossWithPair('power');
  const invalid = updateOperative(roster, roster.operatives[0]!.uid, {
    weapons: [slugga.id, powerClaw.id, 'UNKNOWN-WEAPON'],
  });
  assert.ok(checkKtRoster(invalid, team).some((issue) => issue.level === 'error' && /UNKNOWN-WEAPON/.test(issue.message)));
});
