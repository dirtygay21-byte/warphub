/**
 * Центр уведомлений (14.11.2026): тексты из каталога (или свои из админки), настройки игроков, тихие часы,
 * дневной лимит объявлений, очередь и журнал в базе. Личные уведомления (о своих записях) уходят сразу;
 * объявления (поиск соперника, новости, ивенты, рассылки) — через очередь notification_outbox.
 */
import { and, asc, count, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getAdminTelegramIds } from '../../config/admin';
import { bookingConfig } from '../../config/booking';
import { db } from '../../db';
import {
  notificationLogTable,
  notificationMarksTable,
  notificationOutboxTable,
  notificationPrefsTable,
  notificationTemplatesTable,
  usersTable,
} from '../../db/schema';
import { formatClubDateTime } from '../../lib/telegram/format';
import { BROADCAST_KIND, KIND_BY_ID, renderTemplate, type NotificationCategory } from './catalog';
import { sendTelegramMessageDetailed, setSendObserver, type MessageButton } from './service';

const MIN = 60_000;
const OFFSET_MS = bookingConfig.timezoneOffsetMinutes * MIN;

// ---------------------------------------------------------------- настройки

export type NotificationConfig = { quietFrom: number; quietTo: number; dailyLimit: number };
export const DEFAULT_CONFIG: NotificationConfig = { quietFrom: 23, quietTo: 10, dailyLimit: 2 };
const CONFIG_KEY = '_config';

let cache: { at: number; config: NotificationConfig; templates: Map<string, { enabled: boolean; text: string | null }> } | null = null;

export function invalidateNotificationCache() {
  cache = null;
}

async function loadSettings() {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const rows = await db.select().from(notificationTemplatesTable);
  const templates = new Map(rows.filter((r) => r.kind !== CONFIG_KEY).map((r) => [r.kind, { enabled: r.enabled, text: r.text }]));
  let config = DEFAULT_CONFIG;
  const raw = rows.find((r) => r.kind === CONFIG_KEY)?.text;
  if (raw) {
    try {
      config = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<NotificationConfig>) };
    } catch {
      /* битая настройка — стандартная */
    }
  }
  cache = { at: Date.now(), config, templates };
  return cache;
}

export async function getNotificationConfig() {
  return (await loadSettings()).config;
}

export async function saveNotificationConfig(input: NotificationConfig) {
  const value = JSON.stringify(input);
  await db
    .insert(notificationTemplatesTable)
    .values({ kind: CONFIG_KEY, enabled: true, text: value })
    .onConflictDoUpdate({ target: notificationTemplatesTable.kind, set: { text: value, updatedAt: new Date() } });
  invalidateNotificationCache();
}

/** Текст уведомления: свой из админки или стандартный; null — тип выключен. */
export async function renderKind(kindId: string, vars: Record<string, string | number | null | undefined>): Promise<string | null> {
  const kind = KIND_BY_ID.get(kindId);
  if (!kind) return null;
  const custom = (await loadSettings()).templates.get(kindId);
  if (custom && !custom.enabled) return null;
  const text = renderTemplate(custom?.text?.trim() ? custom.text : kind.defaultText, vars);
  return text || null;
}

// ---------------------------------------------------------------- время клуба

/** Час в часовом поясе клуба (UTC+5). */
export const clubHour = (d: Date) => new Date(d.getTime() + OFFSET_MS).getUTCHours();
/** «2026-11-14» — дата клуба. */
export const clubDateKey = (d: Date) => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
/** Начало суток клуба (00:00 UTC+5) для момента d. */
export const clubDayStart = (d: Date) => new Date(Date.parse(`${clubDateKey(d)}T00:00:00Z`) - OFFSET_MS);
/** День недели клуба: 1 — понедельник … 7 — воскресенье. */
export const clubWeekday = (d: Date) => {
  const day = new Date(d.getTime() + OFFSET_MS).getUTCDay();
  return day === 0 ? 7 : day;
};

export function inQuietHours(d: Date, c: NotificationConfig) {
  const h = clubHour(d);
  if (c.quietFrom === c.quietTo) return false;
  return c.quietFrom > c.quietTo ? h >= c.quietFrom || h < c.quietTo : h >= c.quietFrom && h < c.quietTo;
}

