import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyKtEvent, createKtState, KT_GAME_SCHEMA, replayKt, totalKtVp, type KtEvent, type KtEventBody, type KtState, type Seat } from '../../../client/src/features/roster/ktgame';
import type { KtGameData } from '../../../client/src/features/roster/skirmish/types';

const data = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/kt/game.json'), 'utf8')) as KtGameData;
const names = { p1: 'A', p2: 'B' };
let seq = 0;
const ev = (body: KtEventBody): KtEvent => ({ ...body, id: String(++seq), seq, at: new Date().toISOString() } as KtEvent);
const created = () => ev({ type: 'game-created', schema: KT_GAME_SCHEMA, seed: 'test-seed', names });
const setup = (missionId = 'secure') => ev({ type: 'setup', missionId, killzone: 'Volkus', map: 1, dropZoneLoser: 'p2', rosters: { p1: { id: 'a', operatives: 10, tacOp: 'rout' }, p2: { id: 'b', operatives: 10, tacOp: 'envoy' } } });
const start = (missionId = 'secure') => {
  let state = createKtState({ type: 'game-created', schema: KT_GAME_SCHEMA, seed: 'test-seed', names })!;
  for (const e of [setup(missionId), ev({ type: 'initiative', round: 1, attempt: 0 }), ev({ type: 'primary-op', seat: 'p1', op: 'crit' }), ev({ type: 'primary-op', seat: 'p2', op: 'kill' }), ev({ type: 'phase-advanced' })]) {
    const result = applyKtEvent(state, e, data);
    assert.ok(result.ok, result.ok ? '' : result.error);
    state = result.state;
  }
  return state;
};
const dispatch = (state: KtState, body: KtEventBody) => {
  const result = applyKtEvent(state, ev(body), data);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.state;
};
const end = (state: KtState, controls: Record<string, Seat | null> = {}) => {
  let next = dispatch(state, { type: 'end-round', controls });
  next = dispatch(next, { type: 'initiative', round: next.round, attempt: 0 });
  return dispatch(next, { type: 'phase-advanced' });
};

test('Approved Ops data: 9 Crit Ops, 12 Tac Ops и точная таблица Kill Grade', () => {
  assert.equal(data.critOps.length, 9);
  for (const mission of data.critOps) {
    assert.ok(mission.text.startsWith('MISSION ACTION') || mission.text.startsWith('ADDITIONAL RULES'), mission.id);
    assert.ok(!mission.text.includes('Crit Op'), `${mission.id}: смешаны карточки`);
  }
  assert.equal(data.tacOps.length, 12);
  assert.deepEqual(data.killOp.thresholds['10'], [2, 4, 6, 8, 10]);
  assert.equal(data.game.turningPoints, 4);
  assert.equal(data.game.vpPerOpCap, 6);
});

test('Secure: mission action запрещён в TP1, затем VP за наличие и превосходство; лимит 6VP', () => {
  let s = start();
  const early = applyKtEvent(s, ev({ type: 'crit-action', seat: 'p1', action: 'secure', marker: 'home' }), data);
  assert.equal(early.ok, false);
  s = end(s, { home: 'p1', centre: 'p2' });
  s = dispatch(s, { type: 'crit-action', seat: 'p1', action: 'secure', marker: 'home' });
  s = end(s, { home: 'p1', centre: 'p2' });
  assert.equal(s.players.p1.critVp, 2);
  s = end(s, { home: 'p1', centre: 'p2' });
  s = end(s, { home: 'p1', centre: 'p2' });
  s = dispatch(s, { type: 'finish' });
  assert.equal(s.players.p1.critVp, 6);
  assert.equal(s.players.p1.bonusVp, 3);
});

test('Kill Grade и Rout: thresholds, Kill VP, лимит Rout 2VP за turning point', () => {
  let s = start();
  for (let i = 0; i < 4; i++) s = dispatch(s, { type: 'incapacitated', seat: 'p1', wounds: 12, within6: true });
  assert.equal(s.players.p1.killGrade, 2);
  assert.equal(s.players.p1.killVp, 2);
  assert.equal(s.players.p1.tacVp, 2);
  s = end(s);
  s = dispatch(s, { type: 'incapacitated', seat: 'p1', wounds: 8, within6: true });
  s = dispatch(s, { type: 'incapacitated', seat: 'p1', wounds: 8, within6: true });
  assert.equal(s.players.p1.killGrade, 3);
  assert.equal(s.players.p1.killVp, 3);
  assert.equal(s.players.p1.tacVp, 4);
});

