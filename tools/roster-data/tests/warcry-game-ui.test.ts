import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { applyWarcryEvent, createWarcryState, other, replayWarcry, WARCRY_GAME_SCHEMA, type Color, type Seat, type WcEvent, type WcEventBody, type WcFighterInfo, type WcRosterSetup, type WcState } from '../../../client/src/features/roster/warcrygame';
import { buildWarcryRosterSetup, warcryAbilityCatalog } from '../../../client/src/features/roster/warcrygame/fighters';
import { readWarcryLibrary, readWarcryLocal, rememberWarcryOnline, removeWarcrySaved, saveWarcryLocal } from '../../../client/src/features/roster/warcrygame/library';
import type { WarcryGameData } from '../../../client/src/features/roster/skirmish/types';
import type { WarcryFaction } from '../../../client/src/features/roster/warcry/types';
import type { WarcryRoster } from '../../../client/src/features/roster/warcry/roster';

const data = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/warcry/game.json'), 'utf8')) as WarcryGameData;
const faction = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/warcry/f/askurgan-trueblades.json'), 'utf8')) as WarcryFaction;
const index = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/warcry/index.json'), 'utf8')) as { universal: import('../../../client/src/features/roster/warcry/types').WarcryAbility[] };
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
let seq = 0;
const ev = (body: WcEventBody): WcEvent => ({ ...body, id: String(++seq), seq, at: new Date().toISOString() } as WcEvent);
const created = () => ev({ type: 'game-created', schema: WARCRY_GAME_SCHEMA, seed: 'wc-seed', names: { p1: 'A', p2: 'B' } });
const info = (name: string): WcFighterInfo => ({ name, factionId: 'askurgan-trueblades', fighterId: name, abilities: [{ id: 'a-double', cost: 'double' }, { id: 'a-react', cost: 'reaction' }] });
const roster = (id: string, color: Color, prefix: string): WcRosterSetup => ({ id, color, fighters: [`${prefix}1`, `${prefix}2`, `${prefix}3`], groups: { [`${prefix}1`]: 'dagger', [`${prefix}2`]: 'hammer', [`${prefix}3`]: 'shield' }, fighterData: Object.fromEntries([1, 2, 3].map((n) => [`${prefix}${n}`, info(`${prefix}${n}`)])) });
const setup = () => ev({ type: 'setup', deploymentId: 'first-blood', victoryId: 'treasure-hunters', matchedPlay: true, attacker: 'p1', rosters: { p1: roster('a', 'red', 'f'), p2: roster('b', 'blue', 'e') } });
const dispatch = (state: WcState, body: WcEventBody) => {
  const result = applyWarcryEvent(state, ev(body), data);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.state;
};
const base = () => {
  let state = createWarcryState({ type: 'game-created', schema: WARCRY_GAME_SCHEMA, seed: 'wc-seed', names: { p1: 'A', p2: 'B' } })!;
  return dispatch(state, setup());
};
const rolled = () => dispatch(base(), { type: 'initiative-roll' });
const declareBoth = (state: WcState) => {
  const first = state.initiative;
  let next = dispatch(state, { type: 'wild-set', seat: first, singles: 0, save: 1, improve: [] });
  next = dispatch(next, { type: 'wild-set', seat: other(first), singles: 0, save: 1, improve: [] });
  return next;
};
const combat = () => {
  let state = declareBoth(rolled());
  state.players.p1.dice = [{ value: 6, rank: 2, used: false }];
  state.players.p1.abilityRank = 2;
  return dispatch(state, { type: 'phase-advanced', first: 'p1' });
};

test('библиотека Warcry сохраняет local/online игры и переносит старую запись', () => {
  storage.clear();
  const events = [created(), setup()];
  saveWarcryLocal(events, base());
  let entries = readWarcryLibrary();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.summary.battleplan, 'treasure-hunters');
  assert.deepEqual(readWarcryLocal(entries[0]!.key), events);
  rememberWarcryOnline({ gameId: 'wc-online', seat: 'p2', code: 'ABCD' }, base());
  entries = readWarcryLibrary();
  assert.equal(entries.length, 2);
  for (const entry of entries) removeWarcrySaved(entry.key);
  assert.deepEqual(readWarcryLibrary(), []);
  localStorage.setItem('warphub.warcry.game.v2', JSON.stringify(events));
  assert.equal(readWarcryLibrary().length, 1);
  assert.equal(localStorage.getItem('warphub.warcry.game.v2'), null);
});

