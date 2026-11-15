import { index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from './users';
import { servicesTable } from './services';

/**
 * Лист ожидания (этап 2, 15.11.2026): «напишите, если на этот день освободится место» — по услуге и дню клуба.
 * Когда кто-то отменяет запись этой услуги на этот день, бот пишет ожидающим один раз (notified_at).
 */
export const bookingWaitlistTable = pgTable(
  'booking_waitlist',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    serviceId: integer('service_id')
      .notNull()
      .references(() => servicesTable.id, { onDelete: 'cascade' }),
    /** день клуба, YYYY-MM-DD */
    date: varchar('date', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('booking_waitlist_user_service_date_unique').on(table.userId, table.serviceId, table.date),
    index('booking_waitlist_service_date_index').on(table.serviceId, table.date),
  ],
);
