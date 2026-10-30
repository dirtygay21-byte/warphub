import { bigint, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

/**
 * Поддержка клуба (30.10.2026): особое звание игрока, назначает администратор.
 * title — одно из: flame (Пламя варпа), crown (Корона клуба), banner (Знамя). Нет строки — нет звания.
 */
export const clubSupportersTable = pgTable('club_supporters', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 16 }).notNull(),
  grantedByTelegramId: bigint('granted_by_telegram_id', { mode: 'number' }).notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
});
