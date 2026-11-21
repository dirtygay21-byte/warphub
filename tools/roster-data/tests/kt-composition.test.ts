// Состав Kill Team по слотам (21.11.2026): численность с фиксированными оперативниками, лимиты, «полвыбора». Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { addBlockReason, assignSlots, checkStructure, structureTotal } from '../../../client/src/features/roster/kt/composition';
import { addOperative, checkKtRoster, ktTeamTotal, newKtRoster, rosterSelectionCount, type KtRoster } from '../../../client/src/features/roster/kt/roster';
import type { KtTeam } from '../../../client/src/features/roster/kt/types';

const DIR = join(import.meta.dirname, '../../../backend/roster-data/kt/t');
const team = (id: string): KtTeam => JSON.parse(readFileSync(join(DIR, id + '.json'), 'utf8'));
const add = (r: KtRoster, t: KtTeam, id: string, n = 1) => {
  for (let i = 0; i < n; i++) r = addOperative(r, t.operatives.find((o) => o.id === id)!);
  return r;
};
// оружие по умолчанию у некоторых лидеров — не комбинация из состава; здесь проверяется только численность
const errors = (r: KtRoster, t: KtTeam) => checkKtRoster(r, t).filter((i) => i.level === 'error' && !/комбинации/.test(i.message)).map((i) => i.message);

test('у каждой команды игроков есть разобранный состав; все оперативники данных — в слотах', () => {
  const teams = readdirSync(DIR).map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as KtTeam).filter((t) => !t.special);
  assert.equal(teams.length, 48);
  for (const t of teams) {
    assert.ok(t.structure, `${t.id}: нет structure`);
    const inSlots = new Set(t.structure!.slots.flatMap((s) => s.ops));
    for (const o of t.operatives) assert.ok(inSlots.has('*') || inSlots.has(o.id), `${t.id}: ${o.id} не в слотах`);
    assert.ok(structureTotal(t.structure!) > 0, t.id);
  }
});

test('XV26 Stealth Battlesuits: 7 оперативников — Shas\'vre, Marker Drone, Gun Drone и 4 боескафандра', () => {
  const t = team('TAU-XV26');
  assert.equal(ktTeamTotal(t), 7);
  let r = newKtRoster(t, 'x');
  r = add(r, t, 'TAU-XV26-SV');
  r = add(r, t, 'TAU-XV26-MV75');
  r = add(r, t, 'TAU-XV26-MV15');
  r = add(r, t, 'TAU-XV26-INF', 2);
  r = add(r, t, 'TAU-XV26-DES');
  r = add(r, t, 'TAU-XV26-LIB');
  assert.equal(rosterSelectionCount(r, t), 7);
  assert.deepEqual(errors(r, t), []);
  assert.ok(!checkKtRoster(r, t).some((i) => /Не хватает/.test(i.message)));
  // пятый боескафандр и второй дрон — некуда
  assert.equal(addBlockReason(t.structure!, t, r.operatives, t.operatives.find((o) => o.id === 'TAU-XV26-NEU')!), 'Все места этого типа заняты');
  assert.equal(addBlockReason(t.structure!, t, r.operatives, t.operatives.find((o) => o.id === 'TAU-XV26-MV15')!), 'Все места этого типа заняты');
  // Designator — один раз
  const r2 = add(newKtRoster(t, 'x'), t, 'TAU-XV26-DES', 2);
  assert.ok(errors(r2, t).some((m) => /Designator: не больше 1/.test(m)));
});

test('дроны и маркер не занимают места боескафандров: 4 боескафандра без дронов — не хватает дронов', () => {
  const t = team('TAU-XV26');
  let r = add(newKtRoster(t, 'x'), t, 'TAU-XV26-SV');
  r = add(r, t, 'TAU-XV26-INF', 4);
  const msgs = checkKtRoster(r, t).map((i) => i.message);
  assert.ok(msgs.some((m) => /Не хватает: MV75 Marker Drone/.test(m)));
  assert.ok(msgs.some((m) => /Не хватает: MV15 Gun Drone/.test(m)));
});

test('Kommandos: Grot и Bomb Squig — полвыбора, вместе один; 10 выборов', () => {
  const t = team('ORK-KOM');
  assert.equal(ktTeamTotal(t), 10);
  let r = add(newKtRoster(t, 'x'), t, 'ORK-KOM-NOB');
  r = add(r, t, 'ORK-KOM-BOY', 8);
  r = add(r, t, 'ORK-KOM-GROT');
  r = add(r, t, 'ORK-KOM-SQUIG');
  assert.equal(rosterSelectionCount(r, t), 10);
  assert.deepEqual(errors(r, t), []);
});

