/**
 * Точная информация о записи во всех уведомлениях (20.11.2026, решение владельца): тип записи, игра, стол с типом,
 * время, состояние стола и кто за ним; сводка — по столам и времени.
 */
import { describe, expect, test } from 'bun:test';
import { bookingVars, tableLabel, tableState, whatOf } from '../src/modules/notifications/booking-vars';
import { changeLine, dayTotal, scheduleText, type SummaryRow } from '../src/modules/notifications/summary-format';
import { bookingNoticeText } from '../src/modules/booking/notify-text';

// пт, 20 ноября 2026, 18:00–21:00 по Екатеринбургу (UTC+5)
const at = new Date('2026-11-20T13:00:00Z');
const end = new Date('2026-11-20T16:00:00Z');
const row = (over: Partial<SummaryRow>): SummaryRow => ({
  id: 1,
  serviceId: 1,
  slug: 'wh_game',
  service: 'Игра Warhammer',
  startsAt: at,
  endsAt: end,
  tableId: 1,
  tableName: 'Стол 1',
  tableCategory: 'wh',
  partySize: 1,
  seats: 2,
  hasTrainer: false,
  firstName: 'Иван',
  lastName: null,
  username: 'ivan',
  details: { kind: 'wh_player', game: '40k', army: 'Orks', points: 2000, experienceLevel: 'player' },
  clubArmy: null,
  ...over,
});

describe('тип записи и стол', () => {
  test('whatOf: тип · игра', () => {
    const d = { kind: 'wh_player', game: 'kt', army: 'Kommandos', points: null, experienceLevel: 'player' } as const;
    expect(whatOf({ title: 'Игра Warhammer', slug: 'wh_game' }, d)).toBe('Игра · Kill Team');
    expect(whatOf({ title: 'x', slug: 'wh_group_training' }, { ...d, game: '40k' })).toBe('Групповая тренировка · Warhammer 40,000');
    expect(whatOf({ title: 'x', slug: 'wh_solo_training' }, { ...d, game: 'aos' })).toBe('Индивидуальная тренировка · Age of Sigmar');
    expect(whatOf({ title: 'Покраска миниатюр', slug: 'wh_painting' }, null)).toBe('Покраска');
    expect(whatOf({ title: 'x', slug: 'club_visit' }, null)).toBe('Посещение клуба');
  });

  test('tableLabel и bookingVars.стол — с типом стола', () => {
    expect(tableLabel('Стол 1', 'wh')).toBe('Стол 1 · полномасштабный варгейм');
    expect(tableLabel('Стол 3', 'small')).toBe('Стол 3 · тактические игры');
    expect(tableLabel(null, 'wh')).toBe('');
    expect(bookingVars({ service: { title: 'Игра', slug: 'wh_game' }, details: null, startsAt: at, endsAt: end, tableName: 'Стол 3', tableCategory: 'small' }).стол).toBe('Стол 3 · тактические игры');
  });

  test('tableState: соперник, собран, тренер, свободен', () => {
    expect(tableState(1, 2)).toBe('стол ждёт соперника (1/2)');
    expect(tableState(2, 2)).toBe('стол собран (2/2)');
    expect(tableState(1, 2, true)).toBe('есть места (1/2 + тренер)');
    expect(tableState(2, 2, true)).toBe('группа собрана (2/2 + тренер)');
    expect(tableState(1, 1, true)).toBe('1/1 + тренер');
    expect(tableState(0, 2)).toBe('стол свободен (0/2)');
    expect(tableState(1, 0)).toBe('');
  });
});

