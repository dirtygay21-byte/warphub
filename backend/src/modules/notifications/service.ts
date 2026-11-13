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

/** Отправить сообщение и вернуть подробный результат (для проверки уведомлений из админки). */
export async function sendTelegramMessageDetailed(chatId: number | string, text: string): Promise<SendResult> {
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

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<boolean> {
  return (await sendTelegramMessageDetailed(chatId, text)).ok;
}

/** Отправить сообщение всем администраторам (не ждёт результата) */
export function notifyAdmins(text: string): void {
  for (const adminId of getAdminTelegramIds()) {
    void sendTelegramMessage(adminId, text);
  }
}

/** Отправить сообщение пользователю (не ждёт результата) */
export function notifyUser(telegramId: number | null | undefined, text: string) {
  if (!telegramId) return;
  void sendTelegramMessage(telegramId, text);
}

/**
 * Проверка уведомлений из админки: тестовое сообщение администратору, который нажал кнопку,
 * и понятный ответ, что произошло (доставлено / нужно нажать «Старт» / неверный токен / выключено / нет связи).
 */
export async function testNotification(admin: { telegramId: number; firstName: string }) {
  const result = await sendTelegramMessageDetailed(
    admin.telegramId,
    `🔔 <b>Проверка уведомлений WarpHub</b>\nЕсли вы видите это сообщение, бот может писать вам. Уведомления о записях приходят всем администраторам.`,
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
  );
  const d = describeSendResult(result);
  // пользователю — без подробностей о сервере и токене
  if (d.ok) return { ok: true, message: d.message };
  if (!result.ok && result.reason === 'telegram' && result.status === 403) return { ok: false, needsStart: true, message: 'Бот пока не может писать вам. Нажмите «Разрешить уведомления» или откройте чат с ботом и нажмите «Старт».' };
  return { ok: false, message: 'Сейчас не получилось отправить сообщение — попробуйте позже.' };
}
