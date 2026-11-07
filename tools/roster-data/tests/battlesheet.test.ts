// Боевой лист 40K (07.11.2026): стратагемы ростера, фильтры «чей ход» и «фаза», кому доступны.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { inPhase, inTurn, matchStratagem, PHASES, rosterStratagems } from '../../../client/src/features/roster/engine/battlesheet';
import { addUnit, newRoster } from '../../../client/src/features/roster/engine/roster';
import type { FactionData, Roster } from '../../../client/src/features/roster/engine/types';

const DIR = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'f');
const fac = (id: string): FactionData => JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));
const NEC = fac('NEC');
const L = makeLookup(NEC);
const det = NEC.detachments.find((d) => !d.outdated && NEC.stratagems.some((s) => s.detachment === d.id))!;
const other = NEC.detachments.find((d) => !d.outdated && d.id !== det.id && NEC.stratagems.some((s) => s.detachment === d.id))!;
const sheet = (n: string) => NEC.datasheets.find((d) => d.name === n && d.group === 'own')!;

function roster(): { r: Roster; cr: ReturnType<typeof computeRoster> } {
  let r: Roster = { ...newRoster('NEC'), detachmentIds: [det.id], forceDisposition: det.forceDisposition };
  r = addUnit(r, sheet('Necron Warriors'));
  r = addUnit(r, sheet('Overlord'));
  return { r, cr: computeRoster(r, L) };
}

test('стратагемы ростера: основные и выбранного детачмента; чужого детачмента — нет', () => {
  const { r, cr } = roster();
  const list = rosterStratagems(cr, L, r.detachmentIds);
  assert.ok(list.some((s) => s.core), 'основные');
  assert.ok(list.some((s) => s.st.detachment === det.id && s.det === det.name), 'выбранный детачмент');
  assert.ok(!list.some((s) => s.st.detachment === other.id), 'чужой детачмент');
  // кому доступна: у основной стратагемы — юниты ростера, у которых она в списке
  const core = list.find((s) => s.core && s.targets.length)!;
  assert.ok(core.targets.every((n) => ['Necron Warriors', 'Overlord'].includes(n)));
});

test('фильтр «чей ход»: «Either player’s turn» — обоим; мой ход и ход противника не пересекаются по остальным', () => {
  const st = (turn: string) => ({ turn });
  assert.equal(inTurn(st('Either player’s turn'), 'mine'), true);
  assert.equal(inTurn(st('Either player’s turn'), 'opp'), true);
  assert.equal(inTurn(st('Your turn'), 'mine'), true);
  assert.equal(inTurn(st('Your turn'), 'opp'), false);
  assert.equal(inTurn(st('Opponent’s turn'), 'mine'), false);
  assert.equal(inTurn(st('Opponent’s turn'), 'opp'), true);
  assert.equal(inTurn(st(''), 'opp'), true);
});

test('фильтр фаз: «Any phase» — в любой; «Shooting or Fight phase» — в обеих; каждая стратагема всех армий попадает хотя бы в одну фазу и в один ход', () => {
  assert.equal(inPhase({ phase: 'Any phase' }, 'Charge'), true);
  assert.equal(inPhase({ phase: 'Shooting or Fight phase' }, 'Shooting'), true);
  assert.equal(inPhase({ phase: 'Shooting or Fight phase' }, 'Fight'), true);
  assert.equal(inPhase({ phase: 'Shooting or Fight phase' }, 'Movement'), false);
  const lost: string[] = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json')))
    for (const s of fac(f.replace('.json', '')).stratagems) {
      if (!PHASES.some((p) => inPhase(s, p))) lost.push(`${f} ${s.name}: фаза «${s.phase}»`);
      if (!inTurn(s, 'mine') && !inTurn(s, 'opp')) lost.push(`${f} ${s.name}: ход «${s.turn}»`);
    }
  assert.deepEqual(lost, []);
});

test('поиск по названию, тексту и русскому тексту', () => {
  const { r, cr } = roster();
  const s = rosterStratagems(cr, L, r.detachmentIds).find((x) => x.core)!;
  assert.equal(matchStratagem(s, s.st.name.slice(0, 5).toUpperCase()), true);
  assert.equal(matchStratagem(s, 'zzqq'), false);
  assert.equal(matchStratagem(s, 'переброс', { name: 'Командный переброс', text: '' }), true);
});
