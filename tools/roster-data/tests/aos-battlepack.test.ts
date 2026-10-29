// AoS «Начать игру», S2: данные General's Handbook 2026-27 (backend/roster-data/aos/battlepack.json). Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const bp = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/aos/battlepack.json'), 'utf8'));

test('12 батлпланов по двум таблицам (1–6, 7–12), у каждого строки очков', () => {
  assert.equal(bp.battleplans.length, 12);
  bp.battleplans.forEach((p: { n: number; table: number; scoring: { vp: number; rounds: string; text: string }[]; name: string }, i: number) => {
    assert.equal(p.n, i + 1);
    assert.equal(p.table, p.n <= 6 ? 1 : 2);
    assert.ok(p.scoring.length >= 3, p.name);
    for (const r of p.scoring) {
      assert.ok([3, 4, 7].includes(r.vp), `${p.name}: ${r.vp}`);
      assert.ok(['all', '1', '2+'].includes(r.rounds));
      assert.ok(r.text.length > 5);
    }
  });
});

test('6 карт тактик по 3 тактики в порядке Affray → Strike → Domination, 5 ПО, до 2 карт', () => {
  assert.equal(bp.tactics.cards.length, 6);
  assert.equal(bp.tactics.pick, 2);
  assert.equal(bp.tactics.vp, 5);
  for (const c of bp.tactics.cards) assert.deepEqual(c.tactics.map((t: { tier: string }) => t.tier), ['affray', 'strike', 'domination'], c.name);
  assert.equal(new Set(bp.tactics.cards.map((c: { id: string }) => c.id)).size, 6);
});

test('раунды, победа, CP, priority, цели', () => {
  assert.equal(bp.rounds, 5);
  assert.equal(bp.victory.majorMargin, 5);
  assert.deepEqual([bp.cp.perRound, bp.cp.underdog, bp.cp.fewerAuxiliaries, bp.cp.lostAtRoundEnd], [4, 1, 1, true]);
  assert.equal(bp.priority.seizeBlockedLead, 11);
  assert.equal(bp.battlefield.objectiveRange, 3);
  assert.equal(bp.objectiveTypes.reduce((s: number, o: { count: number }) => s + o.count, 0), 6);
});
