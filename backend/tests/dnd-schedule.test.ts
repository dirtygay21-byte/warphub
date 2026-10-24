// D&D: точное или примерное время игры (src/modules/dnd/schedule.ts). Запуск: bun test tests/dnd-schedule.test.ts
import { describe, expect, test } from 'bun:test';
import { gameStarted, parseSchedule, scheduleChanged, scheduleLabel, ScheduleError } from '../src/modules/dnd/schedule';

const exact = { startsAt: new Date('2026-11-06T13:00:00Z'), endsAt: null, daysOfWeek: [], timesOfDay: [] };

describe('parseSchedule', () => {
  test('примерное: дни и время суток, без повторов, по порядку; точное время очищается', () => {
    expect(parseSchedule({ daysOfWeek: [6, 5, 6], timesOfDay: ['evening', 'afternoon'] })).toEqual({
      startsAt: null,
      endsAt: null,
      daysOfWeek: [5, 6],
      timesOfDay: ['afternoon', 'evening'],
    });
    expect(parseSchedule({ daysOfWeek: [5], timesOfDay: ['evening'] }, exact).startsAt).toBeNull();
  });
  test('нужны и дни, и время суток (или точное время); неверные значения — ошибка', () => {
    expect(() => parseSchedule({})).toThrow(ScheduleError);
    expect(() => parseSchedule({ daysOfWeek: [5], timesOfDay: [] })).toThrow(ScheduleError);
    expect(() => parseSchedule({ daysOfWeek: [8], timesOfDay: ['evening'] })).toThrow(ScheduleError);
    expect(() => parseSchedule({ daysOfWeek: [5], timesOfDay: ['night'] })).toThrow(ScheduleError);
  });
  test('точное: дни очищаются; конец позже начала; без изменений — прежнее', () => {
    const s = parseSchedule({ startsAt: '2026-11-06T18:00:00+05:00' }, { startsAt: null, endsAt: null, daysOfWeek: [5], timesOfDay: ['evening'] });
    expect(s.daysOfWeek).toEqual([]);
    expect(s.startsAt?.toISOString()).toBe('2026-11-06T13:00:00.000Z');
    expect(() => parseSchedule({ startsAt: '2026-11-06T18:00:00+05:00', endsAt: '2026-11-06T17:00:00+05:00' })).toThrow(ScheduleError);
    expect(parseSchedule({ capacity: 3 } as never, exact)).toEqual(exact);
    const flex = { startsAt: null, endsAt: null, daysOfWeek: [6], timesOfDay: ['morning'] };
    expect(parseSchedule({}, flex)).toEqual(flex);
  });
});

test('scheduleLabel: дни и время суток словами; точное — дата и время', () => {
  expect(scheduleLabel({ startsAt: null, endsAt: null, daysOfWeek: [5, 6], timesOfDay: ['evening'] })).toBe('пятница или суббота, вечер');
  expect(scheduleLabel({ startsAt: null, endsAt: null, daysOfWeek: [1, 3, 5], timesOfDay: ['afternoon', 'evening'] })).toBe('понедельник, среда или пятница, день или вечер');
  expect(scheduleLabel(exact)).toContain('18:00');
});

test('gameStarted и scheduleChanged', () => {
  expect(gameStarted({ startsAt: null })).toBe(false);
  expect(gameStarted({ startsAt: new Date(Date.now() - 1000) })).toBe(true);
  const flex = { startsAt: null, endsAt: null, daysOfWeek: [6], timesOfDay: ['evening'] };
  expect(scheduleChanged(flex, { ...flex })).toBe(false);
  expect(scheduleChanged(flex, { ...flex, daysOfWeek: [5, 6] })).toBe(true);
  expect(scheduleChanged(flex, exact)).toBe(true);
});
