import { and, eq, inArray, lte } from 'drizzle-orm';
import { db } from '../../db';
import { dndGameBookingsTable, dndGamesTable, reservationsTable, servicesTable } from '../../db/schema';
import {
  categoryOfService,
  dndBookingCounts,
  PROGRESS_CATEGORIES,
  progressOf,
  reservationCounts,
  type CategoryProgress,
  type ProgressCategory,
} from './rules';

export type PlayerProgress = { categories: CategoryProgress[]; total: number };

/** Прогресс игрока: считается по записям при каждом запросе (своих таблиц нет — прошлые игры учтены). */
export async function getPlayerProgress(userId: string, now = new Date()): Promise<PlayerProgress> {
  const counts: Record<ProgressCategory, number> = { warhammer: 0, dnd: 0, painting: 0, visits: 0 };

  const reservations = await db
    .select({
      status: reservationsTable.status,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
      slug: servicesTable.slug,
    })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .where(and(eq(reservationsTable.userId, userId), eq(reservationsTable.status, 'confirmed'), lte(reservationsTable.startsAt, now)));
  for (const r of reservations) {
    const category = categoryOfService(r.slug);
    if (category && reservationCounts(r, now)) counts[category] += 1;
  }

  const dnd = await db
    .select({
      status: dndGameBookingsTable.status,
      gameStatus: dndGamesTable.status,
      startsAt: dndGamesTable.startsAt,
      endsAt: dndGamesTable.endsAt,
    })
    .from(dndGameBookingsTable)
    .innerJoin(dndGamesTable, eq(dndGameBookingsTable.gameId, dndGamesTable.id))
    .where(and(eq(dndGameBookingsTable.userId, userId), inArray(dndGameBookingsTable.status, ['active'])));
  for (const b of dnd) if (dndBookingCounts(b, now)) counts.dnd += 1;

  const categories = PROGRESS_CATEGORIES.map((c) => progressOf(c, counts[c]));
  return { categories, total: categories.reduce((sum, c) => sum + c.games, 0) };
}
