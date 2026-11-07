import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyKtEvent, createKtState, KT_GAME_SCHEMA, replayKt, totalKtVp, type KtEvent, type KtEventBody, type KtState, type Seat } from '../../../client/src/features/roster/ktgame';
import { readKtLibrary, readKtLocal, rememberKtOnline, removeKtSaved, saveKtLocal } from '../../../client/src/features/roster/ktgame/library';
import { injectKtSecret, readKtSecret, redactKtSetup, writeKtSecret } from '../../../client/src/features/roster/ktgame/secrets';
import type { KtGameData } from '../../../client/src/features/roster/skirmish/types';

const data = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/kt/game.json'), 'utf8')) as KtGameData;
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
const names = { p1: 'A', p2: 'B' };
let seq = 0;
const ev = (body: KtEventBody): KtEvent => ({ ...body, id: String(++seq), seq, at: new Date().toISOString() } as KtEvent);
const created = () => ev({ type: 'game-created', schema: KT_GAME_SCHEMA, seed: 'ui-seed', names });
const setup = () => ev({ type: 'setup', missionId: 'secure', killzone: 'Volkus', map: 1, dropZoneLoser: 'p2', rosters: { p1: { id: 'a', operatives: 10, tacOp: 'rout' }, p2: { id: 'b', operatives: 10, tacOp: 'envoy' } } });
const state = () => replayKt([created(), setup()], data).state!;

test('библиотека сохраняет локальную и онлайн игру, открывает и удаляет записи', () => {
  storage.clear();
  const events = [created(), setup()];
  saveKtLocal(events, state());
  let entries = readKtLibrary();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.kind, 'local');
  assert.equal(entries[0]!.summary.mission, 'secure');
  assert.deepEqual(readKtLocal(entries[0]!.key), events);
  rememberKtOnline({ gameId: 'online-id', seat: 'p2', code: 'ABCD' }, state());
  entries = readKtLibrary();
  assert.equal(entries.length, 2);
  const online = entries.find((entry) => entry.kind === 'online')!;
  assert.equal(online.online!.code, 'ABCD');
  for (const entry of entries) removeKtSaved(entry.key);
  assert.deepEqual(readKtLibrary(), []);
});

test('миграция старой одиночной записи в библиотеку', () => {
  storage.clear();
  localStorage.setItem('warphub.kt.game.v2', JSON.stringify([created(), setup()]));
  const entries = readKtLibrary();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.kind, 'local');
  assert.equal(localStorage.getItem('warphub.kt.game.v2'), null);
  assert.equal(readKtLocal(entries[0]!.key).length, 2);
});

test('второй игрок самостоятельно выбирает ростер и Tac Op до первой инициативы', () => {
  const current = state();
  let next = applyKtEvent(current, ev({ type: 'player-set', seat: 'p2', rosterId: 'second-roster', operatives: 7 }), data);
  assert.ok(next.ok);
  assert.equal(next.state.players.p2.rosterId, 'second-roster');
  assert.equal(next.state.players.p2.startingOperatives, 7);
  next = applyKtEvent(next.state, ev({ type: 'tac-set', seat: 'p2', tacOp: 'rout' }), data);
  assert.ok(next.ok);
  assert.equal(next.state.players.p2.tacOp, 'rout');
  next = applyKtEvent(next.state, ev({ type: 'initiative', round: 1, attempt: 0 }), data);
  assert.ok(next.ok);
  assert.equal(applyKtEvent(next.state, ev({ type: 'player-set', seat: 'p2', rosterId: 'third', operatives: 1 }), data).ok, false);
  assert.equal(applyKtEvent(next.state, ev({ type: 'tac-set', seat: 'p2', tacOp: 'envoy' }), data).ok, false);
});

