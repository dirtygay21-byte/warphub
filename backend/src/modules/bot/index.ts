/**
 * Бот @WarpHubBot в личном чате (20.11.2026): команды из меню, кнопки под сообщениями, меню команд (setMyCommands).
 * Обновления приходят тем же опросом getUpdates, что и события группы Boosty (roster/group.ts). Группы бот не трогает.
 * Ошибки отправки только пишутся в лог — опрос не останавливается.
 */
import { inArray } from 'drizzle-orm';
import { getAdminTelegramIds } from '../../config/admin';
import { db } from '../../db';
import { servicesTable, tablesTable } from '../../db/schema';
import { formatClubDateTime } from '../../lib/telegram/format';
import { BookingError, cancelReservation, getUserReservations, listOpenGamesCached } from '../booking/service';
import { myLeagueStats } from '../league/service';
import { tableLabel, tableState, whatOf } from '../notifications/booking-vars';
import { adminDigestNow, seatsOf } from '../notifications/jobs';
import { miniAppUrl, telegramFetch } from '../notifications/service';
import { hasRosterAccess } from '../roster/service';
import { findUserByTelegramId } from '../users/service';
import {
  ADMIN_COMMANDS,
  USER_COMMANDS,
  builderReply,
  cancelAskReply,
  clubReply,
  gamesReply,
  leagueReply,
  myReply,
  notAdminReply,
  parseCommand,
  replyFor,
  unknownReply,
  type BotButton,
  type BotReply,
  type MyBooking,
} from './replies';

type TgUser = { id: number; first_name?: string; is_bot?: boolean };
export type BotUpdate = {
  message?: { chat: { id: number; type: string }; from?: TgUser; text?: string };
  callback_query?: { id: string; from: TgUser; data?: string; message?: { chat: { id: number; type: string } } };
};

const isAdmin = (id: number) => getAdminTelegramIds().includes(String(id));

function keyboard(rows: BotButton[][] | undefined) {
  const inline = (rows ?? [])
    .map((row) =>
      row.flatMap((b) =>
        b.path ? [{ text: b.text, web_app: { url: miniAppUrl(b.path) } }] : b.url ? [{ text: b.text, url: b.url }] : b.data ? [{ text: b.text, callback_data: b.data }] : [],
      ),
    )
    .filter((row) => row.length);
  return inline.length ? { inline_keyboard: inline } : undefined;
}

async function call(method: string, body: unknown) {
  try {
    const res = await telegramFetch(method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) console.warn(`[bot] ${method} failed:`, json.description);
    return json.ok;
  } catch (error) {
    console.warn(`[bot] ${method} failed:`, (error as Error).message);
    return false;
  }
}

/** Telegram — до 4096 символов в сообщении. */
const clip = (text: string) => (text.length > 4000 ? `${text.slice(0, 3990)}\n…` : text);

export function sendReply(chatId: number, reply: BotReply) {
  return call('sendMessage', { chat_id: chatId, text: clip(reply.text), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: keyboard(reply.buttons) });
}

async function answer(chatId: number, from: TgUser | undefined, text: string | undefined) {
  const cmd = parseCommand(text);
  const admin = !!from && isAdmin(from.id);
  if (!cmd) return sendReply(chatId, unknownReply());
  if (from && ['my', 'games', 'league', 'builder'].includes(cmd.command)) return sendReply(chatId, await dataReply(cmd.command, from.id));
  if (cmd.command === 'today' || cmd.command === 'tomorrow') {
    if (!admin || !from) return sendReply(chatId, notAdminReply());
    const digest = await adminDigestNow(from.id, cmd.command);
    return sendReply(chatId, { text: digest ?? 'Сводка выключена в настройках уведомлений.' });
  }
  return sendReply(chatId, replyFor(cmd.command, cmd.arg, { firstName: from?.first_name, isAdmin: admin }) ?? unknownReply());
}

/** Обработать обновление; не личный чат и не наше — пропустить. */
export async function handleBotUpdate(u: BotUpdate): Promise<void> {
  if (u.message && u.message.chat.type === 'private' && !u.message.from?.is_bot) {
    await answer(u.message.chat.id, u.message.from, u.message.text);
    return;
  }
  const q = u.callback_query;
  if (q && q.message?.chat.type === 'private') {
    const chatId = q.message.chat.id;
    const [action, id] = (q.data ?? '').split(':');
    if (action === 'cancelok' && id) {
      const text = await cancelFromChat(q.from.id, id);
      await call('answerCallbackQuery', { callback_query_id: q.id, text });
      await sendReply(chatId, { text, buttons: [[{ text: 'Мои записи', data: 'my' }]] });
      return;
    }
    await call('answerCallbackQuery', { callback_query_id: q.id, ...(action === 'cancelno' ? { text: 'Запись остаётся' } : {}) });
    if (action === 'club') await sendReply(chatId, clubReply());
    else if (action === 'my' || action === 'games') await sendReply(chatId, await dataReply(action, q.from.id));
    else if (action === 'cancel' && id) {
      const b = (await myBookings(q.from.id))?.find((x) => x.id === id);
      await sendReply(chatId, b ? cancelAskReply(b) : { text: 'Эта запись уже отменена или прошла.' });
    }
  }
}

