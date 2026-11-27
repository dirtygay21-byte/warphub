// Test Army, этап «правила 40K» (27.11.2026): стрельба после продвижения/отступления, в ближнем бою, выбор цели,
// ±1 к попаданию и ранению, сближение и консолидация, строй после манёвра. Источник — whrules-995-core-rules-excerpt.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Datasheet } from '../../../client/src/features/roster/engine/types';
import {
  checkMove,
  DEFAULT_ANGLE,
  DEFAULT_GAP,
  parseBase,
  placeUnit,
  placedBases,
  rules40k,
  shootProfile,
  startMove,
  targetRule,
  weaponRule,
  type ShootProfile,
  type SimContext,
  type TAUnit,
} from '../../../client/src/features/roster/testarmy';
import { simulate } from '../../../client/src/features/roster/testarmy/combat';

const DATA = join(import.meta.dirname, '../../../backend/roster-data');
const sheet = (faction: string, name: string): Datasheet => JSON.parse(readFileSync(join(DATA, 'f', `${faction}.json`), 'utf8')).datasheets.find((d: Datasheet) => d.name === name);
const prof = (o: Partial<ShootProfile> = {}): ShootProfile => ({ assault: false, closeQuarters: false, monsterVehicle: false, afterAdvance: {}, afterFallBack: {}, conditional: [], ...o });
const ctx = (o: Partial<SimContext>): SimContext => ({ phase: 'shooting', active: true, placed: true, flags: {}, engaged: false, nearestEnemy: 10, move: 6, leadership: 6, ...o });
const act = (c: SimContext, id: string) => rules40k.actions(c).find((a) => a.id === id)!;

test('снимок правил: источник, версия данных, отпечаток', () => {
  const ex = JSON.parse(readFileSync(join(import.meta.dirname, '../40k/whrules-995-core-rules-excerpt.json'), 'utf8'));
  assert.equal(ex.source.dataVersion, 995);
  assert.match(ex.source.fullTextSha256, /^[0-9a-f]{64}$/);
  for (const s of ['02.02.01', '09.07', '10.05', '10.06', '12.08', '17.03', '24.07']) assert.ok(ex.sections[s], s);
});

test('профиль стрельбы из данных: исключения отряда и лидера, правила с условием — вручную', () => {
  const eversor = shootProfile([{ ds: sheet('AoI', 'Eversor Assassin'), leader: false }], []);
  assert.equal(eversor.afterAdvance.shoot, 'Frenzon');
  assert.equal(eversor.afterAdvance.charge, 'Frenzon');
  assert.equal(eversor.afterFallBack.shoot, undefined);
  const ds = (text: string, type: 'datasheet' | 'wargear' = 'datasheet') => ({ keywords: ['Infantry'], abilities: [{ type, name: 'X', param: '', text }] }) as unknown as Datasheet;
  assert.equal(shootProfile([{ ds: ds('While this model is leading a unit, that unit is eligible to shoot in a turn in which it Fell Back.'), leader: true }], []).afterFallBack.shoot, 'X');
  const cond = shootProfile([{ ds: ds("If your Army Faction is EMPEROR'S CHILDREN, this unit is eligible to shoot and declare a charge in a turn in which it Advanced or Fell Back."), leader: false }], []);
  assert.deepEqual(cond.afterAdvance, {});
  assert.deepEqual(cond.conditional, ['X']);
  const p = shootProfile([{ ds: { keywords: ['Vehicle'], abilities: [] } as unknown as Datasheet, leader: false }], ['assault, heavy', 'pistol']);
  assert.ok(p.assault && p.closeQuarters && p.monsterVehicle);
});

test('после продвижения: только штурмовая стрельба [ASSAULT]; исключение отряда; правило армии — переключатель', () => {
  const adv = { moved: 'advance' as const };
  assert.match(act(ctx({ flags: adv, shooting: prof() }), 'shoot').blocked!, /нет \[ASSAULT\]/);
  const a = act(ctx({ flags: adv, shooting: prof({ assault: true }) }), 'shoot');
  assert.equal(a.blocked, undefined);
  assert.match(a.hint!, /\[ASSAULT\]/);
  assert.equal(act(ctx({ flags: adv, shooting: prof({ afterAdvance: { shoot: 'Frenzon' } }) }), 'shoot').blocked, undefined);
  assert.ok(act(ctx({ flags: adv, shooting: prof() }), 'rule-allows'), 'переключатель правила армии');
  assert.equal(act(ctx({ flags: { ...adv, ruleAllows: true }, shooting: prof() }), 'shoot').blocked, undefined);
  // нападение после продвижения — нельзя, кроме исключения
  assert.match(act(ctx({ phase: 'charge', flags: adv, shooting: prof() }), 'charge').blocked!, /продвижения/);
  assert.equal(act(ctx({ phase: 'charge', flags: adv, shooting: prof({ afterAdvance: { charge: 'Frenzon' } }) }), 'charge').blocked, undefined);
});

