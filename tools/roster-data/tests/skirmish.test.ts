import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addOperative, newKtRoster } from '../../../client/src/features/roster/kt/roster';
import type { KtGameData, WarcryGameData } from '../../../client/src/features/roster/skirmish/types';
import { buildKtUnits, buildWarcryUnits, clampToBoard, FOE_PREFIX, modelBase } from '../../../client/src/features/roster/testarmy';
import { addFighter, newWarcryRoster } from '../../../client/src/features/roster/warcry/roster';
import type { WarcryFaction } from '../../../client/src/features/roster/warcry/types';

const read = <T,>(path: string): T => JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data', path), 'utf8')) as T;

test('game data: Approved Ops и Warcry generator — реальные размеры и полные списки опций', () => {
  const kt = read<KtGameData>('kt/game.json');
  const wc = read<WarcryGameData>('warcry/game.json');
  assert.deepEqual(kt.board, { width: 30, height: 22, objectiveMm: 40 });
  assert.deepEqual(wc.board, { width: 30, height: 22, objectiveMm: null });
  assert.equal(kt.missionPack.missions.length, 9);
  assert.equal(kt.missionPack.killzones.length, 6);
  assert.equal(kt.missionPack.mapsPerKillzone, 6);
  assert.equal(kt.game.initialCp, 2);
  assert.equal(kt.game.equipmentPicks, 4);
  for (const options of [wc.deploymentOptions, wc.victoryOptions]) {
    assert.equal(options.tableA.length, 12);
    assert.equal(options.tableB.length, 12);
  }
  assert.ok(kt.setup.length >= 4 && wc.setup.length >= 4);
});

test('Kill Team Test Army: каждый оперативник — модель с базой datacard; соперник имеет свои id', () => {
  const team = read<import('../../../client/src/features/roster/kt/types').KtTeam>('kt/t/IMP-KAS.json');
  let roster = newKtRoster(team, 'test');
  roster = addOperative(roster, team.operatives[0]!);
  roster = addOperative(roster, team.operatives[1]!);
  const mine = buildKtUnits(roster, team);
  const foe = buildKtUnits(roster, team, FOE_PREFIX);
  assert.equal(mine.length, 2);
  assert.equal(mine[0]!.models.length, 1);
  assert.ok(mine.every((u) => modelBase(u.models[0]!).known));
  assert.equal(modelBase(mine[0]!.models[0]!).shape.kind, 'circle');
  assert.notEqual(mine[0]!.uid, foe[0]!.uid);
  assert.notEqual(mine[0]!.models[0]!.id, foe[0]!.models[0]!.id);
});

test('Warcry Test Army: бойцы и очки из ростера; неизвестная база явно требует ручного размера', () => {
  const faction = read<WarcryFaction>('warcry/f/blacktalons.json');
  const data = new Map([[faction.id, faction]]);
  let roster = newWarcryRoster(faction, 'test');
  roster = addFighter(roster, faction.id, faction.fighters[0]!, 'warband');
  roster = addFighter(roster, faction.id, faction.fighters[1]!, 'warband');
  const units = buildWarcryUnits(roster, data);
  assert.equal(units.length, 2);
  assert.equal(units[0]!.points, faction.fighters[0]!.points);
  assert.ok(units[0]!.tags?.includes('Лидер'));
  assert.ok(units.every((u) => !modelBase(u.models[0]!).known));
});

test('board clamp: skirmish 30×22 не влияет на стандартное поле 60×44', () => {
  assert.deepEqual(clampToBoard([31, -1], 30, 22), [30, 0]);
  assert.deepEqual(clampToBoard([31, -1]), [31, 0]);
  assert.deepEqual(clampToBoard([100, 100], 30, 22), [30, 22]);
});
