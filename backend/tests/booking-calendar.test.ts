import { describe, expect, test } from 'bun:test';
import { buildIcs } from '../src/modules/booking/calendar-ics';

describe('файл календаря записи', () => {
  test('событие с напоминанием за час, время в UTC, текст экранирован', () => {
    const ics = buildIcs({
      id: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90',
      title: 'Kill Team, стол; 1',
      startsAt: new Date('2026-11-20T13:00:00Z'),
      endsAt: new Date('2026-11-20T16:00:00Z'),
      location: 'WarpHub, Стол 1',
      now: new Date('2026-11-15T10:00:00Z'),
    });
    expect(ics).toContain('DTSTART:20261120T130000Z');
    expect(ics).toContain('DTEND:20261120T160000Z');
    expect(ics).toContain('SUMMARY:WarpHub: Kill Team\\, стол\; 1');
    expect(ics).toContain('TRIGGER:-PT1H');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
  test('без конца — час по умолчанию', () => {
    const ics = buildIcs({ id: 'x', title: 'Покраска', startsAt: new Date('2026-11-20T13:00:00Z'), endsAt: null });
    expect(ics).toContain('DTEND:20261120T140000Z');
  });
});
