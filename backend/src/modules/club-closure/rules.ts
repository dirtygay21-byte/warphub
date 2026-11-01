/**
 * Клуб закрыт на игру D&D (31.10.2026): правила без БД (tests/club-closure-rules.test.ts).
 * Закрытие = начало игры … конец игры + bookingConfig.dndClosureBufferMinutes.
 */
import { bookingConfig } from '../../config/booking';

const MINUTE = 60_000;

export type ClubClosure = {
  startsAt: Date;
  endsAt: Date;
  /** откуда закрытие: игра D&D или бронь стола с целью «Игра D&D» */
  source: 'dnd_game' | 'dnd_hold';
  id: number;
  title: string;
};

export const closureEnd = (gameEndsAt: Date) => new Date(gameEndsAt.getTime() + bookingConfig.dndClosureBufferMinutes * MINUTE);

/** Начало, с которого закрытия надо искать: игра, кончившаяся до rangeStart − буфер, уже не мешает. */
export const closureSearchFrom = (rangeStart: Date) => new Date(rangeStart.getTime() - bookingConfig.dndClosureBufferMinutes * MINUTE);

export const overlaps = (a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) =>
  a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/** Закрытия как блоки каждого стола (для столов Warhammer). */
export function closuresAsTableBlocks(tableIds: number[], closures: ClubClosure[]) {
  return closures.flatMap((c) => tableIds.map((tableId) => ({ tableId, startsAt: c.startsAt, endsAt: c.endsAt })));
}

/** Закрытия как «занятые все места» (для покраски и посещения: общая вместимость). */
export function closuresAsPoolBookings(closures: ClubClosure[], capacity: number) {
  return closures.map((c) => ({ partySize: capacity, startsAt: c.startsAt, endsAt: c.endsAt }));
}
