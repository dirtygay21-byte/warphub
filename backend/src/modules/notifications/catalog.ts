/**
 * Каталог уведомлений WarpHub (14.11.2026). Каждый тип: кому, когда, стандартный текст и переменные.
 * Текст — HTML Telegram (<b>, <i>, <a>). Переменные в фигурных скобках подставляет сервер; строка, в которой
 * переменная оказалась пустой, убирается целиком (например «Стол: {стол}» у записи без стола).
 * Владелец меняет текст и включает / выключает тип в админке («Уведомления → Автоматические»).
 */

/** Категория объявления — что игрок может выключить в профиле; null — личное уведомление (о своих записях). */
export type NotificationCategory = 'match' | 'news' | 'events' | 'promos' | 'eve' | null;

export type NotificationGroup = 'bookings' | 'match' | 'content' | 'engagement' | 'admin';

export type NotificationKind = {
  id: string;
  group: NotificationGroup;
  title: string;
  /** кому и когда приходит — для админки */
  when: string;
  category: NotificationCategory;
  /** объявление: тихие часы и дневной лимит */
  announcement: boolean;
  defaultText: string;
  /** переменные и пример значения (для подсказки и тестовой отправки) */
  vars: Record<string, string>;
};

const BOOKING_VARS = { услуга: 'Игра Warhammer', когда: 'сб, 15 ноября, 18:00–21:00', стол: 'Стол 1' };

