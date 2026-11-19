import { bigint, boolean, index, integer, pgTable, primaryKey, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

/**
 * Одноразовые 4-значные коды доступа к Roster Builder.
 * Сам код не хранится — только HMAC от него (см. modules/roster/codes.ts).
 */
export const rosterAccessCodesTable = pgTable(
  'roster_access_codes',
  {
    id: serial('id').primaryKey(),
    codeHash: text('code_hash').notNull(),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedBy: uuid('used_by').references(() => usersTable.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('roster_access_codes_hash_idx').on(table.codeHash)],
);

/** Пользователи, у которых открыт Roster Builder (бессрочно, пока не отозван). */
export const rosterAccessTable = pgTable('roster_access', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  grantedBy: uuid('granted_by').references(() => usersTable.id, { onDelete: 'set null' }),
  codeId: integer('code_id').references(() => rosterAccessCodesTable.id, { onDelete: 'set null' }),
});

/** Попытки ввода кода — для ограничения перебора. */
export const rosterCodeAttemptsTable = pgTable(
  'roster_code_attempts',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    success: boolean('success').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('roster_code_attempts_user_time_idx').on(table.userId, table.createdAt)],
);

/**
 * Группы Telegram, в которых состоит бот WarpHub (17.11.2026): узнаём из событий бота. purpose = 'boosty' — группа
 * подписчиков Boosty: её участникам WarpBuilder открыт, пока они в группе (выбирает основной администратор).
 */
export const telegramGroupsTable = pgTable('telegram_groups', {
  chatId: bigint('chat_id', { mode: 'number' }).primaryKey(),
  title: text('title').notNull().default(''),
  type: text('type').notNull().default('group'),
  /** статус бота в группе: administrator / member / left / kicked */
  botStatus: text('bot_status').notNull().default('member'),
  purpose: text('purpose'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Участники группы Boosty (по событиям бота и проверке при входе в WarpBuilder). */
export const telegramGroupMembersTable = pgTable(
  'telegram_group_members',
  {
    chatId: bigint('chat_id', { mode: 'number' }).notNull(),
    telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),
    isMember: boolean('is_member').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.telegramId] })],
);
