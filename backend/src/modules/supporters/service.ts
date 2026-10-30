/**
 * Поддержка клуба (30.10.2026): администратор назначает игроку одно из трёх званий (рамка аватара и значок).
 * Хранится в club_supporters; игрок видит своё звание в /me/progress. Проверка — tests/supporters-e2e.test.ts.
 */
import { desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db';
import { clubSupportersTable, usersTable } from '../../db/schema';

export const SUPPORTER_TITLES = ['flame', 'crown', 'banner'] as const;
export type SupporterTitle = (typeof SUPPORTER_TITLES)[number];
export const SUPPORTER_LABELS: Record<SupporterTitle, string> = {
  flame: 'Пламя варпа',
  crown: 'Корона клуба',
  banner: 'Знамя',
};

export class SupporterError extends Error {
  constructor(
    readonly code: 'INVALID_TITLE' | 'USER_NOT_FOUND',
    message: string,
  ) {
    super(message);
  }
}

export const isSupporterTitle = (value: unknown): value is SupporterTitle =>
  typeof value === 'string' && (SUPPORTER_TITLES as readonly string[]).includes(value);

export type SupporterView = {
  user: { id: string; telegramId: number; firstName: string; lastName: string | null; username: string | null };
  title: SupporterTitle | null;
  grantedAt: string | null;
  grantedByTelegramId: number | null;
};

const userColumns = {
  id: usersTable.id,
  telegramId: usersTable.telegramId,
  firstName: usersTable.firstName,
  lastName: usersTable.lastName,
  username: usersTable.username,
};

export async function getSupporterTitle(userId: string): Promise<SupporterTitle | null> {
  const [row] = await db.select({ title: clubSupportersTable.title }).from(clubSupportersTable).where(eq(clubSupportersTable.userId, userId));
  return row && isSupporterTitle(row.title) ? row.title : null;
}

export async function listSupporters(): Promise<SupporterView[]> {
  const rows = await db
    .select({ user: userColumns, title: clubSupportersTable.title, grantedAt: clubSupportersTable.grantedAt, by: clubSupportersTable.grantedByTelegramId })
    .from(clubSupportersTable)
    .innerJoin(usersTable, eq(clubSupportersTable.userId, usersTable.id))
    .orderBy(desc(clubSupportersTable.grantedAt));
  return rows.map((r) => ({ user: r.user, title: isSupporterTitle(r.title) ? r.title : null, grantedAt: r.grantedAt.toISOString(), grantedByTelegramId: r.by }));
}

/** Поиск игрока по @username или Telegram ID — для назначения звания. */
export async function findPlayers(q: string): Promise<SupporterView[]> {
  const query = q.trim().replace(/^@/, '');
  if (!query) return [];
  const id = /^\d{3,}$/.test(query) ? Number(query) : null;
  const rows = await db
    .select({ user: userColumns, title: clubSupportersTable.title, grantedAt: clubSupportersTable.grantedAt, by: clubSupportersTable.grantedByTelegramId })
    .from(usersTable)
    .leftJoin(clubSupportersTable, eq(clubSupportersTable.userId, usersTable.id))
    .where(id !== null ? or(eq(usersTable.telegramId, id), ilike(usersTable.username, `%${query}%`)) : ilike(usersTable.username, `%${query}%`))
    .limit(20);
  return rows.map((r) => ({
    user: r.user,
    title: r.title && isSupporterTitle(r.title) ? r.title : null,
    grantedAt: r.grantedAt ? r.grantedAt.toISOString() : null,
    grantedByTelegramId: r.by ?? null,
  }));
}

/** Назначить звание (title) или снять (null). */
export async function setSupporter(userId: string, title: unknown, adminTelegramId: number): Promise<SupporterView> {
  if (title !== null && !isSupporterTitle(title)) throw new SupporterError('INVALID_TITLE', 'Unknown supporter title');
  const [user] = await db.select(userColumns).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new SupporterError('USER_NOT_FOUND', 'User not found');
  if (title === null) {
    await db.delete(clubSupportersTable).where(eq(clubSupportersTable.userId, userId));
    return { user, title: null, grantedAt: null, grantedByTelegramId: null };
  }
  const now = new Date();
  await db
    .insert(clubSupportersTable)
    .values({ userId, title, grantedByTelegramId: adminTelegramId, grantedAt: now })
    .onConflictDoUpdate({ target: clubSupportersTable.userId, set: { title, grantedByTelegramId: adminTelegramId, grantedAt: now } });
  return { user, title, grantedAt: now.toISOString(), grantedByTelegramId: adminTelegramId };
}
