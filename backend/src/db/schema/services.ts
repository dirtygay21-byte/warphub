import {
  boolean,
  check,
  integer,
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
} from 'drizzle-orm/pg-core';
import { gt, isNull, or, relations } from 'drizzle-orm';
import { disciplinesTable } from './disciplines';
import { reservationsTable } from './reservations';

export const serviceSlugs = pgEnum('service_slugs', [
  'club_visit',
  'dnd_game',
  'wh_game',
  'wh_group_training',
  'wh_solo_training',
  'wh_painting',
]);

export const tableCapacityProfile = pgEnum('table_capacity_profile', [
  'small',
  'large',
]);

export const servicesTable = pgTable(
  'services',
  {
    id: serial('id').primaryKey(),
    disciplineId: integer('discipline_id')
      .references(() => disciplinesTable.id)
      .notNull(),
    slug: serviceSlugs('slug').notNull(),
    title: varchar('title'),
    tableCapacityProfile: tableCapacityProfile('table_capacity_profile'),
    duration: integer(),
    visitorsCapacity: integer('visitors_capacity'),
    /** Игроков за одним столом (WH-игра: 2, групповая тренировка: 2, инд.: 1) */
    seatsPerTable: integer('seats_per_table'),
    /** Общая вместимость без столов (покраска: 5, посещение клуба: 25) */
    poolCapacity: integer('pool_capacity'),
    /** На записи присутствует тренер (не занимает место игрока) */
    hasTrainer: boolean('has_trainer').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    /** Подтверждать запись автоматически (17.11.2026): новая запись сразу «подтверждена»; выкл. — ждёт администратора */
    autoConfirm: boolean('auto_confirm').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    description: text('description'),
  },
  ({ duration, visitorsCapacity, seatsPerTable, poolCapacity }) => [
    check('services_duration_check', or(isNull(duration), gt(duration, 0))!),
    check(
      'services_visitors_capacity_check',
      or(isNull(visitorsCapacity), gt(visitorsCapacity, 0))!,
    ),
    check(
      'services_seats_per_table_check',
      or(isNull(seatsPerTable), gt(seatsPerTable, 0))!,
    ),
    check(
      'services_pool_capacity_check',
      or(isNull(poolCapacity), gt(poolCapacity, 0))!,
    ),
  ],
);

export const serviceRelations = relations(servicesTable, ({ one, many }) => ({
  discipline: one(disciplinesTable, {
    fields: [servicesTable.disciplineId],
    references: [disciplinesTable.id],
  }),
  reservations: many(reservationsTable),
}));
