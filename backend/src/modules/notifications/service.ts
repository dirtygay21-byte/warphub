/**
 * Уведомления через Telegram-бота (тот же токен, что и для входа).
 *
 * Отправка никогда не ломает основной запрос: ошибки только пишутся в лог.
 * Отключить все уведомления (например, на тестовом сервере):
 *   TELEGRAM_NOTIFICATIONS=off
 */
import { getAdminTelegramIds } from '../../config/admin';
import { env } from '../../config/env';
import { describeSendResult, escapeHtml, formatClubDateTime, formatUserName, type SendResult } from '../../lib/telegram/format';

export { escapeHtml, formatClubDateTime, formatUserName };

const TELEGRAM_API = 'https://api.telegram.org';

function notificationsEnabled(): boolean {
  return (process.env.TELEGRAM_NOTIFICATIONS ?? 'on').toLowerCase() !== 'off';
}

/**
 * Журнал последних отправок (14.11.2026) — в памяти сервера, сбрасывается при перезапуске. Без текста сообщений:
 * когда, кому (Telegram ID), что за сообщение, результат. Нужен, чтобы видеть в админке, доходят ли уведомления.
 */
export type SendLogEntry = { at: string; chatId: string; kind: string; ok: boolean; reason?: string; status?: number; description?: string; ms: number };
const SEND_LOG_LIMIT = 60;
const sendLog: SendLogEntry[] = [];

export function recentSends(): SendLogEntry[] {
  return [...sendLog].reverse();
}

function remember(chatId: number | string, kind: string, result: SendResult, ms: number) {
  sendLog.push({
    at: new Date().toISOString(),
    chatId: String(chatId),
    kind,
    ok: result.ok,
    ...(result.ok ? {} : { reason: result.reason, status: result.status, description: result.description?.slice(0, 200) }),
    ms,
  });
  if (sendLog.length > SEND_LOG_LIMIT) sendLog.splice(0, sendLog.length - SEND_LOG_LIMIT);
}

/** Отправить сообщение и вернуть подробный результат (для проверки уведомлений из админки). */
export async function sendTelegramMessageDetailed(chatId: number | string, text: string, kind = 'message'): Promise<SendResult> {
  const started = Date.now();
  const result = await sendRaw(chatId, text);
  remember(chatId, kind, result, Date.now() - started);
  return result;
}

async function sendRaw(chatId: number | string, text: string): Promise<SendResult> {
  if (!notificationsEnabled()) return { ok: false, reason: 'disabled' };

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${env.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // 403 — пользователь не нажимал «Старт» у бота или заблокировал его; 401 — неверный токен
      const body = await response.text().catch(() => '');
      let description: string | undefined;
      try {
        description = (JSON.parse(body) as { description?: string }).description;
      } catch {
        description = body.slice(0, 200) || undefined;
      }
      console.warn(`[notify] Telegram ${response.status} for chat ${chatId}: ${body.slice(0, 200)}`);
      return { ok: false, reason: 'telegram', status: response.status, description };
    }

    return { ok: true };
  } catch (error) {
    console.warn(`[notify] failed for chat ${chatId}:`, (error as Error).message);
    return { ok: false, reason: 'network', description: (error as Error).message };
  }
}

export async function sendTelegramMessage(chatId: number | string, text: string, kind = 'message'): Promise<boolean> {
  return (await sendTelegramMessageDetailed(chatId, text, kind)).ok;
}

/** Отправить сообщение всем администраторам (не ждёт результата) */
export function notifyAdmins(text: string): void {
  for (const adminId of getAdminTelegramIds()) {
    void sendTelegramMessage(adminId, text, 'admin');
  }
}

/** Отправить сообщение пользователю (не ждёт результата) */
export function notifyUser(telegramId: number | null | undefined, text: string) {
  if (!telegramId) return;
  void sendTelegramMessage(telegramId, text, 'user');
}

/**
 * Проверка уведомлений из админки: тестовое сообщение администратору, который нажал кнопку,
 * и понятный ответ, что произошло (доставлено / нужно нажать «Старт» / неверный токен / выключено / нет связи).
 */
export async function testNotification(admin: { telegramId: number; firstName: string }) {
  const result = await sendTelegramMessageDetailed(
    admin.telegramId,
    `🔔 <b>Проверка уведомлений WarpHub</b>\nЕсли вы видите это сообщение, бот может писать вам. Уведомления о записях приходят всем администраторам.`,
    'test-admin',
  );
  return { ...describeSendResult(result), recipients: getAdminTelegramIds().length };
}

const lastUserTest = new Map<number, number>();
const USER_TEST_GAP_MS = 30_000;

/**
 * Проверка уведомлений из профиля (13.11.2026): тестовое сообщение самому пользователю и понятный ответ.
 * Не чаще раза в 30 секунд на пользователя.
 */
export async function testUserNotification(user: { telegramId: number }, now = Date.now()) {
  const last = lastUserTest.get(user.telegramId) ?? 0;
  if (now - last < USER_TEST_GAP_MS) return { ok: false, message: 'Проверка уже отправлена — повторить можно через полминуты.' };
  lastUserTest.set(user.telegramId, now);
  const result = await sendTelegramMessageDetailed(
    user.telegramId,
    `🔔 <b>Уведомления WarpHub работают</b>\nСюда придут подтверждения записей, сообщения о сопернике и об отмене.`,
    'test-user',
  );
  const d = describeSendResult(result);
  // пользователю — без подробностей о сервере и токене
  if (d.ok) return { ok: true, message: d.message };
  if (!result.ok && result.reason === 'telegram' && result.status === 403) return { ok: false, needsStart: true, message: 'Бот пока не может писать вам. Нажмите «Разрешить уведомления» или откройте чат с ботом и нажмите «Старт».' };
  return { ok: false, message: 'Сейчас не получилось отправить сообщение — попробуйте позже.' };
}

/**
 * Диагностика уведомлений для админки (14.11.2026): включены ли, отвечает ли Telegram (getMe — какой бот,
 * сколько миллисекунд), кто получает уведомления администраторов и чем закончились последние отправки.
 * Ничего не отправляет. Токен не показывается.
 */
export async function notificationDiagnostics() {
  const enabled = notificationsEnabled();
  let bot: { ok: boolean; username?: string; ms: number; error?: string };
  const started = Date.now();
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${env.telegramBotToken}/getMe`, { signal: AbortSignal.timeout(10_000) });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string }; description?: string };
    bot = body.ok
      ? { ok: true, username: body.result?.username, ms: Date.now() - started }
      : { ok: false, ms: Date.now() - started, error: `Telegram ${response.status}: ${body.description ?? 'нет ответа'}` };
  } catch (error) {
    bot = { ok: false, ms: Date.now() - started, error: `нет связи с api.telegram.org: ${(error as Error).message}` };
  }
  const log = recentSends();
  const admins = getAdminTelegramIds().map((id) => {
    const last = log.find((e) => e.chatId === id);
    return { telegramId: id, last: last ?? null };
  });
  return { enabled, bot, admins, recent: log.slice(0, 30), since: SERVER_STARTED };
}

const SERVER_STARTED = new Date().toISOString();
