/**
 * Форматирование текста уведомлений Telegram (HTML-режим). Без зависимостей от окружения сервера —
 * поэтому покрывается обычными тестами.
 */
import { bookingConfig } from '../../config/booking';

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

/** Результат отправки: ok — доставлено Telegram; иначе причина (код ответа Telegram и его описание, без токена). */
export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'disabled' | 'network' | 'telegram'; status?: number; description?: string };

/** Понятное объяснение результата отправки для админки. */
export function describeSendResult(r: SendResult): { ok: boolean; message: string; detail?: string } {
  if (r.ok) return { ok: true, message: 'Сообщение доставлено — проверьте чат с ботом.' };
  if (r.reason === 'disabled')
    return { ok: false, message: 'Уведомления выключены на сервере (TELEGRAM_NOTIFICATIONS=off в .env backend).' };
  if (r.reason === 'network')
    return { ok: false, message: 'Сервер не смог связаться с Telegram (api.telegram.org).', detail: r.description };
  if (r.status === 403)
    return { ok: false, message: 'Telegram не разрешает боту писать вам: откройте чат с ботом и нажмите «Старт» (или разблокируйте бота).', detail: r.description };
  if (r.status === 401 || r.status === 404) return { ok: false, message: 'Telegram не принял токен бота — проверьте TELEGRAM_BOT_TOKEN на сервере.', detail: r.description };
  if (r.status === 400) return { ok: false, message: 'Telegram отклонил сообщение (чат не найден или неверный запрос).', detail: r.description };
  return { ok: false, message: `Telegram ответил ошибкой ${r.status ?? ''}`.trim(), detail: r.description };
}
