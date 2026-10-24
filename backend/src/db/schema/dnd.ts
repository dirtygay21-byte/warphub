import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const DND_GAME_STATUSES = [
  /** Черновик — виден только администраторам */
  'draft',
  /** Открыта запись */
  'open',
  /** Видна, но запись закрыта */
  'closed',
  /** Отменена — видна только администраторам и записавшимся */
  'cancelled',
] as const;

export type DndGameStatus = (typeof DND_GAME_STATUSES)[number];

/** Запланированная игра D&D — одна сущность для любого числа игр */
export const dndGamesTable = pgTable(
  'dnd_games',
  {
    id: serial('id').primaryKey(),
    title: varchar('title').notNull(),
    description: text('description'),
    /** Тип игры: «Пробная игра», «One-shot», «Кампания» … */
    gameType: varchar('game_type').notNull(),
    /** Точное начало; null — время примерное (дни недели и время суток), детали согласует Мастер */
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Примерное расписание: дни недели (1 — пн … 7 — вс) */
    daysOfWeek: integer('days_of_week')
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    /** Примерное расписание: время суток (morning / afternoon / evening) */
    timesOfDay: varchar('times_of_day')
      .array()
      .notNull()
      .default(sql`'{}'::varchar[]`),
    capacity: integer('capacity').notNull(),
    imageUrl: text('image_url'),
    status: varchar('status', { enum: DND_GAME_STATUSES })
      .notNull()
      .default('open'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (table) => [
    check('dnd_games_capacity_check', sql`${table.capacity} > 0`),
    check(
      'dnd_games_status_check',
      sql`${table.status} in ('draft', 'open', 'closed', 'cancelled')`,
    ),
    check(
      'dnd_games_ends_at_check',
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      'dnd_games_schedule_check',
      sql`${table.startsAt} is not null or (cardinality(${table.daysOfWeek}) > 0 and cardinality(${table.timesOfDay}) > 0)`,
    ),
    index('dnd_games_starts_at_index').on(table.startsAt),
  ],
);

export const dndGameBookingsTable = pgTable(
  'dnd_game_bookings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: integer('game_id')
      .notNull()
      .references(() => dndGamesTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    timeIsConvenient: boolean('time_is_convenient').notNull(),
    experienceLevel: varchar('experience_level'),
    status: varchar('status', { enum: ['active', 'cancelled'] })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (table) => [
    check('dnd_game_bookings_quantity_check', sql`${table.quantity} > 0`),
    check(
      'dnd_game_bookings_status_check',
      sql`${table.status} in ('active', 'cancelled')`,
    ),
    index('dnd_game_bookings_game_id_index').on(table.gameId),
    index('dnd_game_bookings_user_id_index').on(table.userId),
    uniqueIndex('dnd_game_bookings_active_unique')
      .on(table.gameId, table.userId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const DND_TRIAL_STATUSES = ['new', 'grouped', 'cancelled'] as const;
export type DndTrialStatus = (typeof DND_TRIAL_STATUSES)[number];

/** Заявка «Хочу попробовать» — без даты */
export const dndTrialRequestsTable = pgTable(
  'dnd_trial_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    playersCount: integer('players_count').notNull(),
    preferredTimes: varchar('preferred_times')
      .array()
      .notNull()
      .default(sql`'{}'::varchar[]`),
    experienceLevel: varchar('experience_level'),
    /** Отдельная игра только для своей компании */
    isPrivate: boolean('is_private').notNull().default(false),
    notes: text('notes'),
    status: varchar('status', { enum: DND_TRIAL_STATUSES })
      .notNull()
      .default('new'),
    /** Игра, в которую администратор объединил заявку */
    gameId: integer('game_id').references(() => dndGamesTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      'dnd_trial_requests_players_count_check',
      sql`${table.playersCount} > 0 and ${table.playersCount} <= 20`,
    ),
    check(
      'dnd_trial_requests_status_check',
      sql`${table.status} in ('new', 'grouped', 'cancelled')`,
    ),
    index('dnd_trial_requests_user_id_index').on(table.userId),
    index('dnd_trial_requests_status_index').on(table.status),
  ],
);

export const dndGameRelations = relations(dndGamesTable, ({ many }) => ({
  bookings: many(dndGameBookingsTable),
  trialRequests: many(dndTrialRequestsTable),
}));

export const dndGameBookingRelations = relations(
  dndGameBookingsTable,
  ({ one }) => ({
    game: one(dndGamesTable, {
      fields: [dndGameBookingsTable.gameId],
      references: [dndGamesTable.id],
    }),
    user: one(usersTable, {
      fields: [dndGameBookingsTable.userId],
      references: [usersTable.id],
    }),
  }),
);

export const dndTrialRequestRelations = relations(
  dndTrialRequestsTable,
  ({ one }) => ({
    game: one(dndGamesTable, {
      fields: [dndTrialRequestsTable.gameId],
      references: [dndGamesTable.id],
    }),
    user: one(usersTable, {
      fields: [dndTrialRequestsTable.userId],
      references: [usersTable.id],
    }),
  }),
);
