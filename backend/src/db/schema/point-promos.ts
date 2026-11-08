import { relations } from 'drizzle-orm';
import { doublePrecision, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const pointPromoCodesTable = pgTable(
  'point_promo_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    milestone: integer('milestone').notNull(),
    code: varchar('code').notNull(),
    percent: doublePrecision('percent').notNull().default(25),
    label: text('label').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedBy: uuid('used_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('point_promo_codes_code_unique').on(table.code),
    uniqueIndex('point_promo_codes_user_milestone_unique').on(table.userId, table.milestone),
    index('point_promo_codes_user_index').on(table.userId),
  ],
);

export const pointPromoCodeRelations = relations(pointPromoCodesTable, ({ one }) => ({
  user: one(usersTable, { fields: [pointPromoCodesTable.userId], references: [usersTable.id] }),
  usedBy: one(usersTable, { fields: [pointPromoCodesTable.usedBy], references: [usersTable.id] }),
}));