/** Когда можно отправить объявление: сейчас или в конце тихих часов. */
export function nextAllowedTime(now: Date, c: NotificationConfig): Date {
  if (!inQuietHours(now, c)) return now;
  const start = clubDayStart(now);
  const today = new Date(start.getTime() + c.quietTo * 60 * MIN);
  return today.getTime() > now.getTime() ? today : new Date(today.getTime() + 24 * 60 * MIN);
}

export { formatClubDateTime };

// ---------------------------------------------------------------- отметки «уже отправлено»

/** true — отметка новая (событие ещё не обрабатывали), false — уже было. */
export async function markOnce(key: string): Promise<boolean> {
  const rows = await db.insert(notificationMarksTable).values({ key }).onConflictDoNothing().returning({ key: notificationMarksTable.key });
  return rows.length > 0;
}

export async function hasMark(key: string) {
  const [row] = await db.select({ key: notificationMarksTable.key }).from(notificationMarksTable).where(eq(notificationMarksTable.key, key)).limit(1);
  return !!row;
}

// ---------------------------------------------------------------- настройки игрока

export type UserPrefs = { opponentGames: string[]; news: boolean; events: boolean; promos: boolean; eveReminder: boolean };
export const DEFAULT_PREFS: UserPrefs = { opponentGames: [], news: true, events: true, promos: true, eveReminder: false };
export const OPPONENT_GAMES = ['40k', 'aos', 'kt', 'warcry'] as const;

export async function getPrefs(userIds: string[]): Promise<Map<string, UserPrefs>> {
  if (!userIds.length) return new Map();
  const rows = await db.select().from(notificationPrefsTable).where(inArray(notificationPrefsTable.userId, userIds));
  return new Map(rows.map((r) => [r.userId, { opponentGames: r.opponentGames ?? [], news: r.news, events: r.events, promos: r.promos, eveReminder: r.eveReminder }]));
}

export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  return (await getPrefs([userId])).get(userId) ?? DEFAULT_PREFS;
}

export async function saveUserPrefs(userId: string, input: Partial<UserPrefs>): Promise<UserPrefs> {
  const next = { ...(await getUserPrefs(userId)), ...input };
  next.opponentGames = [...new Set(next.opponentGames.filter((g) => (OPPONENT_GAMES as readonly string[]).includes(g)))];
  await db
    .insert(notificationPrefsTable)
    .values({ userId, ...next })
    .onConflictDoUpdate({ target: notificationPrefsTable.userId, set: { ...next, updatedAt: new Date() } });
  return next;
}

/** Разрешает ли настройка игрока эту категорию (для поиска соперника — нужна игра). */
export function prefAllows(prefs: UserPrefs, category: NotificationCategory, game?: string | null) {
  if (category === null) return true;
  if (category === 'match') return !!game && prefs.opponentGames.includes(game);
  if (category === 'eve') return prefs.eveReminder;
  return prefs[category];
}

// ---------------------------------------------------------------- отправка

/** Личное уведомление — сразу (тип выключен в админке — не отправляется). */
export async function notifyKind(
  kindId: string,
  telegramId: number | null | undefined,
  vars: Record<string, string | number | null | undefined>,
  extra: { buttons?: MessageButton[]; imageUrl?: string | null } = {},
) {
  if (!telegramId) return;
  const text = await renderKind(kindId, vars);
  if (!text) return;
  await sendTelegramMessageDetailed(telegramId, text, kindId, extra);
}

/** Всем администраторам. */
export async function notifyKindAdmins(kindId: string, vars: Record<string, string | number | null | undefined>) {
  const text = await renderKind(kindId, vars);
  if (!text) return;
  for (const id of getAdminTelegramIds()) void sendTelegramMessageDetailed(id, text, kindId);
}

/** Типы, на которые действует дневной лимит (автоматические объявления; рассылки владельца — нет). */
const LIMITED = new Set(['match_new', 'match_still_free', 'weekly_digest', 'news_new', 'event_new', 'dnd_new', 'event_few_seats', 'rank_up', 'inactive']);

export type Recipient = { telegramId: number; userId?: string | null };

/**
 * Объявление списку получателей: тип включён, игрок разрешил категорию, не помечен «не получает»,
 * не превышен дневной лимит; в тихие часы — ждёт утра. Возвращает число поставленных в очередь.
 */
