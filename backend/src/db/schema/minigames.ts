import { relations, sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { usersTable } from './users';

/**
 * Попытка в мини-игре. Сервер фиксирует время начала и сам считает
 * результат (кубики) или проверяет его правдоподобность (бег, яйцо).
 * state — JSON (текстом) для пошаговой игры «Кости войны».
 */
export const minigameSessionsTable = pgTable(
  'minigame_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    game: varchar('game').notNull(),
    status: varchar('status', { enum: ['started', 'finished', 'rejected'] })
      .notNull()
      .default('started'),
    state: text('state'),
    score: integer('score'),
    rejectReason: varchar('reject_reason'),
    rewardId: uuid('reward_id'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'minigame_sessions_status_check',
      sql`${table.status} in ('started', 'finished', 'rejected')`,
    ),
    index('minigame_sessions_user_game_index').on(
      table.userId,
      table.game,
      table.startedAt,
    ),
  ],
);

/** Награда: одна на игру в неделю (лучший результат недели) */
export const minigameRewardsTable = pgTable(
  'minigame_rewards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    game: varchar('game').notNull(),
    sessionId: uuid('session_id'),
    weekKey: varchar('week_key').notNull(),
    tierRank: integer('tier_rank').notNull(),
    score: integer('score').notNull(),
    rewardType: varchar('reward_type').notNull(),
    rewardValue: doublePrecision('reward_value').notNull(),
    label: varchar('label').notNull(),
    code: varchar('code').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedBy: uuid('used_by').references(() => usersTable.id, {
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
    uniqueIndex('minigame_rewards_code_unique').on(table.code),
    uniqueIndex('minigame_rewards_user_game_week_unique').on(
      table.userId,
      table.game,
      table.weekKey,
    ),
    index('minigame_rewards_user_index').on(table.userId),
  ],
);

/** Настройки мини-игр из админки (одна строка id = 'global', JSON текстом) */
export const minigameSettingsTable = pgTable('minigame_settings', {
  id: varchar('id').primaryKey(),
  settings: text('settings').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedBy: uuid('updated_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
});

export const minigameRewardRelations = relations(
  minigameRewardsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [minigameRewardsTable.userId],
      references: [usersTable.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// «Легенды Warp Hub»: пакеты карт, коллекция, счёт очков
// ---------------------------------------------------------------------------

/** Открытый пакет: содержимое генерирует сервер */
export const cardPacksTable = pgTable(
  'card_packs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** День клуба (UTC+5), YYYY-MM-DD — для лимита пакетов в день */
    dayKey: varchar('day_key').notNull(),
    /** JSON (текстом): [{ cardId, rarity, points }] */
    cards: text('cards').notNull(),
    points: integer('points').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('card_packs_user_day_index').on(table.userId, table.dayKey)],
);

/** Коллекция игрока: сколько экземпляров каждой карты */
export const cardCollectionTable = pgTable(
  'card_collection',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    cardId: varchar('card_id').notNull(),
    count: integer('count').notNull().default(0),
    firstAt: timestamp('first_at', { withTimezone: true }).defaultNow().notNull(),
    lastAt: timestamp('last_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.cardId] })],
);

/** Движение очков: начисления за карты и списания администратором */
export const pointsLedgerTable = pgTable(
  'points_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: varchar('reason', { enum: ['card_pack', 'admin_spend', 'admin_add'] }).notNull(),
    note: text('note'),
    refId: uuid('ref_id'),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('points_ledger_user_index').on(table.userId, table.createdAt)],
);
