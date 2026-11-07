// Симулятор боя S2 (08.11.2026): ростер → оружие атакующего (снаряжение, персонажи), дальность, цель.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { addUnit, newRoster, updateUnit } from '../../../client/src/features/roster/engine/roster';
import type { FactionData, Roster } from '../../../client/src/features/roster/engine/types';
import { simulate } from '../../../client/src/features/roster/testarmy/combat';
import { attackRows, inHalfRange, inRange, targetFrom, toWeaponInput } from '../../../client/src/features/roster/testarmy/combatInput';

const fac = (id: string): FactionData => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'f', `${id}.json`), 'utf8'));
const NEC = fac('NEC');
const L = makeLookup(NEC);
const sheet = (n: string) => NEC.datasheets.find((d) => d.name === n && d.group === 'own')!;

function build() {
  let r: Roster = newRoster('NEC');
  r = addUnit(r, sheet('Necron Warriors'));
  r = addUnit(r, sheet('Overlord'));
  r = updateUnit(r, r.units[1]!.uid, { attachedTo: r.units[0]!.uid });
  return { r, cr: computeRoster(r, L) };
}

test('оружие атакующего: снаряжение отряда с числом моделей и оружие присоединённого персонажа', () => {
  const { r, cr } = build();
  const ranged = attackRows(cr, r.units[0]!.uid, false);
  const warriors = cr.byUid.get(r.units[0]!.uid)!;
  const units = new Set(ranged.map((x) => x.unit));
  assert.ok(units.has('Necron Warriors') && units.has('Overlord'), [...units].join(', '));
  const total = ranged.filter((x) => x.unit === 'Necron Warriors' && x.primary).reduce((s, x) => s + x.count, 0);
  assert.equal(total, Object.entries(warriors.loadout).filter(([k]) => ranged.some((x) => x.weapon.toLowerCase() === k.toLowerCase() && x.unit === 'Necron Warriors')).reduce((s, [, v]) => s + v, 0));
  assert.ok(ranged.every((x) => !x.melee && x.range != null));
  const melee = attackRows(cr, r.units[0]!.uid, true);
  assert.ok(melee.length > 0 && melee.every((x) => x.melee));
});

test('дальность: не достаёт дальше дальности; половина дальности — для RAPID FIRE / MELTA', () => {
  const { r, cr } = build();
  const row = attackRows(cr, r.units[0]!.uid, false)[0]!;
  assert.equal(inRange(row, row.range! + 0.1), false);
  assert.equal(inRange(row, row.range!), true);
  assert.equal(inRange(row, null), true);
  assert.equal(inHalfRange(row, row.range! / 2), true);
  assert.equal(inHalfRange(row, row.range! / 2 + 0.1), false);
  assert.equal(toWeaponInput(row, row.range! / 2).halfRange, true);
});

test('цель из ростера: профиль, модели, ключевые слова; персонажи — в примечании; расчёт работает', () => {
  const { r, cr } = build();
  const t = targetFrom(cr, r.units[0]!.uid)!;
  const st = sheet('Necron Warriors').stats[0]!;
  assert.equal(t.target.T, Number(st.T));
  assert.equal(t.target.W, Number(st.W));
  assert.equal(t.target.models, cr.byUid.get(r.units[0]!.uid)!.models);
  assert.ok(t.target.keywords.includes('INFANTRY') || t.target.keywords.some((k) => /infantry/i.test(k)));
  assert.ok(t.notes.some((n) => n.includes('Overlord')));
  const rows = attackRows(cr, r.units[0]!.uid, false).filter((x) => x.primary);
  const res = simulate(rows.map((x) => toWeaponInput(x, 12)), t.target);
  assert.equal(res.error, null);
  assert.ok(Math.abs(res.slain.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});
