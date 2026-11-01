// Клуб закрыт на игру D&D (31.10.2026): правила без БД — час после игры, пересечения, блоки столов и покраски.
import { describe, expect, test } from 'bun:test';
import { bookingConfig } from '../src/config/booking';
import { closureEnd, closureSearchFrom, closuresAsPoolBookings, closuresAsTableBlocks, overlaps, type ClubClosure } from '../src/modules/club-closure/rules';
import { poolFreeSeats } from '../src/modules/booking/rules';

const at = (hhmm: string) => new Date(`2026-11-07T${hhmm}:00+05:00`);

describe('закрытие клуба на D&D', () => {
  test('час после игры: 4 часа с 12:00 — клуб закрыт до 17:00', () => {
    expect(bookingConfig.dndClosureBufferMinutes).toBe(60);
    expect(closureEnd(at('16:00')).toISOString()).toBe(at('17:00').toISOString());
    expect(closureSearchFrom(at('17:00')).toISOString()).toBe(at('16:00').toISOString());
  });

  test('пересечение: запись с 17:00 уже можно, с 16:30 — нет', () => {
    const closure = { startsAt: at('12:00'), endsAt: closureEnd(at('16:00')) };
    expect(overlaps(closure, { startsAt: at('17:00'), endsAt: at('20:00') })).toBe(false);
    expect(overlaps(closure, { startsAt: at('16:30'), endsAt: at('19:00') })).toBe(true);
    expect(overlaps(closure, { startsAt: at('09:00'), endsAt: at('12:00') })).toBe(false);
  });

  const closure: ClubClosure = { source: 'dnd_game', id: 1, title: 'Кампания', startsAt: at('12:00'), endsAt: at('17:00') };

  test('оба острова заблокированы', () => {
    const blocks = closuresAsTableBlocks([1, 2], [closure]);
    expect(blocks.map((b) => b.tableId)).toEqual([1, 2]);
    expect(blocks.every((b) => b.endsAt.getTime() === at('17:00').getTime())).toBe(true);
  });

  test('покраска и посещение: на время закрытия мест нет, после — есть', () => {
    const busy = closuresAsPoolBookings([closure], 6);
    expect(poolFreeSeats({ startsAt: at('13:00'), endsAt: at('14:00') }, busy, 6)).toBe(0);
    expect(poolFreeSeats({ startsAt: at('17:00'), endsAt: at('18:00') }, busy, 6)).toBe(6);
  });
});