/** Предстоящие записи игрока — тип, игра, стол с типом, состояние стола, кто за столом. null — человека нет в базе. */
async function myBookings(telegramId: number, now = new Date()): Promise<MyBooking[] | null> {
  const user = await findUserByTelegramId(telegramId);
  if (!user) return null;
  const { reservations } = await getUserReservations(user.id);
  const upcoming = reservations
    .filter((r) => r.status !== 'cancelled' && r.startsAt && new Date(r.endsAt ?? r.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
  const tableIds = [...new Set(upcoming.flatMap((r) => (r.tableId !== null ? [r.tableId] : [])))];
  const serviceIds = [...new Set(upcoming.map((r) => r.serviceId))];
  const [tables, services] = await Promise.all([
    tableIds.length ? db.select({ id: tablesTable.id, category: tablesTable.category }).from(tablesTable).where(inArray(tablesTable.id, tableIds)) : [],
    serviceIds.length
      ? db
          .select({ id: servicesTable.id, seatsPerTable: servicesTable.seatsPerTable, tableCapacityProfile: servicesTable.tableCapacityProfile, hasTrainer: servicesTable.hasTrainer })
          .from(servicesTable)
          .where(inArray(servicesTable.id, serviceIds))
      : [],
  ]);
  return upcoming.map((r) => {
    const service = services.find((s) => s.id === r.serviceId);
    const seats = service ? seatsOf(service) : 0;
    const start = new Date(r.startsAt!);
    return {
      id: r.id,
      what: whatOf({ title: r.serviceTitle, slug: r.serviceSlug }, r.details),
      when: formatClubDateTime(start, r.endsAt ? new Date(r.endsAt) : null),
      startsAt: start,
      table: tableLabel(r.tableName, tables.find((t) => t.id === r.tableId)?.category),
      state: r.tableId !== null ? tableState(1 + r.tablemates.length, seats, service?.hasTrainer ?? false) : '',
      mates: r.tablemates,
    };
  });
}

async function dataReply(command: string, telegramId: number): Promise<BotReply> {
  if (command === 'my') {
    const list = await myBookings(telegramId);
    return myReply(list ?? [], { known: list !== null });
  }
  if (command === 'games') {
    const games = await listOpenGamesCached();
    return gamesReply(
      games.map((g) => {
        const start = new Date(g.startsAt);
        const game = g.players.find((p) => p.gameLabel)?.gameLabel ?? null;
        return {
          when: formatClubDateTime(start, new Date(g.endsAt)),
          table: tableLabel(g.tableName, g.tableCategory),
          what: [g.serviceTitle, game].filter(Boolean).join(' · '),
          state: tableState(g.occupied, g.capacity, g.hasTrainer),
          players: g.players.map((p) => ({ firstName: p.firstName, username: p.username, army: p.army })),
        };
      }),
    );
  }
  const user = await findUserByTelegramId(telegramId);
  if (command === 'league') return leagueReply(user ? await myLeagueStats(user.id) : null);
  return builderReply(user ? await hasRosterAccess(user) : null);
}

/** Отмена из чата — та же функция, что в приложении (уведомления, цены стола, лист ожидания). */
async function cancelFromChat(telegramId: number, reservationId: string): Promise<string> {
  const user = await findUserByTelegramId(telegramId);
  if (!user) return 'Не нашли вас в WarpHub — откройте приложение.';
  const b = (await myBookings(telegramId))?.find((x) => x.id === reservationId);
  if (!b) return 'Эта запись уже отменена или прошла.';
  try {
    await cancelReservation(user.id, reservationId);
    return `❌ Запись отменена: ${b.what}, ${b.when}.`;
  } catch (error) {
    if (error instanceof BookingError) return 'Эта запись уже отменена.';
    console.warn('[bot] cancel failed:', (error as Error).message);
    return 'Не получилось отменить — попробуйте в приложении.';
  }
}

let registeredAdmins: string[] | null = null;

/**
 * Меню команд: у всех — USER_COMMANDS, у каждого администратора в личном чате — ADMIN_COMMANDS.
 * Повторяется, когда меняется список администраторов (админы из админки перечитываются раз в 5 минут).
 */
export async function registerBotCommands(): Promise<void> {
  const admins = [...getAdminTelegramIds()].sort();
  if (registeredAdmins && admins.join(',') === registeredAdmins.join(',')) return;
  if (!registeredAdmins && !(await call('setMyCommands', { commands: USER_COMMANDS }))) return;
  for (const id of admins) await call('setMyCommands', { commands: ADMIN_COMMANDS, scope: { type: 'chat', chat_id: Number(id) } });
  // бывшие администраторы — обратно обычное меню
  for (const id of (registeredAdmins ?? []).filter((x) => !admins.includes(x))) await call('deleteMyCommands', { scope: { type: 'chat', chat_id: Number(id) } });
  registeredAdmins = admins;
}
