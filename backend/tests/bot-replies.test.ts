/** Ответы бота на команды (20.11.2026). */
import { describe, expect, test } from 'bun:test';
import { ADMIN_COMMANDS, USER_COMMANDS, clubHoursLine, parseCommand, replyFor, startPath } from '../src/modules/bot/replies';

describe('bot replies', () => {
  test('parseCommand: команда, @имя бота, параметр; не команда — null', () => {
    expect(parseCommand('/start')).toEqual({ command: 'start', arg: '' });
    expect(parseCommand('/book@WarpHubBot')).toEqual({ command: 'book', arg: '' });
    expect(parseCommand('/start my')).toEqual({ command: 'start', arg: 'my' });
    expect(parseCommand('привет')).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
  });

  test('часы клуба — из настроек записи', () => {
    expect(clubHoursLine({ allowedWeekdays: [5, 6, 7], openHour: 12, openHourByWeekday: { 5: 20 } })).toBe('пт с 20:00, сб–вс с 12:00');
    expect(clubHoursLine({ allowedWeekdays: [6], openHour: 12, openHourByWeekday: {} })).toBe('сб с 12:00');
  });

  test('/start: имя экранировано, кнопки в приложение; ссылка ?start=my — кнопка на «Мои записи»', () => {
    const r = replyFor('start', '', { firstName: '<Иван>', isAdmin: false })!;
    expect(r.text).toContain('Привет, &lt;Иван&gt;!');
    expect(r.buttons!.flat().map((b) => b.path ?? b.data)).toEqual(['/', '/reservations', 'club']);
    expect(replyFor('start', 'my', { isAdmin: false })!.buttons![0]![0]).toEqual({ text: 'Открыть в приложении', path: '/reservations' });
    expect(startPath('unknown')).toBeNull();
  });

  test('/club: группа и VK; /admin — только администраторам; неизвестная — null', () => {
    const club = replyFor('club', '', { isAdmin: false })!;
    expect(club.buttons!.flat().map((b) => b.url).filter(Boolean)).toEqual(['https://t.me/warpboysgirls', 'https://vk.ru/warpboysandgirls']);
    expect(replyFor('admin', '', { isAdmin: false })!.text).toContain('только для администраторов');
    expect(replyFor('admin', '', { isAdmin: true })!.buttons![0]![0]!.path).toBe('/admin');
    expect(replyFor('nope', '', { isAdmin: true })).toBeNull();
  });

  test('меню: у администратора — все команды пользователя плюс свои; описания до 256 символов, имена по правилам Telegram', () => {
    expect(ADMIN_COMMANDS.slice(0, USER_COMMANDS.length)).toEqual([...USER_COMMANDS]);
    for (const c of ADMIN_COMMANDS) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(256);
    }
    expect(replyFor('help', '', { isAdmin: true })!.text).toContain('/today');
    expect(replyFor('help', '', { isAdmin: false })!.text).not.toContain('/today');
  });
});