describe('сводка по столам и времени', () => {
  const day = [
    row({ id: 1 }),
    row({ id: 2, firstName: 'Сергей', username: null, details: { kind: 'wh_player', game: '40k', army: 'Necrons', points: 2000, experienceLevel: 'novice' } }),
    row({ id: 3, tableId: 3, tableName: 'Стол 3', tableCategory: 'small', firstName: 'Павел', username: null, clubArmy: [true], details: { kind: 'wh_player', game: 'kt', army: 'Kommandos', points: null, experienceLevel: 'player' } }),
    row({ id: 4, serviceId: 5, slug: 'wh_painting', service: 'Покраска', tableId: null, tableName: null, tableCategory: null, seats: 0, partySize: 2, firstName: 'Ольга', username: null, startsAt: new Date('2026-11-20T09:00:00Z'), endsAt: new Date('2026-11-20T12:00:00Z'), details: { kind: 'painting', faction: 'Necrons', model: 'Warriors', paintSource: 'club', needsHelp: true } }),
  ];

  test('группы: стол с типом и временем, тип · игра, состояние, игроки', () => {
    const t = scheduleText(day);
    const blocks = t.split('\n\n');
    expect(blocks).toHaveLength(3);
    // раньше всех — покраска в 14:00
    expect(blocks[0]).toContain('👥 <b>14:00–17:00</b>');
    expect(blocks[0]).toContain('Покраска — 2 человека');
    expect(blocks[0]).toContain('Ольга · 2 мест · Necrons: Warriors · нужна помощь');
    expect(blocks[1]).toContain('🎲 <b>18:00–21:00 · Стол 1 · полномасштабный варгейм</b>');
    expect(blocks[1]).toContain('Игра · Warhammer 40,000 — стол собран (2/2)');
    expect(blocks[1]).toContain('• Иван (@ivan) — Orks, 2000 очков');
    expect(blocks[1]).toContain('• Сергей — Necrons');
    expect(blocks[2]).toContain('Стол 3 · тактические игры');
    expect(blocks[2]).toContain('Игра · Kill Team — стол ждёт соперника (1/2)');
    expect(blocks[2]).toContain('команда клуба');
    expect(scheduleText([])).toBe('Записей нет.');
  });

  test('итог дня: записи, столы, без стола', () => {
    expect(dayTotal(day)).toBe('4 · столов: 2, без стола: 1');
    expect(dayTotal([])).toBe('0');
  });

  test('тренировка: + тренер', () => {
    const t = scheduleText([row({ slug: 'wh_group_training', hasTrainer: true })]);
    expect(t).toContain('Групповая тренировка · Warhammer 40,000 — есть места (1/2 + тренер)');
  });

  test('новая запись и отмена: тип, игра, стол, время, состояние стола и кто за ним', () => {
    const [a, b] = day;
    const added = changeLine(b!, [a!, b!]);
    expect(added).toMatch(/• пт, 20 ноября, 18:00–21:00 <b>Игра · Warhammer 40,000<\/b> · Стол 1 · полномасштабный варгейм — Сергей/);
    expect(added).toContain('сейчас: стол собран (2/2) · за столом: Иван (@ivan)');
    const cancelled = changeLine(b!, [a!]);
    expect(cancelled).toContain('сейчас: стол ждёт соперника (1/2) · за столом: Иван');
    expect(changeLine(b!, [])).toContain('сейчас: стол свободен (0/2)');
  });
});

test('мгновенное сообщение админу: тип · игра и + тренер в заголовке, стол с типом', () => {
  const t = bookingNoticeText({
    reason: 'created',
    serviceTitle: 'Групповая тренировка',
    serviceSlug: 'wh_group_training',
    hasTrainer: true,
    startsAt: at,
    endsAt: end,
    createdAt: at,
    tableName: tableLabel('Стол 1', 'wh'),
    user: { telegramId: 1, firstName: 'Иван' },
    partySize: 1,
    details: { kind: 'wh_player', game: '40k', army: 'Orks', points: 2000, experienceLevel: 'player' },
    table: { occupied: 1, seats: 2 },
  });
  expect(t.split('\n')[0]).toBe('♟ <b>Новая запись: Групповая тренировка · Warhammer 40,000 — есть места (1/2 + тренер)</b>');
  expect(t).toContain('Стол: Стол 1 · полномасштабный варгейм');
  expect(t).not.toContain('Услуга:');
});
