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

// S3 (30.10.2026): карты батлпланов по Sigdex — tools/roster-data/aos/sigdex-battleplans-2026-27.json
test('карты батлпланов: у всех 12, всё в пределах поля 60×44, цели — 6 типов GH, территории A и B', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', [join(import.meta.dirname, '../scripts/aos-battleplan-maps.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'battlepack.json не совпадает со снимком Sigdex: ' + r.stdout + r.stderr);
  assert.match(bp.source.maps, /sigdex/);
  const W = bp.battlefield.width, H = bp.battlefield.height;
  const limit = new Map(bp.objectiveTypes.map((o: { id: string; count: number }) => [o.id, o.count]));
  for (const p of bp.battleplans) {
    const m = p.map;
    assert.ok(m, p.name);
    assert.ok(m.objectives.length >= 3 && m.objectives.length <= 6, `${p.name}: ${m.objectives.length} целей`);
    const per = new Map<string, number>();
    for (const o of m.objectives) {
      assert.ok(limit.has(o.type), `${p.name}: цель ${o.type}`);
      per.set(o.type, (per.get(o.type) ?? 0) + 1);
      assert.ok(o.x >= 0 && o.x <= W && o.y >= 0 && o.y <= H, `${p.name}: цель вне поля`);
    }
    for (const [t, n] of per) assert.ok(n <= (limit.get(t) as number), `${p.name}: ${t} × ${n}`);
    for (const t of m.terrain) {
      assert.ok(['ruin', 'obscuring', 'place-of-power'].includes(t.type) && [2.5, 3.5].includes(t.r), p.name);
      assert.ok(t.x >= 0 && t.x <= W && t.y >= 0 && t.y <= H, `${p.name}: террейн вне поля`);
    }
    for (const side of ['A', 'B']) {
      assert.ok(m.territories[side].length >= 1, `${p.name}: территория ${side}`);
      for (const [x, y, w, h] of m.territories[side]) assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= W && y + h <= H, `${p.name}: ${side}`);
    }
    // территории не пересекаются
    for (const a of m.territories.A) for (const b of m.territories.B) {
      const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
      const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
      assert.ok(ox <= 0 || oy <= 0, `${p.name}: территории пересекаются`);
    }
  }
});
