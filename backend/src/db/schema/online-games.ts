import { index, integer, jsonb, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

/**
 * Игра «Начать игру» на двух телефонах (T1, 24.10.2026). Сервер хранит журнал событий и задаёт их порядок;
 * правила проверяет движок игры на каждом телефоне (вариант A: сервер содержимое событий не разбирает).
 */
export const gameSessionsTable = pgTable(
  'game_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** код для второго игрока (5 символов) */
    code: varchar('code', { length: 8 }).notNull().unique(),
    p1UserId: uuid('p1_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    p2UserId: uuid('p2_user_id').references(() => usersTable.id, { onDelete: 'set null' }),
    /** номер последнего события журнала (0 — пусто) */
    lastSeq: integer('last_seq').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('game_sessions_p1_idx').on(t.p1UserId), index('game_sessions_p2_idx').on(t.p2UserId)],
);

export const gameEventsTable = pgTable(
  'game_events',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => gameSessionsTable.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    authorUserId: uuid('author_user_id').references(() => usersTable.id, { onDelete: 'set null' }),
    /** p1 | p2 | null (общее событие) */
    seat: varchar('seat', { length: 2 }),
    event: jsonb('event').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.seq] })],
);
