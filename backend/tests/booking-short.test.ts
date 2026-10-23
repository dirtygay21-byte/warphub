/** Запись короче полной длительности (B1): конец до следующей занятости, минимум 2 часа. */
import { describe, expect, test } from 'bun:test';
import { bookingConfig } from '../src/config/booking';
import { poolFitEnd, tableFitEnd, checkTableSession, type TableBooking } from '../src/modules/booking/rules';

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 25, h - 5, m)); // местное время клуба (UTC+5)
const MIN = bookingConfig.minShortenedMinutes;
const booking = (from: number, to: number, extra: Partial<TableBooking> = {}): TableBooking =>
  ({ id: `b${from}`, tableId: 1, serviceId: 1, userId: 'u', partySize: 1, startsAt: at(from), endsAt: at(to), ...extra }) as TableBooking;

describe('tableFitEnd', () => {
  test('стол свободен на всю длительность — полный конец', () => {
    expect(tableFitEnd({ tableId: 1, startsAt: at(12), fullEnd: at(16), bookings: [booking(17, 21)], minMinutes: MIN })).toEqual(at(16));
  });
  test('следующая запись в 15:00 — конец в 15:00 (3 ч), и он не пересекается со следующей записью', () => {
    const next = booking(15, 19, { serviceId: 2 });
    const end = tableFitEnd({ tableId: 1, startsAt: at(12), fullEnd: at(16), bookings: [next], minMinutes: MIN })!;
    expect(end).toEqual(at(15));
    expect(checkTableSession({ tableId: 1, serviceId: 1, startsAt: at(12), endsAt: end, partySize: 1, seatsPerTable: 2, bookings: [next] }).ok).toBe(true);
  });
  test('мероприятие на столе тоже ограничивает; другой стол — нет', () => {
    expect(tableFitEnd({ tableId: 1, startsAt: at(12), fullEnd: at(16), bookings: [booking(13, 15, { tableId: 2 })], blocks: [{ tableId: 1, startsAt: at(14, 30), endsAt: at(18) }], minMinutes: MIN })).toEqual(at(14, 30));
  });
  test('свободно меньше 2 часов — нельзя; ровно 2 — можно', () => {
    expect(tableFitEnd({ tableId: 1, startsAt: at(12), fullEnd: at(16), bookings: [booking(13, 15)], minMinutes: MIN })).toBeNull();
    expect(tableFitEnd({ tableId: 1, startsAt: at(12), fullEnd: at(16), bookings: [booking(14, 15)], minMinutes: MIN })).toEqual(at(14));
  });
  test('услуга короче минимума (1 ч) полностью влезает — без ограничений', () => {
    expect(tableFitEnd({ tableId: 1, startsAt: at(12), fullEnd: at(13), bookings: [booking(13, 15)], minMinutes: MIN })).toEqual(at(13));
  });
});

describe('poolFitEnd', () => {
  const pool = (from: number, to: number, partySize: number) => ({ partySize, startsAt: at(from), endsAt: at(to) });
  test('мест хватает на всё время — полный конец', () => {
    expect(poolFitEnd({ startsAt: at(12), fullEnd: at(16), bookings: [pool(13, 16, 2)], capacity: 5, partySize: 2, minMinutes: MIN })).toEqual(at(16));
  });
  test('с 15:00 мест не хватает — конец в 15:00', () => {
    expect(poolFitEnd({ startsAt: at(12), fullEnd: at(16), bookings: [pool(13, 18, 2), pool(15, 18, 2)], capacity: 5, partySize: 2, minMinutes: MIN })).toEqual(at(15));
  });
  test('нехватка раньше 2 часов — нельзя', () => {
    expect(poolFitEnd({ startsAt: at(12), fullEnd: at(16), bookings: [pool(13, 18, 4)], capacity: 5, partySize: 2, minMinutes: MIN })).toBeNull();
  });
});
