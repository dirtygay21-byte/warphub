import { and, asc, eq, gt, inArray, lt, ne, sum } from 'drizzle-orm';
import { eventsConfig } from '../../config/events';
import { db } from '../../db';
import {
  eventsTable,
  eventsTablesTable,
  reservationsTable,
  tableHoldsTable,
  tablesTable,
  usersEventsTable,
} from '../../db/schema';
import { deleteImage } from '../../lib/storage/upload';
import type { ImageCrop } from '../../lib/image-crop';
import { getClubClosures } from '../club-closure/service';

export type EventTableBlock = {
  tableId: number;
  startsAt: Date;
  endsAt: Date;
};

export type EventView = {
  id: number;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  seatsPerTable: number;
  capacity: number;
  bannerUrl: string | null;
  bannerCrop: ImageCrop | null;
  tableIds: number[];
  createdAt: string;
  updatedAt: string;
};

export type PublicEventView = EventView & {
  registeredCount: number;
  freeSeats: number;
};

export type UserEventRegistrationView = {
  eventId: number;
  userId: string;
  partySize: number;
  createdAt: string;
};

export type EventErrorCode =
  | 'EVENT_NOT_FOUND'
  | 'INVALID_TIME_RANGE'
  | 'INVALID_TABLES'
  | 'INVALID_SEATS_PER_TABLE'
  | 'TABLES_UNAVAILABLE'
  | 'EVENT_CAPACITY_BELOW_REGISTRATIONS'
  | 'EVENT_FULL'
  | 'ALREADY_REGISTERED'
  | 'NOT_REGISTERED'
  | 'EVENT_REGISTRATION_CLOSED'
  | 'INVALID_PARTY_SIZE';

export class EventError extends Error {
  readonly code: EventErrorCode;

  constructor(code: EventErrorCode, message: string) {
    super(message);
    this.name = 'EventError';
    this.code = code;
  }
}

export type CreateEventInput = {
  title: string;
  description?: string;
  startsAt: Date;
  endsAt?: Date;
  seatsPerTable: number;
  bannerUrl?: string;
  bannerCrop?: ImageCrop | null;
  tableIds?: number[];
};

export type UpdateEventInput = {
  title?: string;
  description?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  seatsPerTable?: number;
  bannerUrl?: string | null;
  bannerCrop?: ImageCrop | null;
  tableIds?: number[];
};

function computeEventCapacity(
  tableIds: number[],
  seatsPerTable: number,
): number {
  return tableIds.length * seatsPerTable;
}

function assertPositiveSeatsPerTable(seatsPerTable: number): void {
  if (seatsPerTable <= 0) {
    throw new EventError(
      'INVALID_SEATS_PER_TABLE',
      'seatsPerTable must be greater than 0',
    );
  }
}

function assertEventHasTables(tableIds: number[]): void {
  if (tableIds.length === 0) {
    throw new EventError(
      'INVALID_TABLES',
      'At least one table is required for an event',
    );
  }
}

