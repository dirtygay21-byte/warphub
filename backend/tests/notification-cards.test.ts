import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NOTIFICATION_KINDS, renderTemplate } from '../src/modules/notifications/catalog';
import { cardCaption, parseNotificationCard } from '../src/modules/notifications/card/parse';
import { CARD_H, CARD_W, factValue, renderCardPng, shortGames, titleFit } from '../src/modules/notifications/card/render';

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
  test('подпись — весь текст; длинный обрезается по строкам до 1024', () => {
    expect(cardCaption('✅ <b>Вы записаны: Kill Team</b>\n🗓 сб, 15 ноября\n🎲 Стол 1')).toBe('✅ <b>Вы записаны: Kill Team</b>\n🗓 сб, 15 ноября\n🎲 Стол 1');
    const long = cardCaption(['<b>Заголовок</b>', ...Array.from({ length: 80 }, (_, i) => `• строка номер ${i} <b>жирная</b>`)].join('\n'));
    expect(long.length).toBeLessThanOrEqual(1024);
    expect(long.startsWith('<b>Заголовок</b>')).toBe(true);
    expect(long.endsWith('</b>')).toBe(true);
  });
});

describe('карточка результата лиги (этап 3b)', () => {
  test('победа: PNG 1280×720 с рейтингом', async () => {
    const { buildResultCard } = await import('../src/modules/league/card');
    const card = buildResultCard({ result: 'win', gameLabel: 'Warhammer 40,000', when: 'сб, 15 ноября', opponent: 'Иван Петров', season: '2026-Q4', rating: { rating: 1016, delta: 16 } });
    expect(card.kicker).toBe('Победа · IV квартал 2026');
    expect(card.title).toBe('Warhammer 40K');
    const png = await renderCardPng(card);
    expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const out = process.env.CARD_SAMPLES_DIR;
    if (out) (mkdirSync(out, { recursive: true }), writeFileSync(`${out}/league-result.png`, png));
  }, 20_000);
});

describe('карточка для сообщений вне каталога (16.11.2026: картинка на каждое уведомление)', () => {
  const samples: [string, string][] = [
    ['reward', '🎁 <b>Награда: Скидка 3%</b>\nИгра: Рой: инкубатор\nКод: <code>WH-7M28QP</code>\nДействует до: вс, 30 ноября, 04:25\nПокажите код администратору в клубе.'],
    ['legendary', '🌟 <b>Легендарная карта: Пылающий страж</b>\nНачислено: +1000 очков\nСчёт: 2400 очков'],
    ['points', '💠 <b>Начислено 150 очков</b>\nПричина: турнир\nСчёт: 1650 очков'],
    ['promo', '🎁 <b>Промокод: скидка 25%</b>\nНакоплено: 3 000 очков\nКод: <code>WH-25-AB12</code>\nДействует до: 30.11.2026'],
    ['moved', '🔁 <b>Новый стол: Игра Warhammer</b>\n🗓 сб, 15 ноября, 18:00–21:00\nАдминистратор пересадил вас за другой стол.\nВремя игры не изменилось. Подробности — в разделе «Мои записи».'],
    ['dnd-admin', '🐉 <b>D&D: новая запись на игру</b>\nЗатерянный храм — чт, 20 ноября, 18:00\nИгрок: Иван Петров (@ivan)\nМест: 2\nЗанято: 4/5'],
  ];
  for (const [name, text] of samples) {
    test(name, async () => {
      const { cardTitleOf } = await import('../src/modules/notifications/card/index');
      const png = await renderCardPng(parseNotificationCard(text, cardTitleOf(name === 'dnd-admin' ? 'admin' : 'user').title));
      expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      const out = process.env.CARD_SAMPLES_DIR;
      if (out) (mkdirSync(out, { recursive: true }), writeFileSync(`${out}/extra-${name}.png`, png));
    }, 20_000);
  }
  test('тип вне каталога получает заголовок, рассылки — тоже', async () => {
    const { cardTitleOf } = await import('../src/modules/notifications/card/index');
    expect(cardTitleOf('admin').title).toBe('Администраторам');
    expect(cardTitleOf('user').title).toBe('WarpHub');
    expect(cardTitleOf('broadcast:12').title).toBe('WarpHub');
    expect(cardTitleOf('opponent_joined').id).toBe('opponent_joined');
  });
});

describe('карточка уведомления: PNG по всем стандартным текстам', () => {
  const out = process.env.CARD_SAMPLES_DIR;
  if (out) mkdirSync(out, { recursive: true });
  for (const kind of NOTIFICATION_KINDS) {
    test(kind.id, async () => {
      const text = renderTemplate(kind.defaultText, kind.vars);
      const png = await renderCardPng(parseNotificationCard(text, kind.title));
      expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(png.length).toBeGreaterThan(10_000);
      // один размер для всех (15.11.2026): ширина и высота из заголовка PNG
      const view = new DataView(png.buffer, png.byteOffset);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([CARD_W, CARD_H]);
      if (out) writeFileSync(`${out}/${kind.id}.png`, png);
    }, 20_000);
  }
});

test('карточка: много данных и длинный текст — тот же размер (15.11.2026)', async () => {
  const text = [
    '☀️ <b>Сегодня в клубе</b>',
    'Записей: 12 · ждут подтверждения: 5',
    ...Array.from({ length: 9 }, (_, i) => `• ${14 + i}:00 <b>Kill Team</b> — Игрок с очень длинным именем ${i} (@player${i}), Kommandos, Новичок ⏳`),
    'Очень длинная подсказка внизу карточки, которая повторяется. '.repeat(6) + 'в приложении',
  ].join('\n');
  const png = await renderCardPng(parseNotificationCard(text, 'Сводка'));
  const view = new DataView(png.buffer, png.byteOffset);
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([CARD_W, CARD_H]);
  const out = process.env.CARD_SAMPLES_DIR;
  if (out) writeFileSync(`${out}/stress.png`, png);
}, 20_000);

