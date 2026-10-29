/**
 * Сохранённые игры AoS на телефоне (S6): каждая игра — свой журнал под ключом с id игры, плюс список со сводкой
 * (игроки, батлплан, стадия, счёт). Отдельно от 40K (game/library.ts): другой движок и другие данные.
 */
import type { KeyValueStore } from '../game/autosave';
import { replayAos } from './reducer';
import { aosTotals } from './scoring';
import { AOS_GAME_SCHEMA, type AosCatalog, type AosGameEvent, type AosGameState, type Seat } from './types';

export const AOS_LIBRARY_LIMIT = 20;

export type AosSummary = {
  names: Record<Seat, string>;
  battleplan: string | null;
  stage: AosGameState['stage'];
  round: number;
  score: Record<Seat, number>;
};
export type AosSavedEntry = { key: string; createdAt: string; updatedAt: string; summary: AosSummary };

const indexKey = (suffix: string) => `warphub.game.aos.library.v1${suffix}`;
const logKey = (suffix: string, id: string) => `warphub.game.aos.v1${suffix}.${id}`;

export function aosSummarize(s: AosGameState, cat: AosCatalog): AosSummary {
  return {
    names: { p1: s.players.p1.name, p2: s.players.p2.name },
    battleplan: s.battleplan ? (cat.battleplans.find((b) => b.n === s.battleplan)?.name ?? null) : null,
    stage: s.stage,
    round: s.round,
    score: { p1: aosTotals(s, 'p1', cat).total, p2: aosTotals(s, 'p2', cat).total },
  };
}

function readIndex(store: KeyValueStore, suffix: string): AosSavedEntry[] {
  try {
    const v = JSON.parse(store.getItem(indexKey(suffix)) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((e): e is AosSavedEntry => !!e && typeof e.key === 'string' && !!e.summary) : [];
  } catch {
    return [];
  }
}
const sorted = (l: AosSavedEntry[]) => [...l].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

function writeIndex(store: KeyValueStore, suffix: string, list: AosSavedEntry[]): string | null {
  const out = sorted(list);
  while (out.length > AOS_LIBRARY_LIMIT) {
    const fin = out.findLastIndex((e) => e.summary.stage === 'finished');
    const drop = out.splice(fin >= 0 ? fin : out.length - 1, 1)[0]!;
    try {
      store.removeItem(logKey(suffix, drop.key));
    } catch {
      /* хранилище недоступно */
    }
  }
  try {
    store.setItem(indexKey(suffix), JSON.stringify(out));
    return null;
  } catch (e) {
    return `Список игр не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export const readAosLibrary = (store: KeyValueStore, suffix: string) => sorted(readIndex(store, suffix));

/** Сохранить игру (журнал и сводку). null — записано; строка — ошибка. */
export function saveAosGame(store: KeyValueStore, suffix: string, events: readonly AosGameEvent[], state: AosGameState, cat: AosCatalog): string | null {
  const first = events[0];
  if (!first) return null;
  try {
    store.setItem(logKey(suffix, first.id), JSON.stringify({ schema: AOS_GAME_SCHEMA, events }));
  } catch (e) {
    return `Игру не удалось сохранить на устройстве: ${e instanceof Error ? e.message : String(e)}`;
  }
  const list = readIndex(store, suffix);
  const old = list.find((e) => e.key === first.id);
  return writeIndex(store, suffix, [
    ...list.filter((e) => e.key !== first.id),
    { key: first.id, createdAt: old?.createdAt ?? first.at, updatedAt: events.at(-1)!.at || new Date().toISOString(), summary: aosSummarize(state, cat) },
  ]);
}

/** Открыть игру: журнал проигрывается движком; ошибка — строкой. */
export function loadAosGame(store: KeyValueStore, suffix: string, key: string, cat: AosCatalog): { events: AosGameEvent[]; state: AosGameState } | string {
  let text: string | null;
  try {
    text = store.getItem(logKey(suffix, key));
  } catch {
    return 'Хранилище недоступно';
  }
  if (!text) return 'Игра не найдена на телефоне';
  try {
    const v = JSON.parse(text) as { schema?: number; events?: AosGameEvent[] };
    if (v.schema !== AOS_GAME_SCHEMA || !Array.isArray(v.events)) return 'Сохранение другой версии';
    const r = replayAos(v.events, cat);
    return r.ok ? { events: v.events, state: r.state } : `Журнал не проигрывается (событие №${r.seq}): ${r.error}`;
  } catch {
    return 'Сохранение повреждено';
  }
}

export function removeAosGame(store: KeyValueStore, suffix: string, key: string): string | null {
  try {
    store.removeItem(logKey(suffix, key));
  } catch {
    /* хранилище недоступно */
  }
  return writeIndex(store, suffix, readIndex(store, suffix).filter((e) => e.key !== key));
}
