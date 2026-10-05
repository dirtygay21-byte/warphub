import { pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const newsTable = pgTable('news', {
  id: serial('id').primaryKey(),
  coverUrl: varchar('cover_url').notNull(),
  title: varchar('title').notNull(),
  text: text('text').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});
