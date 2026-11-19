// Кураторы направлений (17.11.2026): направление записи, доступ к разделам админки, получатели уведомлений.
import { describe, expect, test } from 'bun:test';
import { adminAreasOf, adminRecipientsFor, curatorAreasById, getBuiltinAdminIds, setAddedAdmins } from '../src/config/admin';
import { canSeeArea, cleanAreas, curatorRule, reservationArea } from '../src/config/admin-areas';

const R = '0b6c2f3e-1111-4c4c-9d9d-123456789abc';

describe('направление записи', () => {
  test('игры — по игре записи, старые записи без игры — 40K', () => {
    expect(reservationArea('wh_game', { kind: 'wh_player', game: 'kt' })).toBe('kt');
    expect(reservationArea('wh_group_training', { kind: 'wh_player', game: 'aos' })).toBe('aos');
    expect(reservationArea('wh_solo_training', { kind: 'wh_player' })).toBe('40k');
    expect(reservationArea('wh_game', null)).toBe('40k');
  });
  test('покраска, клуб, D&D, неизвестная услуга', () => {
    expect(reservationArea('wh_painting', { kind: 'painting' })).toBe('painting');
    expect(reservationArea('club_visit', null)).toBe('club');
    expect(reservationArea('dnd_game', null)).toBe('dnd');
    expect(reservationArea('wh_buy_army', null)).toBeNull();
  });
  test('видимость: полный доступ видит всё, куратор — только свои, неизвестное — никто из кураторов', () => {
    expect(canSeeArea(null, null)).toBe(true);
    expect(canSeeArea(['kt', 'warcry'], 'kt')).toBe(true);
    expect(canSeeArea(['kt', 'warcry'], '40k')).toBe(false);
    expect(canSeeArea(['kt'], null)).toBe(false);
    expect(cleanAreas(['kt', 'nope', 'dnd', 'kt'])).toEqual(['kt', 'dnd']);
    expect(cleanAreas('kt')).toEqual([]);
  });
});

describe('разделы админки для куратора', () => {
  test('свои записи и действия с ними', () => {
    expect(curatorRule('GET', '/admin/reservations')).toEqual({ kind: 'allow' });
    expect(curatorRule('GET', '/admin/reservations/count')).toEqual({ kind: 'allow' });
    expect(curatorRule('PATCH', `/admin/reservations/${R}/confirm`)).toEqual({ kind: 'reservation', id: R });
    expect(curatorRule('POST', `/admin/reservations/${R}/payments`)).toEqual({ kind: 'reservation', id: R });
    expect(curatorRule('DELETE', `/admin/reservations/discounts/${R}`)).toEqual({ kind: 'discount', id: R });
    expect(curatorRule('GET', `/admin/users/${R}`)).toEqual({ kind: 'allow' });
  });
  test('столы, D&D — по направлениям', () => {
    expect(curatorRule('GET', '/admin/warhammer/day')).toMatchObject({ kind: 'any' });
    expect(curatorRule('POST', '/admin/table-holds')).toMatchObject({ kind: 'any', areas: ['40k', 'aos', 'kt', 'warcry'] });
    expect(curatorRule('PATCH', '/admin/dnd/games/5')).toEqual({ kind: 'any', areas: ['dnd'] });
  });
  test('остальное — только полный доступ', () => {
    for (const [m, p] of [
      ['PUT', '/admin/pricing/services/1'],
      ['GET', '/admin/admins'],
      ['POST', '/admin/admins'],
      ['PUT', '/admin/admins/1/areas'],
      ['POST', '/admin/news'],
      ['GET', '/admin/users'],
      ['GET', '/admin/results'],
      ['POST', '/admin/broadcasts'],
      ['GET', '/admin/roster/codes'],
      ['GET', '/admin/dominatus/campaign'],
      ['POST', '/admin/minigames/rewards/1/redeem'],
    ] as const)
      expect(curatorRule(m, p)).toEqual({ kind: 'deny' });
  });
});

describe('получатели уведомлений', () => {
  test('полный доступ — всё; куратор — своё направление; общее — только полный доступ', () => {
    const builtin = getBuiltinAdminIds()[0]!;
    setAddedAdmins([
      { id: 111, areas: ['kt', 'warcry'] },
      { id: 222, areas: ['dnd'] },
      { id: 333, areas: [] },
      { id: Number(builtin), areas: ['dnd'] }, // основной администратор не может стать куратором
    ]);
    expect(adminRecipientsFor('kt')).toContain('111');
    expect(adminRecipientsFor('kt')).not.toContain('222');
    expect(adminRecipientsFor('kt')).toContain('333');
    expect(adminRecipientsFor('kt')).toContain(builtin);
    expect(adminRecipientsFor('dnd')).toContain('222');
    expect(adminRecipientsFor(null)).not.toContain('111');
    expect(adminRecipientsFor(null)).not.toContain('222');
    expect(adminRecipientsFor(null)).toContain('333');
    expect(adminAreasOf({ telegramId: 111 } as never)).toEqual(['kt', 'warcry']);
    expect(adminAreasOf({ telegramId: Number(builtin) } as never)).toBeNull();
    expect(curatorAreasById('333')).toBeNull();
    setAddedAdmins([]);
  });
});
