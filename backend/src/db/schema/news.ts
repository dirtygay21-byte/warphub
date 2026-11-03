import { jsonb, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { ImageCrop } from '../../lib/image-crop';

export const newsTable = pgTable('news', {
  id: serial('id').primaryKey(),
  coverUrl: varchar('cover_url').notNull(),
  coverCrop: jsonb('cover_crop').$type<ImageCrop>(),
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