test('новый ручной Tac Op не зависит от секрета, не дублирует Rout и имеет лимит 2VP за turning point', () => {
  let own = start();
  let publicState = structuredClone(own);
  publicState.players.p1.tacOp = data.tacOps[0]!.id;
  const actions: KtEventBody[] = [
    { type: 'incapacitated', seat: 'p1', wounds: 12, within6: true, manualTacOp: true },
    { type: 'tac-score', seat: 'p1', points: 2 },
    { type: 'incapacitated', seat: 'p1', wounds: 8, within6: true, manualTacOp: true },
  ];
  for (const action of actions) {
    own = dispatch(own, action);
    publicState = dispatch(publicState, action);
  }
  assert.equal(own.players.p1.tacVp, 2);
  assert.equal(publicState.players.p1.tacVp, own.players.p1.tacVp);
  assert.equal(publicState.players.p1.killVp, own.players.p1.killVp);
  assert.equal(applyKtEvent(own, ev({ type: 'tac-score', seat: 'p1', points: 1 }), data).ok, false);
  assert.equal(applyKtEvent(publicState, ev({ type: 'tac-score', seat: 'p1', points: 1 }), data).ok, false);
  own = end(own);
  publicState = end(publicState);
  own = dispatch(own, { type: 'incapacitated', seat: 'p1', wounds: 8, within6: true, manualTacOp: true });
  publicState = dispatch(publicState, { type: 'incapacitated', seat: 'p1', wounds: 8, within6: true, manualTacOp: true });
  own = dispatch(own, { type: 'tac-score', seat: 'p1', points: 1 });
  publicState = dispatch(publicState, { type: 'tac-score', seat: 'p1', points: 1 });
  assert.equal(own.players.p1.tacVp, 3);
  assert.equal(publicState.players.p1.tacVp, 3);
});

test('Data: Compile запрещает повтор маркера за turning point, Send Data даёт VP за снятые points', () => {
  let s = start('data');
  s = end(s);
  s = dispatch(s, { type: 'crit-action', seat: 'p1', action: 'compile', marker: 'centre' });
  assert.equal(applyKtEvent(s, ev({ type: 'crit-action', seat: 'p1', action: 'compile', marker: 'centre' }), data).ok, false);
  s = end(s);
  s = dispatch(s, { type: 'crit-action', seat: 'p1', action: 'compile', marker: 'centre' });
  s = end(s);
  s = end(s);
  s = dispatch(s, { type: 'crit-action', seat: 'p1', action: 'send', marker: 'centre' });
  assert.equal(s.players.p1.critVp, 4);
});

test('primary op и окончание: половина с округлением, победитель, отмена восстанавливает состояние', () => {
  const events = [created(), setup(), ev({ type: 'initiative', round: 1, attempt: 0 }), ev({ type: 'primary-op', seat: 'p1', op: 'crit' }), ev({ type: 'primary-op', seat: 'p2', op: 'kill' }), ev({ type: 'phase-advanced' }), ev({ type: 'end-round', controls: { home: 'p1' } }), ev({ type: 'initiative', round: 2, attempt: 0 }), ev({ type: 'phase-advanced' }), ev({ type: 'crit-action', seat: 'p1', action: 'secure', marker: 'home' }), ev({ type: 'end-round', controls: { home: 'p1' } }), ev({ type: 'initiative', round: 3, attempt: 0 }), ev({ type: 'phase-advanced' }), ev({ type: 'end-round', controls: { home: 'p1' } }), ev({ type: 'initiative', round: 4, attempt: 0 }), ev({ type: 'phase-advanced' }), ev({ type: 'end-round', controls: { home: 'p1' } }), ev({ type: 'finish' })];
  const replayed = replayKt(events, data);
  assert.ok(replayed.ok);
  const state = replayed.state!;
  assert.equal(state.stage, 'finished');
  assert.equal(state.players.p1.critVp, 6);
  assert.equal(state.players.p1.bonusVp, 3);
  assert.equal(state.winner, 'p1');
  assert.equal(totalKtVp(state, 'p1'), 9);
  const undone = replayKt([...events.slice(0, -2), ev({ type: 'event-reverted' })], data);
  assert.ok(undone.ok);
  assert.equal(undone.state!.round, 4);
  assert.equal(undone.state!.stage, 'battle');
});


test('phase gate: действия и конец turning point нельзя выполнить до инициативы и Firefight', () => {
  let state = createKtState({ type: 'game-created', schema: KT_GAME_SCHEMA, seed: 'test-seed', names })!;
  state = dispatch(state, setup());
  assert.equal(applyKtEvent(state, ev({ type: 'crit-action', seat: 'p1', action: 'secure', marker: 'home' }), data).ok, false);
  assert.equal(applyKtEvent(state, ev({ type: 'end-round', controls: {} }), data).ok, false);
  state = dispatch(state, { type: 'initiative', round: 1, attempt: 0 });
  assert.equal(applyKtEvent(state, ev({ type: 'end-round', controls: {} }), data).ok, false);
  state = dispatch(state, { type: 'primary-op', seat: 'p1', op: 'crit' });
  state = dispatch(state, { type: 'primary-op', seat: 'p2', op: 'kill' });
  state = dispatch(state, { type: 'phase-advanced' });
  assert.equal(state.phase, 'firefight');
});
