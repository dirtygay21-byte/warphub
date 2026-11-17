import type { User } from '../modules/users/service';
import { type AdminArea, cleanAreas } from './admin-areas';

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

/** Направления кураторов (17.11.2026): Telegram ID → направления; кого нет в списке — полный доступ. */
let curatorAreas = new Map<string, AdminArea[]>();

export function setAddedAdminIds(ids: Array<string | number>): void {
  addedAdminIds = [...new Set(ids.map(String).filter((id) => /^\d+$/.test(id)))];
}

/** Добавленные администраторы вместе с направлениями (modules/admins/service.ts). */
export function setAddedAdmins(rows: Array<{ id: string | number; areas?: unknown }>): void {
  setAddedAdminIds(rows.map((r) => r.id));
  curatorAreas = new Map();
  for (const r of rows) {
    const id = String(r.id);
    const areas = cleanAreas(r.areas);
    if (areas.length && !getBuiltinAdminIds().includes(id)) curatorAreas.set(id, areas);
  }
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

/** Направления администратора: null — полный доступ (встроенный или без направлений), иначе — только эти. */
export function adminAreasOf(user: Pick<User, 'telegramId'>): AdminArea[] | null {
  const id = user.telegramId.toString();
  if (getBuiltinAdminIds().includes(id)) return null;
  return curatorAreas.get(id) ?? null;
}

/**
 * Кому из администраторов отправлять сообщение о направлении: всем с полным доступом и кураторам этого направления.
 * area = null — сообщение общее (только полный доступ).
 */
export function adminRecipientsFor(area: AdminArea | null): string[] {
  return getAdminTelegramIds().filter((id) => {
    const areas = curatorAreas.get(id);
    return !areas || (area !== null && areas.includes(area));
  });
}

/** Направления куратора по Telegram ID (для сводки: каждому — его направления); null — полный доступ. */
export function curatorAreasById(id: string): AdminArea[] | null {
  return getBuiltinAdminIds().includes(id) ? null : (curatorAreas.get(id) ?? null);
}