async function assertEventTablesAvailable(
  tableIds: number[],
  startsAt: Date,
  endsAt: Date,
  excludeEventId?: number,
): Promise<void> {
  if (tableIds.length === 0) return;

  const [conflictingReservation] = await db
    .select({ tableId: reservationsTable.tableId })
    .from(reservationsTable)
    .where(
      and(
        inArray(reservationsTable.tableId, tableIds),
        inArray(reservationsTable.status, ['pending', 'confirmed']),
        lt(reservationsTable.startsAt, endsAt),
        gt(reservationsTable.endsAt, startsAt),
      ),
    )
    .limit(1);

  if (conflictingReservation) {
    throw new EventError(
      'TABLES_UNAVAILABLE',
      'One or more tables are already booked for this time',
    );
  }

  const conflictingEvents = await db
    .select({ tableId: eventsTablesTable.tableId })
    .from(eventsTablesTable)
    .innerJoin(eventsTable, eq(eventsTablesTable.eventId, eventsTable.id))
    .where(
      and(
        inArray(eventsTablesTable.tableId, tableIds),
        lt(eventsTable.startsAt, endsAt),
        gt(eventsTable.endsAt, startsAt),
        excludeEventId !== undefined
          ? ne(eventsTable.id, excludeEventId)
          : undefined,
      ),
    )
    .limit(1);

  // брони столов администратором (table_holds) — ивент поверх них не ставим
  const [conflictingHold] = await db
    .select({ tableId: tableHoldsTable.tableId })
    .from(tableHoldsTable)
    .where(and(inArray(tableHoldsTable.tableId, tableIds), lt(tableHoldsTable.startsAt, endsAt), gt(tableHoldsTable.endsAt, startsAt)))
    .limit(1);
  if (conflictingHold) {
    throw new EventError('TABLES_UNAVAILABLE', 'One or more tables are reserved by the club at this time');
  }

  // игра D&D закрывает весь клуб (31.10.2026) — ивент на это время (с часом после игры) не ставим
  const [closure] = await getClubClosures(startsAt, endsAt);
  if (closure) {
    throw new EventError('TABLES_UNAVAILABLE', `The club is closed for the D&D game «${closure.title}» at this time (plus one hour after it)`);
  }

  if (conflictingEvents.length > 0) {
    throw new EventError(
      'TABLES_UNAVAILABLE',
      'One or more tables are reserved for another event at this time',
    );
  }
}

async function assertCapacityFitsRegistrations(
  eventId: number,
  capacity: number,
): Promise<void> {
  const registeredSeats = await getEventRegisteredSeats(eventId);
  if (registeredSeats > capacity) {
    throw new EventError(
      'EVENT_CAPACITY_BELOW_REGISTRATIONS',
      'Event capacity cannot be less than current registrations',
    );
  }
}

function defaultEndsAt(startsAt: Date): Date {
  return new Date(
    startsAt.getTime() + eventsConfig.defaultDurationHours * 60 * 60 * 1000,
  );
}

function assertValidTimeRange(startsAt: Date, endsAt: Date): void {
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new EventError('INVALID_TIME_RANGE', 'endsAt must be after startsAt');
  }
}

function normalizeTableIds(tableIds: number[] | undefined): number[] {
  if (!tableIds || tableIds.length === 0) return [];
  return [...new Set(tableIds)];
}

async function assertValidTableIds(tableIds: number[]): Promise<void> {
  if (tableIds.length === 0) return;

  const rows = await db
    .select({ id: tablesTable.id })
    .from(tablesTable)
    .where(
      and(inArray(tablesTable.id, tableIds), eq(tablesTable.isActive, true)),
    );

  if (rows.length !== tableIds.length) {
    throw new EventError('INVALID_TABLES', 'One or more tables are invalid');
  }
}

async function replaceEventTables(
  eventId: number,
  tableIds: number[],
): Promise<void> {
  await db
    .delete(eventsTablesTable)
    .where(eq(eventsTablesTable.eventId, eventId));

  if (tableIds.length === 0) return;

  await db.insert(eventsTablesTable).values(
    tableIds.map((tableId) => ({
      eventId,
      tableId,
    })),
  );
}

async function getEventTableIds(eventId: number): Promise<number[]> {
  const rows = await db
    .select({ tableId: eventsTablesTable.tableId })
    .from(eventsTablesTable)
    .where(eq(eventsTablesTable.eventId, eventId));

  return rows.map((row) => row.tableId);
}

