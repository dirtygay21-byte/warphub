// Карточка юнита 40K (07.11.2026): «Действует на юнит» — армейское правило и правила выбранных детачментов (в том числе через отряд).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { unitAppliedRules } from '../../../client/src/features/roster/engine/group';
import { addUnit, newRoster, updateUnit } from '../../../client/src/features/roster/engine/roster';
import type { FactionData, Roster } from '../../../client/src/features/roster/engine/types';

const NEC: FactionData = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'f', 'NEC.json'), 'utf8'));
const sheet = (F: FactionData, n: string) => F.datasheets.find((d) => d.name === n && d.group === 'own')!;
const det = NEC.detachments.find((d) => !d.outdated && d.abilities.length)!;

function build(F: FactionData, detIds: string[]) {
  const L = makeLookup(F);
  let r: Roster = { ...newRoster('NEC'), detachmentIds: detIds, forceDisposition: det.forceDisposition };
  r = addUnit(r, sheet(F, 'Necron Warriors'));
  r = addUnit(r, sheet(F, 'Overlord'));
  r = updateUnit(r, r.units[1]!.uid, { attachedTo: r.units[0]!.uid });
  return { L, r, cr: computeRoster(r, L) };
}

test('армейское правило — у каждого юнита с ним (Reanimation Protocols), с текстом из словаря правил армии', () => {
  const { L, r, cr } = build(NEC, []);
  const a = unitAppliedRules(cr.units[0]!, cr, L, r.detachmentIds);
  assert.ok(a.army.some((x) => /Reanimation Protocols/.test(x.name) && x.text.length > 20), JSON.stringify(a.army.map((x) => x.name)));
  // детачмент не выбран — правил детачмента нет
  assert.deepEqual(a.det, []);
});

test('правило выбранного детачмента — у юнита; без детачмента — нет', () => {
  const { L, r, cr } = build(NEC, [det.id]);
  const a = unitAppliedRules(cr.units[0]!, cr, L, r.detachmentIds);
  assert.ok(a.det.some((x) => x.id === det.abilities[0]!.id && x.det === det.name && x.own));
});

test('правило через отряд: у присоединённого Leader правила нет, но телохранители его дают — «через Necron Warriors»', () => {
  const F = structuredClone(NEC);
  sheet(F, 'Overlord').detachmentAbilities = [];
  const { L, r, cr } = build(F, [det.id]);
  const lead = cr.units.find((u) => u.ds!.name === 'Overlord')!;
  const x = unitAppliedRules(lead, cr, L, r.detachmentIds).det.find((y) => y.id === det.abilities[0]!.id)!;
  assert.ok(x, 'правило детачмента у Overlord через отряд');
  assert.equal(x.own, false);
  assert.deepEqual(x.via, ['Necron Warriors']);
});