export async function announce(
  kindId: string,
  recipients: Recipient[],
  text: string | null,
  options: { imageUrl?: string | null; buttons?: MessageButton[]; game?: string | null; broadcastId?: number | null; category?: NotificationCategory; now?: Date } = {},
): Promise<number> {
  if (!text || !recipients.length) return 0;
  const now = options.now ?? new Date();
  const config = await getNotificationConfig();
  const category = options.category !== undefined ? options.category : (KIND_BY_ID.get(kindId)?.category ?? null);

  const unique = [...new Map(recipients.filter((r) => r.telegramId).map((r) => [r.telegramId, r])).values()];
  const prefs = await getPrefs(unique.map((r) => r.userId).filter((x): x is string => !!x));
  let list = unique.filter((r) => prefAllows((r.userId && prefs.get(r.userId)) || DEFAULT_PREFS, category, options.game));

  // «не получает» (403 за последние 30 дней) — не тратим очередь
  if (list.length) {
    const keys = list.map((r) => `unreachable:${r.telegramId}`);
    const marks = await db
      .select({ key: notificationMarksTable.key })
      .from(notificationMarksTable)
      .where(and(inArray(notificationMarksTable.key, keys), gte(notificationMarksTable.at, new Date(now.getTime() - 30 * 24 * 60 * MIN))));
    const blocked = new Set(marks.map((m) => m.key));
    list = list.filter((r) => !blocked.has(`unreachable:${r.telegramId}`));
  }

  // дневной лимит автоматических объявлений
  if (LIMITED.has(kindId) && list.length && config.dailyLimit > 0) {
    const ids = list.map((r) => r.telegramId);
    const since = clubDayStart(now);
    const sent = await db
      .select({ id: notificationLogTable.telegramId, n: count() })
      .from(notificationLogTable)
      .where(and(inArray(notificationLogTable.telegramId, ids), gte(notificationLogTable.at, since), inArray(notificationLogTable.kind, [...LIMITED])))
      .groupBy(notificationLogTable.telegramId);
    const queued = await db
      .select({ id: notificationOutboxTable.telegramId, n: count() })
      .from(notificationOutboxTable)
      .where(and(inArray(notificationOutboxTable.telegramId, ids), inArray(notificationOutboxTable.kind, [...LIMITED])))
      .groupBy(notificationOutboxTable.telegramId);
    const used = new Map<number, number>();
    for (const row of [...sent, ...queued]) used.set(row.id, (used.get(row.id) ?? 0) + Number(row.n));
    list = list.filter((r) => (used.get(r.telegramId) ?? 0) < config.dailyLimit);
  }

  if (!list.length) return 0;
  const notBefore = nextAllowedTime(now, config);
  for (let i = 0; i < list.length; i += 500) {
    await db.insert(notificationOutboxTable).values(
      list.slice(i, i + 500).map((r) => ({
        telegramId: r.telegramId,
        kind: kindId,
        text,
        imageUrl: options.imageUrl ?? null,
        buttons: options.buttons ?? null,
        broadcastId: options.broadcastId ?? null,
        notBefore,
      })),
    );
  }
  return list.length;
}

/** Получатели по списку пользователей (id → telegram). */
export async function recipientsOf(userIds: string[]): Promise<Recipient[]> {
  if (!userIds.length) return [];
  const rows = await db.select({ userId: usersTable.id, telegramId: usersTable.telegramId }).from(usersTable).where(inArray(usersTable.id, userIds));
  return rows.map((r) => ({ userId: r.userId, telegramId: r.telegramId }));
}

/** Все пользователи (для объявлений клуба). */
export async function allRecipients(): Promise<Recipient[]> {
  const rows = await db.select({ userId: usersTable.id, telegramId: usersTable.telegramId }).from(usersTable);
  return rows.map((r) => ({ userId: r.userId, telegramId: r.telegramId }));
}

// ---------------------------------------------------------------- очередь

const RATE_DELAY_MS = 50; // ~20 сообщений в секунду — ниже лимита Telegram
let draining = false;

