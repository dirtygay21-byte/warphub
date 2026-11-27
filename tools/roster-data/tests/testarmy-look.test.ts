import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARMY_COLORS, armyColor, sampleDist } from '../../../client/src/features/roster/testarmy/look';

// Test Army, этап 1 (27.11.2026): цвета армий, «Вне стола», таблички и баннеры.
const ui = (p: string) => readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui', p), 'utf8');

test('Цвет армии: по умолчанию по стороне, свой выбор из палитры, две армии одного цвета различаются', () => {
  const red = ARMY_COLORS.find((c) => c.id === 'red')!.hex;
  const blue = ARMY_COLORS.find((c) => c.id === 'blue')!.hex;
  const green = ARMY_COLORS.find((c) => c.id === 'green')!.hex;
  assert.equal(armyColor({ side: 'attacker' }), red);
  assert.equal(armyColor({ side: 'defender' }), blue);
  assert.equal(armyColor({ side: 'defender', color: green }), green);
  assert.equal(armyColor({ side: 'defender', color: '#123456' }), blue, 'цвет не из палитры не применяется');
  // обе выбрали зелёный: атакующий остаётся зелёным, защитник получает другой цвет
  assert.equal(armyColor({ side: 'attacker', color: green }, { side: 'defender', color: green }), green);
  assert.notEqual(armyColor({ side: 'defender', color: green }, { side: 'attacker', color: green }), green);
});

test('Бросок по распределению симулятора: значение в пределах и по вероятностям', () => {
  const p = [0.25, 0.5, 0.25];
  assert.equal(sampleDist(p, 0.1), 0);
  assert.equal(sampleDist(p, 0.3), 1);
  assert.equal(sampleDist(p, 0.9), 2);
  assert.equal(sampleDist([0, 0, 1], 0.999999), 2);
});

test('Стол: полоса армий, «Вне стола» обеих армий, баннеры; цвет передают все три экрана', () => {
  const board = ui('testarmy/Board.tsx');
  for (const token of ['<ArmyBar', '<OffTable name={foe.name}', '<OffTable name={me.name}', '<Banner banner={banner}', 'plate={', 'fillOpacity={0.16}']) assert.ok(board.includes(token), token);
  assert.ok(!board.includes('SIDE_COLOR'), 'цвета — только через armyColor');
  for (const p of ['testarmy/TestArmyScreen.tsx', 'testarmy/AosTestArmyScreen.tsx', 'skirmish/SkirmishTestArmyScreen.tsx']) assert.ok(ui(p).includes('onArmyColor={setArmyColor}'), p);
  assert.ok(ui('testarmy/TestArmyScreen.tsx').includes('onRoll='), 'бросок симулятора → баннер');
  assert.ok(ui('testarmy/CombatSheet.tsx').includes('sampleDist(result.slain)'));
});
