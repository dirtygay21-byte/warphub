import { boolean, index, integer, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