export const NOTIFICATION_KINDS: NotificationKind[] = [
  // A. Мои записи — личные, всегда включены у игрока
  {
    id: 'booking_created',
    group: 'bookings',
    title: 'Вы записаны',
    when: 'Игроку сразу после записи (администратор получает своё сообщение)',
    category: null,
    announcement: false,
    defaultText:
      '✅ <b>Вы записаны: {услуга}</b>\nКогда: {когда}\nСтол: {стол}\n{стол_статус}\nОтменить или посмотреть запись — в приложении, раздел «Записи».',
    vars: { ...BOOKING_VARS, стол_статус: 'Стол ждёт соперника — напишем, когда он запишется.' },
  },
  {
    id: 'booking_confirmed',
    group: 'bookings',
    title: 'Запись подтверждена',
    when: 'Игроку, когда администратор подтвердил запись',
    category: null,
    announcement: false,
    defaultText: '👍 <b>Запись подтверждена: {услуга}</b>\nКогда: {когда}\nСтол: {стол}\nЖдём вас в клубе!',
    vars: BOOKING_VARS,
  },
  {
    id: 'opponent_joined',
    group: 'bookings',
    title: 'К игре присоединился соперник',
    when: 'Игрокам за столом, когда записался ещё один',
    category: null,
    announcement: false,
    defaultText: '⚔️ <b>К вашей игре присоединился соперник!</b>\n{услуга} — {когда}\n{соперник}',
    vars: { ...BOOKING_VARS, соперник: 'Игрок: Иван Петров (@ivan)\nИгра: Warhammer 40,000\nАрмия: Orks\nОчки: 2000\nОпыт: Игрок' },
  },
  {
    id: 'opponent_cancelled',
    group: 'bookings',
    title: 'Соперник отменил запись',
    when: 'Оставшимся игрокам за столом',
    category: null,
    announcement: false,
    defaultText: 'ℹ️ <b>Соперник отменил запись</b>\n{услуга} — {когда}\nВаша запись сохранена, место за столом снова свободно.',
    vars: BOOKING_VARS,
  },
  {
    id: 'booking_cancelled_admin',
    group: 'bookings',
    title: 'Запись отменена администратором',
    when: 'Игроку, когда администратор отклонил или отменил запись',
    category: null,
    announcement: false,
    defaultText: '❌ <b>Ваша запись отменена администратором</b>\n{услуга} — {когда}',
    vars: BOOKING_VARS,
  },
  {
    id: 'booking_time_changed',
    group: 'bookings',
    title: 'Время записи изменено',
    when: 'Игроку, когда администратор продлил или изменил время',
    category: null,
    announcement: false,
    defaultText: '🕒 <b>Время записи изменено: {услуга}</b>\nТеперь: {когда}\nСтол: {стол}',
    vars: BOOKING_VARS,
  },
  {
    id: 'reminder_3h',
    group: 'bookings',
    title: 'Напоминание за 3 часа',
    when: 'Игроку за 3 часа до начала',
    category: null,
    announcement: false,
    defaultText:
      '⏰ <b>Напоминание: {услуга}</b>\nКогда: {когда}\nСтол: {стол}\nСоперник: {соперник}\n{ждёт_подтверждения}\nНе получается прийти — отмените запись в приложении, раздел «Записи».',
    vars: { ...BOOKING_VARS, соперник: 'Иван Петров (@ivan)', ждёт_подтверждения: 'Запись ещё ждёт подтверждения администратора.' },
  },
  {
    id: 'reminder_eve',
    group: 'bookings',
    title: 'Напоминание накануне',
    when: 'Игроку вечером (с 19:00) накануне — если включил в профиле',
    category: 'eve',
    announcement: false,
    defaultText: '🌙 <b>Завтра: {услуга}</b>\nКогда: {когда}\nСтол: {стол}\nСоперник: {соперник}',
    vars: { ...BOOKING_VARS, соперник: 'Иван Петров (@ivan)' },
  },

  // B. Поиск соперника — по играм, которые игрок включил сам
  {
    id: 'match_new',
    group: 'match',
    title: 'Игрок ищет соперника',
    when: 'Подписчикам игры, когда кто-то записался за стол и место свободно',
    category: 'match',
    announcement: true,
    defaultText: '🎲 <b>Ищут соперника: {игра}</b>\n{игрок}\n{армия}\nОпыт: {опыт}\nКогда: {когда}\nСтол: {стол}\nХочешь сыграть? Запишись на эту игру в приложении.',
    vars: { игра: 'Warhammer 40,000', игрок: 'Иван Петров (@ivan)', армия: 'Orks · 2000 очков', опыт: 'Игрок', когда: BOOKING_VARS.когда, стол: 'Стол 1' },
  },
  {
    id: 'match_still_free',
    group: 'match',
    title: 'Соперник так и не нашёлся',
    when: 'Подписчикам игры за сутки до начала, если место всё ещё свободно',
    category: 'match',
    announcement: true,
    defaultText: '⏳ <b>Соперник ещё не нашёлся: {игра}</b>\n{игрок} ждёт игру {когда}.\n{армия}\nЗаписаться — в приложении.',
    vars: { игра: 'Warhammer 40,000', игрок: 'Иван Петров (@ivan)', армия: 'Orks · 2000 очков', когда: BOOKING_VARS.когда },
  },
  {
    id: 'weekly_digest',
    group: 'match',
    title: 'Свободные игры на выходных',
    when: 'По пятницам с 12:00 — тем, у кого включены ивенты или поиск соперника; если есть открытые игры',
    category: 'events',
    announcement: true,
    defaultText: '📅 <b>Игры на выходных</b>\n{список}\nПрисоединиться — в приложении.',
    vars: { список: '• сб 15.11, 18:00 — Warhammer 40,000, Orks · 2000 (ищет соперника)' },
  },

  // C. Новости и ивенты
  {
    id: 'news_new',
    group: 'content',
    title: 'Новая новость',
    when: 'Подписчикам новостей, когда новость опубликована',
    category: 'news',
    announcement: true,
    defaultText: '📰 <b>{заголовок}</b>\n{текст}',
    vars: { заголовок: 'Турнир в субботу', текст: 'Регистрация открыта — места ограничены.' },
  },
  {
    id: 'event_new',
    group: 'content',
    title: 'Новый ивент',
    when: 'Подписчикам ивентов, когда ивент создан',
    category: 'events',
    announcement: true,
    defaultText: '🎉 <b>Новый ивент: {название}</b>\nКогда: {когда}\n{описание}',
    vars: { название: 'Турнир Kill Team', когда: BOOKING_VARS.когда, описание: 'Формат 1 на 1, призы победителям.' },
  },
  {
    id: 'dnd_new',
    group: 'content',
    title: 'Новая игра D&D',
    when: 'Подписчикам ивентов, когда открыта запись на игру D&D',
    category: 'events',
    announcement: true,
    defaultText: '🐉 <b>Новая игра D&D: {название}</b>\nКогда: {когда}\nМест: {места}',
    vars: { название: 'Затерянные шахты', когда: BOOKING_VARS.когда, места: '6' },
  },
  {
    id: 'event_reminder',
    group: 'content',
    title: 'Напоминание об ивенте',
    when: 'Записавшимся на ивент: за сутки и за 3 часа',
    category: null,
    announcement: false,
    defaultText: '⏰ <b>{через}: {название}</b>\nКогда: {когда}',
    vars: { через: 'Завтра', название: 'Турнир Kill Team', когда: BOOKING_VARS.когда },
  },
  {
    id: 'event_few_seats',
    group: 'content',
    title: 'Осталось мало мест',
    when: 'Подписчикам ивентов, когда на ивенте осталось 2 места или меньше (один раз)',
    category: 'events',
    announcement: true,
    defaultText: '🔥 <b>Осталось мест: {места}</b> — {название}\nКогда: {когда}',
    vars: { места: '2', название: 'Турнир Kill Team', когда: BOOKING_VARS.когда },
  },

  // E. Вовлечение
  {
    id: 'rank_up',
    group: 'engagement',
    title: 'Новый ранг',
    when: 'Игроку, когда он получил новый ранг (проверка раз в день)',
    category: 'promos',
    announcement: true,
    defaultText: '🏅 <b>Новый ранг: {ранг}</b> — {категория}\nСыграно: {игры}. Новая рамка аватара уже в профиле!',
    vars: { ранг: 'Опытный', категория: 'Warhammer', игры: '15' },
  },
  {
    id: 'inactive',
    group: 'engagement',
    title: 'Давно не заходили',
    when: 'Игроку, если больше 30 дней не было записей (не чаще раза в месяц)',
    category: 'promos',
    announcement: true,
    defaultText: '👋 <b>Давно не виделись!</b>\nВ клубе свободные столы и новые игры — загляните в приложение.',
    vars: {},
  },

  // F. Администраторам
  {
    id: 'admin_booking',
    group: 'admin',
    title: 'Новая запись / отмена',
    when: 'Всем администраторам — о каждой записи, просьбе о помощи и отмене',
    category: null,
    announcement: false,
    defaultText: '{текст}',
    vars: { текст: '🆕 <b>Новая запись: Игра Warhammer</b>\n…' },
  },
  {
    id: 'admin_digest',
    group: 'admin',
    title: 'Утренняя сводка',
    when: 'Администраторам каждый день с 10:00',
    category: null,
    announcement: false,
    defaultText: '☀️ <b>Сегодня в клубе</b>\nЗаписей: {всего}\nЖдут подтверждения: {ждут}\n{список}',
    vars: { всего: '5', ждут: '2', список: '• 18:00 Игра Warhammer — Иван Петров' },
  },
  {
    id: 'admin_pending',
    group: 'admin',
    title: 'Запись долго ждёт подтверждения',
    when: 'Администраторам, если запись ждёт подтверждения больше 3 часов (один раз)',
    category: null,
    announcement: false,
    defaultText: '⏳ <b>Запись ждёт подтверждения уже {часов} ч</b>\n{игрок}: {услуга} — {когда}',
    vars: { часов: '3', игрок: 'Иван Петров (@ivan)', услуга: 'Игра Warhammer', когда: BOOKING_VARS.когда },
  },
  {
    id: 'admin_delivery_alert',
    group: 'admin',
    title: 'Уведомления не доходили',
    when: 'Администраторам, когда связь с Telegram восстановилась после сбоя',
    category: null,
    announcement: false,
    defaultText: '⚠️ <b>Уведомления не доходили</b>\nС {с} по {по} не удалось отправить сообщений: {сколько}. Сейчас связь восстановлена.',
    vars: { с: '14 нояб., 03:10', по: '14 нояб., 05:07', сколько: '12' },
  },
];

export const KIND_BY_ID = new Map(NOTIFICATION_KINDS.map((k) => [k.id, k]));

/** Ручная рассылка владельца — не в каталоге автоматических, но в журнале. */
export const BROADCAST_KIND = 'broadcast';

/**
 * Подстановка переменных. Строка, где хотя бы одна известная переменная пустая, убирается целиком;
 * неизвестные {слова} остаются как есть (видно опечатку в шаблоне).
 */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template
    .split('\n')
    .flatMap((line) => {
      let empty = false;
      const out = line.replace(/\{([^{}\n]+)\}/g, (match, key: string) => {
        if (!(key in vars)) return match;
        const value = vars[key];
        if (value === null || value === undefined || String(value).trim() === '') {
          empty = true;
          return '';
        }
        return String(value);
      });
      return empty ? [] : [out];
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