function toEventView(
  event: typeof eventsTable.$inferSelect,
  tableIds: number[],
): EventView {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    seatsPerTable: event.seatsPerTable,
    capacity: computeEventCapacity(tableIds, event.seatsPerTable),
    bannerUrl: event.bannerUrl,
    bannerCrop: event.bannerCrop,
    tableIds,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

async function getEventRegisteredSeats(eventId: number): Promise<number> {
  const [row] = await db
    .select({
      value: sum(usersEventsTable.partySize),
    })
    .from(usersEventsTable)
    .where(eq(usersEventsTable.eventId, eventId));

  return Number(row?.value ?? 0);
}

async function loadPublicEventView(
  event: typeof eventsTable.$inferSelect,
): Promise<PublicEventView> {
  const base = await loadEventView(event);
  const registeredCount = await getEventRegisteredSeats(event.id);

  return {
    ...base,
    registeredCount,
    freeSeats: Math.max(0, base.capacity - registeredCount),
  };
}

async function loadEventView(
  event: typeof eventsTable.$inferSelect,
): Promise<EventView> {
  const tableIds = await getEventTableIds(event.id);
  return toEventView(event, tableIds);
}

export async function listEvents(options?: {
  upcomingOnly?: boolean;
}): Promise<EventView[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(eventsTable)
    .where(options?.upcomingOnly ? gt(eventsTable.endsAt, now) : undefined)
    .orderBy(asc(eventsTable.startsAt));

  return Promise.all(rows.map((row) => loadEventView(row)));
}

export type UserUpcomingEventView = PublicEventView & {
  isRegistered: boolean;
  partySize: number | null;
};

export async function getNearestUpcomingEventForUser(
  userId: string,
): Promise<UserUpcomingEventView | null> {
  const event = await getNearestUpcomingEvent();
  if (!event) {
    return null;
  }

  const [registration] = await db
    .select({ partySize: usersEventsTable.partySize })
    .from(usersEventsTable)
    .where(
      and(
        eq(usersEventsTable.eventId, event.id),
        eq(usersEventsTable.userId, userId),
      ),
    )
    .limit(1);

  if (!registration) {
    return null;
  }

  return {
    ...event,
    isRegistered: true,
    partySize: registration.partySize,
  };
}

export async function getEventById(
  eventId: number,
): Promise<EventView | undefined> {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId))
    .limit(1);

  if (!event) return undefined;

  return loadEventView(event);
}

export async function getNearestUpcomingEvent(): Promise<
  PublicEventView | undefined
> {
  const now = new Date();
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(gt(eventsTable.startsAt, now))
    .orderBy(asc(eventsTable.startsAt))
    .limit(1);

  if (!event) return undefined;

  return loadPublicEventView(event);
}

export async function registerForEvent(
  userId: string,
  eventId: number,
  partySize = 1,
): Promise<UserEventRegistrationView> {
  if (partySize <= 0) {
    throw new EventError(
      'INVALID_PARTY_SIZE',
      'partySize must be greater than 0',
    );
  }

  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId))
    .limit(1);

  if (!event) {
    throw new EventError('EVENT_NOT_FOUND', 'Event not found');
  }

  const now = new Date();
  if (event.startsAt.getTime() <= now.getTime()) {
    throw new EventError(
      'EVENT_REGISTRATION_CLOSED',
      'Event registration is closed',
    );
  }

  const [existingRegistration] = await db
    .select({ userId: usersEventsTable.userId })
    .from(usersEventsTable)
    .where(
      and(
        eq(usersEventsTable.eventId, eventId),
        eq(usersEventsTable.userId, userId),
      ),
    )
    .limit(1);

  if (existingRegistration) {
    throw new EventError(
      'ALREADY_REGISTERED',
      'You are already registered for this event',
    );
  }

  const registeredSeats = await getEventRegisteredSeats(eventId);
  const tableIds = await getEventTableIds(eventId);
  const capacity = computeEventCapacity(tableIds, event.seatsPerTable);
  if (registeredSeats + partySize > capacity) {
    throw new EventError('EVENT_FULL', 'Not enough seats available');
  }

  const [registration] = await db
    .insert(usersEventsTable)
    .values({
      userId,
      eventId,
      partySize,
    })
    .returning();

  return {
    eventId: registration.eventId,
    userId: registration.userId,
    partySize: registration.partySize,
    createdAt: registration.createdAt.toISOString(),
  };
}

