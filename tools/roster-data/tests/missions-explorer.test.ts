// «Поле боя» (07.11.2026): основная миссия каждой стороны для любой пары типов армий — та же функция, что в игре.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { matchupMission } from '../../../client/src/features/roster/game/reducer';

const ROOT = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const bf = JSON.parse(fs.readFileSync(path.join(ROOT, 'battlefield.json'), 'utf8'));
const missions = JSON.parse(fs.readFileSync(path.join(ROOT, 'missions.json'), 'utf8'));

test('каждая пара типов армий: основная миссия у обеих сторон есть и это карта primary колоды', () => {
  const primary = new Set(missions.cards.filter((c: { type: string }) => c.type === 'primary').map((c: { id: string }) => c.id));
  const bad: string[] = [];
  for (const a of bf.dispositions)
    for (const b of bf.dispositions) {
      const m = matchupMission(bf.matchups, a.id, b.id);
      if (!m || !primary.has(m)) bad.push(`${a.id} против ${b.id}: ${m}`);
    }
  assert.deepEqual(bad, []);
  assert.equal(bf.dispositions.length ** 2, bf.matchups.length);
});

test('нет пары — null (интерфейс показывает «нет данных»)', () => {
  assert.equal(matchupMission(bf.matchups, 'take-and-hold', 'нет-такого'), null);
});
