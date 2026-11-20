/**
 * Бот @WarpHubBot в личном чате (20.11.2026): команды из меню, кнопки под сообщениями, меню команд (setMyCommands).
 * Обновления приходят тем же опросом getUpdates, что и события группы Boosty (roster/group.ts). Группы бот не трогает.
 * Ошибки отправки только пишутся в лог — опрос не останавливается.
 */
import { getAdminTelegramIds } from '../../config/admin';
import { adminDigestNow } from '../notifications/jobs';
import { miniAppUrl, telegramFetch } from '../notifications/service';
import { ADMIN_COMMANDS, USER_COMMANDS, clubReply, notAdminReply, parseCommand, replyFor, unknownReply, type BotButton, type BotReply } from './replies';

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
    await call('answerCallbackQuery', { callback_query_id: q.id });
    if (q.data === 'club') await sendReply(q.message.chat.id, clubReply());
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
