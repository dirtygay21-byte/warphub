// Kill Team 2024 (W2 30.10.2026): данные из ktdash-v4-public в backend/roster-data/kt. Запуск: bun test
// Сверка с источником — если рядом есть клон ktdash (KTDASH_DIR или /home/claude/ktdash), иначе пропуск.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { KtIndex, KtTeam } from '../../../client/src/features/roster/kt/types';

const KT = join(import.meta.dirname, '../../../backend/roster-data/kt');
const index: KtIndex = JSON.parse(readFileSync(join(KT, 'index.json'), 'utf8'));
const teams: KtTeam[] = readdirSync(join(KT, 't')).map((f) => JSON.parse(readFileSync(join(KT, 't', f), 'utf8')));
const SRC = process.env.KTDASH_DIR ?? '/home/claude/ktdash';

test('индекс: источник с коммитом и датой, команды = файлы, фракции существуют', () => {
  assert.equal(index.system, 'kt');
  assert.match(index.source.commit, /^[0-9a-f]{7,}$/);
  assert.match(index.source.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(index.teams.length, teams.length);
  const factions = new Set(index.factions.map((f) => f.id));
  for (const t of index.teams) {
    assert.ok(factions.has(t.factionId), t.id);
    const file = teams.find((x) => x.id === t.id);
    assert.ok(file, t.id);
    assert.equal(file!.operatives.length, t.operatives, t.id);
    assert.equal(file!.special, t.factionId === 'SPEC', t.id);
  }
  assert.ok(index.teams.filter((t) => !t.special).length >= 45);
});

test('команды: оперативники с характеристиками, оружие с профилями, id уникальны, уловки размечены', () => {
  const ids = new Set<string>();
  for (const t of teams) {
    assert.ok(t.name && t.operatives.length > 0, t.id);
    if (!t.special && t.id !== 'IMP-SFV') {
      assert.ok(t.composition.length > 20, `${t.id}: состав`);
      assert.ok(t.ploys.some((p) => p.type === 'strategy') && t.ploys.some((p) => p.type === 'firefight'), `${t.id}: уловки`);
      assert.ok(t.equipment.length > 0, `${t.id}: снаряжение`);
    }
    for (const o of t.operatives) {
      assert.ok(!ids.has(o.id), o.id);
      ids.add(o.id);
      // неигровые оперативники наборов миссий (SPEC) бывают без движения и APL — проверяются только команды для игры
      if (!t.special) assert.ok(o.stats.apl > 0 && o.stats.wounds > 0 && /\+$/.test(o.stats.save) && /"$/.test(o.stats.move), `${o.id}: ${JSON.stringify(o.stats)}`);
      for (const w of o.weapons) {
        assert.ok(['ranged', 'melee', 'equipment'].includes(w.type), w.id);
        for (const p of w.profiles) assert.ok(p.atk !== '' && p.hit !== '' && p.dmg !== '', `${w.id}: ${JSON.stringify(p)}`);
      }
    }
  }
});

test('сверка с источником ktdash: импорт даёт ровно эти файлы', { skip: !existsSync(join(SRC, 'prisma/seed-data.json')) && 'нет клона ktdash' }, () => {
  const r = spawnSync('node', [join(import.meta.dirname, '../scripts/import-ktdash.mjs'), SRC, '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