test('после отступления стрелять нельзя, кроме исключения отряда (09.07)', () => {
  assert.match(act(ctx({ flags: { moved: 'fallback' }, shooting: prof() }), 'shoot').blocked!, /отступления/);
  assert.equal(act(ctx({ flags: { moved: 'fallback' }, shooting: prof({ afterFallBack: { shoot: 'Bounding Leaps' } }) }), 'shoot').blocked, undefined);
});

test('связан боем: стрельба только с [CLOSE-QUARTERS] / [PISTOL] или MONSTER/VEHICLE (10.06)', () => {
  assert.match(act(ctx({ engaged: true, shooting: prof() }), 'shoot').blocked!, /CLOSE-QUARTERS/);
  assert.equal(act(ctx({ engaged: true, shooting: prof({ closeQuarters: true }) }), 'shoot').blocked, undefined);
  assert.equal(act(ctx({ engaged: true, shooting: prof({ monsterVehicle: true }) }), 'shoot').blocked, undefined);
});

test('оружие и цель: штурмовая, ближний бой, связанные MONSTER/VEHICLE', () => {
  const w = (k: string) => ({ keywords: k, melee: false });
  const base = { mode: 'normal' as const, attackerMV: false, engagedWithAttacker: false, engagedMV: false };
  assert.equal(weaponRule(w('heavy'), { ...base, mode: 'assault' }).allowed, false);
  assert.equal(weaponRule(w('assault, heavy'), { ...base, mode: 'assault' }).allowed, true);
  assert.equal(weaponRule(w('rapid fire 1'), { ...base, mode: 'close', engagedWithAttacker: true }).allowed, false);
  assert.equal(weaponRule(w('pistol'), { ...base, mode: 'close', engagedWithAttacker: true }).allowed, true);
  // MONSTER/VEHICLE в бою: −1, кроме [CLOSE-QUARTERS] по противнику; [BLAST] по противнику — нельзя
  assert.equal(weaponRule(w('heavy'), { ...base, mode: 'close', attackerMV: true, engagedWithAttacker: false }).hitMod, -1);
  assert.equal(weaponRule(w('pistol'), { ...base, mode: 'close', attackerMV: true, engagedWithAttacker: true }).hitMod, 0);
  assert.equal(weaponRule(w('blast'), { ...base, mode: 'close', attackerMV: true, engagedWithAttacker: true }).allowed, false);
  // 17.03: цель MONSTER/VEHICLE в бою с моими: −1, [BLAST] нельзя
  assert.equal(weaponRule(w(''), { ...base, engagedMV: true }).hitMod, -1);
  assert.equal(weaponRule(w('blast'), { ...base, engagedMV: true }).allowed, false);
  // 04.02: цель в бою с моими (не MONSTER/VEHICLE) — нельзя; атакующий в бою — только по своим противникам
  const t = { attackerEngaged: false, attackerMV: false, engagedWithAttacker: false, targetEngagedWithMine: true, targetMV: false };
  assert.match(targetRule(t)!, /04\.02/);
  assert.equal(targetRule({ ...t, targetMV: true }), null);
  assert.match(targetRule({ ...t, attackerEngaged: true, targetEngagedWithMine: false })!, /10\.06/);
  assert.equal(targetRule({ ...t, attackerEngaged: true, engagedWithAttacker: true }), null);
});

test('модификаторы попадания и ранения — не больше ±1 (02.02.01)', () => {
  const target = { models: 10, T: 4, Sv: 3, inv: null, W: 1, fnp: null, keywords: 'Infantry' };
  const wpn = (keywords: string, hitMod = 0) => ({ name: 'w', melee: false, A: '2', skill: '4+', S: '4', AP: '0', D: '1', keywords, count: 5, ...(hitMod ? { hitMod } : {}) });
  const one = simulate([wpn('heavy')], target, { heavy: true }).expectedSlain;
  const two = simulate([wpn('heavy')], target, { heavy: true, hitMod: 1 }).expectedSlain;
  assert.ok(Math.abs(one - two) < 1e-9, 'HEAVY +1 и ещё +1 — всё равно +1');
  const minus = simulate([wpn('', -1)], target, { hitMod: -1 }).expectedSlain;
  const minusOne = simulate([wpn('', -1)], target, {}).expectedSlain;
  assert.ok(Math.abs(minus - minusOne) < 1e-9, '−1 и −1 — всё равно −1');
  const melee = { ...wpn('lance'), melee: true };
  assert.ok(Math.abs(simulate([melee], target, { charged: true, woundMod: 1 }).expectedSlain - simulate([melee], target, { charged: true }).expectedSlain) < 1e-9);
});

