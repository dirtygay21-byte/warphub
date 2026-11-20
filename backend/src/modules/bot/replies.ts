/**
 * Ответы бота @WarpHubBot на команды в личном чате (20.11.2026, решение владельца: бот — вход в приложение через меню).
 * Чистые функции без БД и сети — tests/bot-replies.test.ts. Отправка и разбор обновлений — bot/index.ts.
 */
import { bookingConfig } from '../../config/booking';
import { escapeHtml, formatClubDateTime } from '../../lib/telegram/format';

/** Кнопка под сообщением: path — страница приложения (web_app), url — ссылка, data — ответ боту (callback). */
export type BotButton = { text: string; path?: string; url?: string; data?: string };
export type BotReply = { text: string; buttons?: BotButton[][] };

export const CLUB_GROUP_URL = 'https://t.me/warpboysgirls';
export const CLUB_VK_URL = 'https://vk.ru/warpboysandgirls';

/** Меню команд (setMyCommands): у всех и дополнительно у администраторов. */
export const USER_COMMANDS = [
  { command: 'start', description: 'Главное меню' },
  { command: 'book', description: 'Записаться на игру' },
  { command: 'my', description: 'Мои записи' },
  { command: 'games', description: 'Кто ищет соперника' },
  { command: 'league', description: 'Мой рейтинг в лиге' },
  { command: 'builder', description: 'Доступ к WarpBuilder' },
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
    buttons: [...open, [{ text: 'Записаться', path: '/' }, { text: 'Мои записи', data: 'my' }], [{ text: 'Ищут соперника', data: 'games' }, { text: 'Клуб и контакты', data: 'club' }]],
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
    text: 'Я понимаю команды из меню: /my, /games, /book, /club, /help. Записаться и всё остальное — в приложении.',
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

// ---------- этап 3 (20.11.2026): записи, соперники, лига, WarpBuilder прямо в чате ----------

export const BOOSTY_URL = 'https://boosty.to/wbg';

type Mate = { firstName: string; username: string | null; army?: string | null };
const mateName = (m: Mate) => escapeHtml(m.username ? `${m.firstName} (@${m.username})` : m.firstName);

/** Запись игрока для /my — уже с типом записи, игрой, подписью стола и состоянием (см. notifications/booking-vars). */
export type MyBooking = { id: string; what: string; when: string; startsAt: Date; table: string; state: string; mates: Mate[] };

const shortWhen = (d: Date) => formatClubDateTime(d);

export function myReply(list: MyBooking[], opts: { known: boolean }): BotReply {
  if (!opts.known) return { text: 'Вы ещё не заходили в WarpHub — откройте приложение, и записи появятся здесь.', buttons: [[{ text: 'Открыть WarpHub', path: '/' }]] };
  if (!list.length) return { text: '📅 Предстоящих записей нет.', buttons: [[{ text: 'Записаться', path: '/' }]] };
  const shown = list.slice(0, 8);
  const blocks = shown.map((b, i) =>
    [
      `${i + 1}. <b>${escapeHtml(b.what)}</b>`,
      escapeHtml(b.when),
      b.table ? `Стол: ${escapeHtml(b.table)}${b.state ? ` — ${escapeHtml(b.state)}` : ''}` : '',
      b.mates.length ? `За столом: ${b.mates.map(mateName).join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return {
    text: [`📅 <b>Мои записи (${list.length})</b>`, ...blocks].join('\n\n') + (list.length > shown.length ? `\n\n… и ещё ${list.length - shown.length} — в приложении` : ''),
    buttons: [...shown.map((b, i) => [{ text: `Отменить ${i + 1}: ${shortWhen(b.startsAt)}`, data: `cancel:${b.id}` }]), [{ text: 'Открыть мои записи', path: '/reservations' }]],
  };
}

/** Подтверждение отмены — отменить можно только второй кнопкой. */
export function cancelAskReply(b: Pick<MyBooking, 'id' | 'what' | 'when' | 'table'>): BotReply {
  return {
    text: [`Отменить запись?`, `<b>${escapeHtml(b.what)}</b>`, escapeHtml(b.when), b.table ? `Стол: ${escapeHtml(b.table)}` : ''].filter(Boolean).join('\n'),
    buttons: [[{ text: 'Да, отменить', data: `cancelok:${b.id}` }, { text: 'Нет', data: 'cancelno' }]],
  };
}

export type OpenGame = { when: string; table: string; what: string; state: string; players: Mate[] };

export function gamesReply(list: OpenGame[]): BotReply {
  if (!list.length) return { text: '⚔️ Сейчас никто не ищет соперника. Начните свою игру — и вас увидят другие.', buttons: [[{ text: 'Записаться', path: '/' }]] };
  const shown = list.slice(0, 10);
  const blocks = shown.map((g) =>
    [`<b>${escapeHtml(g.when)}</b> · ${escapeHtml(g.table)}`, `${escapeHtml(g.what)} — ${escapeHtml(g.state)}`, ...g.players.map((p) => `• ${mateName(p)}${p.army ? ` — ${escapeHtml(p.army)}` : ''}`)].join('\n'),
  );
  return {
    text: [`⚔️ <b>Ищут соперника (${list.length})</b>`, ...blocks].join('\n\n') + (list.length > shown.length ? `\n\n… и ещё ${list.length - shown.length} — в приложении` : ''),
    buttons: [[{ text: 'Присоединиться в приложении', path: '/' }]],
  };
}

export type LeagueLine = { gameLabel: string; games: number; wins: number; draws: number; losses: number; rating: number | null; rank: number | null; players: number };

export function leagueReply(stats: { seasonLabel: string; games: LeagueLine[] } | null): BotReply {
  const open = [[{ text: 'Таблица лиги', path: '/league' }]];
  if (!stats) return { text: 'Вы ещё не заходили в WarpHub — откройте приложение.', buttons: open };
  if (!stats.games.length) return { text: `🏆 <b>Лига · ${escapeHtml(stats.seasonLabel)}</b>\nПока нет засчитанных игр. Результат засчитывается, когда его подтвердят оба игрока.`, buttons: open };
  const lines = stats.games.map(
    (g) =>
      `<b>${escapeHtml(g.gameLabel)}</b>: ${g.rating !== null ? `рейтинг ${Math.round(g.rating)}, место ${g.rank} из ${g.players}` : 'в этом сезоне игр нет'} · игр ${g.games} (${g.wins}–${g.draws}–${g.losses})`,
  );
  return { text: [`🏆 <b>Лига · ${escapeHtml(stats.seasonLabel)}</b>`, ...lines, '', 'Победы–ничьи–поражения за всё время.'].join('\n'), buttons: open };
}

export function builderReply(access: boolean | null): BotReply {
  if (access === null) return { text: 'Вы ещё не заходили в WarpHub — откройте приложение.', buttons: [[{ text: 'Открыть WarpHub', path: '/' }]] };
  return access
    ? { text: '📜 <b>WarpBuilder открыт</b>\nРостеры 40K, AoS, Kill Team и Warcry — в приложении.', buttons: [[{ text: 'Открыть WarpBuilder', path: '/roster' }]] }
    : {
        text: '📜 <b>WarpBuilder</b> — для подписчиков клуба на Boosty. Доступ откроется сам, как только вы окажетесь в группе подписчиков.',
        buttons: [[{ text: 'Подписка на Boosty', url: BOOSTY_URL }]],
      };
}
