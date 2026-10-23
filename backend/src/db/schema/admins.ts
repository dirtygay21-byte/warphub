import { bigint, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Администраторы, добавленные в админке по Telegram ID (N2, 24.10.2026).
 * Встроенные администраторы (код и ADMIN_TELEGRAM_IDS в .env) здесь не хранятся — см. config/admin.ts.
 * Добавлять и удалять могут только встроенные администраторы.
 */
export const adminUsersTable = pgTable('admin_users', {
  telegramId: bigint('telegram_id', { mode: 'number' }).primaryKey(),
  /** пометка: имя или кто это */
  note: varchar('note', { length: 100 }),
  addedByTelegramId: bigint('added_by_telegram_id', { mode: 'number' }).notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
});
