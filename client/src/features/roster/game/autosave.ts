/**
 * Автосохранение игры на устройстве (G4b): журнал событий в формате serializeGame под ключом аккаунта Telegram.
 * Хранилище передаётся параметром (localStorage в приложении, заглушка в тестах).
 * Только на этом телефоне: журнал партии (десятки КБ) больше лимита CloudStorage (4096 символов на значение);
 * синхронизация между устройствами — этап двух телефонов (сервер).
 * Повреждённое или более новое сохранение не удаляется молча: его можно отложить (ключ .broken) перед новой игрой.
 */
import { loadGame, serializeGame } from './serialize';
import type { GameCatalog, GameEvent, GameState } from './types';

/** Хранилище с интерфейсом localStorage (getItem/setItem/removeItem). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Ключ сохранения 40K-игры; suffix — «.<id пользователя Telegram>» или пусто вне Telegram. */
export const gameSaveKey = (suffix: string) => `warphub.game.40k.v1${suffix}`;

export type SavedRead =
  | { kind: 'none' }
  | { kind: 'ok'; events: GameEvent[]; state: GameState; warnings: string[] }
  | { kind: 'bad'; error: string };

/** Прочитать сохранение: нет / игра (журнал проигран движком) / не читается (с причиной). Ничего не удаляет. */
export function readSavedGame(store: KeyValueStore, key: string, catalog: GameCatalog): SavedRead {
  let text: string | null;
  try {
    text = store.getItem(key);
  } catch {
    return { kind: 'none' };
  }
  if (text == null) return { kind: 'none' };
  const r = loadGame(text, catalog);
  if (!r.ok || !r.events) return { kind: 'bad', error: r.ok ? 'В сохранении нет журнала игры' : `${r.error}${r.seq ? ` (событие №${r.seq})` : ''}` };
  return { kind: 'ok', events: r.events, state: r.state, warnings: r.warnings };
}

/** Записать журнал. null — записано; строка — ошибка (переполнено, приватный режим). Пустой журнал не пишется. */
export function writeSavedGame(store: KeyValueStore, key: string, events: readonly GameEvent[], catalog: GameCatalog): string | null {
  if (!events.length) return null;
  try {
    store.setItem(key, serializeGame(events, catalog));
    return null;
  } catch (e) {
    return `Игру не удалось сохранить на устройстве: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Отложить нечитаемое сохранение под ключ .broken (предыдущее отложенное заменяется), чтобы начать новую игру. */
export function setAsideSavedGame(store: KeyValueStore, key: string): void {
  try {
    const text = store.getItem(key);
    if (text != null) store.setItem(`${key}.broken`, text);
    store.removeItem(key);
  } catch {
    /* хранилище недоступно — нечего откладывать */
  }
}
