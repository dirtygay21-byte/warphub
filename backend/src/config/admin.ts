import type { User } from '../modules/users/service';

/**
 * Администраторы определяются по Telegram ID (он подтверждается подписью
 * Telegram при входе, поэтому его нельзя подделать).
 *
 * Встроенные администраторы: список в коде и ADMIN_TELEGRAM_IDS=123456789,987654321 в .env сервера
 * (после изменения .env — перезапуск backend). Остальных администраторов встроенные добавляют
 * в админке по Telegram ID (таблица admin_users) — без перезапуска.
 */
const DEFAULT_ADMIN_TELEGRAM_IDS = ['394165661', '269942222'];

function parseIds(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));
}

/** Встроенные администраторы: из кода и .env. Только они добавляют и удаляют администраторов в админке. */
export function getBuiltinAdminIds(): string[] {
  return [
    ...new Set([
      ...DEFAULT_ADMIN_TELEGRAM_IDS,
      ...parseIds(process.env.ADMIN_TELEGRAM_ID),
      ...parseIds(process.env.ADMIN_TELEGRAM_IDS),
    ]),
  ];
}

/**
 * Администраторы, добавленные в админке (таблица admin_users, N2). Держатся в памяти, чтобы проверка прав
 * оставалась синхронной; обновляются при старте и после каждого изменения (modules/admins/service.ts).
 */
let addedAdminIds: string[] = [];

export function setAddedAdminIds(ids: Array<string | number>): void {
  addedAdminIds = [...new Set(ids.map(String).filter((id) => /^\d+$/.test(id)))];
}

/** Все администраторы: встроенные и добавленные в админке (права, уведомления). */
export function getAdminTelegramIds(): string[] {
  return [...new Set([...getBuiltinAdminIds(), ...addedAdminIds])];
}

export function isAdminUser(user: Pick<User, 'telegramId'>): boolean {
  return getAdminTelegramIds().includes(user.telegramId.toString());
}

export function isBuiltinAdmin(user: Pick<User, 'telegramId'>): boolean {
  return getBuiltinAdminIds().includes(user.telegramId.toString());
}
