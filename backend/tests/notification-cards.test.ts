import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NOTIFICATION_KINDS, renderTemplate } from '../src/modules/notifications/catalog';
import { cardCaption, parseNotificationCard } from '../src/modules/notifications/card/parse';
import { CARD_STYLES, renderCardPng } from '../src/modules/notifications/card/render';

describe('карточка уведомления: разбор текста (14.11.2026)', () => {
  test('заголовок «Метка: игра» → надзаголовок и крупный заголовок; строки 🗓 / 🎲 и «Метка: значение»', () => {
    const card = parseNotificationCard('✅ <b>Вы записаны: Kill Team</b>\n🗓 сб, 15 ноября, 18:00–21:00\n🎲 Стол 1\nКоманда: Kommandos (Orks)\n\nПосмотреть или отменить запись — в приложении, раздел «Записи».');
    expect(card).toMatchObject({ kicker: 'Вы записаны', title: 'Kill Team', tone: 'accent' });
    expect(card.blocks).toEqual([{ type: 'rows', rows: [
      { label: 'Когда', value: 'сб, 15 ноября, 18:00–21:00' },
      { label: 'Стол', value: 'Стол 1' },
      { label: 'Команда', value: 'Kommandos (Orks)' },
    ] }]);
    expect(card.note).toContain('в приложении');
  });
  test('подзаголовок из « — …» и «(…)», цвет по эмодзи', () => {
    expect(parseNotificationCard('❌ <b>Отмена: Age of Sigmar</b> (отменил игрок)')).toMatchObject({ kicker: 'Отмена', title: 'Age of Sigmar', subtitle: 'отменил игрок', tone: 'danger' });
    expect(parseNotificationCard('♟ <b>Новая запись: Kill Team — стол ждёт соперника (1/2)</b>')).toMatchObject({ title: 'Kill Team', subtitle: 'стол ждёт соперника (1/2)' });
    expect(parseNotificationCard('⏰ <b>Скоро игра: Warhammer 40,000</b>').tone).toBe('warn');
  });
  test('жирная строка — заголовок блока, «• …» — список, HTML и эмодзи убраны', () => {
    const card = parseNotificationCard('☀️ <b>Сегодня в клубе</b>\nЗаписей: 5\n\n<b>Соперник</b>\n• 18:00 <b>Kill Team</b> — Иван &amp; Ко ⏳\n• 19:00 AoS');
    expect(card.title).toBe('Сегодня в клубе');
    expect(card.blocks).toEqual([
      { type: 'rows', rows: [{ label: 'Записей', value: '5' }] },
      { type: 'heading', text: 'Соперник' },
      { type: 'list', items: ['18:00 Kill Team — Иван & Ко', '19:00 AoS'] },
    ]);
  });
  test('подпись — первые две строки', () => {
    expect(cardCaption('✅ <b>Вы записаны: Kill Team</b>\n🗓 сб, 15 ноября\n🎲 Стол 1')).toBe('✅ <b>Вы записаны: Kill Team</b>\n🗓 сб, 15 ноября');
  });
});

describe('карточка уведомления: PNG по всем стандартным текстам', () => {
  const out = process.env.CARD_SAMPLES_DIR;
  if (out) mkdirSync(out, { recursive: true });
  for (const kind of NOTIFICATION_KINDS) {
    test(kind.id, async () => {
      const text = renderTemplate(kind.defaultText, kind.vars);
      const png = await renderCardPng(parseNotificationCard(text, kind.title), 'date-compact');
      expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(png.length).toBeGreaterThan(10_000);
      if (out) writeFileSync(`${out}/${kind.id}.png`, png);
    }, 20_000);
  }
});

describe('карточка уведомления: варианты оформления на одном примере (15.11.2026)', () => {
  const out = process.env.CARD_SAMPLES_DIR;
  const kind = NOTIFICATION_KINDS.find((k) => k.id === 'admin_booking')!;
  for (const style of CARD_STYLES) {
    test(style, async () => {
      const png = await renderCardPng(parseNotificationCard(renderTemplate(kind.defaultText, kind.vars), kind.title), style);
      expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      if (out) writeFileSync(`${out}/style-${style}.png`, png);
    }, 20_000);
  }
});
