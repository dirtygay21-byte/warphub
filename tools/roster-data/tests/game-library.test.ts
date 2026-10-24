// Сохранённые игры (24.10.2026): список игр на телефоне (game/library.ts) — перенос старого автосохранения, сводка,
// лимит, удаление, ссылки на игры на двух телефонах. Хранилище — заглушка localStorage. Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameSaveKey, writeSavedGame, type KeyValueStore } from '../../../client/src/features/roster/game/autosave';
import {
  LIBRARY_LIMIT,
  loadLocalGame,
  readLibrary,
  rememberOnlineGame,
  removeSavedGame,
  saveLocalGame,
} from '../../../client/src/features/roster/game/library';
import { replay } from '../../../client/src/features/roster/game/reducer';
import type { GameEvent } from '../../../client/src/features/roster/game/types';
import { catalog, created, log, setupBodies, type Body } from './game-helpers';

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
const S = '.42';
const state = (ev: GameEvent[]) => {
  const r = replay(ev, catalog);
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.state;
};
const withId = (ev: GameEvent[], id: string, at: string) => ev.map((e, i) => (i === 0 ? { ...e, id, at } : { ...e, at }));

test('старое автосохранение переносится в список, старый ключ удаляется; сводка — игроки, миссии, стадия', () => {
  const s = memory();
  const ev = log(...setupBodies(), { type: 'command-phase-started' } as Body);
  assert.equal(writeSavedGame(s, gameSaveKey(S), ev, catalog), null);
  const lib = readLibrary(s, S, catalog);
  assert.deepEqual(lib.warnings, []);
  assert.equal(lib.entries.length, 1);
  const e = lib.entries[0]!;
  assert.equal(e.kind, 'local');
  assert.equal(e.summary?.names.p1, 'Аня');
  assert.equal(e.summary?.stage, 'battle');
  assert.ok(e.summary?.primary.p1 && e.summary.primary.p2, 'основные миссии в сводке');
  assert.ok(e.summary?.deploymentId);
  assert.equal(s.getItem(gameSaveKey(S)), null);
  const back = loadLocalGame(s, S, e.key, catalog);
  assert.equal(back.kind, 'ok');
  assert.equal(back.kind === 'ok' && back.events.length, ev.length);
});

test('нечитаемое старое сохранение откладывается (.broken), не теряется', () => {
  const s = memory();
  s.setItem(gameSaveKey(S), '{битое');
  const lib = readLibrary(s, S, catalog);
  assert.equal(lib.entries.length, 0);
  assert.equal(lib.warnings.length, 1);
  assert.equal(s.getItem(`${gameSaveKey(S)}.broken`), '{битое');
});

test('новая игра не затирает старую; одна и та же игра обновляется; новые сверху', () => {
  const s = memory();
  const a = withId(log(created), 'ga', '2026-10-01T10:00:00Z');
  const b = withId(log(created), 'gb', '2026-10-02T10:00:00Z');
  saveLocalGame(s, S, a, state(a), catalog);
  saveLocalGame(s, S, b, state(b), catalog);
  saveLocalGame(s, S, a, state(a), catalog);
  const keys = readLibrary(s, S, catalog).entries.map((e) => e.key);
  assert.deepEqual(keys, ['local:gb', 'local:ga']);
});

test('лимит: сверх 20 удаляются самые старые, сначала законченные; журнал удалённой — тоже', () => {
  const s = memory();
  for (let i = 0; i < LIBRARY_LIMIT + 1; i++) {
    const ev = withId(log(created), `g${i}`, `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00Z`);
    saveLocalGame(s, S, ev, state(ev), catalog);
  }
  const keys = readLibrary(s, S, catalog).entries.map((e) => e.key);
  assert.equal(keys.length, LIBRARY_LIMIT);
  assert.ok(!keys.includes('local:g0'));
  assert.equal(s.getItem(`${gameSaveKey(S)}.g0`), null);
});

test('игра на двух телефонах: ссылка без сводки, затем со сводкой; удаление — только из списка', () => {
  const s = memory();
  const link = { gameId: 'srv1', seat: 'p2' as const, code: 'ABCDE' };
  rememberOnlineGame(s, S, link, null, catalog, '2026-10-03T10:00:00Z');
  let e = readLibrary(s, S, catalog).entries[0]!;
  assert.equal(e.kind, 'online');
  assert.equal(e.summary, null);
  const ev = log(created);
  rememberOnlineGame(s, S, link, state(ev), catalog, '2026-10-03T11:00:00Z');
  e = readLibrary(s, S, catalog).entries[0]!;
  assert.equal(e.summary?.names.p2, 'Борис');
  assert.equal(e.createdAt, '2026-10-03T10:00:00Z');
  assert.equal(removeSavedGame(s, S, e.key), null);
  assert.equal(readLibrary(s, S, catalog).entries.length, 0);
});
