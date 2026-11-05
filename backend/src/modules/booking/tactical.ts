/**
 * Правило «Tactical Games блокирует покраску» (решение владельца 05.11.2026):
 *  - занятый стол категории small (столы 3–4) — записью игрока или бронью администратора — в это время
 *    покраска недоступна (как закрытие клуба: вся вместимость пула);
 *  - бронь стола small не принимается, если на этот промежуток уже есть запись на покраску.
 * Без зависимости от сервиса записи (чтобы не было циклов импорта с table-holds).
 */
import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import { db } from '../../db';
import { reservationsTable, servicesTable, tableHoldsTable, tablesTable } from '../../db/schema';

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const PAINTING_SLUG = 'wh_painting';
const ACTIVE_STATUSES = ['pending', 'confirmed'] as const;

/** Id столов категории small (Tactical Games), включая выключенные — их записи ещё могут стоять во времени */
export async function tacticalTableIds(executor: Executor = db): Promise<number[]> {
  const rows = await executor.select({ id: tablesTable.id }).from(tablesTable).where(eq(tablesTable.category, 'small'));
  return rows.map((r) => r.id);
}

/** Есть ли запись на покраску, пересекающая интервал */
export async function paintingBookedDuring(executor: Executor, startsAt: Date, endsAt: Date): Promise<boolean> {
  const [row] = await executor
    .select({ id: reservationsTable.id })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .where(
      and(
        eq(servicesTable.slug, PAINTING_SLUG),
        isNull(reservationsTable.tableId),
        inArray(reservationsTable.status, [...ACTIVE_STATUSES]),
        lt(reservationsTable.startsAt, endsAt),
        gt(reservationsTable.endsAt, startsAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Интервалы занятости столов категории small в диапазоне: записи игроков и брони администратора */
export async function tacticalBusyForPainting(
  executor: Executor,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Array<{ startsAt: Date; endsAt: Date }>> {
  const ids = await tacticalTableIds(executor);
  if (ids.length === 0) return [];
  const [bookings, holds] = await Promise.all([
    executor
      .select({ startsAt: reservationsTable.startsAt, endsAt: reservationsTable.endsAt })
      .from(reservationsTable)
      .where(
        and(
          inArray(reservationsTable.tableId, ids),
          inArray(reservationsTable.status, [...ACTIVE_STATUSES]),
          lt(reservationsTable.startsAt, rangeEnd),
          gt(reservationsTable.endsAt, rangeStart),
        ),
      ),
    executor
      .select({ startsAt: tableHoldsTable.startsAt, endsAt: tableHoldsTable.endsAt })
      .from(tableHoldsTable)
      .where(and(inArray(tableHoldsTable.tableId, ids), lt(tableHoldsTable.startsAt, rangeEnd), gt(tableHoldsTable.endsAt, rangeStart))),
  ]);
  return [...bookings, ...holds].filter(
    (r): r is { startsAt: Date; endsAt: Date } => r.startsAt !== null && r.endsAt !== null,
  );
}
