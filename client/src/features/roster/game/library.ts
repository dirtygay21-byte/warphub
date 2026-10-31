/**
 * Сохранённые игры на телефоне (24.10.2026): список вместо одного автосохранения. У каждой одиночной игры — свой журнал
 * под ключом с id игры; у игры на двух телефонах журнал на сервере, здесь — ссылка (id, место, код). Для списка у каждой
 * записи краткая сводка: игроки, основные миссии, деплой, стадия, счёт. Хранилище — параметром (localStorage / заглушка).
 * Старое единственное автосохранение (G4b) переносится в список; удаляется только после успешной записи нового.
 * Тесты: tools/roster-data/tests/game-library.test.ts.
 */
import { gameSaveKey, readSavedGame, setAsideSavedGame, writeSavedGame, type KeyValueStore, type SavedRead } from './autosave';
import { totals } from './scoring';
import type { GameCatalog, GameEvent, GameState, Seat } from './types';

/** Сколько игр хранится; сверх — удаляются самые старые (сначала законченные). */
export const LIBRARY_LIMIT = 20;

export type GameSummary = {
  /** режим (DM1); нет — обычная игра */
  mode?: GameState['mode'];
  /** фаза кампании Dominatus (DM3) */
  domPhase?: number | null;
  names: Record<Seat, string>;
  /** основные миссии (названия карт); null — ещё не определена */
  primary: Record<Seat, string | null>;
  deploymentId: string | null;
  stage: GameState['stage'];
  round: number;
  score: Record<Seat, number>;
};

export type OnlineLink = { gameId: string; seat: Seat; code: string };

export type SavedEntry = {
  /** local:<id игры> или online:<id игры на сервере> */
  key: string;
  kind: 'local' | 'online';
  createdAt: string;
  updatedAt: string;
  /** null — игру ещё не открывали на этом телефоне (только ссылка) */
  summary: GameSummary | null;
  online?: OnlineLink;
};

const indexKey = (suffix: string) => `warphub.game.40k.library.v1${suffix}`;
const localKey = (suffix: string, id: string) => `${gameSaveKey(suffix)}.${id}`;

export function summarize(state: GameState, catalog: GameCatalog): GameSummary {
  const card = (id: string | null) => (id ? (catalog.cards.find((c) => c.id === id)?.name ?? id) : null);
  return {
    ...(state.mode === 'dominatus' ? { mode: state.mode, domPhase: state.dominatus?.phase ?? null } : {}),
    names: { p1: state.players.p1.name, p2: state.players.p2.name },
    primary: { p1: card(state.primary.p1), p2: card(state.primary.p2) },
    deploymentId: state.deploymentId,
    stage: state.stage,
    round: state.round,
    score: { p1: totals(state, 'p1', catalog).total, p2: totals(state, 'p2', catalog).total },
  };
}

function readIndex(store: KeyValueStore, suffix: string): SavedEntry[] {
  try {
    const v = JSON.parse(store.getItem(indexKey(suffix)) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((e): e is SavedEntry => !!e && typeof e.key === 'string' && (e.kind === 'local' || e.kind === 'online')) : [];
  } catch {
    return [];
  }
}

const sorted = (list: SavedEntry[]) => [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

/** Записать список; сверх лимита — убрать самые старые (сначала законченные), их журналы тоже. */
function writeIndex(store: KeyValueStore, suffix: string, list: SavedEntry[]): string | null {
  const out = sorted(list);
  while (out.length > LIBRARY_LIMIT) {
    const finished = out.findLastIndex((e) => e.summary?.stage === 'finished');
    const drop = out.splice(finished >= 0 ? finished : out.length - 1, 1)[0]!;
    if (drop.kind === 'local') safeRemove(store, localKey(suffix, drop.key.slice(6)));
  }
  try {
    store.setItem(indexKey(suffix), JSON.stringify(out));
    return null;
  } catch (e) {
    return `Список игр не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function safeRemove(store: KeyValueStore, key: string) {
  try {
    store.removeItem(key);
  } catch {
    /* хранилище недоступно */
  }
}

function upsert(store: KeyValueStore, suffix: string, entry: Omit<SavedEntry, 'createdAt'> & { createdAt?: string }): string | null {
  const list = readIndex(store, suffix);
  const old = list.find((e) => e.key === entry.key);
  const next: SavedEntry = { ...old, ...entry, createdAt: old?.createdAt ?? entry.createdAt ?? entry.updatedAt } as SavedEntry;
  if (!next.summary && old?.summary) next.summary = old.summary;
  return writeIndex(store, suffix, [...list.filter((e) => e.key !== entry.key), next]);
}

export type LibraryRead = { entries: SavedEntry[]; warnings: string[] };

/**
 * Список сохранённых игр (новые сверху). Переносит старое автосохранение: журнал под новым ключом и запись в списке,
 * старый ключ удаляется только после успешной записи. Нечитаемое старое — откладывается (.broken), не удаляется.
 */
export function readLibrary(store: KeyValueStore, suffix: string, catalog: GameCatalog): LibraryRead {
  const warnings: string[] = [];
  const legacy = readSavedGame(store, gameSaveKey(suffix), catalog);
  if (legacy.kind === 'ok') {
    const err = saveLocalGame(store, suffix, legacy.events, legacy.state, catalog);
    if (err) warnings.push(err);
    else safeRemove(store, gameSaveKey(suffix));
  } else if (legacy.kind === 'bad') {
    setAsideSavedGame(store, gameSaveKey(suffix));
    warnings.push(`Старое сохранение не читается и отложено: ${legacy.error}`);
  }
  return { entries: sorted(readIndex(store, suffix)), warnings };
}

/** Сохранить одиночную игру (журнал и сводку). null — записано; строка — ошибка. Пустой журнал не пишется. */
export function saveLocalGame(store: KeyValueStore, suffix: string, events: readonly GameEvent[], state: GameState, catalog: GameCatalog): string | null {
  const first = events[0];
  if (!first) return null;
  const err = writeSavedGame(store, localKey(suffix, first.id), events, catalog);
  if (err) return err;
  return upsert(store, suffix, { key: `local:${first.id}`, kind: 'local', createdAt: first.at, updatedAt: events.at(-1)!.at || new Date().toISOString(), summary: summarize(state, catalog) });
}

/** Открыть одиночную игру из списка. */
export function loadLocalGame(store: KeyValueStore, suffix: string, key: string, catalog: GameCatalog): SavedRead {
  return readSavedGame(store, localKey(suffix, key.replace(/^local:/, '')), catalog);
}

/** Запомнить игру на двух телефонах (при создании, входе и после каждого изменения — со сводкой). */
export function rememberOnlineGame(store: KeyValueStore, suffix: string, link: OnlineLink, state: GameState | null, catalog: GameCatalog, at?: string): string | null {
  const now = at ?? new Date().toISOString();
  return upsert(store, suffix, { key: `online:${link.gameId}`, kind: 'online', online: link, updatedAt: now, summary: state ? summarize(state, catalog) : null });
}

/** Убрать игру из списка: одиночную — вместе с журналом; на двух телефонах — только ссылку (игра остаётся на сервере). */
export function removeSavedGame(store: KeyValueStore, suffix: string, key: string): string | null {
  const list = readIndex(store, suffix);
  if (key.startsWith('local:')) safeRemove(store, localKey(suffix, key.slice(6)));
  return writeIndex(store, suffix, list.filter((e) => e.key !== key));
}
