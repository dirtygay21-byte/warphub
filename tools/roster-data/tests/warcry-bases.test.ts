// Warcry: размеры баз из варскроллов AoS 4 (решение владельца 27.11.2026). Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { WarcryFaction } from '../../../client/src/features/roster/warcry/types';
import { parseBase } from '../../../client/src/features/roster/testarmy/bases';
import { buildWarcryUnits } from '../../../client/src/features/roster/testarmy/skirmish';

const DATA = join(import.meta.dirname, '../../../backend/roster-data');
const curated = JSON.parse(readFileSync(join(import.meta.dirname, '../warcry/bases.json'), 'utf8'));
const factions: WarcryFaction[] = readdirSync(join(DATA, 'warcry/f')).map((f) => JSON.parse(readFileSync(join(DATA, 'warcry/f', f), 'utf8')));
const fighters = factions.flatMap((f) => f.fighters);
const aosScrolls = new Map<string, { name: string; bases: string }>();
for (const f of readdirSync(join(DATA, 'aos/f'))) for (const w of JSON.parse(readFileSync(join(DATA, 'aos/f', f), 'utf8')).warscrolls) aosScrolls.set(w.id, w);

test('bases.json актуален относительно данных приложения (scripts/warcry-bases.mjs --check)', () => {
  const r = spawnSync('bun', [join(import.meta.dirname, '../scripts/warcry-bases.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('данные бойцов совпадают с bases.json; без совпадения — базы нет', () => {
  let withBase = 0;
  for (const f of fighters) {
    const c = curated.fighters[f.id];
    assert.equal(f.base, c?.base, `${f.id} ${f.name}`);
    assert.equal(f.baseFrom, c?.from, `${f.id} ${f.name}`);
    if (f.base) withBase++;
  }
  assert.equal(withBase, Object.keys(curated.fighters).length);
  assert.equal(curated.stats.fighters, fighters.length);
  assert.ok(withBase > 400, `с базой ${withBase}`);
});

test('каждая база ссылается на реальный варскролл AoS и разбирается в размер', () => {
  for (const [id, c] of Object.entries<{ base: string; from: string; fromId: string; match: string }>(curated.fighters)) {
    const w = aosScrolls.get(c.fromId);
    assert.ok(w, `${id}: нет варскролла ${c.fromId}`);
    assert.equal(w!.name, c.from);
    assert.ok(w!.bases.includes(c.base), `${id}: «${c.base}» нет в «${w!.bases}»`);
    assert.ok(['exact', 'base', 'plural'].includes(c.match));
    assert.ok(parseBase(c.base).options.length >= 1, `${id}: «${c.base}» не разобран`);
  }
});

test('известные бойцы: точное, без снаряжения, мн. число, база самой модели', () => {
  const by = (name: string) => fighters.find((f) => f.name === name)!;
  assert.equal(by('Lord-Terminos').base, '40mm'); // «40mm, Memorian: 25mm» — спутник не учтён
  assert.equal(by('Crypt Ghoul').base, '25mm');
  assert.equal(by('Crypt Ghoul').baseFrom, 'Crypt Ghouls');
  assert.equal(by('Gor with Pair of Gor Blades').base, '32mm');
  assert.equal(by('Packlord').base, undefined); // Warcry-only — нет данных
});

test('Test Army: боец получает базу из данных, без базы — пустые варианты', () => {
  const fac = factions.find((f) => f.fighters.some((x) => x.name === 'Crypt Ghoul'))!;
  const ghoul = fac.fighters.find((x) => x.name === 'Crypt Ghoul')!;
  const roster = { fighters: [{ uid: 'a', factionId: fac.id, fighterId: ghoul.id, role: 'warband', name: '' }] } as never;
  const [u] = buildWarcryUnits(roster, new Map([[fac.id, fac]]));
  assert.deepEqual(u!.models[0]!.options, [{ kind: 'circle', d: 25 }]);
  assert.equal(u!.models[0]!.source, '25mm');
  const pack = factions.flatMap((f) => f.fighters.map((x) => ({ f, x }))).find(({ x }) => x.name === 'Packlord')!;
  const [p] = buildWarcryUnits({ fighters: [{ uid: 'b', factionId: pack.f.id, fighterId: pack.x.id, role: 'warband', name: '' }] } as never, new Map([[pack.f.id, pack.f]]));
  assert.deepEqual(p!.models[0]!.options, []);
});
