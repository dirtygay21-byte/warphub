// Система уведомлений (14.11.2026): шаблоны, тихие часы, настройки игрока, расписание рассылок — без базы.
import { describe, expect, test } from 'bun:test';
import { KIND_BY_ID, NOTIFICATION_KINDS, renderTemplate } from '../src/modules/notifications/catalog';
import { clubDateKey, clubWeekday, DEFAULT_CONFIG, DEFAULT_PREFS, inQuietHours, nextAllowedTime, prefAllows } from '../src/modules/notifications/hub';
import { BroadcastError, nextRun, validateBroadcast } from '../src/modules/notifications/broadcasts';

// 14.11.2026 — суббота; время клуба = UTC+5
const at = (local: string) => new Date(`${local}+05:00`);

describe('каталог и шаблоны', () => {
  test('у каждого типа — уникальный id, текст и примеры всех переменных из текста', () => {
    expect(new Set(NOTIFICATION_KINDS.map((k) => k.id)).size).toBe(NOTIFICATION_KINDS.length);
    for (const k of NOTIFICATION_KINDS) {
      const used = [...k.defaultText.matchAll(/\{([^{}\n]+)\}/g)].map((m) => m[1]!);
      for (const v of used) expect(Object.keys(k.vars)).toContain(v);
      expect(renderTemplate(k.defaultText, k.vars)).not.toMatch(/\{[^{}\n]+\}/);
    }
  });
  test('строка с пустой переменной убирается; неизвестная {переменная} остаётся видна', () => {
    const t = renderTemplate('A {x}\nСтол: {стол}\nB {нет}', { x: '1', стол: '' });
    expect(t).toBe('A 1\nB {нет}');
  });
  test('поиск соперника и объявления — с тихими часами, личные — без', () => {
    expect(KIND_BY_ID.get('match_new')).toMatchObject({ category: 'match', announcement: true });
    expect(KIND_BY_ID.get('booking_created')).toMatchObject({ category: null, announcement: false });
  });
});

describe('время клуба и тихие часы (23:00–10:00)', () => {
  test('ночью и до 10:00 — тихо, днём — нет', () => {
    expect(inQuietHours(at('2026-11-14T23:30:00'), DEFAULT_CONFIG)).toBe(true);
    expect(inQuietHours(at('2026-11-14T09:59:00'), DEFAULT_CONFIG)).toBe(true);
    expect(inQuietHours(at('2026-11-14T10:00:00'), DEFAULT_CONFIG)).toBe(false);
    expect(inQuietHours(at('2026-11-14T15:00:00'), DEFAULT_CONFIG)).toBe(false);
  });
  test('ночью объявление ждёт 10:00 того же или следующего утра', () => {
    expect(nextAllowedTime(at('2026-11-14T03:00:00'), DEFAULT_CONFIG).toISOString()).toBe(at('2026-11-14T10:00:00').toISOString());
    expect(nextAllowedTime(at('2026-11-14T23:30:00'), DEFAULT_CONFIG).toISOString()).toBe(at('2026-11-15T10:00:00').toISOString());
    const day = at('2026-11-14T15:00:00');
    expect(nextAllowedTime(day, DEFAULT_CONFIG)).toBe(day);
  });
  test('дата и день недели — по времени клуба', () => {
    expect(clubDateKey(at('2026-11-14T01:00:00'))).toBe('2026-11-14');
    expect(clubWeekday(at('2026-11-14T12:00:00'))).toBe(6);
  });
});

describe('настройки игрока', () => {
  test('поиск соперника — только по включённым играм; по умолчанию выключен', () => {
    expect(prefAllows(DEFAULT_PREFS, 'match', '40k')).toBe(false);
    expect(prefAllows({ ...DEFAULT_PREFS, opponentGames: ['40k'] }, 'match', '40k')).toBe(true);
    expect(prefAllows({ ...DEFAULT_PREFS, opponentGames: ['40k'] }, 'match', 'aos')).toBe(false);
  });
  test('новости, ивенты, акции — включены по умолчанию; накануне — выключено; личные — всегда', () => {
    expect(prefAllows(DEFAULT_PREFS, 'news')).toBe(true);
    expect(prefAllows({ ...DEFAULT_PREFS, news: false }, 'news')).toBe(false);
    expect(prefAllows(DEFAULT_PREFS, 'eve')).toBe(false);
    expect(prefAllows({ ...DEFAULT_PREFS, news: false, events: false, promos: false }, null)).toBe(true);
  });
});

describe('расписание рассылок', () => {
  const now = at('2026-11-14T12:00:00'); // суббота
  test('один раз — в заданное время; прошедшее — нет запуска', () => {
    expect(nextRun({ type: 'once', at: at('2026-11-20T18:00:00').toISOString() }, now)?.toISOString()).toBe(at('2026-11-20T18:00:00').toISOString());
    expect(nextRun({ type: 'once', at: at('2026-11-10T18:00:00').toISOString() }, now)).toBeNull();
  });
  test('каждую пятницу в 12:00 — ближайшая пятница; сегодня позже — сегодня', () => {
    expect(nextRun({ type: 'weekly', days: [5], time: '12:00' }, now)?.toISOString()).toBe(at('2026-11-20T12:00:00').toISOString());
    expect(nextRun({ type: 'weekly', days: [6], time: '18:30' }, now)?.toISOString()).toBe(at('2026-11-14T18:30:00').toISOString());
  });
  test('до даты окончания включительно, потом — конец', () => {
    expect(nextRun({ type: 'weekly', days: [5], time: '12:00', until: '2026-11-19' }, now)).toBeNull();
  });
  test('раз в месяц: 31-е в коротком месяце — последний день', () => {
    expect(nextRun({ type: 'monthly', day: 31, time: '10:00' }, at('2026-11-14T12:00:00'))?.toISOString()).toBe(at('2026-11-30T10:00:00').toISOString());
  });
  test('проверка формы: пустой текст, кнопка без ссылки, http-ссылка, время', () => {
    const ok = { title: 'T', text: 'Текст', audience: { kind: 'all' as const }, schedule: { type: 'now' as const } };
    expect(() => validateBroadcast(ok)).not.toThrow();
    expect(() => validateBroadcast({ ...ok, text: ' ' })).toThrow(BroadcastError);
    expect(() => validateBroadcast({ ...ok, buttons: [{ text: 'Открыть' }] })).toThrow(BroadcastError);
    expect(() => validateBroadcast({ ...ok, buttons: [{ text: 'Сайт', url: 'http://x.ru' }] })).toThrow(BroadcastError);
    expect(() => validateBroadcast({ ...ok, schedule: { type: 'weekly', days: [5], time: '25:00' } })).toThrow(BroadcastError);
  });
});
