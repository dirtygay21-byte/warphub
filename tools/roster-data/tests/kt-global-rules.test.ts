import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  addOperative,
  allowedWeaponCombos,
  isLeaderOperative,
  newKtRoster,
  requiredOperativeKeywords,
  rosterSelectionCount,
} from '../../../client/src/features/roster/kt/roster';
import type { KtTeam } from '../../../client/src/features/roster/kt/types';

const teams = new Map(readdirSync(join(import.meta.dirname, '../../../backend/roster-data/kt/t')).map((file) => {
  const team = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/kt/t', file), 'utf8')) as KtTeam;
  return [team.id, team] as const;
}));

const LEADER_FALLBACK = new Set(['ORK-KOM-NOB', 'NEC-CAN-GEO']);

test('global leaders: no fallback leadership for ordinary operatives', () => {
  for (const team of teams.values()) {
    for (const operative of team.operatives) {
      const expected = operative.keywords.includes('LEADER') || LEADER_FALLBACK.has(operative.id);
      assert.equal(isLeaderOperative(team, operative), expected, `${team.id}/${operative.id}`);
    }
  }
});

test('Warp Coven: Tzaangor count as half selections; Sorcerer is required, not a leader', () => {
  const team = teams.get('CHAOS-WC')!;
  const sorcerer = team.operatives.find((o) => o.id === 'CHAOS-WC-SOD')!;
  const tzaangor = team.operatives.filter((o) => o.keywords.includes('TZAANGOR'));
  let roster = addOperative(newKtRoster(team, 'test'), sorcerer);
  for (const operative of [...tzaangor, ...tzaangor]) roster = addOperative(roster, operative);

  assert.equal(roster.operatives.length, 9);
  assert.equal(rosterSelectionCount(roster, team), 5);
  assert.deepEqual(requiredOperativeKeywords(team), ['SORCERER']);
  assert.equal(isLeaderOperative(team, sorcerer), false);
  assert.ok(requiredOperativeKeywords(team).every((keyword) => sorcerer.keywords.includes(keyword)));
});

test('AEL-BOK nested wargear alternatives are not reduced to incomplete simple pairs', () => {
  const team = teams.get('AEL-BOK')!;
  const exarch = team.operatives.find((o) => o.id === 'AEL-BOK-DAX')!;
  assert.equal(allowedWeaponCombos(team, exarch), null);
});
