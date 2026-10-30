import { describe, expect, test } from 'bun:test';
import { categoryOfService, dndBookingCounts, progressOf, rankOf, reservationCounts } from '../src/modules/progress/rules';

const now = new Date('2026-11-01T12:00:00Z');
const past = new Date('2026-10-31T12:00:00Z');
const future = new Date('2026-11-02T12:00:00Z');

describe('прогресс игрока', () => {
  test('ранги: 0–4, 5–14, 15–39, 40+', () => {
    expect([0, 4, 5, 14, 15, 39, 40, 120].map((n) => progressOf('warhammer', n).rank)).toEqual([
      'beginner', 'beginner', 'player', 'player', 'experienced', 'experienced', 'veteran', 'veteran',
    ]);
    expect(progressOf('dnd', 7)).toMatchObject({ rankLabel: 'Игрок', nextAt: 15, nextLabel: 'Опытный' });
    expect(progressOf('dnd', 41)).toMatchObject({ nextAt: null, nextLabel: null });
    expect(rankOf(-1)).toBe(0);
  });
  test('категории услуг', () => {
    expect(categoryOfService('wh_game')).toBe('warhammer');
    expect(categoryOfService('wh_solo_training')).toBe('warhammer');
    expect(categoryOfService('wh_painting')).toBe('painting');
    expect(categoryOfService('club_visit')).toBe('visits');
    expect(categoryOfService('something_else')).toBeNull();
  });
  test('запись: только подтверждённая и прошедшая', () => {
    expect(reservationCounts({ status: 'confirmed', startsAt: past, endsAt: past }, now)).toBe(true);
    expect(reservationCounts({ status: 'confirmed', startsAt: past, endsAt: future }, now)).toBe(false);
    expect(reservationCounts({ status: 'pending', startsAt: past, endsAt: past }, now)).toBe(false);
    expect(reservationCounts({ status: 'cancelled', startsAt: past, endsAt: past }, now)).toBe(false);
  });
  test('D&D: прошедшая игра; без времени — когда закрыта; отмена не считается', () => {
    expect(dndBookingCounts({ status: 'active', gameStatus: 'open', startsAt: past, endsAt: past }, now)).toBe(true);
    expect(dndBookingCounts({ status: 'active', gameStatus: 'open', startsAt: future, endsAt: null }, now)).toBe(false);
    expect(dndBookingCounts({ status: 'active', gameStatus: 'closed', startsAt: null, endsAt: null }, now)).toBe(true);
    expect(dndBookingCounts({ status: 'active', gameStatus: 'open', startsAt: null, endsAt: null }, now)).toBe(false);
    expect(dndBookingCounts({ status: 'cancelled', gameStatus: 'closed', startsAt: past, endsAt: past }, now)).toBe(false);
    expect(dndBookingCounts({ status: 'active', gameStatus: 'cancelled', startsAt: past, endsAt: past }, now)).toBe(false);
  });
});
