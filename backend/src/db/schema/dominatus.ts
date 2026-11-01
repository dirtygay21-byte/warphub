import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

/**
 * Кампания Dominatus в WarpHub (DM2, 31.10.2026). Одна активная кампания; Warmaster — администраторы WarpHub.
 * Карты физические: здесь хранится, какую карту игрок оставил. Правила — modules/dominatus/rules.ts.
 */
export const dominatusCampaignsTable = pgTable('dominatus_campaigns', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  /** active | finished */
  status: varchar('status', { length: 16 }).notNull().default('active'),
  /** решение Warmaster о победителе кампании (альянс); правила его не определяют */
  winnerAlliance: varchar('winner_alliance', { length: 16 }),
  createdByTelegramId: bigint('created_by_telegram_id', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const dominatusPlayersTable = pgTable(
  'dominatus_players',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id')
      .notNull()
      .references(() => dominatusCampaignsTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** liberators | oppressors | raiders */
    alliance: varchar('alliance', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('dominatus_players_campaign_user').on(t.campaignId, t.userId)],
);

export const dominatusPhasesTable = pgTable(
  'dominatus_phases',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id')
      .notNull()
      .references(() => dominatusCampaignsTable.id, { onDelete: 'cascade' }),
    phase: integer('phase').notNull(),
    locationId: varchar('location_id', { length: 40 }),
    /** D6 при случайном выборе; null — выбор Warmaster */
    locationRoll: integer('location_roll'),
    /** open | resolved */
    status: varchar('status', { length: 16 }).notNull().default('open'),
    /** итог фазы: контроль, Ascendancy, Narrative Points (заполняется при завершении) */
    controller: varchar('controller', { length: 16 }),
    ascendant: text('ascendant')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    narrative: jsonb('narrative').$type<Record<string, number>>(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('dominatus_phases_campaign_phase').on(t.campaignId, t.phase)],
);

export const dominatusBattlesTable = pgTable(
  'dominatus_battles',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id')
      .notNull()
      .references(() => dominatusCampaignsTable.id, { onDelete: 'cascade' }),
    phase: integer('phase').notNull(),
    locationId: varchar('location_id', { length: 40 }),
    /** id игры WarpHub: повторная запись той же игры обновляет битву, а не создаёт вторую */
    gameKey: varchar('game_key', { length: 80 }).notNull(),
    player1Id: integer('player1_id')
      .notNull()
      .references(() => dominatusPlayersTable.id, { onDelete: 'cascade' }),
    player2Id: integer('player2_id')
      .notNull()
      .references(() => dominatusPlayersTable.id, { onDelete: 'cascade' }),
    vp1: integer('vp1').notNull(),
    vp2: integer('vp2').notNull(),
    /** p1 | p2 | draw */
    result: varchar('result', { length: 8 }).notNull(),
    agenda1: varchar('agenda1', { length: 60 }),
    agenda2: varchar('agenda2', { length: 60 }),
    achieved1: integer('achieved1').notNull().default(0),
    achieved2: integer('achieved2').notNull().default(0),
    /** снимок игры: раунды, миссии, улучшения — для истории и отправки на сайт (DM4) */
    details: jsonb('details').$type<Record<string, unknown>>(),
    recordedByUserId: uuid('recorded_by_user_id').references(() => usersTable.id, { onDelete: 'set null' }),
    playedAt: timestamp('played_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('dominatus_battles_game_key').on(t.campaignId, t.gameKey), index('dominatus_battles_campaign_phase').on(t.campaignId, t.phase)],
);

export const dominatusCardsTable = pgTable(
  'dominatus_cards',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id')
      .notNull()
      .references(() => dominatusCampaignsTable.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .notNull()
      .references(() => dominatusPlayersTable.id, { onDelete: 'cascade' }),
    /** honour | skill | relic | agenda (Agenda Achieved) */
    kind: varchar('kind', { length: 16 }).notNull(),
    /** название карты; null — карта ещё не выбрана (награда ожидает выбора игрока) или Agenda Achieved */
    name: varchar('name', { length: 80 }),
    /** колода фазы для Battle Honour; фаза получения */
    phase: integer('phase').notNull(),
    battleId: integer('battle_id').references(() => dominatusBattlesTable.id, { onDelete: 'cascade' }),
    /** battle | agenda | relic | location | manual */
    source: varchar('source', { length: 16 }).notNull(),
    /** сколько карт тянуть, чтобы выбрать эту (для ожидающей выбора) */
    draw: integer('draw').notNull().default(1),
    note: varchar('note', { length: 200 }),
    discarded: boolean('discarded').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('dominatus_cards_player').on(t.playerId)],
);
