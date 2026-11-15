/**
 * Лист ожидания (этап 2, 15.11.2026): игрок просит написать, если на выбранный день освободится место в услуге.
 * Отмена записи этой услуги на этот день (игроком или администратором) — бот пишет всем ожидающим один раз.
 */
import { and, eq, gte, isNull, ne } from 'drizzle-orm';
import { db } from '../../db';
import { bookingWaitlistTable, servicesTable, usersTable } from '../../db/schema';
import { escapeHtml, formatClubDateTime } from '../../lib/telegram/format';
import { clubDateKey } from '../notifications/hub';
import { notifyKind } from '../notifications/hub';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class WaitlistError extends Error {}

export async function joinWaitlist(userId: string, serviceId: number, date: string) {
  if (!Number.isInteger(serviceId) || !DATE_RE.test(date)) throw new WaitlistError('Неверная услуга или дата');
  if (date < clubDateKey(new Date())) throw new WaitlistError('Этот день уже прошёл');
  const [service] = await db.select({ id: servicesTable.id }).from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
  if (!service) throw new WaitlistError('Услуга не найдена');
  // повторная подписка после уведомления — снова ждём
  await db
    .insert(bookingWaitlistTable)
    .values({ userId, serviceId, date })
    .onConflictDoUpdate({
      target: [bookingWaitlistTable.userId, bookingWaitlistTable.serviceId, bookingWaitlistTable.date],
      set: { notifiedAt: null, createdAt: new Date() },
    });
  return { serviceId, date, waiting: true };
}

export async function leaveWaitlist(userId: string, serviceId: number, date: string) {
  await db
    .delete(bookingWaitlistTable)
    .where(and(eq(bookingWaitlistTable.userId, userId), eq(bookingWaitlistTable.serviceId, serviceId), eq(bookingWaitlistTable.date, date)));
  return { serviceId, date, waiting: false };
}

/** Активные подписки игрока с сегодняшнего дня. */
export async function myWaitlist(userId: string) {
  return db
    .select({ serviceId: bookingWaitlistTable.serviceId, date: bookingWaitlistTable.date })
    .from(bookingWaitlistTable)
    .where(and(eq(bookingWaitlistTable.userId, userId), isNull(bookingWaitlistTable.notifiedAt), gte(bookingWaitlistTable.date, clubDateKey(new Date()))));
}

/** После отмены будущей записи: написать ожидающим этот день этой услуги (кроме того, кто отменил). */
export async function notifyWaitlist(reservation: { userId: string; serviceId: number; startsAt: Date | null; endsAt: Date | null }) {
  try {
    if (!reservation.startsAt || reservation.startsAt.getTime() <= Date.now()) return;
    const date = clubDateKey(reservation.startsAt);
    const rows = await db
      .select({ id: bookingWaitlistTable.id, telegramId: usersTable.telegramId })
      .from(bookingWaitlistTable)
      .innerJoin(usersTable, eq(usersTable.id, bookingWaitlistTable.userId))
      .where(
        and(
          eq(bookingWaitlistTable.serviceId, reservation.serviceId),
          eq(bookingWaitlistTable.date, date),
          isNull(bookingWaitlistTable.notifiedAt),
          ne(bookingWaitlistTable.userId, reservation.userId),
        ),
      );
    if (rows.length === 0) return;
    const [service] = await db.select({ title: servicesTable.title, slug: servicesTable.slug }).from(servicesTable).where(eq(servicesTable.id, reservation.serviceId)).limit(1);
    const vars = { что: escapeHtml(service?.title ?? service?.slug ?? 'Запись'), когда: escapeHtml(formatClubDateTime(reservation.startsAt, reservation.endsAt)) };
    for (const row of rows) {
      await db.update(bookingWaitlistTable).set({ notifiedAt: new Date() }).where(eq(bookingWaitlistTable.id, row.id));
      void notifyKind('waitlist_free', row.telegramId, vars, { buttons: [{ text: 'Записаться', path: '/' }] });
    }
  } catch (error) {
    console.error('[waitlist] notify failed', error);
  }
}