const unit = (uid: string, n: number, at: [number, number]): TAUnit =>
  placeUnit(
    { uid, name: uid, leaders: [], datasheetIds: [], points: 0, formation: 'tight', angle: DEFAULT_ANGLE, gap: DEFAULT_GAP, placed: false, models: Array.from({ length: n }, (_, i) => ({ id: `${uid}.${i}`, profile: 'x', options: parseBase('32mm').options, source: '', pick: 0, customMm: null, at: null })) },
    at,
  );
const bases = (u: TAUnit) => placedBases(u).filter((b) => !!b) as NonNullable<ReturnType<typeof placedBases>[number]>[];

test('сближение и консолидация: связан боем после; остаться в бою; консолидация на цели; нет режима — нельзя', () => {
  const me = unit('a', 1, [10, 10]);
  const foe = { uid: 'f', name: 'Foe', bases: bases(unit('f', 1, [13, 10])) }; // зазор ~1,7″ — в бою
  const far = { uid: 'g', name: 'Far', bases: bases(unit('g', 1, [30, 30])) };
  const pile = act(ctx({ phase: 'fight', engaged: true }), 'pilein');
  const am = { ...startMove(me, pile, [6])!, startEngaged: ['f'] };
  assert.deepEqual(checkMove(am, rules40k, bases(me), [foe, far]), []);
  const away = bases(unit('a', 1, [5, 10]));
  const probs = checkMove(am, rules40k, away, [foe, far]);
  assert.ok(probs.some((p) => /связанным боем/.test(p)) && probs.some((p) => /остаться в бою/.test(p)));
  // консолидация на цели: не в бою, враг дальше 3″, цель в 3″
  const cons = act(ctx({ phase: 'fight', engaged: false, nearestEnemy: 10, objective: 2, flags: { fought: true } }), 'consolidate');
  assert.equal(cons.endObjective, true);
  const amc = startMove(me, cons, [6])!;
  assert.ok(checkMove(amc, rules40k, bases(me), [far], { inRange: false }).some((p) => /цели/.test(p)));
  assert.deepEqual(checkMove(amc, rules40k, bases(me), [far], { inRange: true }), []);
  assert.match(act(ctx({ phase: 'fight', engaged: false, nearestEnemy: 10, objective: 8, flags: { fought: true } }), 'consolidate').blocked!, /12\.08/);
});

test('строй после манёвра: разорванный строй — нарушение', () => {
  const u = unit('s', 3, [20, 20]);
  const normal = act(ctx({ phase: 'movement' }), 'normal');
  const am = startMove(u, normal, [6, 6, 6])!;
  assert.deepEqual(checkMove(am, rules40k, bases(u), []), []);
  const broken = bases(u).map((b, i) => (i === 2 ? { ...b, x: b.x + 5 } : b));
  assert.ok(checkMove(am, rules40k, broken, []).some((p) => /строй разорван/.test(p)));
});

test('боевой шок: подсказка про половину численности (08.03)', () => {
  assert.match(act(ctx({ phase: 'command' }), 'battleshock').hint!, /половине численности/);
});

test('стол: профиль стрельбы передаётся, цель проверяется, HEAVY/LANCE — из режима «Игра»', () => {
  const ui = (p: string) => readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/testarmy', p), 'utf8');
  const board = ui('Board.tsx');
  for (const t of ['targetRule({', 'shooting: a.sim?.shooting?.(u)', "kind === 'toggle'", 'startEngaged:', 'movedDist()', 'nearestObjective(unitsOf(active.uid)']) assert.ok(board.includes(t), t);
  assert.ok(ui('TestArmyScreen.tsx').includes('shootProfileOf(a.cr'));
  const sheet = ui('CombatSheet.tsx');
  for (const t of ['weaponRule(', 'shot?.heavy', 'shot?.charged', '24.07']) assert.ok(sheet.includes(t), t);
});