export async function cancelEventRegistration(
  userId: string,
  eventId: number,
): Promise<UserEventRegistrationView> {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId))
    .limit(1);

  if (!event) {
    throw new EventError('EVENT_NOT_FOUND', 'Event not found');
  }

  const now = new Date();
  if (event.startsAt.getTime() <= now.getTime()) {
    throw new EventError(
      'EVENT_REGISTRATION_CLOSED',
      'Event registration is closed',
    );
  }

  const [registration] = await db
    .delete(usersEventsTable)
    .where(
      and(
        eq(usersEventsTable.eventId, eventId),
        eq(usersEventsTable.userId, userId),
      ),
    )
    .returning();

  if (!registration) {
    throw new EventError(
      'NOT_REGISTERED',
      'You are not registered for this event',
    );
  }

  return {
    eventId: registration.eventId,
    userId: registration.userId,
    partySize: registration.partySize,
    createdAt: registration.createdAt.toISOString(),
  };
}

export async function createEvent(input: CreateEventInput): Promise<EventView> {
  const endsAt = input.endsAt ?? defaultEndsAt(input.startsAt);
  assertValidTimeRange(input.startsAt, endsAt);
  assertPositiveSeatsPerTable(input.seatsPerTable);

  const tableIds = normalizeTableIds(input.tableIds);
  assertEventHasTables(tableIds);
  await assertValidTableIds(tableIds);
  await assertEventTablesAvailable(tableIds, input.startsAt, endsAt);

  const [event] = await db
    .insert(eventsTable)
    .values({
      title: input.title,
      description: input.description ?? null,
      startsAt: input.startsAt,
      endsAt,
      seatsPerTable: input.seatsPerTable,
      bannerUrl: input.bannerUrl ?? null,
      bannerCrop: input.bannerCrop ?? null,
    })
    .returning();

  await replaceEventTables(event.id, tableIds);

  return toEventView(event, tableIds);
}

export async function updateEvent(
  eventId: number,
  input: UpdateEventInput,
): Promise<EventView> {
  const [existing] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId))
    .limit(1);

  if (!existing) {
    throw new EventError('EVENT_NOT_FOUND', 'Event not found');
  }

  const startsAt = input.startsAt ?? existing.startsAt;
  const endsAt = input.endsAt ?? existing.endsAt;
  assertValidTimeRange(startsAt, endsAt);

  const seatsPerTable = input.seatsPerTable ?? existing.seatsPerTable;
  assertPositiveSeatsPerTable(seatsPerTable);

  const tableIds =
    input.tableIds !== undefined
      ? normalizeTableIds(input.tableIds)
      : await getEventTableIds(eventId);

  assertEventHasTables(tableIds);
  await assertValidTableIds(tableIds);
  await assertEventTablesAvailable(tableIds, startsAt, endsAt, eventId);
  await assertCapacityFitsRegistrations(
    eventId,
    computeEventCapacity(tableIds, seatsPerTable),
  );

  const [updated] = await db
    .update(eventsTable)
    .set({
      title: input.title ?? existing.title,
      description:
        input.description !== undefined
          ? input.description
          : existing.description,
      startsAt,
      endsAt,
      seatsPerTable,
      bannerUrl:
        input.bannerUrl !== undefined ? input.bannerUrl : existing.bannerUrl,
      bannerCrop:
        input.bannerCrop !== undefined ? input.bannerCrop : existing.bannerCrop,
    })
    .where(eq(eventsTable.id, eventId))
    .returning();

  if (input.tableIds !== undefined) {
    await replaceEventTables(updated.id, tableIds);
  }

  return toEventView(updated, tableIds);
}

export type EmptyTableView = {
  id: number;
  name: string;
};

/**
 * Активные столы без пересекающихся бронирований и без резерва другими ивентами
 * на интервал [startsAt, endsAt).
 */
