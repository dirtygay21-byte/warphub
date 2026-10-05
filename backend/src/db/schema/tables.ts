import { boolean, pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { reservationsTable } from './reservations';

export const tablesTable = pgTable('tables', {
  id: serial('id').primaryKey(),
  name: varchar().notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const tableRelations = relations(tablesTable, ({ many }) => ({
  reservations: many(reservationsTable),
}));
