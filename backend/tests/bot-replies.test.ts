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
    expect(r.buttons!.flat().map((b) => b.path ?? b.data)).toEqual(['/', 'my', 'games', 'club']);
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

describe('bot replies — записи, соперники, лига, WarpBuilder', () => {
  const at = new Date('2026-11-20T13:00:00Z');
  const booking = { id: 'r1', what: 'Игра · Kill Team', when: 'пт, 20 ноября, 18:00–21:00', startsAt: at, table: 'Стол 3 · тактические игры', state: 'стол собран (2/2)', mates: [{ firstName: 'Иван', username: 'ivan' }] };

  test('/my: тип и игра, стол с типом и состоянием, кто за столом; отмена — через подтверждение', async () => {
    const { myReply, cancelAskReply } = await import('../src/modules/bot/replies');
    const r = myReply([booking], { known: true });
    expect(r.text).toContain('<b>Игра · Kill Team</b>');
    expect(r.text).toContain('Стол: Стол 3 · тактические игры — стол собран (2/2)');
    expect(r.text).toContain('За столом: Иван (@ivan)');
    expect(r.buttons![0]![0]).toEqual({ text: 'Отменить 1: пт, 20 ноября, 18:00', data: 'cancel:r1' });
    expect(cancelAskReply(booking).buttons![0]!.map((b) => b.data)).toEqual(['cancelok:r1', 'cancelno']);
    expect(myReply([], { known: true }).text).toContain('Предстоящих записей нет');
    expect(myReply([], { known: false }).text).toContain('ещё не заходили');
  });

  test('/games, /league, /builder', async () => {
    const { gamesReply, leagueReply, builderReply, BOOSTY_URL } = await import('../src/modules/bot/replies');
    const g = gamesReply([{ when: 'пт, 20 ноября, 18:00–21:00', table: 'Стол 1 · полномасштабный варгейм', what: 'Игра Warhammer · Warhammer 40,000', state: 'стол ждёт соперника (1/2)', players: [{ firstName: 'Сергей', username: null, army: 'Orks' }] }]);
    expect(g.text).toContain('Ищут соперника (1)');
    expect(g.text).toContain('• Сергей — Orks');
    expect(gamesReply([]).text).toContain('никто не ищет');
    const l = leagueReply({ seasonLabel: 'Зима 2026', games: [{ gameLabel: 'Kill Team', games: 5, wins: 3, draws: 1, losses: 1, rating: 1532.4, rank: 2, players: 9 }] });
    expect(l.text).toContain('<b>Kill Team</b>: рейтинг 1532, место 2 из 9 · игр 5 (3–1–1)');
    expect(builderReply(true).buttons![0]![0]!.path).toBe('/roster');
    expect(builderReply(false).buttons![0]![0]!.url).toBe(BOOSTY_URL);
  });
});