test('wild dice объявляются по очереди, сохраняются и переводят игру в Reserve phase', () => {
  let state = rolled();
  const first = state.initiative;
  const second = other(first);
  assert.equal(state.phase, 'initiative');
  assert.equal(applyWarcryEvent(state, ev({ type: 'wild-set', seat: second, singles: 0, save: 1, improve: [] }), data).ok, false);
  assert.equal(applyWarcryEvent(state, ev({ type: 'wild-set', seat: first, singles: 0, save: 0, improve: [] }), data).ok, false, 'все wild dice должны быть распределены');
  state = dispatch(state, { type: 'wild-set', seat: first, singles: 0, save: 1, improve: [] });
  assert.equal(state.players[first].wildSaved, 1);
  assert.equal(state.phase, 'initiative');
  state = dispatch(state, { type: 'wild-set', seat: second, singles: 1, save: 0, improve: [] });
  assert.equal(state.phase, 'reserve');
  assert.equal(state.players[second].singles, state.baseSingles![second] + 1);
  assert.equal(state.players[second].wildSaved, 0);
});

test('wild single становится double, уменьшает singles и не улучшается дважды', () => {
  let state = rolled();
  const first = state.initiative;
  const single = state.initiativeDice![first].find((value, index, all) => all.indexOf(value) === index && all.lastIndexOf(value) === index);
  assert.ok(single, 'seed должен дать хотя бы один single');
  const before = state.players[first].singles;
  state = dispatch(state, { type: 'wild-set', seat: first, singles: 0, save: 0, improve: [{ from: 1, value: single! }] });
  assert.equal(state.players[first].singles, before - 1);
  assert.ok(state.players[first].dice.some((die) => die.value === single && die.rank === 2));
  state = dispatch(state, { type: 'wild-set', seat: other(first), singles: 0, save: 1, improve: [] });
  assert.equal(state.phase, 'reserve');

  const invalid = rolled();
  invalid.players[invalid.initiative].wildSaved = 1;
  const duplicate = applyWarcryEvent(invalid, ev({ type: 'wild-set', seat: invalid.initiative, singles: 0, save: 0, improve: [{ from: 1, value: single! }, { from: 1, value: single! }] }), data);
  assert.equal(duplicate.ok, false);
});

test('второй игрок меняет варбанду до первой инициативы, но не после броска', () => {
  let state = base();
  state = dispatch(state, { type: 'player-set', seat: 'p2', roster: roster('second', 'blue', 'x') });
  assert.equal(state.players.p2.rosterId, 'second');
  assert.ok(state.players.p2.fighters.includes('x1'));
  state = dispatch(state, { type: 'initiative-roll' });
  assert.equal(applyWarcryEvent(state, ev({ type: 'player-set', seat: 'p2', roster: roster('third', 'blue', 'z') }), data).ok, false);
});

test('combat: чередование, реальная способность, реакция и завершение после двух пасов', () => {
  let state = combat();
  assert.equal(applyWarcryEvent(state, ev({ type: 'activate', seat: 'p2', fighterId: 'e1' }), data).ok, false);
  state = dispatch(state, { type: 'activate', seat: 'p1', fighterId: 'f1', actions: ['move', 'attack'], abilityId: 'a-double', diceIndex: 0, abilityAfter: 1 });
  assert.equal(state.turn, 'p2');
  assert.equal(state.players.p1.dice[0]!.used, true);
  assert.equal(state.players.p1.activationLog.f1!.abilityId, 'a-double');
  assert.equal(applyWarcryEvent(state, ev({ type: 'reaction', seat: 'p1', fighterId: 'f2', abilityId: 'a-react' }), data).ok, false);
  state = dispatch(state, { type: 'reaction', seat: 'p2', fighterId: 'e1', abilityId: 'a-react' });
  assert.equal(applyWarcryEvent(state, ev({ type: 'reaction', seat: 'p2', fighterId: 'e1', abilityId: 'a-react' }), data).ok, false);
  assert.equal(applyWarcryEvent(state, ev({ type: 'activate', seat: 'p1', fighterId: 'f2' }), data).ok, false);
  assert.equal(applyWarcryEvent(state, ev({ type: 'end-round' }), data).ok, false);
  assert.equal(applyWarcryEvent(state, ev({ type: 'pass', seat: 'p2' }), data).ok, false, 'нельзя пасовать, пока есть доступный боец');
  state = dispatch(state, { type: 'activate', seat: 'p2', fighterId: 'e1', actions: ['wait', 'wait'] });
  state = dispatch(state, { type: 'pass', seat: 'p1' });
  state = dispatch(state, { type: 'pass', seat: 'p2' });
  assert.equal(state.passes, 2);
  state = dispatch(state, { type: 'end-round' });
  assert.equal(state.round, 2);
  assert.equal(state.phase, 'initiative');
  assert.equal(state.players.p1.dice.length, 0);
  assert.equal(state.players.p2.wildSaved, 1);
});

