// Ростер Kill Team (W3 30.10.2026): операции, проверки, код KT1. Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addOperative, checkKtRoster, compositionTotal, decodeKtRoster, encodeKtRoster, newKtRoster, sanitizeKtRoster, toggleEquipment } from '../../../client/src/features/roster/kt/roster';
import type { KtTeam } from '../../../client/src/features/roster/kt/types';

const team = (id: string): KtTeam => JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/kt/t', id + '.json'), 'utf8'));

test('численность по составу: однозначный текст — число, варианты на верхнем уровне — null', () => {
  assert.equal(compositionTotal(team('CHAOS-LEG').composition), 6);
  assert.equal(compositionTotal(team('AEL-BOK').composition), 8);
  assert.equal(compositionTotal(team('IMP-NOV').composition), 10);
  assert.equal(compositionTotal('- 1 A operative\nOr:\n- 2 B operatives'), null);
});

test('проверки: нужен ровно один LEADER, численность по составу — замечание, оружие по умолчанию выбрано', () => {
  const t = team('CHAOS-LEG');
  const leader = t.operatives.find((o) => o.keywords.includes('LEADER'))!;
  const warrior = t.operatives.find((o) => !o.keywords.includes('LEADER'))!;
  let r = addOperative(newKtRoster(t, 'x'), warrior);
  assert.ok(r.operatives[0]!.weapons.length > 0);
  assert.ok(checkKtRoster(r, t).some((i) => i.level === 'error' && /лидер/i.test(i.message)));
  r = addOperative(r, leader);
  assert.ok(!checkKtRoster(r, t).some((i) => i.level === 'error'));
  assert.ok(checkKtRoster(r, t).some((i) => i.level === 'warning' && /6 оперативников/.test(i.message)));
  r = addOperative(r, leader);
  assert.ok(checkKtRoster(r, t).some((i) => /Лидеров 2/.test(i.message)));
});

test('код KT1.: туда и обратно, чужая команда — ошибка, мусор отбрасывается', () => {
  const t = team('AEL-BOK');
  let r = addOperative(newKtRoster(t, 'abc'), t.operatives[0]!);
  r = toggleEquipment(r, t.equipment[0]!.id);
  const back = decodeKtRoster(encodeKtRoster(r), ['AEL-BOK']);
  assert.equal(back.teamId, 'AEL-BOK');
  assert.deepEqual(back.operatives.map((o) => o.opTypeId), r.operatives.map((o) => o.opTypeId));
  assert.deepEqual(back.equipment, r.equipment);
  assert.notEqual(back.id, r.id);
  assert.throws(() => decodeKtRoster(encodeKtRoster(r), ['IMP-KAS']), /не найдена/);
  assert.throws(() => decodeKtRoster('WH1.abc'), /KT1/);
  assert.equal(sanitizeKtRoster({ system: 'aos' }), null);
  const s = sanitizeKtRoster({ system: 'kt', teamId: 'AEL-BOK', operatives: [{ opTypeId: '../x' }, { opTypeId: 'AEL-BOK-DAW', weapons: [1, 'AEL-BOK-DAW-SC'] }] })!;
  assert.equal(s.operatives.length, 1);
  assert.deepEqual(s.operatives[0]!.weapons, ['AEL-BOK-DAW-SC']);
});
