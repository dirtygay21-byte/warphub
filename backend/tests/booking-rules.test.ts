import { describe, expect, test } from 'bun:test';
import {
  canBookDndSeats,
  checkTableSession,
  dndAvailableSeats,
  getAllowedWeekdays,
  groupSessions,
  isDateAllowed,
  isOnSlotGrid,
  isoWeekday,
  localDateTimeToUtc,
  parseDateParam,
  poolFreeSeats,
  toLocalDateParts,
  validateDetails,
  DetailsValidationError,
  formatLocalIso,
  type TableBooking,
} from '../src/modules/booking/rules';

const at = (date: string, hour: number, minute = 0) =>
  localDateTimeToUtc(parseDateParam(date), hour, minute);
const hours = (n: number) => n * 60 * 60 * 1000;

describe('club time (UTC+5)', () => {
  test('local 18:00 is 13:00 UTC', () => {
    expect(at('2026-10-09', 18).toISOString()).toBe('2026-10-09T13:00:00.000Z');
  });

  test('late-evening UTC moment belongs to the next local day', () => {
    // 20:30 UTC on Thursday = 01:30 Friday in Yekaterinburg
    const parts = toLocalDateParts(new Date('2026-10-08T20:30:00Z'));
    expect(parts).toEqual({ year: 2026, month: 10, day: 9 });
    expect(isoWeekday(parts)).toBe(5);
  });

  test('formats ISO with +05:00', () => {
    expect(formatLocalIso(at('2026-10-10', 12))).toBe(
      '2026-10-10T12:00:00+05:00',
    );
  });

  test('slot grid: 12:00 start valid, 12:15 invalid, 23:30 valid', () => {
    const s = at('2026-10-10', 12);
    expect(isOnSlotGrid(s, new Date(s.getTime() + hours(2)), 120)).toBe(true);
    const odd = at('2026-10-10', 12, 15);
    expect(isOnSlotGrid(odd, new Date(odd.getTime() + hours(2)), 120)).toBe(
      false,
    );
    const late = at('2026-10-10', 23, 30);
    expect(isOnSlotGrid(late, new Date(late.getTime() + hours(2)), 120)).toBe(
      true,
    );
  });
});

describe('Friday–Sunday rule', () => {
  // 2026-10-05 is a Monday
  const days = {
    mon: '2026-10-05',
    tue: '2026-10-06',
    wed: '2026-10-07',
    thu: '2026-10-08',
    fri: '2026-10-09',
    sat: '2026-10-10',
    sun: '2026-10-11',
  };

  test('Mon–Thu rejected, Fri–Sun allowed', () => {
    for (const d of [days.mon, days.tue, days.wed, days.thu]) {
      expect(isDateAllowed(parseDateParam(d), [1, 2, 3, 4, 5, 6, 7])).toBe(
        false,
      );
    }
    for (const d of [days.fri, days.sat, days.sun]) {
      expect(isDateAllowed(parseDateParam(d), [1, 2, 3, 4, 5, 6, 7])).toBe(
        true,
      );
    }
  });

  test('discipline schedule cannot widen Fri–Sun', () => {
    expect(getAllowedWeekdays([1, 2, 3, 4])).toEqual([]);
    expect(getAllowedWeekdays([6, 7])).toEqual([6, 7]);
    expect(getAllowedWeekdays(null)).toEqual([5, 6, 7]);
  });
});

