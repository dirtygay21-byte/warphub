/**
 * Сохранение и загрузка игры (G1.7): игра хранится как журнал событий + версия схемы + отпечаток данных миссий.
 * Тот же формат подойдёт и для автосохранения на устройстве (G4b), и для передачи журнала второму телефону/серверу.
 */
import { hashSeed } from './rng';
import { replay } from './reducer';
import { GAME_SCHEMA, type ApplyResult, type GameCatalog, type GameEvent } from './types';

export const SAVE_FORMAT = 'warphub-game';

export interface SavedGame {
  format: typeof SAVE_FORMAT;
  schema: number;
  /** отпечаток данных миссий, с которыми шла игра (изменились — предупреждение: очки пересчитываются по новым данным) */
  catalog: string;
  events: GameEvent[];
}

/**
 * Миграции журнала: ключ — версия, С которой переводится журнал (1 → 2 будет записана под ключом 1).
 * Пока версия одна — список пуст; новая схема добавляет функцию сюда и поднимает GAME_SCHEMA.
 */
export const MIGRATIONS: Record<number, (events: GameEvent[]) => GameEvent[]> = {};

/** Отпечаток каталога: состав карт, очки строк, лимиты, пары и раскладки — всё, от чего зависят правила игры. */
export function catalogFingerprint(catalog: GameCatalog): string {
  const cards = catalog.cards.map((c) => [c.id, c.type, c.modes ?? [], c.blocks.map((b) => [b.rounds, b.mode ?? '', b.rows.map((r) => [r.vp, !!r.plus, !!r.or, r.max ?? 0])])]);
  const payload = JSON.stringify([cards, catalog.caps, catalog.matchups.map((m) => [m.you, m.foe, m.mission]), catalog.layouts.map((l) => [l.id, l.pair, l.variant, l.deployment])]);
  return hashSeed('catalog', payload).toString(16).padStart(8, '0');
}

export function serializeGame(events: readonly GameEvent[], catalog: GameCatalog): string {
  const saved: SavedGame = { format: SAVE_FORMAT, schema: GAME_SCHEMA, catalog: catalogFingerprint(catalog), events: [...events] };
  return JSON.stringify(saved);
}

export type LoadResult = (ApplyResult & { seq?: number }) & { events?: GameEvent[]; warnings: string[] };

/** Разобрать сохранённую игру, при необходимости перевести журнал на текущую схему и проиграть его. */
export function loadGame(text: string, catalog: GameCatalog): LoadResult {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Сохранение повреждено: это не JSON', warnings };
  }
  const saved = raw as Partial<SavedGame> | null;
  if (!saved || typeof saved !== 'object' || saved.format !== SAVE_FORMAT) return { ok: false, error: 'Это не сохранённая игра WarpHub', warnings };
  if (!Number.isInteger(saved.schema) || (saved.schema as number) < 1) return { ok: false, error: 'В сохранении нет версии схемы', warnings };
  if ((saved.schema as number) > GAME_SCHEMA) return { ok: false, error: `Игра сохранена более новой версией приложения (схема ${saved.schema}, здесь ${GAME_SCHEMA}) — обновите приложение`, warnings };
  if (!Array.isArray(saved.events) || !saved.events.length) return { ok: false, error: 'В сохранении нет журнала игры', warnings };
  let events = saved.events as GameEvent[];
  for (let v = saved.schema as number; v < GAME_SCHEMA; v++) {
    const m = MIGRATIONS[v];
    if (!m) return { ok: false, error: `Нет перевода сохранения со схемы ${v} на ${v + 1}`, warnings };
    events = m(events);
  }
  if (saved.catalog !== catalogFingerprint(catalog)) warnings.push('Данные миссий изменились после начала этой игры: журнал проигран по новым данным, очки уже засчитанных карт могли измениться.');
  return { ...replay(events, catalog), events, warnings };
}
