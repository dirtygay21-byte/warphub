// Админка «Все записи» (13.11.2026): записи одной игры за столом собираются в группу.
import { describe, expect, test } from 'bun:test';
import { groupTableGames, tableGameKey } from '../src/modules/booking/rules';

const t = (h: number) => new Date(Date.UTC(2026, 10, 14, h));
const row = (id: string, o: Partial<{ serviceId: number; tableId: number | null; startsAt: Date | null; status: string }> = {}) => ({
  id,
  serviceId: 1,
  tableId: 3,
  startsAt: t(13),
  status: 'confirmed',
  ...o,
});

describe('groupTableGames', () => {
  test('одна услуга, один стол, одно начало — одна игра; порядок записей сохраняется', () => {
    const g = groupTableGames([row('a'), row('b', { status: 'pending' })]);
    expect([...g.values()].map((x) => x.map((r) => r.id))).toEqual([['a', 'b']]);
    expect([...g.keys()][0]).toBe(tableGameKey(1, 3, t(13)));
  });
  test('другой стол, другое время или другая услуга — разные игры', () => {
    const g = groupTableGames([row('a'), row('b', { tableId: 4 }), row('c', { startsAt: t(14) }), row('d', { serviceId: 2 })]);
    expect(g.size).toBe(4);
  });
  test('отменённые и записи без стола в игру не входят', () => {
    const g = groupTableGames([row('a'), row('b', { status: 'cancelled' }), row('c', { tableId: null })]);
    expect([...g.values()].flat().map((r) => r.id)).toEqual(['a']);
  });
  test('ключ не зависит от формы времени (Date или ISO-строка)', () => {
    expect(tableGameKey(1, 3, t(13))).toBe(tableGameKey(1, 3, t(13).toISOString()));
    expect(tableGameKey(1, null, t(13))).toBeNull();
  });
});