test('старые журналы завершаются по прежним правилам, новый пошаговый режим ждёт endRound', () => {
  let legacy = base();
  legacy = dispatch(legacy, { type: 'initiative' });
  legacy = dispatch(legacy, { type: 'phase-advanced' });
  legacy = dispatch(legacy, { type: 'finish' });
  assert.equal(legacy.stage, 'finished');
  const current = combat();
  assert.equal(current.sequenced, true);
  assert.equal(applyWarcryEvent(current, ev({ type: 'finish' }), data).ok, false);
});

test('снимок бойца содержит реальные faction и universal способности без длинных текстов', () => {
  const source: WarcryRoster = { system: 'warcry', id: 'visual', name: 'Visual', factionId: faction.id, fighters: [{ uid: 'f1', factionId: faction.id, fighterId: faction.fighters[0]!.id, role: 'warband', name: '', group: 'dagger' }], dataVersion: 'test', createdAt: 1, updatedAt: 1 };
  const setupData = buildWarcryRosterSetup(source, 'red', new Map([[faction.id, faction]]), index.universal);
  const fighter = setupData.fighterData!.f1!;
  assert.equal(fighter.name, faction.fighters[0]!.name);
  assert.ok(fighter.abilities.some((ability) => ability.id === '48f97b6e' && ability.cost === 'double'));
  assert.ok(fighter.abilities.some((ability) => ability.cost === 'reaction'));
  assert.equal('text' in fighter.abilities[0]!, false);
  const catalog = warcryAbilityCatalog(new Map([[faction.id, faction]]), index.universal);
  assert.equal(catalog.get('48f97b6e')!.name, 'Moment of Savagery');
});

test('даже самая большая варбанда укладывается в production-лимит события 32 КБ', () => {
  for (const file of readdirSync(join(import.meta.dirname, '../../../backend/roster-data/warcry/f'))) {
    const source = JSON.parse(readFileSync(join(import.meta.dirname, `../../../backend/roster-data/warcry/f/${file}`), 'utf8')) as WarcryFaction;
    for (const selected of source.fighters) {
      const large: WarcryRoster = { system: 'warcry', id: 'size', name: 'Size', factionId: source.id, fighters: Array.from({ length: 15 }, (_, i) => ({ uid: `f${i}`, factionId: source.id, fighterId: selected.id, role: 'warband', name: '', group: (['dagger', 'shield', 'hammer'] as const)[i % 3] })), dataVersion: 'test', createdAt: 1, updatedAt: 1 };
      const setupData = buildWarcryRosterSetup(large, 'red', new Map([[source.id, source]]), index.universal);
      const bytes = Buffer.byteLength(JSON.stringify(setupData)) * 2;
      assert.ok(bytes < 32768, `${source.id}/${selected.id}: ${bytes} bytes`);
    }
  }
});

test('экран использует библиотеку, официальную карту, wild dice и пошаговый combat', () => {
  const screen = readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/warcry/WarcryFullGameScreen.tsx'), 'utf8');
  for (const token of ['StartCard', 'WarcrySavedList', 'WarcryDeploymentPanel', 'OnlinePlayerSetup', 'initiative-roll', 'wild-set', 'ActivationPanel', 'ReactionPanel', 'player-set']) assert.ok(screen.includes(token), token);
});
