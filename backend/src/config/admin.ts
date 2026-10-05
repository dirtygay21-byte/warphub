import type { User } from '../modules/users/service';

/**
 * Администраторы определяются по Telegram ID (он подтверждается подписью
 * Telegram при входе, поэтому его нельзя подделать).
 *
 * Добавить администратора без изменения кода: в .env сервера
 *   ADMIN_TELEGRAM_IDS=123456789,987654321
 * и перезапустить backend.
 */
const DEFAULT_ADMIN_TELEGRAM_IDS = ['394165661', '269942222'];

function parseIds(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));
}

export function getAdminTelegramIds(): string[] {
  return [
    ...new Set([
      ...DEFAULT_ADMIN_TELEGRAM_IDS,
      ...parseIds(process.env.ADMIN_TELEGRAM_ID),
      ...parseIds(process.env.ADMIN_TELEGRAM_IDS),
    ]),
  ];
}

export function isAdminUser(user: Pick<User, 'telegramId'>): boolean {
  return getAdminTelegramIds().includes(user.telegramId.toString());
}
