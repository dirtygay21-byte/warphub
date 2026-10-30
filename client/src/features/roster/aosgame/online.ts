/**
 * AoS на двух телефонах (30.10.2026): чьё событие. Журнал хранит тот же сервер, что у 40K (он правил не знает);
 * каждый телефон проигрывает журнал движком AoS. Общие события — создание игры, раскрытие тактик, начало битвы;
 * остальные — место этого телефона, и движок не даст действовать за соперника (ход, CP, тактики, отмена — только свои).
 */
import type { AosEventBody, Seat } from './types';

const SHARED: ReadonlySet<AosEventBody['type']> = new Set(['game-created', 'tactics-revealed', 'battle-started']);

export function aosSeatForEvent(type: AosEventBody['type'], mySeat: Seat): Seat | null {
  return SHARED.has(type) ? null : mySeat;
}
