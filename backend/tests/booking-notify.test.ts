/**
 * Уведомление администраторам о записи (N1): одно полное сообщение — что, когда, кто, все варианты.
 * И понятные причины, если бот не может написать (проверка уведомлений из админки).
 */
import { describe, expect, test } from 'bun:test';
import { bookingNoticeText, type BookingNotice } from '../src/modules/booking/notify-text';
import { describeSendResult } from '../src/lib/telegram/format';

// сб, 25 октября 2026, 18:00–21:00 по Екатеринбургу (UTC+5)
const base: BookingNotice = {
  reason: 'created',
  serviceTitle: 'Игра Warhammer 40,000',
  startsAt: new Date('2026-10-25T13:00:00Z'),
  endsAt: new Date('2026-10-25T16:00:00Z'),
  createdAt: new Date('2026-10-23T22:47:00Z'),
  tableName: 'Стол 3',
  user: { telegramId: 123456789, firstName: 'Иван', lastName: 'Петров', username: 'ivan' },
  partySize: 1,
  details: { kind: 'wh_player', army: 'Orks', points: 2000, experienceLevel: 'player' },
  table: { occupied: 1, seats: 2 },
};

describe('bookingNoticeText', () => {
  test('игра за столом: вид, дата и время, стол, кто с Telegram ID, армия, очки, опыт, когда оформлено', () => {
    const t = bookingNoticeText(base);
    expect(t).toContain('Новая запись: Игра Warhammer 40,000 — стол ждёт соперника (1/2)');
    expect(t).toMatch(/Когда: .*25 октября, 18:00–21:00/);
    expect(t).toContain('Стол: Стол 3');
    expect(t).toContain('Кто: Иван Петров (@ivan) · Telegram ID: 123456789');
    expect(t).toContain('Армия: Orks');
    expect(t).toContain('Очки: 2000');
    expect(t).toContain('Опыт: Игрок');
    expect(t).toMatch(/Оформлено: .*24 октября, 03:47/);
    expect(t).not.toContain('Мест:');
  });

  test('стол собран', () => {
    expect(bookingNoticeText({ ...base, table: { occupied: 2, seats: 2 } })).toContain('стол собран (2/2)');
  });

  test('без стола (посещение клуба): заголовок «Новая запись», места, армия клуба', () => {
    const t = bookingNoticeText({
      ...base,
      serviceTitle: 'Посещение клуба',
      tableName: null,
      table: null,
      details: null,
      partySize: 3,
      seatClubArmyOptions: [true, false, true],
    });
    expect(t.split('\n')[0]).toBe('📅 <b>Новая запись: Посещение клуба</b>');
    expect(t).toContain('Мест: 3');
    expect(t).toContain('Армия клуба: 2 из 3 мест');
    expect(t).not.toContain('Стол:');
  });

  test('покраска: все поля формы и «нужна помощь»; отдельное сообщение, если помощь отметили позже', () => {
    const painting: BookingNotice = {
      ...base,
      serviceTitle: 'Покраска',
      tableName: null,
      table: null,
      partySize: 2,
      buyArmyOptions: [true, false],
      details: { kind: 'painting', faction: 'Necrons', model: 'Warriors', paintSource: 'club', needsHelp: false, comment: 'Первый раз <3' },
    };
    const t = bookingNoticeText(painting);
    expect(t).toContain('Фракция: Necrons');
    expect(t).toContain('Модель: Warriors');
    expect(t).toMatch(/Краски: \S/);
    expect(t).toContain('Нужна помощь: нет');
    expect(t).toContain('Комментарий: Первый раз &lt;3');
    expect(t).toContain('Покупка армии: 1 из 2 мест');
    const help = bookingNoticeText({ ...painting, reason: 'help-requested', details: { ...painting.details!, needsHelp: true } as BookingNotice['details'] });
    expect(help.split('\n')[0]).toBe('🎨 <b>Покраска: нужна помощь</b>');
    expect(help).toContain('Нужна помощь: да');
  });

  test('HTML экранируется в названиях и именах', () => {
    const t = bookingNoticeText({ ...base, serviceTitle: 'A&B', user: { ...base.user, firstName: '<b>X</b>', username: null } });
    expect(t).toContain('A&amp;B');
    expect(t).toContain('&lt;b&gt;X&lt;/b&gt;');
  });
});

describe('describeSendResult', () => {
  test('доставлено и каждая причина отказа объяснена по-русски', () => {
    expect(describeSendResult({ ok: true }).ok).toBe(true);
    expect(describeSendResult({ ok: false, reason: 'disabled' }).message).toContain('TELEGRAM_NOTIFICATIONS=off');
    expect(describeSendResult({ ok: false, reason: 'network', description: 'timeout' }).message).toContain('api.telegram.org');
    expect(describeSendResult({ ok: false, reason: 'telegram', status: 403, description: 'Forbidden: bot was blocked by the user' }).message).toContain('«Старт»');
    expect(describeSendResult({ ok: false, reason: 'telegram', status: 401 }).message).toContain('TELEGRAM_BOT_TOKEN');
    expect(describeSendResult({ ok: false, reason: 'telegram', status: 400 }).message).toContain('отклонил');
  });
});

describe('ограниченное время (B1)', () => {
  test('запись короче полной длительности — строка «Ограниченное время»', () => {
    const t = bookingNoticeText({ ...base, endsAt: new Date('2026-10-25T16:00:00Z'), fullMinutes: 240 });
    expect(t).toContain('Ограниченное время: 3 ч вместо 4 ч');
    expect(t).toMatch(/18:00–21:00/);
    expect(bookingNoticeText({ ...base, startsAt: new Date('2026-10-25T13:00:00Z'), endsAt: new Date('2026-10-25T17:00:00Z'), fullMinutes: 240 })).not.toContain('Ограниченное');
  });
});
