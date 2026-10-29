/**
 * Игра на двух телефонах (T2): правила синхронизации журнала. Чистые функции — tools/roster-data/tests/game-online.test.ts.
 * Сервер хранит журнал и порядок (seq); каждый телефон проигрывает его этим же движком (вариант A).
 */
import type { EventBody, GameEvent, Seat } from './types';

/** События, которые движок принимает только общими (seat = null): создание, раскрытия, начало битвы. */
const SHARED: ReadonlySet<GameEvent['type']> = new Set(['game-created', 'dispositions-revealed', 'secondaries-revealed', 'battle-started']);

/**
 * Чьё событие при игре на двух телефонах: общее (раскрытия и т. п.) — null, остальные — место этого телефона.
 * Так движок сам не даст телефону действовать за соперника: ход, карты, CP и отмена — только свои.
 */
export function seatForEvent(type: EventBody['type'], mySeat: Seat): Seat | null {
  return SHARED.has(type) ? null : mySeat;
}

/** Игра на сервере — Age of Sigmar (первое событие с system: 'aos'); у 40K метки нет. Сервер систему не различает. */
export const isAosLog = (events: readonly { type: string; system?: unknown }[]) => events[0]?.type === 'game-created' && events[0]?.system === 'aos';

/**
 * Добавить к журналу события с сервера: только продолжение по номерам (seq = последний + 1, без пропусков).
 * null — пришло не продолжение (пропуск или чужая история): нужно взять журнал целиком.
 */
export function appendRemote<E extends { seq: number; id: string } = GameEvent>(events: readonly E[], incoming: readonly E[]): E[] | null {
  let last = events.at(-1)?.seq ?? 0;
  const out = [...events];
  for (const ev of [...incoming].sort((a, b) => a.seq - b.seq)) {
    if (ev.seq <= last) {
      if (out[ev.seq - 1]?.id !== ev.id) return null;
      continue;
    }
    if (ev.seq !== last + 1) return null;
    out.push(ev);
    last = ev.seq;
  }
  return out;
}
