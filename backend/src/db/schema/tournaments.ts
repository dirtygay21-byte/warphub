import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { eventsTable } from './events';
import { usersTable } from './users';

/**
 * Турниры (этап 4, 15.11.2026): ивент становится турниром по швейцарской системе. Участники — записавшиеся на ивент
 * и гости, добавленные администратором. Результаты вносит администратор; партии двух пользователей идут в лигу.
 */
export const tournamentsTable = pgTable(
  'tournaments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => eventsTable.id, { onDelete: 'cascade' }),
    game: varchar('game', { length: 16 }).notNull(),
    rounds: integer('rounds').notNull(),
    status: varchar('status', { length: 16, enum: ['setup', 'running', 'finished'] }).notNull().default('setup'),
    seed: integer('seed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('tournaments_event_unique').on(t.eventId)],
);

export const tournamentPlayersTable = pgTable(
  'tournament_players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournamentsTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => usersTable.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 80 }).notNull(),
    army: varchar('army', { length: 80 }),
    dropped: boolean('dropped').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('tournament_players_tournament_index').on(t.tournamentId)],
);

export const tournamentGamesTable = pgTable(
  'tournament_games',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournamentsTable.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    tableNo: integer('table_no').notNull(),
    playerA: uuid('player_a')
      .notNull()
      .references(() => tournamentPlayersTable.id, { onDelete: 'cascade' }),
    playerB: uuid('player_b').references(() => tournamentPlayersTable.id, { onDelete: 'cascade' }),
    result: varchar('result', { length: 8, enum: ['a', 'b', 'draw'] }),
    vpA: integer('vp_a'),
    vpB: integer('vp_b'),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    note: text('note'),
  },
  (t) => [index('tournament_games_tournament_index').on(t.tournamentId, t.round)],
);
