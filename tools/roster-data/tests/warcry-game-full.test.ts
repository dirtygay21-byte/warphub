import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyWarcryEvent, createWarcryState, replayWarcry, WARCRY_GAME_SCHEMA, type WcEvent, type WcEventBody, type WcState } from '../../../client/src/features/roster/warcrygame';
import type { WarcryGameData } from '../../../client/src/features/roster/skirmish/types';

const data = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/warcry/game.json'), 'utf8')) as WarcryGameData;
let seq = 0;
const ev = (body: WcEventBody): WcEvent => ({ ...body, id: String(++seq), seq, at: new Date().toISOString() } as WcEvent);
const created = () => ev({ type: 'game-created', schema: WARCRY_GAME_SCHEMA, seed: 'wc-seed', names: { p1: 'A', p2: 'B' } });
const setup = () => ev({ type: 'setup', deploymentId: 'first-blood', victoryId: 'treasure-hunters', matchedPlay: true, attacker: 'p1', rosters: {
  p1: { id: 'a', color: 'red', fighters: ['f1', 'f2', 'f3'], groups: { f1: 'dagger', f2: 'hammer', f3: 'shield' } },
  p2: { id: 'b', color: 'blue', fighters: ['e1', 'e2', 'e3'], groups: { e1: 'dagger', e2: 'hammer', e3: 'shield' } },
} });
const start = () => {
  let state = createWarcryState({ type: 'game-created', schema: WARCRY_GAME_SCHEMA, seed: 'wc-seed', names: { p1: 'A', p2: 'B' } })!;
  for (const e of [setup(), ev({ type: 'initiative' })]) {
    const result = applyWarcryEvent(state, e, data); assert.ok(result.ok, result.ok ? '' : result.error); state = result.state;
  }
  return state;
};
const dispatch = (state: WcState, body: WcEventBody) => { const result = applyWarcryEvent(state, ev(body), data); assert.ok(result.ok, result.ok ? '' : result.error); return result.state; };

test('24 deployment maps: по одной Dagger/Shield/Hammer каждого цвета; 24 victory и 18 twists', () => {
  assert.equal(data.deployments.length, 24);
  for (const map of data.deployments) {
    assert.equal(map.points.length, 6);
    for (const side of ['red', 'blue']) assert.deepEqual(map.points.filter((p) => p.side === side).map((p) => p.group).sort(), ['dagger', 'hammer', 'shield']);
  }
  assert.equal(data.victories.tableA.length + data.victories.tableB.length, 24);
  assert.equal(data.twists.length, 18);
});

test('First Blood: резервы Hammer/Shield блокируют бойцов до RND2, затем прибытие и активация', () => {
  let s = start();
  assert.deepEqual(s.players.p1.reserves.sort(), ['f2', 'f3']);
  assert.equal(applyWarcryEvent(s, ev({ type: 'activate', seat: 'p1', fighterId: 'f2' }), data).ok, false);
  s = dispatch(s, { type: 'activate', seat: 'p1', fighterId: 'f1' });
  assert.equal(applyWarcryEvent(s, ev({ type: 'activate', seat: 'p1', fighterId: 'f1' }), data).ok, false);
  s = dispatch(s, { type: 'end-round' });
  s = dispatch(s, { type: 'reserve', seat: 'p1', group: 'hammer' });
  s = dispatch(s, { type: 'initiative' });
  s = dispatch(s, { type: 'activate', seat: 'p1', fighterId: 'f2' });
  assert.ok(s.players.p1.activations.includes('f2'));
});

test('wild dice сохраняются и улучшаются детерминированно; ability dice нельзя использовать дважды', () => {
  let s = start();
  const first = replayWarcry([created(), setup(), ev({ type: 'initiative', wild: { p1: { save: 1 } } })], data);
  assert.ok(first.ok);
  const second = replayWarcry([created(), setup(), ev({ type: 'initiative', wild: { p1: { save: 1 } } })], data);
  assert.deepEqual(first.state?.initiativeDice, second.state?.initiativeDice);
  s = first.state!;
  assert.equal(s.players.p1.wildSaved, 1);
  if (s.players.p1.abilityRank) {
    const rank = s.players.p1.abilityRank;
    s = dispatch(s, { type: 'ability', seat: 'p1', fighterId: 'f1', rank, name: 'Test' });
    assert.equal(applyWarcryEvent(s, ev({ type: 'ability', seat: 'p1', fighterId: 'f1', rank, name: 'Test' }), data).ok, false);
  }
});

test('Treasure Hunters: четыре раунда, счёт, завершение и undo', () => {
  const events = [created(), setup(), ev({ type: 'initiative' }), ev({ type: 'score', seat: 'p1', points: 2 }), ev({ type: 'end-round' }), ev({ type: 'end-round' }), ev({ type: 'end-round' }), ev({ type: 'end-round' }), ev({ type: 'finish' })];
  const result = replayWarcry(events, data);
  assert.ok(result.ok);
  assert.equal(result.state?.stage, 'finished');
  assert.equal(result.state?.winner, 'p1');
  const undone = replayWarcry([...events.slice(0, -1), ev({ type: 'event-reverted' })], data);
  assert.ok(undone.ok);
  assert.equal(undone.state?.stage, 'battle');
  assert.equal(undone.state?.round, 4);
});
