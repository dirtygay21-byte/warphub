/**
 * Администраторы по Telegram ID (N2, 24.10.2026): встроенные администраторы (код и .env) добавляют и удаляют
 * других в админке. Список добавленных — таблица admin_users и копия в памяти (config/admin.ts), чтобы проверка
 * прав оставалась мгновенной; копия обновляется при старте сервера, раз в 5 минут и после каждого изменения.
 */
import { eq, inArray } from 'drizzle-orm';
import { getBuiltinAdminIds, isBuiltinAdmin, setAddedAdminIds } from '../../config/admin';
import { db } from '../../db';
import { adminUsersTable, usersTable } from '../../db/schema';
import { notifyUser } from '../notifications/service';
import type { User } from '../users/service';
import { cleanNote, parseTelegramId } from './rules';

export class AdminsError extends Error {
  constructor(
    public code: 'FORBIDDEN' | 'BAD_ID' | 'BUILTIN' | 'EXISTS' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
  }
}

/** Перечитать добавленных администраторов в память. Ошибка (например, нет таблицы до миграции) — только в лог. */
export async function refreshAddedAdmins(): Promise<void> {
  try {
    const rows = await db.select({ id: adminUsersTable.telegramId }).from(adminUsersTable);
    setAddedAdminIds(rows.map((r) => r.id));
  } catch (error) {
    console.warn('[admins] could not load admin_users:', (error as Error).message);
  }
}

export type AdminEntry = {
  telegramId: number;
  builtin: boolean;
  note: string | null;
  name: string | null;
  username: string | null;
  addedAt: string | null;
  addedByTelegramId: number | null;
};

/** Все администраторы: встроенные (удалить нельзя) и добавленные; имя — если человек уже входил в приложение. */
export async function listAdmins(): Promise<{ admins: AdminEntry[] }> {
  const added = await db.select().from(adminUsersTable).orderBy(adminUsersTable.addedAt);
  const builtin = getBuiltinAdminIds().map(Number);
  const ids = [...new Set([...builtin, ...added.map((a) => a.telegramId)])];
  const users = ids.length
    ? await db
        .select({ telegramId: usersTable.telegramId, firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.telegramId, ids))
    : [];
  const who = (id: number) => users.find((u) => u.telegramId === id);
  const name = (id: number) => {
    const u = who(id);
    return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : null;
  };
  return {
    admins: [
      ...builtin.map((id) => ({ telegramId: id, builtin: true, note: null, name: name(id), username: who(id)?.username ?? null, addedAt: null, addedByTelegramId: null })),
      ...added
        .filter((a) => !builtin.includes(a.telegramId))
        .map((a) => ({
          telegramId: a.telegramId,
          builtin: false,
          note: a.note,
          name: name(a.telegramId),
          username: who(a.telegramId)?.username ?? null,
          addedAt: a.addedAt.toISOString(),
          addedByTelegramId: a.addedByTelegramId,
        })),
    ],
  };
}

function requireBuiltin(by: User) {
  if (!isBuiltinAdmin(by)) throw new AdminsError('FORBIDDEN', 'Добавлять и удалять администраторов могут только основные администраторы');
}

export async function addAdmin(by: User, rawId: unknown, rawNote: unknown) {
  requireBuiltin(by);
  const telegramId = parseTelegramId(rawId);
  if (telegramId === null) throw new AdminsError('BAD_ID', 'Telegram ID — число из 5–15 цифр');
  if (getBuiltinAdminIds().includes(String(telegramId))) throw new AdminsError('BUILTIN', 'Это основной администратор — он уже имеет доступ');
  const inserted = await db
    .insert(adminUsersTable)
    .values({ telegramId, note: cleanNote(rawNote), addedByTelegramId: by.telegramId })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) throw new AdminsError('EXISTS', 'Этот Telegram ID уже администратор');
  await refreshAddedAdmins();
  notifyUser(telegramId, '🛡 <b>Вам открыт доступ к админке WarpHub.</b>\nОткройте приложение заново — раздел администратора появится в меню.');
  return listAdmins();
}

export async function removeAdmin(by: User, rawId: unknown) {
  requireBuiltin(by);
  const telegramId = parseTelegramId(rawId);
  if (telegramId === null) throw new AdminsError('BAD_ID', 'Telegram ID — число из 5–15 цифр');
  if (getBuiltinAdminIds().includes(String(telegramId))) throw new AdminsError('BUILTIN', 'Основного администратора нельзя удалить из админки');
  const removed = await db.delete(adminUsersTable).where(eq(adminUsersTable.telegramId, telegramId)).returning();
  if (!removed.length) throw new AdminsError('NOT_FOUND', 'Такого администратора нет');
  await refreshAddedAdmins();
  return listAdmins();
}
