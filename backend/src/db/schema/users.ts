import { relations } from 'drizzle-orm';
import { bigint, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { reservationsTable } from './reservations';

export const usersTable = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  firstName: varchar('first_name').notNull(),
  lastName: varchar('last_name'),
  username: varchar('username'),
  photoUrl: text('photo_url'),
});

export const userRelations = relations(usersTable, ({ many }) => ({
  reservations: many(reservationsTable),
}));
