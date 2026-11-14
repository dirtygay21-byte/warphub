/**
 * Система уведомлений (14.11.2026): журнал отправок, очередь (тихие часы, лимит), настройки игроков,
 * тексты автоматических уведомлений, отметки «уже отправлено» и рассылки администратора.
 */
import { bigint, boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export type NotificationButton = { text: string; path?: string; url?: string };

/** Каждая отправка: кому, какой тип, результат (без текста сообщения). */
export const notificationLogTable = pgTable(
  'notification_log',
  {
    id: serial('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
    telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),
    kind: varchar('kind').notNull(),
    broadcastId: integer('broadcast_id'),
    ok: boolean('ok').notNull(),
    reason: varchar('reason'),
    status: integer('status'),
    description: text('description'),
  },
  (t) => [index('notification_log_tg_at_index').on(t.telegramId, t.at), index('notification_log_kind_at_index').on(t.kind, t.at)],
);

/** Очередь объявлений: ждут конца тихих часов или своей очереди (ограничение скорости Telegram). */
export const notificationOutboxTable = pgTable(
  'notification_outbox',
  {
    id: serial('id').primaryKey(),
    telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),
    kind: varchar('kind').notNull(),
    text: text('text').notNull(),
    imageUrl: text('image_url'),
    buttons: jsonb('buttons').$type<NotificationButton[]>(),
    broadcastId: integer('broadcast_id'),
    notBefore: timestamp('not_before', { withTimezone: true }).defaultNow().notNull(),
    attempts: integer('attempts').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('notification_outbox_not_before_index').on(t.notBefore)],
);

/** Настройки игрока: что присылать (поиск соперника — только по включённым играм). */
export const notificationPrefsTable = pgTable('user_notification_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  opponentGames: jsonb('opponent_games').$type<string[]>().default([]).notNull(),
  news: boolean('news').default(true).notNull(),
  events: boolean('events').default(true).notNull(),
  promos: boolean('promos').default(true).notNull(),
  eveReminder: boolean('eve_reminder').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Автоматические уведомления: включено ли и свой текст (null — стандартный). Ключ «_config» — общие настройки. */
export const notificationTemplatesTable = pgTable('notification_templates', {
  kind: varchar('kind').primaryKey(),
  enabled: boolean('enabled').default(true).notNull(),
  text: text('text'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** «Уже отправлено»: ключ события (например eve:<запись>, digest:2026-11-14) — второй раз не шлём. */
export const notificationMarksTable = pgTable('notification_marks', {
  key: varchar('key').primaryKey(),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
});

export type BroadcastAudience = { kind: 'all' | 'game' | 'recent' | 'events' | 'admins' | 'me'; game?: string; days?: number };
export type BroadcastSchedule =
  | { type: 'now' }
  | { type: 'once'; at: string }
  | { type: 'weekly'; days: number[]; time: string; until?: string | null }
  | { type: 'monthly'; day: number; time: string; until?: string | null };

/** Рассылки владельца: текст, картинка, кнопки, аудитория, расписание. */
export const broadcastsTable = pgTable('broadcasts', {
  id: serial('id').primaryKey(),
  title: varchar('title').notNull(),
  text: text('text').notNull(),
  imageUrl: text('image_url'),
  buttons: jsonb('buttons').$type<NotificationButton[]>().default([]).notNull(),
  audience: jsonb('audience').$type<BroadcastAudience>().notNull(),
  schedule: jsonb('schedule').$type<BroadcastSchedule>().notNull(),
  status: varchar('status', { enum: ['draft', 'scheduled', 'paused', 'done'] }).default('draft').notNull(),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  runs: integer('runs').default(0).notNull(),
  lastRecipients: integer('last_recipients'),
  createdBy: bigint('created_by', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});
