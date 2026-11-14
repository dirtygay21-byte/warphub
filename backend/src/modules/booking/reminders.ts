/**
 * Напоминания о визите (14.11.2026): раз в 5 минут сервер ищет записи, до начала которых осталось не больше
 * REMIND_BEFORE (3 ч), и пишет игроку в Telegram — что, когда, стол, соперник. Одно напоминание на запись:
 * reservations.remind_at = когда отправлено (отметка ставится до отправки, атомарно — повтора не будет даже
 * при двух процессах). Выключить: REMINDERS=off в .env backend. Отправка — через общий журнал уведомлений.
 */
import { and, asc, eq, gt, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import { reservationsTable, servicesTable, tablesTable, usersTable } from '../../db/schema';
import { notifyKind } from '../notifications/hub';
import { escapeHtml, formatClubDateTime, formatUserName } from '../../lib/telegram/format';
import { REMIND_BEFORE_MS, REMIND_MIN_AGE_MS } from './rules';

export function remindersEnabled(): boolean {
  return (process.env.REMINDERS ?? 'on').toLowerCase() !== 'off';
}

/** Один проход: отметить и отправить напоминания. Возвращает число отправленных. */
export async function sendDueReminders(now = new Date()): Promise<number> {
  // отметить подходящие записи одной командой — RETURNING отдаёт только те, что отметили мы
  const marked = await db
    .update(reservationsTable)
    .set({ remindAt: now })
    .where(
      and(
        isNull(reservationsTable.remindAt),
        inArray(reservationsTable.status, ['pending', 'confirmed']),
        gt(reservationsTable.startsAt, now),
        lte(reservationsTable.startsAt, new Date(now.getTime() + REMIND_BEFORE_MS)),
        lte(reservationsTable.createdAt, new Date(now.getTime() - REMIND_MIN_AGE_MS)),
      ),
    )
    .returning({
      id: reservationsTable.id,
      userId: reservationsTable.userId,
      serviceId: reservationsTable.serviceId,
      tableId: reservationsTable.tableId,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
      status: reservationsTable.status,
    });
  if (marked.length === 0) return 0;

  let sent = 0;
  for (const r of marked) {
    try {
      const [row] = await db
        .select({
          telegramId: usersTable.telegramId,
          serviceTitle: servicesTable.title,
          serviceSlug: servicesTable.slug,
          tableName: tablesTable.name,
        })
        .from(reservationsTable)
        .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
        .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
        .leftJoin(tablesTable, eq(reservationsTable.tableId, tablesTable.id))
        .where(eq(reservationsTable.id, r.id))
        .limit(1);
      if (!row?.telegramId || !r.startsAt) continue;
      // соперники — другие записи той же игры за столом (та же услуга, стол, начало)
      const opponents =
        r.tableId === null
          ? []
          : await db
              .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username })
              .from(reservationsTable)
              .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
              .where(
                and(
                  eq(reservationsTable.serviceId, r.serviceId),
                  eq(reservationsTable.tableId, r.tableId),
                  eq(reservationsTable.startsAt, r.startsAt),
                  ne(reservationsTable.id, r.id),
                  ne(reservationsTable.userId, r.userId),
                  inArray(reservationsTable.status, ['pending', 'confirmed']),
                ),
              )
              .orderBy(asc(reservationsTable.createdAt));
      await notifyKind('reminder_3h', row.telegramId, {
        услуга: escapeHtml(row.serviceTitle ?? row.serviceSlug),
        когда: formatClubDateTime(r.startsAt, r.endsAt),
        стол: row.tableName ? escapeHtml(row.tableName) : '',
        соперник: opponents.map((o) => escapeHtml(formatUserName(o))).join(', '),
        ждёт_подтверждения: r.status === 'pending' ? 'Запись ещё ждёт подтверждения администратора.' : '',
      });
      sent++;
    } catch (error) {
      console.warn('[reminders] reservation', r.id, (error as Error).message);
    }
  }
  return sent;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Запустить проверку раз в 5 минут (из src/index.ts). */
export function startReminderWorker(): void {
  if (timer || !remindersEnabled()) return;
  const tick = () =>
    void sendDueReminders().catch((error) => console.warn('[reminders] pass failed:', (error as Error).message));
  timer = setInterval(tick, 5 * 60_000);
  setTimeout(tick, 30_000);
}

// для отладки в консоли: число записей, ждущих напоминания
export const pendingReminderCount = async (now = new Date()) =>
  (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(and(isNull(reservationsTable.remindAt), inArray(reservationsTable.status, ['pending', 'confirmed']), gt(reservationsTable.startsAt, now)))
  )[0]?.n ?? 0;