export async function listEmptyTables(
  startsAt: Date,
  endsAt?: Date,
  options?: { excludeEventId?: number },
): Promise<EmptyTableView[]> {
  const resolvedEndsAt = endsAt ?? defaultEndsAt(startsAt);
  assertValidTimeRange(startsAt, resolvedEndsAt);

  const activeTables = await db
    .select({ id: tablesTable.id, name: tablesTable.name })
    .from(tablesTable)
    .where(eq(tablesTable.isActive, true))
    .orderBy(asc(tablesTable.id));

  if (activeTables.length === 0) return [];

  const tableIds = activeTables.map((table) => table.id);

  const occupiedByReservations = await db
    .selectDistinct({ tableId: reservationsTable.tableId })
    .from(reservationsTable)
    .where(
      and(
        inArray(reservationsTable.tableId, tableIds),
        inArray(reservationsTable.status, ['pending', 'confirmed']),
        lt(reservationsTable.startsAt, resolvedEndsAt),
        gt(reservationsTable.endsAt, startsAt),
      ),
    );

  const occupiedByEvents = await db
    .selectDistinct({ tableId: eventsTablesTable.tableId })
    .from(eventsTablesTable)
    .innerJoin(eventsTable, eq(eventsTablesTable.eventId, eventsTable.id))
    .where(
      and(
        inArray(eventsTablesTable.tableId, tableIds),
        lt(eventsTable.startsAt, resolvedEndsAt),
        gt(eventsTable.endsAt, startsAt),
        options?.excludeEventId !== undefined
          ? ne(eventsTable.id, options.excludeEventId)
          : undefined,
      ),
    );

  const occupiedByHolds = await db
    .selectDistinct({ tableId: tableHoldsTable.tableId })
    .from(tableHoldsTable)
    .where(and(inArray(tableHoldsTable.tableId, tableIds), lt(tableHoldsTable.startsAt, resolvedEndsAt), gt(tableHoldsTable.endsAt, startsAt)));

  const occupiedIds = new Set<number>();
  for (const row of occupiedByHolds) occupiedIds.add(row.tableId);
  for (const row of occupiedByReservations) {
    if (row.tableId !== null) occupiedIds.add(row.tableId);
  }
  for (const row of occupiedByEvents) {
    occupiedIds.add(row.tableId);
  }

  return activeTables.filter((table) => !occupiedIds.has(table.id));
}

export async function getEventTableBlocks(
  tableIds: number[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<EventTableBlock[]> {
  if (tableIds.length === 0) return [];

  const rows = await db
    .select({
      tableId: eventsTablesTable.tableId,
      startsAt: eventsTable.startsAt,
      endsAt: eventsTable.endsAt,
    })
    .from(eventsTablesTable)
    .innerJoin(eventsTable, eq(eventsTablesTable.eventId, eventsTable.id))
    .where(
      and(
        inArray(eventsTablesTable.tableId, tableIds),
        lt(eventsTable.startsAt, rangeEnd),
        gt(eventsTable.endsAt, rangeStart),
      ),
    );

  return rows;
}

export function isIntervalBlockedByEvent(
  tableId: number,
  interval: { startsAt: Date; endsAt: Date },
  eventBlocks: EventTableBlock[],
): boolean {
  return eventBlocks.some(
    (block) =>
      block.tableId === tableId &&
      interval.startsAt < block.endsAt &&
      interval.endsAt > block.startsAt,
  );
}

export async function deleteEvent(eventId: number): Promise<EventView> {
  const [event] = await db
    .delete(eventsTable)
    .where(eq(eventsTable.id, eventId))
    .returning();

  if (!event) {
    throw new EventError('EVENT_NOT_FOUND', 'Event not found');
  }

  if (event.bannerUrl) {
    await deleteImage(event.bannerUrl);
  }

  return toEventView(event, await getEventTableIds(eventId));
}
