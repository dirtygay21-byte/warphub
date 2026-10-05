/**
 * Уведомления через Telegram-бота (тот же токен, что и для входа).
 *
 * Отправка никогда не ломает основной запрос: ошибки только пишутся в лог.
 * Отключить все уведомления (например, на тестовом сервере):
 *   TELEGRAM_NOTIFICATIONS=off
 */
import { bookingConfig } from '../../config/booking';
import { getAdminTelegramIds } from '../../config/admin';
import { env } from '../../config/env';

const TELEGRAM_API = 'https://api.telegram.org';

function notificationsEnabled(): boolean {
  return (process.env.TELEGRAM_NOTIFICATIONS ?? 'on').toLowerCase() !== 'off';
}

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
): Promise<boolean> {
  if (!notificationsEnabled()) return false;

  try {
    const response = await fetch(
      `${TELEGRAM_API}/bot${env.telegramBotToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      // 403 — пользователь не нажимал «Старт» у бота или заблокировал его
      const body = await response.text().catch(() => '');
      console.warn(
        `[notify] Telegram ${response.status} for chat ${chatId}: ${body.slice(0, 200)}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`[notify] failed for chat ${chatId}:`, (error as Error).message);
    return false;
  }
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

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: bookingConfig.timeZone,
  weekday: 'short',
  day: 'numeric',
  month: 'long',
});

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: bookingConfig.timeZone,
  hour: '2-digit',
  minute: '2-digit',
});

/** «сб, 10 октября, 18:00–21:00» во времени клуба */
export function formatClubDateTime(
  startsAt: Date | null | undefined,
  endsAt?: Date | null,
): string {
  if (!startsAt) return '—';
  const date = dateFormatter.format(startsAt);
  const start = timeFormatter.format(startsAt);
  return endsAt
    ? `${date}, ${start}–${timeFormatter.format(endsAt)}`
    : `${date}, ${start}`;
}

export function formatUserName(user: {
  firstName: string;
  lastName?: string | null;
  username?: string | null;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return user.username ? `${name} (@${user.username})` : name;
}
