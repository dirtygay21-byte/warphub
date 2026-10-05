import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  serial,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { servicesTable } from './services';

export const disciplineSlugs = pgEnum('discipline_slugs', [
  'wh',
  'dnd',
  'club',
]);

/** ISO weekday: 1 = Monday, 7 = Sunday */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ALL_ISO_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export const disciplinesTable = pgTable(
  'disciplines',
  {
    id: serial('id').primaryKey(),
    slug: disciplineSlugs('slug').notNull(),
    title: varchar().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    scheduleWeekdays: integer('schedule_weekdays')
      .array()
      .notNull()
      .default([1, 2, 3, 4, 5, 6, 7])
      .$type<IsoWeekday[]>(),
  },
  (table) => [
    check(
      'disciplines_schedule_weekdays_check',
      sql`${table.scheduleWeekdays} <@ ARRAY[1,2,3,4,5,6,7]::integer[] AND cardinality(${table.scheduleWeekdays}) > 0`,
    ),
  ],
);

export const disciplineRelations = relations(disciplinesTable, ({ many }) => ({
  services: many(servicesTable),
}));