/** Отправить готовые сообщения из очереди (одним проходом, по порядку). */
export async function processOutbox(now = new Date(), limit = 300): Promise<number> {
  if (draining) return 0;
  draining = true;
  let sent = 0;
  try {
    const due = await db
      .select()
      .from(notificationOutboxTable)
      .where(lte(notificationOutboxTable.notBefore, now))
      .orderBy(asc(notificationOutboxTable.id))
      .limit(limit);
    for (const item of due) {
      // забираем строку; если её уже забрал другой проход — пропускаем
      const taken = await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, item.id)).returning({ id: notificationOutboxTable.id });
      if (!taken.length) continue;
      const result = await sendTelegramMessageDetailed(item.telegramId, item.text, item.kind, {
        imageUrl: item.imageUrl,
        buttons: item.buttons,
        broadcastId: item.broadcastId,
      });
      if (result.ok) sent++;
      else if (result.reason === 'network' && item.attempts < 5) {
        // нет связи — повторим через 5 минут
        await db.insert(notificationOutboxTable).values({ ...item, id: undefined, attempts: item.attempts + 1, notBefore: new Date(Date.now() + 5 * MIN) });
      }
      await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
    }
  } finally {
    draining = false;
  }
  return sent;
}

export async function outboxSize() {
  const [row] = await db.select({ n: count() }).from(notificationOutboxTable);
  return Number(row?.n ?? 0);
}

// ---------------------------------------------------------------- журнал

let failStreak: { from: Date; n: number } | null = null;

function persistLogs() {
  return (process.env.NOTIFICATION_LOG ?? 'on').toLowerCase() !== 'off';
}

/** Журнал в базе, «не получает» после 403, сигнал администраторам, когда связь вернулась. */
export function installSendObserver() {
  setSendObserver(({ chatId, kind, result, broadcastId }) => {
    if (!persistLogs()) return;
    const telegramId = Number(chatId);
    void db
      .insert(notificationLogTable)
      .values({
        telegramId,
        kind,
        broadcastId: broadcastId ?? null,
        ok: result.ok,
        reason: result.ok ? null : result.reason,
        status: result.ok ? null : (result.status ?? null),
        description: result.ok ? null : (result.description?.slice(0, 300) ?? null),
      })
      .catch((error) => console.warn('[notify] log insert failed', (error as Error).message));

    const key = `unreachable:${telegramId}`;
    if (result.ok) {
      void db.delete(notificationMarksTable).where(eq(notificationMarksTable.key, key)).catch(() => {});
    } else if (result.reason === 'telegram' && result.status === 403) {
      void db
        .insert(notificationMarksTable)
        .values({ key })
        .onConflictDoUpdate({ target: notificationMarksTable.key, set: { at: new Date() } })
        .catch(() => {});
    }

    if (!result.ok && result.reason === 'network') {
      failStreak = failStreak ? { ...failStreak, n: failStreak.n + 1 } : { from: new Date(), n: 1 };
    } else if (result.ok && failStreak) {
      const streak = failStreak;
      failStreak = null;
      if (streak.n >= 5 && kind !== 'admin_delivery_alert') {
        const fmt = (d: Date) => formatClubDateTime(d, null);
        void notifyKindAdmins('admin_delivery_alert', { с: fmt(streak.from), по: fmt(new Date()), сколько: streak.n });
      }
    }
  });
}

/** Журнал для админки: последние записи и итоги за сутки и неделю. */
export async function notificationLog(options: { kind?: string; limit?: number } = {}) {
  const where = options.kind ? eq(notificationLogTable.kind, options.kind) : undefined;
  const rows = await db
    .select()
    .from(notificationLogTable)
    .where(where)
    .orderBy(sql`${notificationLogTable.at} desc`)
    .limit(Math.min(options.limit ?? 100, 300));
  const totals = async (since: Date) => {
    const [row] = await db
      .select({
        all: count(),
        ok: sql<number>`count(*) filter (where ${notificationLogTable.ok})`,
      })
      .from(notificationLogTable)
      .where(where ? and(where, gte(notificationLogTable.at, since)) : gte(notificationLogTable.at, since));
    return { sent: Number(row?.all ?? 0), delivered: Number(row?.ok ?? 0) };
  };
  const now = Date.now();
  return {
    rows: rows.map((r) => ({ ...r, at: r.at.toISOString() })),
    day: await totals(new Date(now - 24 * 60 * MIN)),
    week: await totals(new Date(now - 7 * 24 * 60 * MIN)),
    queued: await outboxSize(),
    broadcastKind: BROADCAST_KIND,
  };
}