describe('Warhammer table sessions (2 players per table)', () => {
  const service = 1;
  const start = at('2026-10-10', 18);
  const end = new Date(start.getTime() + hours(3));
  const base = {
    tableId: 1,
    serviceId: service,
    startsAt: start,
    endsAt: end,
    partySize: 1,
    seatsPerTable: 2,
  };
  const first: TableBooking = {
    id: 'a',
    tableId: 1,
    serviceId: service,
    partySize: 1,
    startsAt: start,
    endsAt: end,
  };

  test('empty table → new session (0/2 → 1/2)', () => {
    const result = checkTableSession({ ...base, bookings: [] });
    expect(result).toEqual({
      ok: true,
      isJoin: false,
      occupiedBefore: 0,
      others: [],
    });
  });

  test('1/2 table, same start → join (2/2)', () => {
    const result = checkTableSession({ ...base, bookings: [first] });
    expect(result.ok && result.isJoin).toBe(true);
  });

  test('2/2 table → full', () => {
    const second = { ...first, id: 'b' };
    expect(checkTableSession({ ...base, bookings: [first, second] })).toEqual({
      ok: false,
      reason: 'FULL',
    });
  });

  test('overlapping booking with different start → busy (no half-overlaps)', () => {
    const shifted = new Date(start.getTime() + hours(1));
    const result = checkTableSession({
      ...base,
      startsAt: shifted,
      endsAt: new Date(shifted.getTime() + hours(3)),
      bookings: [first],
    });
    expect(result).toEqual({ ok: false, reason: 'BUSY' });
  });

  test('other service on the table → busy', () => {
    const result = checkTableSession({
      ...base,
      bookings: [{ ...first, serviceId: 99 }],
    });
    expect(result).toEqual({ ok: false, reason: 'BUSY' });
  });

  test('event block → blocked', () => {
    const result = checkTableSession({
      ...base,
      bookings: [],
      blocks: [{ tableId: 1, startsAt: start, endsAt: end }],
    });
    expect(result).toEqual({ ok: false, reason: 'BLOCKED' });
  });

  test('other table is independent', () => {
    const result = checkTableSession({
      ...base,
      tableId: 2,
      bookings: [first, { ...first, id: 'b' }],
    });
    expect(result.ok).toBe(true);
  });

  test('back-to-back sessions do not collide', () => {
    const result = checkTableSession({
      ...base,
      startsAt: end,
      endsAt: new Date(end.getTime() + hours(3)),
      bookings: [first, { ...first, id: 'b' }],
    });
    expect(result.ok).toBe(true);
  });

  test('solo training: 1 player per table', () => {
    expect(
      checkTableSession({ ...base, seatsPerTable: 1, bookings: [first] }),
    ).toEqual({ ok: false, reason: 'FULL' });
    expect(
      checkTableSession({ ...base, seatsPerTable: 1, partySize: 2, bookings: [] }),
    ).toEqual({ ok: false, reason: 'TOO_MANY' });
  });

  test('groupSessions merges players of the same session', () => {
    const sessions = groupSessions(
      [first, { ...first, id: 'b' }, { ...first, id: 'c', tableId: 2 }],
      service,
    );
    expect(sessions.map((s) => [s.tableId, s.occupied])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });
});

describe('pool capacity (painting = 5)', () => {
  const start = at('2026-10-10', 14);
  const span = (h: number, len: number, partySize: number) => ({
    partySize,
    startsAt: new Date(start.getTime() + hours(h)),
    endsAt: new Date(start.getTime() + hours(h + len)),
  });

  test('2 + 2 booked → 1 free', () => {
    const free = poolFreeSeats(
      { startsAt: start, endsAt: new Date(start.getTime() + hours(2)) },
      [span(0, 2, 2), span(0, 2, 2)],
      5,
    );
    expect(free).toBe(1);
  });

  test('peak inside the interval counts', () => {
    const free = poolFreeSeats(
      { startsAt: start, endsAt: new Date(start.getTime() + hours(3)) },
      [span(0, 1, 2), span(1, 2, 4)],
      5,
    );
    expect(free).toBe(1);
  });

  test('non-overlapping bookings do not count', () => {
    const free = poolFreeSeats(
      { startsAt: start, endsAt: new Date(start.getTime() + hours(1)) },
      [span(1, 2, 5)],
      5,
    );
    expect(free).toBe(5);
  });
});

describe('D&D capacity', () => {
  test('capacity 5 with 2+2 → 1 available', () => {
    expect(dndAvailableSeats(5, [2, 2])).toBe(1);
    expect(canBookDndSeats(5, [2, 2], 1)).toBe(true);
    expect(canBookDndSeats(5, [2, 2], 2)).toBe(false);
  });

  test('rejects 0, fractions and more than 6 per booking', () => {
    expect(canBookDndSeats(20, [], 0)).toBe(false);
    expect(canBookDndSeats(20, [], 1.5)).toBe(false);
    expect(canBookDndSeats(20, [], 7)).toBe(false);
    expect(canBookDndSeats(20, [], 6)).toBe(true);
  });
});

describe('details validation', () => {
  test('warhammer player details', () => {
    expect(
      validateDetails('wh_player', {
        army: '  Astra   Militarum ',
        points: 1500,
        experienceLevel: 'experienced',
      }),
    ).toEqual({
      kind: 'wh_player',
      army: 'Astra Militarum',
      points: 1500,
      experienceLevel: 'experienced',
    });
  });

  test('warhammer details reject bad values', () => {
    expect(() => validateDetails('wh_player', undefined)).toThrow(
      DetailsValidationError,
    );
    expect(() =>
      validateDetails('wh_player', {
        army: 'Orks',
        points: 0,
        experienceLevel: 'player',
      }),
    ).toThrow(DetailsValidationError);
    expect(() =>
      validateDetails('wh_player', {
        army: 'Orks',
        points: 1000,
        experienceLevel: 'god',
      }),
    ).toThrow(DetailsValidationError);
    expect(() =>
      validateDetails('wh_player', {
        army: '   ',
        points: 1000,
        experienceLevel: 'player',
      }),
    ).toThrow(DetailsValidationError);
  });

  test('painting details', () => {
    expect(
      validateDetails('painting', {
        faction: 'Necrons',
        model: 'Necron Warriors',
        paintSource: 'club',
        needsHelp: true,
      }),
    ).toEqual({
      kind: 'painting',
      faction: 'Necrons',
      model: 'Necron Warriors',
      paintSource: 'club',
      needsHelp: true,
      comment: null,
    });
    expect(() =>
      validateDetails('painting', {
        faction: 'Necrons',
        model: 'x',
        paintSource: 'borrowed',
        needsHelp: false,
      }),
    ).toThrow(DetailsValidationError);
  });

  test('services without details reject extra data', () => {
    expect(validateDetails(null, undefined)).toBeNull();
    expect(() => validateDetails(null, { army: 'x' })).toThrow(
      DetailsValidationError,
    );
  });
});
