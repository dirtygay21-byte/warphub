// Сводки администраторам в 12:00 и 20:00 (17.11.2026) и «сразу — только в игровой день».
import { describe, expect, test } from 'bun:test';
import { isUrgentForAdmins, nextSummaryAt, summarySlot } from '../src/modules/notifications/admin-schedule';

// время клуба UTC+5: «2026-11-17T12:00+05:00»
const at = (s: string) => new Date(`${s}+05:00`);

describe('сводки', () => {
  test('слот: последняя сводка и предыдущая', () => {
    expect(summarySlot(at('2026-11-17T13:00:00'))).toEqual({ at: at('2026-11-17T12:00:00'), hour: 12, previous: at('2026-11-16T20:00:00') });
    expect(summarySlot(at('2026-11-17T20:30:00'))).toEqual({ at: at('2026-11-17T20:00:00'), hour: 20, previous: at('2026-11-17T12:00:00') });
    expect(summarySlot(at('2026-11-17T09:00:00'))).toEqual({ at: at('2026-11-16T20:00:00'), hour: 20, previous: at('2026-11-16T12:00:00') });
  });
  test('следующая сводка', () => {
    expect(nextSummaryAt(at('2026-11-17T09:00:00'))).toEqual(at('2026-11-17T12:00:00'));
    expect(nextSummaryAt(at('2026-11-17T12:00:00'))).toEqual(at('2026-11-17T20:00:00'));
    expect(nextSummaryAt(at('2026-11-17T23:00:00'))).toEqual(at('2026-11-18T12:00:00'));
  });
});

describe('сразу или в сводку', () => {
  test('игра сегодня — сразу', () => {
    expect(isUrgentForAdmins(at('2026-11-17T21:00:00'), at('2026-11-17T13:00:00'))).toBe(true);
    expect(isUrgentForAdmins(at('2026-11-17T18:00:00'), at('2026-11-17T10:00:00'))).toBe(true);
  });
  test('игра раньше следующей сводки — сразу (запись ночью на утро)', () => {
    expect(isUrgentForAdmins(at('2026-11-18T11:00:00'), at('2026-11-17T23:00:00'))).toBe(true);
  });
  test('игра в другой день — в сводку', () => {
    expect(isUrgentForAdmins(at('2026-11-18T18:00:00'), at('2026-11-17T13:00:00'))).toBe(false);
    expect(isUrgentForAdmins(at('2026-11-18T14:00:00'), at('2026-11-17T23:00:00'))).toBe(false);
    expect(isUrgentForAdmins(at('2026-11-22T16:00:00'), at('2026-11-17T13:00:00'))).toBe(false);
    expect(isUrgentForAdmins(null, at('2026-11-17T13:00:00'))).toBe(false);
  });
});
