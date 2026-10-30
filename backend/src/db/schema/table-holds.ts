import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { dndGamesTable } from './dnd';
import { tablesTable } from './tables';

/**
 * Бронь стола администратором (30.10.2026): стол закрыт для записи игроков с startsAt по endsAt.
 * Цель — турнирная игра, внутреннее мероприятие, закрытая игра, D&D или другое; у D&D — ссылка на игру.
 * Учитывается там же, где столы ивентов (свободное время, запись, пересадка) — см. modules/table-holds.
 */
export const tableHoldsTable = pgTable(
  'table_holds',
  {
    id: serial('id').primaryKey(),
    tableId: integer('table_id')
      .notNull()
      .references(() => tablesTable.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** tournament | club_event | private_game | dnd | other */
    purpose: varchar('purpose', { length: 20 }).notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    description: text('description'),
    dndGameId: integer('dnd_game_id').references(() => dndGamesTable.id, { onDelete: 'set null' }),
    createdByTelegramId: bigint('created_by_telegram_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('table_holds_interval_check', sql`${table.endsAt} > ${table.startsAt}`),
    index('table_holds_table_time_idx').on(table.tableId, table.startsAt),
  ],
);
