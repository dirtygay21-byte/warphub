// Warcry (W4 30.10.2026): данные из warcry_data в backend/roster-data/warcry. Запуск: bun test
// Сверка с источником — если рядом есть клон warcry_data (WARCRY_DATA_DIR или /home/claude/warcry_data), иначе пропуск.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { WarcryFaction, WarcryIndex } from '../../../client/src/features/roster/warcry/types';

const WC = join(import.meta.dirname, '../../../backend/roster-data/warcry');
const index: WarcryIndex = JSON.parse(readFileSync(join(WC, 'index.json'), 'utf8'));
const factions: WarcryFaction[] = readdirSync(join(WC, 'f')).map((f) => JSON.parse(readFileSync(join(WC, 'f', f), 'utf8')));
const SRC = process.env.WARCRY_DATA_DIR ?? '/home/claude/warcry_data';
const COSTS = ['battletrait', 'passive', 'reaction', 'double', 'triple', 'quad'];

test('индекс: источник с коммитом и датой, фракции = файлы, 4 общих файла альянсов', () => {
  assert.equal(index.system, 'warcry');
  assert.match(index.source.commit, /^[0-9a-f]{7,}$/);
  assert.match(index.source.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(index.factions.length, factions.length);
  for (const f of index.factions) {
    const file = factions.find((x) => x.id === f.id);
    assert.ok(file, f.id);
    assert.equal(file!.fighters.length, f.fighters, f.id);
    assert.equal(file!.grandAlliance, f.grandAlliance, f.id);
    assert.ok(index.grandAlliances.includes(f.grandAlliance), f.id);
  }
  assert.deepEqual(index.factions.filter((f) => f.generic).map((f) => f.id).sort(), ['chaos', 'death', 'destruction', 'order']);
  assert.ok(index.factions.filter((f) => !f.generic).length >= 60);
  assert.ok(index.universal.length > 0 && index.universal.every((a) => COSTS.includes(a.cost) && a.text));
});

test('фракции: бойцы с характеристиками и оружием, id уникальны, способности привязаны', () => {
  const ids = new Set<string>(index.universal.map((a) => a.id));
  for (const f of factions) {
    assert.ok(f.name && f.fighters.length > 0, f.id);
    const subs = new Set(f.subfactions.map((s) => s.name));
    for (const x of f.fighters) {
      assert.ok(!ids.has(x.id), x.id);
      ids.add(x.id);
      assert.ok(x.movement > 0 && x.toughness > 0 && x.wounds > 0 && x.points >= 0, `${x.id}: ${x.name}`);
      assert.ok(x.subfaction === '' || subs.has(x.subfaction), `${x.id}: ${x.subfaction}`);
      for (const w of x.weapons) assert.ok(w.attacks > 0 && w.strength > 0 && w.maxRange >= w.minRange && w.dmgCrit >= w.dmgHit, `${x.id}: ${JSON.stringify(w)}`);
    }
    for (const a of f.abilities) {
      assert.ok(!ids.has(a.id), a.id);
      ids.add(a.id);
      assert.ok(COSTS.includes(a.cost) && a.text, a.id);
      assert.ok(a.subfaction === undefined || subs.has(a.subfaction), `${a.id}: ${a.subfaction}`);
    }
    // общие файлы альянсов — только союзники, траллы и монстры
    if (f.generic) for (const x of f.fighters) assert.ok(x.runemarks.some((r) => ['ally', 'thrall', 'monster'].includes(r)), `${f.id}: ${x.name}`);
  }
  // в основных варбандах есть герои (первый боец варбанды — лидер-герой)
  for (const f of factions.filter((x) => !x.generic)) assert.ok(f.fighters.some((x) => x.runemarks.includes('hero')), `${f.id}: нет героев`);
});

test('сверка с источником warcry_data: импорт даёт ровно эти файлы', { skip: !existsSync(join(SRC, 'data/universal/universal_abilities.json')) && 'нет клона warcry_data' }, () => {
  const r = spawnSync('node', [join(import.meta.dirname, '../scripts/import-warcry.mjs'), SRC, '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
