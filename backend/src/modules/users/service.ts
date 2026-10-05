import { count, eq, ilike } from 'drizzle-orm';
import { db } from '../../db';
import { reservationsTable, usersTable } from '../../db/schema';
import type { TelegramWebAppUser } from '../../lib/telegram/types';

export type User = typeof usersTable.$inferSelect;

export type AdminUserView = {
  id: string;
  telegramId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  reservationsCount: number;
};

function toAdminUserView(user: User, reservationsCount: number): AdminUserView {
  return {
    id: user.id,
    telegramId: user.telegramId,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    photoUrl: user.photoUrl,
    reservationsCount,
  };
}

async function countUserReservations(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(reservationsTable)
    .where(eq(reservationsTable.userId, userId));

  return Number(row?.value ?? 0);
}

export async function findUserById(id: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);

  return user;
}

export async function findUserByTelegramId(
  telegramId: number,
): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);

  return user;
}

export async function upsertUserFromTelegram(
  telegramUser: TelegramWebAppUser,
): Promise<User> {
  const existing = await findUserByTelegramId(telegramUser.id);

  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name ?? null,
        username: telegramUser.username ?? null,
        photoUrl: telegramUser.photo_url ?? null,
      })
      .where(eq(usersTable.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      telegramId: telegramUser.id,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name ?? null,
      username: telegramUser.username ?? null,
      photoUrl: telegramUser.photo_url ?? null,
    })
    .returning();

  return created;
}

export async function searchUsersByUsername(
  username: string,
  limit = 20,
): Promise<AdminUserView[]> {
  const normalized = username.trim().replace(/^@/, '');
  if (!normalized) return [];

  const pageSize = Math.min(Math.max(limit, 1), 50);
  const users = await db
    .select()
    .from(usersTable)
    .where(ilike(usersTable.username, `%${normalized}%`))
    .limit(pageSize);

  return Promise.all(
    users.map(async (user) =>
      toAdminUserView(user, await countUserReservations(user.id)),
    ),
  );
}

export async function getAdminUserProfile(
  userId: string,
): Promise<AdminUserView | undefined> {
  const user = await findUserById(userId);
  if (!user) return undefined;

  return toAdminUserView(user, await countUserReservations(user.id));
}
