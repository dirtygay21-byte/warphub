import { describe, expect, test } from 'bun:test';
import { HoldError, shiftOpenAt, validateHoldInput } from '../src/modules/table-holds/rules';

const now = new Date('2026-11-01T06:00:00Z'); // 11:00 по клубу (UTC+5)
const base = { tableId: 3, startsAt: '2026-11-07T14:00:00+05:00', endsAt: '2026-11-07T18:00:00+05:00', purpose: 'tournament', title: 'Турнир Kill Team' };
const err = (input: unknown) => {
  try {
    validateHoldInput(input, now);
  } catch (e) {
    return (e as HoldError).message;
  }
  return null;
};

describe('бронь стола: проверка ввода', () => {
  test('корректная бронь', () => {
    const h = validateHoldInput({ ...base, description: '  финал  ', dndGameId: null }, now);
    expect(h.tableId).toBe(3);
    expect(h.purpose).toBe('tournament');
    expect(h.description).toBe('финал');
    expect(h.endsAt.getTime() - h.startsAt.getTime()).toBe(4 * 3600_000);
  });
  test('конец раньше начала, прошлое, пустое название, неизвестная цель', () => {
    expect(err({ ...base, endsAt: base.startsAt })).toContain('позже начала');
    expect(err({ ...base, startsAt: '2026-10-30T14:00:00+05:00', endsAt: '2026-10-30T18:00:00+05:00' })).toContain('будущее');
    expect(err({ ...base, title: '  ' })).toContain('название');
    expect(err({ ...base, purpose: 'party' })).toContain('цель');
    expect(err({ ...base, tableId: 0 })).toContain('стол');
  });
  test('в пределах одной смены: 12:00 — 10:00 следующего дня', () => {
    expect(err({ ...base, startsAt: '2026-11-07T11:00:00+05:00' })).toContain('смены');
    expect(err({ ...base, startsAt: '2026-11-07T20:00:00+05:00', endsAt: '2026-11-08T02:00:00+05:00' })).toBeNull();
    expect(err({ ...base, startsAt: '2026-11-07T20:00:00+05:00', endsAt: '2026-11-08T13:00:00+05:00' })).toContain('смены');
  });
  test('начало смены для ночного времени — предыдущий день', () => {
    expect(shiftOpenAt(new Date('2026-11-08T02:00:00+05:00')).toISOString()).toBe(new Date('2026-11-07T12:00:00+05:00').toISOString());
    expect(shiftOpenAt(new Date('2026-11-07T15:00:00+05:00')).toISOString()).toBe(new Date('2026-11-07T12:00:00+05:00').toISOString());
  });
});