test('секреты применяются только к своему месту, заглушка не меняет исходник', () => {
  storage.clear();
  const current = state();
  writeKtSecret('game', 'p1', { tacOp: 'rout', primaryOp: 'kill' });
  writeKtSecret('game', 'p2', { tacOp: 'envoy', primaryOp: 'tac' });
  const own = injectKtSecret(current, 'game', 'p1');
  assert.equal(own.players.p1.tacOp, 'rout');
  assert.equal(own.players.p1.primaryOp, 'kill');
  assert.equal(own.players.p2.tacOp, current.players.p2.tacOp);
  assert.equal(own.players.p2.primaryOp, current.players.p2.primaryOp);
  const redacted = redactKtSetup(setup(), data.tacOps[0]!.id);
  assert.equal(redacted.rosters.p1.tacOp, data.tacOps[0]!.id);
  assert.equal(redacted.rosters.p2.tacOp, data.tacOps[0]!.id);
  assert.equal(current.players.p1.tacOp, 'rout');
  assert.equal(current.players.p2.tacOp, 'envoy');
});

test('secret-revealed публикует секреты после TP4 и считает primary bonus', () => {
  storage.clear();
  const current = state();
  assert.equal(applyKtEvent(current, ev({ type: 'secret-revealed', seat: 'p1', tacOp: 'rout', op: 'kill' }), data).ok, false, 'секрет нельзя раскрыть до завершения TP4');
  current.round = 5;
  writeKtSecret('game', 'p1', { tacOp: 'rout', primaryOp: 'kill' });
  writeKtSecret('game', 'p2', { tacOp: 'envoy', primaryOp: 'tac' });
  current.players.p1.killVp = 4;
  current.players.p2.tacVp = 5;
  let next = applyKtEvent(current, ev({ type: 'secret-revealed', seat: 'p1', tacOp: 'rout', op: 'kill' }), data);
  assert.ok(next.ok);
  next = applyKtEvent(next.state, ev({ type: 'secret-revealed', seat: 'p2', tacOp: 'envoy', op: 'tac' }), data);
  assert.ok(next.ok);
  next = applyKtEvent(next.state, ev({ type: 'finish' }), data);
  assert.ok(next.ok);
  assert.equal(next.state.stage, 'finished');
  assert.equal(next.state.players.p1.primaryOp, 'kill');
  assert.equal(next.state.players.p2.primaryOp, 'tac');
  assert.equal(next.state.players.p1.bonusVp, 2);
  assert.equal(next.state.players.p2.bonusVp, 3);
  assert.equal(totalKtVp(next.state, 'p1'), totalKtVp(current, 'p1') + 2);
  assert.equal(totalKtVp(next.state, 'p2'), totalKtVp(current, 'p2') + 3);
});

test('экран использует библиотеку, карту, online controls и скрывает секреты соперника', () => {
  const screen = readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/kt/KtFullGameScreen.tsx'), 'utf8');
  for (const token of ['StartCard', 'KtSavedList', 'SetupStep', 'KtMapPanel', 'OnlineBar', 'secret-revealed', 'Секреты соперника скрыты', 'joinOnline: joinAndOpen', 'Раскрыть мой секрет', 'finishLocalBattle', 'Ростер соперника', 'manualTacOp: true']) assert.ok(screen.includes(token), token);
  const online = readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui/skirmish/useSkirmishOnline.ts'), 'utf8');
  assert.ok(online.includes('const leave = useCallback'));
  assert.ok(online.includes('setOnline({ ...result.data.game, seat: online.seat })'), 'polling обновляет сведения о вошедшем сопернике');
  assert.ok(screen.includes("state.stage === 'battle' && state.round === 1 && !state.initiativeRolls"), 'выбор ростера и секрета доступен только до первой инициативы');
});

test('игра с ростера из редактора: число оперативников известно сразу (07.11.2026)', () => {
  const screen = readFileSync(new URL('../../../client/src/features/roster/ui/kt/KtFullGameScreen.tsx', import.meta.url), 'utf8');
  assert.ok(screen.includes("operatives: rosters.find((r) => r.id === initialRosterId)?.operatives.length ?? 0"));
  assert.ok(!screen.includes('<select'), 'системные списки заменены ChoiceField');
});
