import { boolean, check, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const partnerSettingsTable = pgTable('partner_settings', {
  id: integer('id').primaryKey(),
  partner1Title: varchar('partner1_title', { length: 120 }).notNull().default('Партнёр 1'),
  partner2Title: varchar('partner2_title', { length: 120 }).notNull().default('Партнёр 2'),
  footerText: text('footer_text').notNull().default('Мини-ки по скидке'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export const partnerCardsTable = pgTable('partner_cards', {
  id: serial('id').primaryKey(),
  lane: integer('lane').notNull(),
  title: varchar('title', { length: 180 }).notNull(),
  text: text('text').notNull().default(''),
  url: text('url').notNull(),
  imageUrl: text('image_url').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
}, (table) => [
  check('partner_cards_lane_check', sql`${table.lane} in (1, 2)`),
  check('partner_cards_sort_order_check', sql`${table.sortOrder} >= 0`),
]);
