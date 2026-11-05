import { boolean, check, pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { reservationsTable } from './reservations';

/** Категория стола: wh — Full-scale Wargaming (40K, AoS), small — Tactical Games (Kill Team, Warcry) */
export type TableCategory = 'wh' | 'small';

export const tablesTable = pgTable(
  'tables',
  {
    id: serial('id').primaryKey(),
    name: varchar().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    category: varchar('category').$type<TableCategory>().notNull().default('wh'),
  },
  (table) => [check('tables_category_check', sql`${table.category} IN ('wh', 'small')`)],
);

export const tableRelations = relations(tablesTable, ({ many }) => ({
  reservations: many(reservationsTable),
}));
