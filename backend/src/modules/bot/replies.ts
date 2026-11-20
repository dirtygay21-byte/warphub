/**
 * Ответы бота @WarpHubBot на команды в личном чате (20.11.2026, решение владельца: бот — вход в приложение через меню).
 * Чистые функции без БД и сети — tests/bot-replies.test.ts. Отправка и разбор обновлений — bot/index.ts.
 */
import { bookingConfig } from '../../config/booking';
import { escapeHtml } from '../../lib/telegram/format';

/** Кнопка под сообщением: path — страница приложения (web_app), url — ссылка, data — ответ боту (callback). */
export type BotButton = { text: string; path?: string; url?: string; data?: string };
export type BotReply = { text: string; buttons?: BotButton[][] };

export const CLUB_GROUP_URL = 'https://t.me/warpboysgirls';
export const CLUB_VK_URL = 'https://vk.ru/warpboysandgirls';

/** Меню команд (setMyCommands): у всех и дополнительно у администраторов. */
export const USER_COMMANDS = [
  { command: 'start', description: 'Главное меню' },
  { command: 'book', description: 'Записаться на игру' },
  { command: 'club', description: 'Когда открыт клуб и как нас найти' },
  { command: 'help', description: 'Что умеет бот' },
] as const;
export const ADMIN_COMMANDS = [
  ...USER_COMMANDS,
  { command: 'today', description: 'Сводка записей на сегодня' },
  { command: 'tomorrow', description: 'Сводка записей на завтра' },
  { command: 'admin', description: 'Открыть админку' },
] as const;

/** «/book», «/book@WarpHubBot», «/start my» → { command: 'book', arg: '' }; не команда — null. */
export function parseCommand(text: string | undefined | null): { command: string; arg: string } | null {
  const m = /^\/([a-z_]+)(?:@\w+)?(?:\s+(.*))?$/is.exec((text ?? '').trim());
  return m ? { command: m[1]!.toLowerCase(), arg: (m[2] ?? '').trim() } : null;
}

/** Ссылка t.me/WarpHubBot?start=<параметр> → страница приложения. */
const START_PATHS: Record<string, string> = { book: '/', my: '/reservations', league: '/league', builder: '/roster', news: '/news', profile: '/profile' };
export function startPath(arg: string): string | null {
  return START_PATHS[arg.toLowerCase()] ?? null;
}

const WEEKDAY = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** «пт с 20:00, сб–вс с 12:00» — из настроек записи (bookingConfig), ничего не придумывается. */
export function clubHoursLine(cfg: Pick<typeof bookingConfig, 'allowedWeekdays' | 'openHour' | 'openHourByWeekday'> = bookingConfig): string {
  const groups: Array<{ days: number[]; hour: number }> = [];
  for (const d of [...cfg.allowedWeekdays].sort((a, b) => a - b)) {
    const hour = cfg.openHourByWeekday[d] ?? cfg.openHour;
    const last = groups.at(-1);
    if (last && last.hour === hour && last.days.at(-1) === d - 1) last.days.push(d);
    else groups.push({ days: [d], hour });
  }
  return groups
    .map((g) => `${g.days.length > 1 ? `${WEEKDAY[g.days[0]!]}–${WEEKDAY[g.days.at(-1)!]}` : WEEKDAY[g.days[0]!]} с ${hh(g.hour)}`)
    .join(', ');
}

export function startReply(firstName: string | null | undefined, opts: { path?: string | null } = {}): BotReply {
  const name = firstName?.trim() ? `, ${escapeHtml(firstName.trim())}` : '';
  const open: BotButton[][] = opts.path && opts.path !== '/' ? [[{ text: 'Открыть в приложении', path: opts.path }]] : [];
  return {
    text: [
      `👋 <b>Привет${name}!</b>`,
      'Это WarpHub — приложение клуба Warp Boys and Girls.',
      '',
      '🎲 Записаться на игру, тренировку или покраску',
      '⚔️ Найти соперника на свой стол',
      '📜 Собрать ростер в WarpBuilder',
      '',
      'Напоминания о записях придут сюда, в этот чат.',
    ].join('\n'),
    buttons: [...open, [{ text: 'Записаться', path: '/' }, { text: 'Мои записи', path: '/reservations' }], [{ text: 'Клуб и контакты', data: 'club' }]],
  };
}

export function bookReply(): BotReply {
  return { text: '🎲 <b>Запись в клуб</b>\nИгра, тренировка, покраска или посещение — выберите день и стол в приложении.', buttons: [[{ text: 'Записаться', path: '/' }]] };
}

export function clubReply(): BotReply {
  return {
    text: [
      '🏠 <b>Клуб Warp Boys and Girls</b>',
      `Когда открыт: ${clubHoursLine()} (запись — до полуночи).`,
      'Как найти: клуб на 6-м, последнем этаже — поднимайтесь до самого верха.',
      'Закрытые дни и мероприятия — в приложении и в группе клуба.',
    ].join('\n'),
    buttons: [[{ text: 'Группа в Telegram', url: CLUB_GROUP_URL }, { text: 'ВКонтакте', url: CLUB_VK_URL }], [{ text: 'Записаться', path: '/' }]],
  };
}

export function helpReply(isAdmin: boolean): BotReply {
  const list = (isAdmin ? ADMIN_COMMANDS : USER_COMMANDS).map((c) => `/${c.command} — ${c.description.charAt(0).toLowerCase()}${c.description.slice(1)}`);
  return {
    text: ['<b>Что умеет бот</b>', ...list, '', 'Всё остальное — в приложении: кнопка «Открыть» слева от поля ввода.'].join('\n'),
    buttons: [[{ text: 'Открыть WarpHub', path: '/' }]],
  };
}

export function adminReply(): BotReply {
  return { text: '🛠 <b>Админка WarpHub</b>', buttons: [[{ text: 'Открыть админку', path: '/admin' }]] };
}

export function notAdminReply(): BotReply {
  return { text: 'Эта команда — только для администраторов клуба.' };
}

export function unknownReply(): BotReply {
  return {
    text: 'Я понимаю команды из меню: /book, /club, /help. Записаться и всё остальное — в приложении.',
    buttons: [[{ text: 'Открыть WarpHub', path: '/' }]],
  };
}

/** Ответ на команду; null — команда для администратора (обрабатывается отдельно, нужна БД) или не наша. */
export function replyFor(command: string, arg: string, ctx: { firstName?: string | null; isAdmin: boolean }): BotReply | null {
  switch (command) {
    case 'start':
      return startReply(ctx.firstName, { path: startPath(arg) });
    case 'book':
      return bookReply();
    case 'club':
      return clubReply();
    case 'help':
      return helpReply(ctx.isAdmin);
    case 'admin':
      return ctx.isAdmin ? adminReply() : notAdminReply();
    default:
      return null;
  }
}
