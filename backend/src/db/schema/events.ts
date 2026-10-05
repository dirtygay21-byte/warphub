import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { tablesTable } from './tables';
import { usersTable } from './users';

export const eventsTable = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    title: varchar('title').notNull(),
    description: text('description'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    seatsPerTable: integer('seats_per_table').notNull(),
    bannerUrl: text('banner_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (table) => [
    check('events_seats_per_table_check', sql`${table.seatsPerTable} > 0`),
  ],
);

export const eventsTablesTable = pgTable(
  'events_tables',
  {
    eventId: integer('event_id')
      .notNull()
      .references(() => eventsTable.id, { onDelete: 'cascade' }),
    tableId: integer('table_id')
      .notNull()
      .references(() => tablesTable.id),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.tableId] })],
);

export const usersEventsTable = pgTable(
  'users_events',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    eventId: integer('event_id')
      .notNull()
      .references(() => eventsTable.id, { onDelete: 'cascade' }),
    partySize: integer('party_size').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.eventId] }),
    check('users_events_party_size_check', sql`${table.partySize} > 0`),
  ],
);

export const eventRelations = relations(eventsTable, ({ many }) => ({
  eventTables: many(eventsTablesTable),
  userEvents: many(usersEventsTable),
}));

export const eventTableRelations = relations(eventsTablesTable, ({ one }) => ({
  event: one(eventsTable, {
    fields: [eventsTablesTable.eventId],
    references: [eventsTable.id],
  }),
  table: one(tablesTable, {
    fields: [eventsTablesTable.tableId],
    references: [tablesTable.id],
  }),
}));

export const userEventRelations = relations(usersEventsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [usersEventsTable.userId],
    references: [usersTable.id],
  }),
  event: one(eventsTable, {
    fields: [usersEventsTable.eventId],
    references: [eventsTable.id],
  }),
}));
