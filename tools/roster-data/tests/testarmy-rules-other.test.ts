// Test Army, этап 3 правил (27.11.2026): AoS 4 (Wahapedia Core Rules 14–16, 20), Kill Team (Wahapedia Core Rules),
// Warcry (warcrier.net: Attack / Move / Other Actions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coherency, COHERENCY_AOS, rulesAos, rulesKt, skirmishTargetRule, type Placed, type SimContext } from '../../../client/src/features/roster/testarmy';

const ctx = (o: Partial<SimContext>): SimContext => ({ phase: 'shooting', active: true, placed: true, flags: {}, engaged: false, nearestEnemy: 10, move: 6, leadership: null, ...o });
const r25 = 25 / 2 / 25.4;
const m = (x: number): Placed => ({ x, y: 10, rx: r25, ry: r25, angle: 0 });

test('AoS 16.0: в бою стрелять только оружием Shoot in Combat и только по отрядам в бою с ним', () => {
  const shoot = (o: Partial<SimContext>) => rulesAos.actions(ctx(o)).find((a) => a.id === 'shoot')!;
  assert.match(shoot({ engaged: true, shootInCombat: false }).blocked!, /Shoot in Combat/);
  assert.equal(shoot({ engaged: true, shootInCombat: true }).blocked, undefined);
  assert.equal(shoot({ engaged: false, shootInCombat: false }).blocked, undefined);
  const base = { melee: false, attackerEngaged: true, targetEngagedWithAttacker: false, friendlyNearTarget: false, gap: 8, ranges: [{ max: 12 }] };
  assert.match(skirmishTargetRule('aos', base)!, /16\.0/);
  assert.equal(skirmishTargetRule('aos', { ...base, targetEngagedWithAttacker: true }), null);
});

test('AoS 15.1: отряд — одна группа; две группы по ½″ — строй разорван', () => {
  const step = 2 * r25 + 0.4;
  const one = [0, 1, 2, 3].map((i) => m(10 + i * step));
  assert.ok(coherency(one, COHERENCY_AOS).ok);
  const two = [m(10), m(10 + step), m(20), m(20 + step)];
  const r = coherency(two, COHERENCY_AOS);
  assert.ok(!r.ok && r.bad.length === 2, 'вторая пара — вне группы');
});

test('AoS 15.3: сближение — остаться в бою со всеми, с кем был', () => {
  const pile = rulesAos.actions(ctx({ phase: 'combat', engaged: true })).find((a) => a.id === 'pilein')!;
  assert.equal(pile.keepEngaged, true);
});

test('Kill Team: действие не дважды; Fall Back и Charge — с ограничениями; Shoot — не по цели рядом со своим', () => {
  const kt = (did: string[], o: Partial<SimContext> = {}) => Object.fromEntries(rulesKt.actions(ctx({ phase: 'firefight', apl: 3, flags: { order: 'engage', did, spent: did.length }, ...o })).map((a) => [a.id, a.blocked]));
  assert.match(kt(['shoot']).shoot!, /уже было/);
  assert.match(kt(['dash']).dash!, /уже было/);
  assert.match(kt(['reposition'], { engaged: true }).fallback!, /Reposition/);
  assert.match(kt(['dash']).charge!, /Dash/);
  assert.match(kt(['reposition']).charge!, /Reposition/);
  assert.equal(kt([]).charge, undefined);
  const base = { melee: false, attackerEngaged: false, targetEngagedWithAttacker: false, friendlyNearTarget: true, gap: 8, ranges: [] };
  assert.match(skirmishTargetRule('kt', base)!, /control range/);
  assert.equal(skirmishTargetRule('kt', { ...base, friendlyNearTarget: false }), null);
});

test('Warcry Attack: враг в 1″ — цель только из них; дальняя атака по врагу у своего бойца — только из 3″ без мин. дальности', () => {
  const base = { melee: false, attackerEngaged: true, targetEngagedWithAttacker: false, friendlyNearTarget: false, gap: 6, ranges: [{ max: 12 }] };
  assert.match(skirmishTargetRule('warcry', base)!, /в 1″/);
  const missile = { ...base, attackerEngaged: false, friendlyNearTarget: true };
  assert.match(skirmishTargetRule('warcry', missile)!, /дальняя атака/);
  assert.equal(skirmishTargetRule('warcry', { ...missile, gap: 2.5 }), null, 'в 3″, без минимальной дальности');
  assert.match(skirmishTargetRule('warcry', { ...missile, gap: 2.5, ranges: [{ min: 2, max: 12 }] })!, /дальняя атака/);
  assert.equal(skirmishTargetRule('warcry', { ...missile, gap: 1.5, ranges: [{ max: 2 }, { min: 3, max: 12 }] }), null, 'ближняя атака');
});

test('стол: проверка цели до отметки «стрелял»; AoS — Shoot in Combat из варскролла', () => {
  const ui = (p: string) => readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/testarmy', p), 'utf8');
  const board = ui('Board.tsx');
  assert.ok(board.indexOf('skirmishTargetRule(rules.system') < board.indexOf("if (game && from && rules) {"), 'сначала проверка цели, потом отметка');
  assert.ok(board.includes('shootInCombat:'));
  assert.ok(ui('AosTestArmyScreen.tsx').includes('/shoot in combat/i.test(w.abilities'));
});
