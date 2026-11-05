/**
 * Бронь стола администратором (30.10.2026). Стол закрыт для записи игроков на интервал: свободное время,
 * новая запись и пересадка учитывают брони вместе со столами ивентов (getTableBlocks).
 * Бронь нельзя поставить поверх записей игроков, ивента или другой брони — сначала их нужно перенести/отменить.
 * Правила без БД — rules.ts (tests/table-holds-rules.test.ts), сквозная проверка — tests/table-holds-e2e.test.ts.
 */
import { and, asc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import { dndGamesTable, reservationsTable, tableHoldsTable, tablesTable, usersTable } from '../../db/schema';
import { formatLocalIso } from '../booking/rules';
import { paintingBookedDuring } from '../booking/tactical';
import { getEventTableBlocks, type EventTableBlock } from '../events/service';
import { assertClubFreeForDnd, ClubClosureError, closuresAsTableBlocks, getClubClosures } from '../club-closure/service';
import { HoldError, validateHoldInput, type HoldInput, type HoldPurpose } from './rules';

export { HoldError } from './rules';

export type TableHoldView = {
  id: number;
  tableId: number;
  tableName: string;
  startsAt: string;
  endsAt: string;
  purpose: HoldPurpose;
  title: string;
  description: string | null;
  /** кто бронирует (вписано администратором) */
  reservedBy: string | null;
  dndGameId: number | null;
  /** кто создал бронь в приложении */
  createdBy: { telegramId: number; name: string | null; username: string | null };
  createdAt: string;
};

const creatorColumns = { firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username };

/** Занятость столов для записи игроков: столы ивентов + брони администратора + закрытие клуба на D&D (с часом после). */
export async function getTableBlocks(tableIds: number[], rangeStart: Date, rangeEnd: Date): Promise<EventTableBlock[]> {
  if (tableIds.length === 0) return [];
  const [events, holds, closures] = await Promise.all([
    getEventTableBlocks(tableIds, rangeStart, rangeEnd),
    db
      .select({ tableId: tableHoldsTable.tableId, startsAt: tableHoldsTable.startsAt, endsAt: tableHoldsTable.endsAt })
      .from(tableHoldsTable)
      .where(and(inArray(tableHoldsTable.tableId, tableIds), lt(tableHoldsTable.startsAt, rangeEnd), gt(tableHoldsTable.endsAt, rangeStart))),
    getClubClosures(rangeStart, rangeEnd),
  ]);
  return [...events, ...holds, ...closuresAsTableBlocks(tableIds, closures)];
}

type Creator = { firstName: string | null; lastName: string | null; username: string | null } | null;

const view = (row: typeof tableHoldsTable.$inferSelect, tableName: string, creator: Creator): TableHoldView => ({
  id: row.id,
  tableId: row.tableId,
  tableName,
  startsAt: formatLocalIso(row.startsAt),
  endsAt: formatLocalIso(row.endsAt),
  purpose: row.purpose as HoldPurpose,
  title: row.title,
  description: row.description,
  reservedBy: row.reservedBy,
  dndGameId: row.dndGameId,
  createdBy: {
    telegramId: row.createdByTelegramId,
    name: creator ? [creator.firstName, creator.lastName].filter(Boolean).join(' ') || null : null,
    username: creator?.username ?? null,
  },
  createdAt: row.createdAt.toISOString(),
});

/** Брони, которые ещё не закончились (или пересекают интервал from–to). */
export async function listTableHolds(range?: { from?: Date; to?: Date }): Promise<TableHoldView[]> {
  const from = range?.from ?? new Date();
  const conditions = [gt(tableHoldsTable.endsAt, from)];
  if (range?.to) conditions.push(lt(tableHoldsTable.startsAt, range.to));
  const rows = await db
    .select({ hold: tableHoldsTable, tableName: tablesTable.name, creator: creatorColumns })
    .from(tableHoldsTable)
    .innerJoin(tablesTable, eq(tableHoldsTable.tableId, tablesTable.id))
    .leftJoin(usersTable, eq(usersTable.telegramId, tableHoldsTable.createdByTelegramId))
    .where(and(...conditions))
    .orderBy(asc(tableHoldsTable.startsAt), asc(tableHoldsTable.tableId));
  return rows.map((r) => view(r.hold, r.tableName, r.creator));
}

export async function createTableHold(input: unknown, createdByTelegramId: number): Promise<TableHoldView> {
  const hold: HoldInput = validateHoldInput(input, new Date());

  return db.transaction(async (tx) => {
    // та же блокировка стола, что у записи игрока (booking/service.ts, LOCK_TABLE = 1): запись и бронь идут по очереди
    await tx.execute(sql`select pg_advisory_xact_lock(1::int, ${hold.tableId}::int)`);
    const [table] = await tx
      .select({ id: tablesTable.id, name: tablesTable.name, isActive: tablesTable.isActive, category: tablesTable.category })
      .from(tablesTable)
      .where(eq(tablesTable.id, hold.tableId));
    if (!table || !table.isActive) throw new HoldError('TABLE_NOT_FOUND', 'Стол не найден или выключен');

    if (hold.dndGameId !== null) {
      const [game] = await tx.select({ id: dndGamesTable.id }).from(dndGamesTable).where(eq(dndGamesTable.id, hold.dndGameId));
      if (!game) throw new HoldError('DND_GAME_NOT_FOUND', 'Игра D&D не найдена');
    }

    // записи игроков за этим столом в это время — бронь поверх них не ставим
    const bookings = await tx
      .select({
        startsAt: reservationsTable.startsAt,
        endsAt: reservationsTable.endsAt,
        firstName: usersTable.firstName,
        username: usersTable.username,
      })
      .from(reservationsTable)
      .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
      .where(
        and(
          eq(reservationsTable.tableId, hold.tableId),
          inArray(reservationsTable.status, ['pending', 'confirmed']),
          lt(reservationsTable.startsAt, hold.endsAt),
          gt(reservationsTable.endsAt, hold.startsAt),
        ),
      );
    if (bookings.length > 0) {
      const list = bookings
        .map((b) => `${b.firstName ?? ''}${b.username ? ` @${b.username}` : ''} ${formatLocalIso(b.startsAt!).slice(11, 16)}–${formatLocalIso(b.endsAt!).slice(11, 16)}`.trim())
        .join('; ');
      throw new HoldError('BOOKINGS_CONFLICT', `За этим столом в это время есть записи игроков: ${list}. Перенесите или отмените их.`);
    }

    // стол Tactical Games (категория small): покраска на это время занята записью — бронь не ставим (решение 05.11.2026)
    if (table.category === 'small' && (await paintingBookedDuring(tx, hold.startsAt, hold.endsAt))) {
      throw new HoldError('BOOKINGS_CONFLICT', 'На покраску в это время есть запись. Перенесите или отмените её.');
    }

    // D&D закрывает весь клуб (31.10.2026): бронь «Игра D&D» — только если клуб свободен с часом после игры;
    // любая другая бронь — не поверх закрытия клуба на D&D
    if (hold.purpose === 'dnd') {
      try {
        await assertClubFreeForDnd(hold.startsAt, hold.endsAt, { gameId: hold.dndGameId });
      } catch (e) {
        if (e instanceof ClubClosureError) throw new HoldError('CLUB_CLOSED', e.message);
        throw e;
      }
    } else {
      const [closure] = await getClubClosures(hold.startsAt, hold.endsAt);
      if (closure) throw new HoldError('CLUB_CLOSED', `Клуб закрыт на игру D&D «${closure.title}» в это время (с часом после игры)`);
    }

    const events = await getEventTableBlocks([hold.tableId], hold.startsAt, hold.endsAt);
    if (events.length > 0) throw new HoldError('EVENT_CONFLICT', 'Стол уже отдан под ивент в это время');

    const [other] = await tx
      .select({ title: tableHoldsTable.title })
      .from(tableHoldsTable)
      .where(and(eq(tableHoldsTable.tableId, hold.tableId), lt(tableHoldsTable.startsAt, hold.endsAt), gt(tableHoldsTable.endsAt, hold.startsAt)));
    if (other) throw new HoldError('HOLD_CONFLICT', `Стол уже забронирован в это время: «${other.title}»`);

    const [row] = await tx
      .insert(tableHoldsTable)
      .values({ ...hold, createdByTelegramId })
      .returning();
    const [creator] = await tx.select(creatorColumns).from(usersTable).where(eq(usersTable.telegramId, createdByTelegramId));
    return view(row!, table.name, creator ?? null);
  });
}

export async function deleteTableHold(id: number): Promise<{ id: number }> {
  const [row] = await db.delete(tableHoldsTable).where(eq(tableHoldsTable.id, id)).returning({ id: tableHoldsTable.id });
  if (!row) throw new HoldError('HOLD_NOT_FOUND', 'Бронь не найдена');
  return row;
}

/** Для дневного расписания «Столы Warhammer»: брони, пересекающие смену. */
export async function listHoldsBetween(openAt: Date, closeAt: Date, excludeId?: number): Promise<TableHoldView[]> {
  const rows = await db
    .select({ hold: tableHoldsTable, tableName: tablesTable.name, creator: creatorColumns })
    .from(tableHoldsTable)
    .innerJoin(tablesTable, eq(tableHoldsTable.tableId, tablesTable.id))
    .leftJoin(usersTable, eq(usersTable.telegramId, tableHoldsTable.createdByTelegramId))
    .where(
      and(
        lt(tableHoldsTable.startsAt, closeAt),
        gt(tableHoldsTable.endsAt, openAt),
        ...(excludeId !== undefined ? [ne(tableHoldsTable.id, excludeId)] : []),
      ),
    )
    .orderBy(asc(tableHoldsTable.startsAt));
  return rows.map((r) => view(r.hold, r.tableName, r.creator));
}
