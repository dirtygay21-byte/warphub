/**
 * Календарь армий клуба (этап 2, 15.11.2026): кто и когда берёт армию / команду / варбанду клуба — на 14 дней вперёд,
 * чтобы администратор заранее подготовил модели и видел пересечения по времени. Только активные записи (ждут / подтверждены).
 */
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '../../db';
import { reservationsTable, servicesTable, tablesTable, usersTable } from '../../db/schema';
import { clubArmyLabel } from '../../config/booking';
import type { ReservationDetails } from './rules';

const DAY = 24 * 60 * 60 * 1000;

export type ClubArmyBooking = {
  reservationId: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  service: string;
  tableName: string | null;
  player: { firstName: string; lastName: string | null; username: string | null };
  /** «Армия клуба» / «Команда клуба» / «Варбанда клуба» */
  label: string;
  game: string | null;
  army: string | null;
  points: number | null;
  /** сколько мест в записи просят армию клуба */
  seats: number;
};

export async function getClubArmyCalendar(now = new Date(), days = 14): Promise<ClubArmyBooking[]> {
  const rows = await db
    .select({
      id: reservationsTable.id,
      status: reservationsTable.status,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
      clubArmy: reservationsTable.seatClubArmyOptions,
      details: reservationsTable.details,
      service: servicesTable.title,
      slug: servicesTable.slug,
      tableName: tablesTable.name,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
    })
    .from(reservationsTable)
    .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .leftJoin(tablesTable, eq(reservationsTable.tableId, tablesTable.id))
    .where(
      and(
        inArray(reservationsTable.status, ['pending', 'confirmed']),
        gte(reservationsTable.endsAt, now),
        lt(reservationsTable.startsAt, new Date(now.getTime() + days * DAY)),
      ),
    )
    .orderBy(asc(reservationsTable.startsAt));

  return rows
    .filter((r) => r.startsAt && (r.clubArmy ?? []).some(Boolean))
    .map((r) => {
      const d = r.details as ReservationDetails | null;
      const wh = d?.kind === 'wh_player' ? d : null;
      return {
        reservationId: r.id,
        startsAt: r.startsAt!.toISOString(),
        endsAt: r.endsAt?.toISOString() ?? null,
        status: r.status,
        service: r.service ?? r.slug,
        tableName: r.tableName ?? null,
        player: { firstName: r.firstName, lastName: r.lastName, username: r.username },
        label: clubArmyLabel(wh?.game),
        game: wh?.game ?? null,
        army: wh?.army ?? null,
        points: wh?.clubArmyPoints ?? null,
        seats: (r.clubArmy ?? []).filter(Boolean).length,
      };
    });
}
