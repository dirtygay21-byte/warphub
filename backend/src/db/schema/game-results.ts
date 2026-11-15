import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from './users';
import { servicesTable } from './services';
import { tablesTable } from './tables';

/**
 * Результаты партий клубной лиги (этап 3, 15.11.2026). Одна строка — одна партия за столом на двоих
 * (услуга + стол + время начала). Бот спрашивает результат после игры; один игрок вносит, второй подтверждает
 * или оспаривает (спор решает администратор); неоспоренный результат засчитывается через 48 часов.
 */
export const gameResultsTable = pgTable(
  'game_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    game: varchar('game', { length: 16 }).notNull(),
    /** услуга записи; у партии турнира — null (этап 4) */
    serviceId: integer('service_id').references(() => servicesTable.id, { onDelete: 'cascade' }),
    tableId: integer('table_id').references(() => tablesTable.id, { onDelete: 'set null' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    playerA: uuid('player_a')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    playerB: uuid('player_b')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** a — победил A, b — победил B, draw — ничья; null — ещё не внесён */
    outcome: varchar('outcome', { length: 8, enum: ['a', 'b', 'draw'] }),
    status: varchar('status', { length: 16, enum: ['awaiting', 'reported', 'confirmed', 'disputed', 'void'] })
      .notNull()
      .default('awaiting'),
    reportedBy: uuid('reported_by').references(() => usersTable.id, { onDelete: 'set null' }),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    /** кто закрыл: opponent | auto | admin */
    confirmedBy: varchar('confirmed_by', { length: 16 }),
    note: text('note'),
    /** партия турнира (этап 4): результат вносит администратор турнира, сразу засчитан */
    tournamentGameId: uuid('tournament_game_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('game_results_game_slot_unique').on(t.serviceId, t.tableId, t.startsAt),
    index('game_results_player_a_index').on(t.playerA),
    index('game_results_player_b_index').on(t.playerB),
    index('game_results_status_index').on(t.status),
    uniqueIndex('game_results_tournament_game_unique').on(t.tournamentGameId),
  ],
);
