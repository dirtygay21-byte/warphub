import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { and, gt, isNotNull, isNull, or, relations } from 'drizzle-orm';
import { usersTable } from './users';
import { tablesTable } from './tables';
import { servicesTable } from './services';
import type { ReservationDetails } from '../../modules/booking/rules';

export const reservationsTable = pgTable(
  'reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => usersTable.id)
      .notNull(),
    serviceId: integer('service_id')
      .references(() => servicesTable.id)
      .notNull(),
    tableId: integer('table_id').references(() => tablesTable.id),
    partySize: integer('party_size'),
    seatClubArmyOptions: jsonb('seat_club_army_options').$type<boolean[]>(),
    buyArmyOptions: jsonb('buy_army_options').$type<boolean[]>(),
    /** Данные игрока (армия, очки, опыт) или формы покраски */
    details: jsonb('details').$type<ReservationDetails>(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    status: varchar('status', {
      enum: ['pending', 'confirmed', 'cancelled'],
    })
      .default('pending')
      .notNull(),
    remindAt: timestamp('remind_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  ({
    userId,
    serviceId,
    tableId,
    partySize,
    startsAt,
    endsAt,
    status,
    remindAt,
  }) => [
    index('reservations_user_id_index').on(userId),
    index('reservations_service_id_index').on(serviceId),
    index('reservations_table_id_starts_at_index').on(tableId, startsAt),
    index('reservations_table_id_time_range_index').on(
      tableId,
      startsAt,
      endsAt,
    ),
    index('reservations_starts_at_ends_at_index').on(startsAt, endsAt),
    index('reservations_status_index').on(status),
    index('reservations_remind_at_index').on(remindAt),
    check(
      'reservations_ends_at_check',
      or(isNull(endsAt), isNull(startsAt), gt(endsAt, startsAt))!,
    ),
    check(
      'reservations_table_party_size_check',
      or(isNull(tableId), and(isNotNull(partySize), gt(partySize, 0)))!,
    ),
  ],
);

export const reservationRelations = relations(reservationsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [reservationsTable.userId],
    references: [usersTable.id],
  }),
  service: one(servicesTable, {
    fields: [reservationsTable.serviceId],
    references: [servicesTable.id],
  }),
  table: one(tablesTable, {
    fields: [reservationsTable.tableId],
    references: [tablesTable.id],
  }),
}));
