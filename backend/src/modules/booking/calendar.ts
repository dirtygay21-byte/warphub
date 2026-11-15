/**
 * Файл календаря для записи (15.11.2026, «Добавить в календарь»): один VEVENT по id записи.
 * Ссылка без входа — Telegram открывает файлы без заголовка авторизации; в файле только услуга, время и стол
 * (без имени игрока), id записи — случайный UUID.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { reservationsTable, servicesTable, tablesTable } from '../../db/schema';
import { gameLabel } from '../../config/booking';

import { buildIcs, CLUB } from './calendar-ics';

/** Файл календаря для записи или null — записи нет или она отменена. */
export async function reservationIcs(id: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: reservationsTable.id,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
      status: reservationsTable.status,
      details: reservationsTable.details,
      serviceTitle: servicesTable.title,
      serviceSlug: servicesTable.slug,
      tableName: tablesTable.name,
    })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .leftJoin(tablesTable, eq(reservationsTable.tableId, tablesTable.id))
    .where(eq(reservationsTable.id, id))
    .limit(1);
  if (!row || row.status === 'cancelled' || !row.startsAt) return null;
  const details = row.details as { kind?: string; game?: string } | null;
  const title = details?.kind === 'wh_player' ? gameLabel(details.game) : (row.serviceTitle ?? row.serviceSlug);
  return buildIcs({
    id: row.id,
    title,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    location: row.tableName ? `${CLUB}, ${row.tableName}` : CLUB,
  });
}
