// «Начать игру», G4b: автосохранение на устройстве (game/autosave.ts) — запись журнала, чтение и продолжение,
// нечитаемые сохранения не теряются. Хранилище — заглушка с интерфейсом localStorage. Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameSaveKey, readSavedGame, setAsideSavedGame, writeSavedGame, type KeyValueStore } from '../../../client/src/features/roster/game/autosave';
import { applyEvent, replay } from '../../../client/src/features/roster/game/reducer';
import { serializeGame } from '../../../client/src/features/roster/game/serialize';
import type { GameEvent } from '../../../client/src/features/roster/game/types';
import { catalog, log, setupBodies, type Body } from './game-helpers';

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
const KEY = gameSaveKey('.42');
const B = (b: object) => b as Body;
const battle = () => log(...setupBodies(), B({ type: 'command-phase-started' }), B({ type: 'command-phase-ended' }), B({ type: 'turn-ended' }), B({ type: 'command-phase-started' }));

test('ключ — свой у аккаунта; нет сохранения — none; пустой журнал не пишется', () => {
  assert.equal(gameSaveKey('.42'), 'warphub.game.40k.v1.42');
  assert.equal(gameSaveKey(''), 'warphub.game.40k.v1');
  const s = memory();
  assert.deepEqual(readSavedGame(s, KEY, catalog), { kind: 'none' });
  assert.equal(writeSavedGame(s, KEY, [], catalog), null);
  assert.equal(s.data.size, 0);
});

test('сохранить → прочитать: то же состояние (карты, колода, CP), игру можно продолжить', () => {
  const s = memory();
  const events = battle();
  const before = replay(events, catalog);
  assert.ok(before.ok);
  assert.equal(writeSavedGame(s, KEY, events, catalog), null);
  const r = readSavedGame(s, KEY, catalog);
  assert.equal(r.kind, 'ok');
  if (r.kind !== 'ok' || !before.ok) return;
  assert.deepEqual(r.state, before.state);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.events.length, events.length);
  // продолжить: следующее событие применяется к прочитанному состоянию
  const next = applyEvent(r.state, { seat: null, type: 'cards-drawn', target: 'p1', cards: r.state.players.p1.deck.slice(0, 2), source: 'random', id: 'x', seq: r.state.lastSeq + 1, at: '2026-10-24T00:00:00Z' } as GameEvent, catalog);
  assert.ok(next.ok, next.ok ? '' : next.error);
});

test('нечитаемое сохранение — bad с причиной, не удаляется; откладывается под .broken', () => {
  const s = memory();
  s.setItem(KEY, '{не json');
  const r = readSavedGame(s, KEY, catalog);
  assert.equal(r.kind, 'bad');
  assert.match(r.kind === 'bad' ? r.error : '', /не JSON/);
  assert.equal(s.getItem(KEY), '{не json', 'не удалено при чтении');
  setAsideSavedGame(s, KEY);
  assert.equal(s.getItem(KEY), null);
  assert.equal(s.getItem(`${KEY}.broken`), '{не json');
});

test('сохранение более новой версии и сломанный журнал — bad с понятной причиной', () => {
  const s = memory();
  const saved = JSON.parse(serializeGame(battle(), catalog));
  s.setItem(KEY, JSON.stringify({ ...saved, schema: 99 }));
  const newer = readSavedGame(s, KEY, catalog);
  assert.match(newer.kind === 'bad' ? newer.error : '', /более новой версией/);
  const broken = { ...saved, events: saved.events.map((e: GameEvent, i: number) => (i === 3 ? { ...e, seq: 99 } : e)) };
  s.setItem(KEY, JSON.stringify(broken));
  const r = readSavedGame(s, KEY, catalog);
  assert.match(r.kind === 'bad' ? r.error : '', /событие №|seq|порядк/i);
});

test('данные миссий изменились — игра открывается с предупреждением', () => {
  const s = memory();
  const saved = JSON.parse(serializeGame(battle(), catalog));
  s.setItem(KEY, JSON.stringify({ ...saved, catalog: 'deadbeef' }));
  const r = readSavedGame(s, KEY, catalog);
  assert.equal(r.kind, 'ok');
  assert.match(r.kind === 'ok' ? r.warnings.join() : '', /Данные миссий изменились/);
});

test('ошибка записи (переполнено) — строкой, без исключения', () => {
  const s: KeyValueStore = { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.match(writeSavedGame(s, KEY, battle(), catalog) ?? '', /не удалось сохранить.*QuotaExceeded/);
});