test('Wrecka Krew: 2 Bomb Squig обязательны и входят в численность (8)', () => {
  const t = team('ORK-WK');
  assert.equal(ktTeamTotal(t), 8);
  let r = add(newKtRoster(t, 'x'), t, 'ORK-WK-NOB');
  r = add(r, t, 'ORK-WK-BBFTR', 5);
  assert.ok(checkKtRoster(r, t).some((i) => /Не хватает: Wrecka Bomb Squig — ещё 2/.test(i.message)));
});

test('Wyrmblade: агенты культа — за два выбора, не больше двух; Gunner — до двух с разным оружием', () => {
  const t = team('TYR-WB');
  let r = add(newKtRoster(t, 'x'), t, 'TYR-WB-LDR');
  r = add(r, t, 'TYR-WB-KLM');
  r = add(r, t, 'TYR-WB-LOC');
  assert.equal(rosterSelectionCount(r, t), 5);
  assert.ok(addBlockReason(t.structure!, t, r.operatives, t.operatives.find((o) => o.id === 'TYR-WB-SNP')!));
  r = add(r, t, 'TYR-WB-GNR', 2);
  assert.ok(errors(r, t).some((m) => /разное оружие/.test(m)));
});

test('Inquisitorial Agents: реквизиция только из одной группы', () => {
  const t = team('IMP-INQ');
  let r = add(newKtRoster(t, 'x'), t, 'IMP-INQ-INQ24-INT');
  r = add(r, t, 'IMP-INQ-DKK24-TRP');
  r = add(r, t, 'IMP-INQ-KAS24-TRP');
  assert.ok(errors(r, t).some((m) => /одной группы/.test(m)));
});

test('Gellerpox: фиксированный состав 11; Chaos Cult: Mutant/Torment не выбираются', () => {
  assert.equal(ktTeamTotal(team('CHAOS-GPI')), 11);
  const cult = team('CHAOS-CULT');
  assert.equal(ktTeamTotal(cult), 14);
  assert.equal(addBlockReason(cult.structure!, cult, [], cult.operatives.find((o) => o.id === 'CHAOS-CULT-MUT')!), 'Все места этого типа заняты');
});

test('распределение по слотам: фиксированные не занимают общий слот', () => {
  const t = team('IMP-BC');
  const ops = [{ uid: 'a', opTypeId: 'IMP-BC-BSU' }, { uid: 'b', opTypeId: 'IMP-BC-TA' }];
  const { fills, extra } = assignSlots(t.structure!, ops);
  assert.deepEqual(extra, []);
  assert.deepEqual(fills.map((f) => f.filled), [1, 1, 0]);
  assert.ok(checkStructure(t.structure!, t, []).length === 0);
});

test('каждую команду можно собрать полностью по слотам без ошибок численности и лимитов', () => {
  const teams = readdirSync(DIR).map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as KtTeam).filter((t) => !t.special);
  const report: string[] = [];
  for (const t of teams) {
    const s = t.structure!;
    let r = newKtRoster(t, 'x');
    for (const slot of s.slots.filter((x) => !x.optional)) {
      const pool = slot.ops.includes('*') ? t.operatives.map((o) => o.id) : slot.ops;
      let guard = 0;
      while (guard++ < 40) {
        const filled = assignSlots(s, r.operatives).fills[s.slots.indexOf(slot)]!.filled;
        if (filled + 1e-9 >= slot.count) break;
        const next = pool.map((id) => t.operatives.find((o) => o.id === id)!).find((o) => {
          if (addBlockReason(s, t, r.operatives, o)) return false;
          const after = addOperative(r, o);
          return assignSlots(s, after.operatives).fills[s.slots.indexOf(slot)]!.filled <= slot.count + 1e-9 && assignSlots(s, after.operatives).fills[s.slots.indexOf(slot)]!.filled > filled;
        });
        if (!next) break;
        r = addOperative(r, next);
      }
    }
    const hard = checkStructure(s, t, r.operatives).filter((i) => !i.soft);
    if (hard.length || Math.abs(rosterSelectionCount(r, t) - structureTotal(s)) > 1e-9) report.push(`${t.id}: ${rosterSelectionCount(r, t)}/${structureTotal(s)} ${hard.map((i) => i.message).join('; ')}`);
  }
  assert.deepEqual(report, []);
});