describe('анимированная карточка (GIF, 15.11.2026)', () => {
  const out = process.env.CARD_SAMPLES_DIR;
  for (const id of ['booking_created', 'reminder_3h', 'booking_cancelled_admin']) {
    test(id, async () => {
      const { renderCardGif, GIF_W } = await import('../src/modules/notifications/card/render');
      const kind = NOTIFICATION_KINDS.find((k) => k.id === id)!;
      const gif = await renderCardGif(parseNotificationCard(renderTemplate(kind.defaultText, kind.vars), kind.title));
      expect(new TextDecoder().decode(gif.slice(0, 6))).toBe('GIF89a');
      const view = new DataView(gif.buffer, gif.byteOffset);
      expect([view.getUint16(6, true), view.getUint16(8, true)]).toEqual([GIF_W, GIF_W * 9 / 16]);
      expect(gif.length).toBeLessThan(5_000_000);
      console.log(`gif ${id}: ${gif.length} bytes`);
      if (out) writeFileSync(`${out}/anim-${id}.gif`, gif);
    }, 60_000);
  }
});

test('факт на картинке — главная часть значения, без «—…» (15.11.2026)', () => {
  expect(factValue('Иван Петров (@ivan) — Kommandos, Игрок')).toBe('Иван Петров (@ivan)');
  expect(factValue('5 · ждут подтверждения: 2')).toBe('5');
  expect(factValue('Константин Константинопольский (@konstantin)')).toBe('Константин');
  expect(factValue('Стол 1')).toBe('Стол 1');
  for (const v of ['Иван Петров (@ivan) — Kommandos, Игрок', 'Очень-очень-длинное-значение-без-пробелов']) expect(factValue(v)).not.toContain('…');
});

test('анимация MP4 (H.264) — чёткая, 1280×720 (15.11.2026)', async () => {
  const { renderCardMp4 } = await import('../src/modules/notifications/card/render');
  const kind = NOTIFICATION_KINDS.find((k) => k.id === 'booking_created')!;
  const mp4 = await renderCardMp4(parseNotificationCard(renderTemplate(kind.defaultText, kind.vars), kind.title));
  expect(new TextDecoder().decode(mp4.slice(4, 8))).toBe('ftyp');
  expect(mp4.length).toBeLessThan(5_000_000);
  console.log(`mp4 booking_created: ${mp4.length} bytes`);
  const out = process.env.CARD_SAMPLES_DIR;
  if (out) writeFileSync(`${out}/anim-booking_created.mp4`, mp4);
}, 120_000);

describe('заголовок карточки по ширине (17.11.2026: «WARHAMMER 40,000» наезжал на дату)', () => {
  test('на картинке — Warhammer 40K, одной строкой', () => {
    expect(shortGames('Warhammer 40,000')).toBe('Warhammer 40K');
    expect(shortGames('Новая запись: Warhammer 40,000 — стол')).toBe('Новая запись: Warhammer 40K — стол');
    expect(titleFit('Warhammer 40K').lines).toBe(1);
    expect(titleFit('Age of Sigmar').lines).toBe(1);
    expect(titleFit('Индивидуальная тренировка').size).toBeGreaterThanOrEqual(60);
    const long = titleFit('Очень длинное название услуги для проверки переноса');
    expect(long.lines).toBe(2);
    expect(long.size).toBeLessThanOrEqual(72);
  });
  const samples: [string, string][] = [
    ['admin-new-40k', '♟ <b>Новая запись: Warhammer 40,000 — стол ждёт соперника (1/2)</b>\nУслуга: Сыграть\nКогда: пт, 20 ноября, 20:00–00:00\nСтол: Стол 1\nКто: Егор Коренев (@KorenevEgor) · Telegram ID: 1\nИгра: Warhammer 40,000\nАрмия: Agents of the Imperium\nОчки: 1500\nОпыт: Новичок'],
    ['admin-new-aos', '♟ <b>Новая запись: Age of Sigmar — стол собран (2/2)</b>\nУслуга: Сыграть\nКогда: воскресенье, 22 ноября, 16:00–19:00\nСтол: Стол 2\nИгра: Age of Sigmar'],
    ['admin-new-training', '♟ <b>Новая запись: Индивидуальная тренировка</b>\nКогда: сб, 21 ноября, 12:00–13:30\nСтол: Стол 2\nИгра: Warhammer 40,000'],
  ];
  for (const [name, text] of samples) {
    test(name, async () => {
      const png = await renderCardPng(parseNotificationCard(text, 'Администраторам'));
      expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      const out = process.env.CARD_SAMPLES_DIR;
      if (out) (mkdirSync(out, { recursive: true }), writeFileSync(`${out}/${name}.png`, png));
    }, 20_000);
  }
});

describe('цвет D&D (17.11.2026)', () => {
  test('D&D — фиолетовый, отмена и перенос — как у всех', () => {
    expect(parseNotificationCard('🐉 <b>D&D: новая запись на игру</b>\nИгра: Шахты').tone).toBe('dnd');
    expect(parseNotificationCard('🎲 <b>Новая игра D&amp;D</b>').tone).toBe('dnd');
    expect(parseNotificationCard('❌ <b>Игра D&D отменена</b>').tone).toBe('danger');
    expect(parseNotificationCard('🕒 <b>Игра D&D перенесена</b>').tone).toBe('warn');
    expect(parseNotificationCard('♟ <b>Новая запись: Kill Team</b>').tone).toBe('accent');
  });
});
