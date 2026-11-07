import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  SQL,
  sql,
} from 'drizzle-orm';
import {
  bookingConfig,
  experienceLabel,
  armyLine,
  gameLabel,
  type TableCapacityProfile,
} from '../../config/booking';
import { db } from '../../db';
import {
  disciplinesTable,
  reservationsTable,
  servicesTable,
  tablesTable,
  usersTable,
} from '../../db/schema';
import { getTableBlocks, listHoldsBetween, type TableHoldView } from '../table-holds/service';
import { paintingBookedDuring, tacticalBusyForPainting } from './tactical';
import { closuresAsPoolBookings, getClubClosures } from '../club-closure/service';
import {
  getNearestUpcomingEventForUser,
  type EventTableBlock,
  type UserUpcomingEventView,
} from '../events/service';
import {
  escapeHtml,
  formatClubDateTime,
  formatUserName,
  notifyAdmins,
  notifyUser,
} from '../notifications/service';
import {
  checkTableSession,
  DetailsValidationError,
  detailsKindForSlug,
  formatLocalIso,
  getAllowedWeekdays,
  getClubSessionBounds,
  gameFitsTable,
  TABLE_CATEGORY_LABEL,
  groupSessions,
  isDateAllowed,
  isOnSlotGrid,
  overlapsInterval,
  parseDateParam,
  poolFreeSeats,
  toLocalDateParts,
  validateDetails,
  type DateParts,
  type ReservationDetails,
  type TableBooking,
  poolFitEnd,
  tableFitEnd,
} from './rules';

export { parseDateParam } from './rules';
import { bookingNoticeText } from './notify-text';

const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed'] as const;
const CLUB_VISIT_SLUG = 'club_visit';
const PAINTING_SLUG = 'wh_painting';
const WH_SERVICE_SLUGS = [
  'wh_game',
  'wh_group_training',
  'wh_solo_training',
] as const;

type WhServiceSlug = (typeof WH_SERVICE_SLUGS)[number];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

type ClubTable = {
  id: number;
  name: string;
  category: 'wh' | 'small';
};

export type TableAvailabilitySegment = {
  startsAt: string;
  endsAt: string;
  freeSeats: number;
};

export type TableAvailabilityEntry = {
  table: {
    id: number;
    name: string;
    seatCapacity: number;
    /** категория стола; у пула мест (покраска, клуб) не задаётся */
    category?: 'wh' | 'small';
  };
  segments: TableAvailabilitySegment[];
};

export type BookingMode = 'table' | 'pool' | 'none';

export type SessionPlayerView = {
  firstName: string;
  /** ник в Telegram — для связи насчёт игры (31.10.2026); только для вошедших пользователей, иначе null */
  username: string | null;
  /** игра (40k / aos / kt); null — не игрок Warhammer */
  game: string | null;
  gameLabel: string | null;
  army: string | null;
  points: number | null;
  experienceLevel: string | null;
  experienceLabel: string | null;
};

export type SessionView = {
  tableId: number;
  tableName: string;
  startsAt: string;
  endsAt: string;
  occupied: number;
  capacity: number;
  freeSeats: number;
  players: SessionPlayerView[];
};

export type ServiceAvailability = {
  date: string;
  /** Можно ли записаться на эту дату (пт–вс и расписание дисциплины) */
  dateAllowed: boolean;
  allowedWeekdays: number[];
  service: {
    id: number;
    slug: string;
    duration: number;
    visitorsCapacity: number | null;
    tableCapacityProfile: TableCapacityProfile | null;
    mode: BookingMode;
    seatsPerTable: number | null;
    poolCapacity: number | null;
    hasTrainer: boolean;
    /** B1: минимальная длительность укороченной записи, минут (если до следующей занятости меньше полной) */
    minDuration: number;
    /** Макс. вместимость зрителей в клубе (только для club_visit) */
    clubSpectatorCapacity?: number;
  };
  /**
   * Режим table: по элементу на стол, сегменты — когда можно начать НОВУЮ игру.
   * Режим pool: один элемент с общей вместимостью.
   */
  slots: TableAvailabilityEntry[];
  /** Режим table: уже начатые игры (1/2, 2/2) с данными игроков */
  sessions: SessionView[];
  /** клуб закрыт на игру D&D в эти интервалы (с часом после игры) — для подписи «Клуб закрыт» (31.10.2026) */
  closures: { startsAt: string; endsAt: string; title: string }[];
};

type ServiceRow = {
  id: number;
  slug: string;
  title: string | null;
  disciplineId: number;
  duration: number | null;
  visitorsCapacity: number | null;
  tableCapacityProfile: TableCapacityProfile | null;
  seatsPerTable: number | null;
  poolCapacity: number | null;
  hasTrainer: boolean;
  isActive: boolean;
  scheduleWeekdays: number[] | null;
  disciplineActive: boolean | null;
};

function profileCapacity(profile: TableCapacityProfile): number {
  return bookingConfig.tableCapacityByProfile[profile];
}

function resolveMode(service: ServiceRow):
  | { mode: 'table'; seatsPerTable: number }
  | { mode: 'pool'; capacity: number }
  | { mode: 'none' } {
  if (service.poolCapacity !== null || service.slug === CLUB_VISIT_SLUG) {
    return {
      mode: 'pool',
      capacity: service.poolCapacity ?? bookingConfig.clubSpectatorCapacity,
    };
  }

  if (service.seatsPerTable !== null || service.tableCapacityProfile !== null) {
    return {
      mode: 'table',
      seatsPerTable:
        service.seatsPerTable ??
        profileCapacity(service.tableCapacityProfile as TableCapacityProfile),
    };
  }

  return { mode: 'none' };
}

async function loadService(
  executor: Executor,
  serviceId: number,
): Promise<ServiceRow | undefined> {
  const [row] = await executor
    .select({
      id: servicesTable.id,
      slug: servicesTable.slug,
      title: servicesTable.title,
      disciplineId: servicesTable.disciplineId,
      duration: servicesTable.duration,
      visitorsCapacity: servicesTable.visitorsCapacity,
      tableCapacityProfile: servicesTable.tableCapacityProfile,
      seatsPerTable: servicesTable.seatsPerTable,
      poolCapacity: servicesTable.poolCapacity,
      hasTrainer: servicesTable.hasTrainer,
      isActive: servicesTable.isActive,
      scheduleWeekdays: disciplinesTable.scheduleWeekdays,
      disciplineActive: disciplinesTable.isActive,
    })
    .from(servicesTable)
    .leftJoin(
      disciplinesTable,
      eq(servicesTable.disciplineId, disciplinesTable.id),
    )
    .where(eq(servicesTable.id, serviceId))
    .limit(1);

  return row as ServiceRow | undefined;
}

function serviceDuration(service: ServiceRow): number {
  return service.duration ?? bookingConfig.defaultDurationMinutes;
}

function mergeAdjacentSegments(
  segments: TableAvailabilitySegment[],
): TableAvailabilitySegment[] {
  if (segments.length === 0) return [];

  const merged: TableAvailabilitySegment[] = [];
  let current = { ...segments[0]! };

  for (let index = 1; index < segments.length; index++) {
    const next = segments[index]!;

    if (
      next.freeSeats === current.freeSeats &&
      current.endsAt === next.startsAt
    ) {
      current = { ...current, endsAt: next.endsAt };
      continue;
    }

    merged.push(current);
    current = { ...next };
  }

  merged.push(current);
  return merged;
}

/**
 * Сегменты, когда на столе можно начать новую игру: стол полностью свободен
 * (нет записей ни одной услуги и нет ивента).
 */
function getNewSessionSegments(
  tableId: number,
  window: { startsAt: Date; endsAt: Date },
  bookings: TableBooking[],
  eventBlocks: EventTableBlock[],
  seatsPerTable: number,
): TableAvailabilitySegment[] {
  if (window.startsAt >= window.endsAt) return [];

  const busy = [
    ...bookings.filter((booking) => booking.tableId === tableId),
    ...eventBlocks.filter((block) => block.tableId === tableId),
  ].filter((interval) => overlapsInterval(interval, window));

  const boundaries = new Set<number>([
    window.startsAt.getTime(),
    window.endsAt.getTime(),
  ]);
  for (const interval of busy) {
    boundaries.add(Math.max(window.startsAt.getTime(), interval.startsAt.getTime()));
    boundaries.add(Math.min(window.endsAt.getTime(), interval.endsAt.getTime()));
  }

  const sorted = [...boundaries].sort((a, b) => a - b);
  const segments: TableAvailabilitySegment[] = [];

  for (let index = 0; index < sorted.length - 1; index++) {
    const startsAt = new Date(sorted[index]!);
    const endsAt = new Date(sorted[index + 1]!);
    if (startsAt >= endsAt) continue;

    const isBusy = busy.some((interval) =>
      overlapsInterval(interval, { startsAt, endsAt }),
    );

    segments.push({
      startsAt: formatLocalIso(startsAt),
      endsAt: formatLocalIso(endsAt),
      freeSeats: isBusy ? 0 : seatsPerTable,
    });
  }

  return mergeAdjacentSegments(segments);
}

function getPoolSegments(
  window: { startsAt: Date; endsAt: Date },
  bookings: TableBooking[],
  capacity: number,
): TableAvailabilitySegment[] {
  if (window.startsAt >= window.endsAt) return [];

  const boundaries = new Set<number>([
    window.startsAt.getTime(),
    window.endsAt.getTime(),
  ]);

  for (const booking of bookings) {
    if (!overlapsInterval(booking, window)) continue;
    boundaries.add(Math.max(window.startsAt.getTime(), booking.startsAt.getTime()));
    boundaries.add(Math.min(window.endsAt.getTime(), booking.endsAt.getTime()));
  }

  const sorted = [...boundaries].sort((a, b) => a - b);
  const segments: TableAvailabilitySegment[] = [];

  for (let index = 0; index < sorted.length - 1; index++) {
    const startsAt = new Date(sorted[index]!);
    const endsAt = new Date(sorted[index + 1]!);
    if (startsAt >= endsAt) continue;

    const occupied = bookings
      .filter((booking) => overlapsInterval(booking, { startsAt, endsAt }))
      .reduce((sum, booking) => sum + booking.partySize, 0);

    segments.push({
      startsAt: formatLocalIso(startsAt),
      endsAt: formatLocalIso(endsAt),
      freeSeats: Math.max(0, capacity - occupied),
    });
  }

  return mergeAdjacentSegments(segments);
}

async function getActiveTables(executor: Executor = db): Promise<ClubTable[]> {
  return executor
    .select({
      id: tablesTable.id,
      name: tablesTable.name,
      category: tablesTable.category,
    })
    .from(tablesTable)
    .where(eq(tablesTable.isActive, true))
    .orderBy(asc(tablesTable.id));
}

type BookingRow = TableBooking & { id: string; userId: string };

async function getTableReservations(
  executor: Executor,
  tableIds: number[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BookingRow[]> {
  if (tableIds.length === 0) return [];

  const rows = await executor
    .select({
      id: reservationsTable.id,
      userId: reservationsTable.userId,
      tableId: reservationsTable.tableId,
      serviceId: reservationsTable.serviceId,
      partySize: reservationsTable.partySize,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
    })
    .from(reservationsTable)
    .where(
      and(
        isNotNull(reservationsTable.tableId),
        inArray(reservationsTable.tableId, tableIds),
        inArray(reservationsTable.status, [...ACTIVE_RESERVATION_STATUSES]),
        lt(reservationsTable.startsAt, rangeEnd),
        gt(reservationsTable.endsAt, rangeStart),
      ),
    );

  return rows.filter(
    (row): row is BookingRow =>
      row.tableId !== null &&
      row.partySize !== null &&
      row.startsAt !== null &&
      row.endsAt !== null,
  );
}

async function getPoolReservations(
  executor: Executor,
  serviceId: number,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BookingRow[]> {
  const rows = await executor
    .select({
      id: reservationsTable.id,
      userId: reservationsTable.userId,
      tableId: reservationsTable.tableId,
      serviceId: reservationsTable.serviceId,
      partySize: reservationsTable.partySize,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
    })
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.serviceId, serviceId),
        isNull(reservationsTable.tableId),
        inArray(reservationsTable.status, [...ACTIVE_RESERVATION_STATUSES]),
        lt(reservationsTable.startsAt, rangeEnd),
        gt(reservationsTable.endsAt, rangeStart),
      ),
    );

  return rows.filter(
    (row): row is BookingRow =>
      row.partySize !== null && row.startsAt !== null && row.endsAt !== null,
  );
}

/**
 * Записи покраски / посещения + закрытие клуба на D&D (31.10.2026): на время закрытия «заняты все места»,
 * поэтому свободного времени нет, а запись обрезается до начала игры (poolFitEnd).
 */
async function getPoolBusy(
  executor: Executor,
  serviceId: number,
  capacity: number,
  rangeStart: Date,
  rangeEnd: Date,
  blockedByTactical = false,
): Promise<BookingRow[]> {
  const [bookings, closures, tactical] = await Promise.all([
    getPoolReservations(executor, serviceId, rangeStart, rangeEnd),
    getClubClosures(rangeStart, rangeEnd),
    // Tactical Games (столы 3–4) закрывают покраску на время занятия стола (решение 05.11.2026)
    blockedByTactical ? tacticalBusyForPainting(executor, rangeStart, rangeEnd) : Promise.resolve([]),
  ]);
  const closed = closuresAsPoolBookings(closures, capacity).map((c, i) => ({
    ...c,
    id: `club-closure-${i}`,
    userId: '',
    tableId: null,
    serviceId,
  }));
  const blocked = tactical.map((t, i) => ({
    partySize: capacity,
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    id: `tactical-${i}`,
    userId: '',
    tableId: null,
    serviceId,
  }));
  return [...bookings, ...closed, ...blocked];
}

/** Окно записи на дату: от открытия (или от «сейчас», если день сегодняшний) до 00:00 */
function getBookingWindow(dateParts: DateParts, now = new Date()) {
  const { openAt, bookingUntil, closeAt } = getClubSessionBounds(dateParts);
  const stepMs = bookingConfig.slotStepMinutes * 60 * 1000;
  const nowCeil = new Date(Math.ceil(now.getTime() / stepMs) * stepMs);
  const startsAt = nowCeil > openAt ? nowCeil : openAt;

  return { startsAt, endsAt: bookingUntil, openAt, closeAt };
}

function toPlayerView(
  firstName: string,
  details: ReservationDetails | null,
  username: string | null = null,
): SessionPlayerView {
  if (details?.kind === 'wh_player') {
    return {
      firstName,
      username,
      game: details.game ?? '40k',
      gameLabel: gameLabel(details.game),
      army: details.army,
      points: details.points,
      experienceLevel: details.experienceLevel,
      experienceLabel: experienceLabel(details.experienceLevel),
    };
  }

  return {
    firstName,
    username,
    game: null,
    gameLabel: null,
    army: null,
    points: null,
    experienceLevel: null,
    experienceLabel: null,
  };
}

async function loadPlayersByReservation(
  reservationIds: string[],
): Promise<Map<string, { firstName: string; username: string | null; details: ReservationDetails | null }>> {
  const map = new Map<
    string,
    { firstName: string; username: string | null; details: ReservationDetails | null }
  >();
  if (reservationIds.length === 0) return map;

  const rows = await db
    .select({
      id: reservationsTable.id,
      firstName: usersTable.firstName,
      username: usersTable.username,
      details: reservationsTable.details,
    })
    .from(reservationsTable)
    .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
    .where(inArray(reservationsTable.id, reservationIds));

  for (const row of rows) {
    map.set(row.id, {
      firstName: row.firstName,
      username: row.username,
      details: (row.details as ReservationDetails | null) ?? null,
    });
  }

  return map;
}

export async function getServiceAvailability(
  serviceId: number,
  date: string,
): Promise<ServiceAvailability | undefined> {
  const service = await loadService(db, serviceId);
  if (!service || !service.isActive) return undefined;

  const dateParts = parseDateParam(date);
  const durationMinutes = serviceDuration(service);
  const mode = resolveMode(service);
  const allowedWeekdays = getAllowedWeekdays(service.scheduleWeekdays);
  const dateAllowed = isDateAllowed(dateParts, service.scheduleWeekdays);

  const base: ServiceAvailability = {
    date,
    dateAllowed,
    allowedWeekdays,
    service: {
      id: service.id,
      slug: service.slug,
      duration: durationMinutes,
      visitorsCapacity: service.visitorsCapacity,
      tableCapacityProfile: service.tableCapacityProfile,
      mode: mode.mode,
      seatsPerTable: mode.mode === 'table' ? mode.seatsPerTable : null,
      poolCapacity: mode.mode === 'pool' ? mode.capacity : null,
      hasTrainer: service.hasTrainer,
      minDuration: Math.min(durationMinutes, bookingConfig.minShortenedMinutes),
      ...(service.slug === CLUB_VISIT_SLUG && mode.mode === 'pool'
        ? { clubSpectatorCapacity: mode.capacity }
        : {}),
    },
    slots: [],
    sessions: [],
    closures: [],
  };

  if (!dateAllowed || mode.mode === 'none') return base;

  const window = getBookingWindow(dateParts);
  base.closures = (await getClubClosures(window.openAt, window.closeAt)).map((c) => ({
    startsAt: formatLocalIso(c.startsAt),
    endsAt: formatLocalIso(c.endsAt),
    title: c.title,
  }));

  if (mode.mode === 'pool') {
    const bookings = await getPoolBusy(
      db,
      service.id,
      mode.capacity,
      window.openAt,
      window.closeAt,
      service.slug === PAINTING_SLUG,
    );

    base.slots = [
      {
        table: {
          id: 0,
          name: service.slug === CLUB_VISIT_SLUG ? 'Клуб' : (service.title ?? 'Места'),
          seatCapacity: mode.capacity,
        },
        segments: getPoolSegments(window, bookings, mode.capacity),
      },
    ];
    return base;
  }

  const tables = await getActiveTables();
  if (tables.length === 0) return base;

  const tableIds = tables.map((table) => table.id);
  const bookings = await getTableReservations(
    db,
    tableIds,
    window.openAt,
    window.closeAt,
  );
  const eventBlocks = await getTableBlocks(
    tableIds,
    window.openAt,
    window.closeAt,
  );

  base.slots = tables.map((table) => ({
    table: { id: table.id, name: table.name, seatCapacity: mode.seatsPerTable, category: table.category },
    segments: getNewSessionSegments(
      table.id,
      window,
      bookings,
      eventBlocks,
      mode.seatsPerTable,
    ),
  }));

  const now = new Date();
  const sessions = groupSessions(bookings, service.id).filter(
    (session) => session.startsAt > now,
  );
  const players = await loadPlayersByReservation(
    sessions.flatMap((session) =>
      session.bookings.map((booking) => booking.id!),
    ),
  );
  const tableNames = new Map(tables.map((table) => [table.id, table.name]));
  const tableCategories = new Map(tables.map((table) => [table.id, table.category]));

  base.sessions = sessions.map((session) => ({
    tableId: session.tableId,
    tableName: tableNames.get(session.tableId) ?? '',
    tableCategory: tableCategories.get(session.tableId) ?? 'wh',
    startsAt: formatLocalIso(session.startsAt),
    endsAt: formatLocalIso(session.endsAt),
    occupied: session.occupied,
    capacity: mode.seatsPerTable,
    freeSeats: Math.max(0, mode.seatsPerTable - session.occupied),
    players: session.bookings.map((booking) => {
      const player = players.get(booking.id!);
      return toPlayerView(player?.firstName ?? 'Игрок', player?.details ?? null, player?.username ?? null);
    }),
  }));

  return base;
}

export type BookingErrorCode =
  | 'SERVICE_NOT_FOUND'
  | 'SERVICE_NOT_BOOKABLE'
  | 'TABLE_REQUIRED'
  | 'TABLE_NOT_ALLOWED'
  | 'TABLE_NOT_FOUND'
  | 'INVALID_PARTY_SIZE'
  | 'INVALID_TIME'
  | 'DATE_NOT_ALLOWED'
  | 'SLOT_UNAVAILABLE'
  | 'INVALID_SEAT_OPTIONS'
  | 'INVALID_BUY_ARMY_OPTIONS'
  | 'INVALID_DETAILS'
  | 'RESERVATION_NOT_FOUND'
  | 'RESERVATION_ALREADY_CANCELLED'
  | 'RESERVATION_ALREADY_CONFIRMED'
  | 'RESERVATION_NOT_PENDING'
  | 'RESERVATION_STARTED'
  | 'INVALID_ENDS_AT';

export class BookingError extends Error {
  readonly code: BookingErrorCode;

  constructor(code: BookingErrorCode, message: string) {
    super(message);
    this.name = 'BookingError';
    this.code = code;
  }
}

export type CreateReservationInput = {
  userId: string;
  serviceId: number;
  startsAt?: Date;
  tableId?: number;
  partySize?: number;
  /** По одному флагу аренды армии на каждое место (только WH game/training) */
  seatClubArmyOptions?: boolean[];
  /** По одному флагу покупки покрашенной армии на каждое место (только wh_painting) */
  buyArmyOptions?: boolean[];
  /** Данные игрока (WH) или формы покраски */
  details?: unknown;
};

export type Reservation = typeof reservationsTable.$inferSelect;

export function parseIsoDateTime(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BookingError('INVALID_TIME', 'Invalid startsAt datetime');
  }

  return date;
}

function isWhService(slug: string): slug is WhServiceSlug {
  return WH_SERVICE_SLUGS.includes(slug as WhServiceSlug);
}

function resolveSeatClubArmyOptions(
  slug: string,
  partySize: number,
  seatClubArmyOptions: boolean[] | undefined,
): boolean[] | null {
  if (isWhService(slug)) {
    if (seatClubArmyOptions === undefined) {
      return Array.from({ length: partySize }, () => false);
    }
    if (seatClubArmyOptions.length !== partySize) {
      throw new BookingError(
        'INVALID_SEAT_OPTIONS',
        `seatClubArmyOptions must contain exactly ${partySize} boolean values`,
      );
    }

    return seatClubArmyOptions;
  }

  if (seatClubArmyOptions !== undefined && seatClubArmyOptions.length > 0) {
    throw new BookingError(
      'INVALID_SEAT_OPTIONS',
      'seatClubArmyOptions is only allowed for Warhammer game/training services',
    );
  }

  return null;
}

function resolveBuyArmyOptions(
  slug: string,
  partySize: number,
  buyArmyOptions: boolean[] | undefined,
): boolean[] | null {
  if (slug === PAINTING_SLUG) {
    if (buyArmyOptions === undefined || buyArmyOptions.length === 0) {
      return null;
    }
    if (buyArmyOptions.length !== partySize) {
      throw new BookingError(
        'INVALID_BUY_ARMY_OPTIONS',
        `buyArmyOptions must contain exactly ${partySize} boolean values`,
      );
    }

    return buyArmyOptions;
  }

  if (buyArmyOptions !== undefined && buyArmyOptions.length > 0) {
    throw new BookingError(
      'INVALID_BUY_ARMY_OPTIONS',
      'buyArmyOptions is only allowed for wh_painting',
    );
  }

  return null;
}

function parseDetails(slug: string, raw: unknown): ReservationDetails | null {
  try {
    return validateDetails(detailsKindForSlug(slug), raw);
  } catch (error) {
    if (error instanceof DetailsValidationError) {
      throw new BookingError('INVALID_DETAILS', error.message);
    }
    throw error;
  }
}

async function lockKey(tx: Tx, namespace: number, id: number) {
  // Транзакционная блокировка: две одновременные записи на один стол/услугу
  // выполняются по очереди, поэтому вместимость не может быть превышена.
  await tx.execute(
    sql`select pg_advisory_xact_lock(${namespace}::int, ${id}::int)`,
  );
}

const LOCK_TABLE = 1;
const LOCK_POOL = 2;

export type CreateReservationResult = Reservation & {
  /** Игрок присоединился к уже начатой игре */
  joinedSession: boolean;
};

export async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  const service = await loadService(db, input.serviceId);

  if (!service || !service.isActive || service.disciplineActive === false) {
    throw new BookingError('SERVICE_NOT_FOUND', 'Service not found');
  }

  const mode = resolveMode(service);
  if (mode.mode === 'none') {
    throw new BookingError(
      'SERVICE_NOT_BOOKABLE',
      'This service cannot be booked online',
    );
  }

  if (input.startsAt === undefined) {
    throw new BookingError(
      'INVALID_TIME',
      'startsAt is required for this service',
    );
  }

  const startsAt = input.startsAt;
  const durationMinutes = serviceDuration(service);
  // полный конец по длительности; ниже он может стать раньше, если до следующей занятости меньше (B1)
  const fullEndsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  if (startsAt.getTime() <= Date.now()) {
    throw new BookingError('INVALID_TIME', 'Selected time is in the past');
  }

  if (!isOnSlotGrid(startsAt, fullEndsAt, durationMinutes)) {
    throw new BookingError(
      'INVALID_TIME',
      'Selected time slot is not available',
    );
  }

  const dateParts = toLocalDateParts(startsAt);
  if (!isDateAllowed(dateParts, service.scheduleWeekdays)) {
    throw new BookingError(
      'DATE_NOT_ALLOWED',
      'This activity can only be booked on Friday, Saturday or Sunday',
    );
  }

  const details = parseDetails(service.slug, input.details);
  const detailsKind = detailsKindForSlug(service.slug);

  // Игроки WH записываются по одному: у каждого свои армия, очки и опыт.
  const partySize = input.partySize ?? 1;
  if (!Number.isInteger(partySize) || partySize <= 0) {
    throw new BookingError(
      'INVALID_PARTY_SIZE',
      'partySize must be greater than 0',
    );
  }
  if (detailsKind === 'wh_player' && partySize !== 1) {
    throw new BookingError(
      'INVALID_PARTY_SIZE',
      'Each Warhammer player books one place',
    );
  }

  const seatClubArmyOptions = resolveSeatClubArmyOptions(
    service.slug,
    partySize,
    input.seatClubArmyOptions,
  );
  const buyArmyOptions = resolveBuyArmyOptions(
    service.slug,
    partySize,
    input.buyArmyOptions,
  );

  const { openAt, closeAt } = getClubSessionBounds(dateParts);

  if (mode.mode === 'pool') {
    if (input.tableId !== undefined) {
      throw new BookingError(
        'TABLE_NOT_ALLOWED',
        'This activity does not use a table',
      );
    }

    const maxParty = Math.min(
      service.visitorsCapacity ?? mode.capacity,
      mode.capacity,
    );
    if (partySize > maxParty) {
      throw new BookingError(
        'INVALID_PARTY_SIZE',
        `partySize cannot exceed ${maxParty}`,
      );
    }

    const reservation = await db.transaction(async (tx) => {
      await lockKey(tx, LOCK_POOL, service.id);
      const bookings = await getPoolBusy(tx, service.id, mode.capacity, openAt, closeAt, service.slug === PAINTING_SLUG);
      const free = poolFreeSeats({ startsAt, endsAt: new Date(startsAt.getTime() + 1) }, bookings, mode.capacity);

      if (free < partySize) {
        throw new BookingError(
          'SLOT_UNAVAILABLE',
          free === 0 ? 'No places left' : `Only ${free} places left`,
        );
      }
      // B1: если мест не хватит на всю длительность — запись короче, но не меньше минимума
      const endsAt = poolFitEnd({
        startsAt,
        fullEnd: fullEndsAt,
        bookings,
        capacity: mode.capacity,
        partySize,
        minMinutes: bookingConfig.minShortenedMinutes,
      });
      if (!endsAt) {
        throw new BookingError('SLOT_UNAVAILABLE', `Less than ${bookingConfig.minShortenedMinutes / 60} hours are free from this time`);
      }

      const [created] = await tx
        .insert(reservationsTable)
        .values({
          userId: input.userId,
          serviceId: service.id,
          partySize,
          buyArmyOptions,
          details,
          startsAt,
          endsAt,
        })
        .returning();

      return created!;
    });

    void notifyAfterCreate(service, reservation, { joined: false, others: [] });
    return { ...reservation, joinedSession: false };
  }

  if (input.tableId === undefined) {
    throw new BookingError(
      'TABLE_REQUIRED',
      'tableId is required for this service',
    );
  }
  const tableId = input.tableId;

  const result = await db.transaction(async (tx) => {
    await lockKey(tx, LOCK_TABLE, tableId);

    const [table] = await tx
      .select({ id: tablesTable.id, category: tablesTable.category })
      .from(tablesTable)
      .where(and(eq(tablesTable.id, tableId), eq(tablesTable.isActive, true)))
      .limit(1);

    if (!table) {
      throw new BookingError('TABLE_NOT_FOUND', 'Table not found');
    }
    if (details?.kind === 'wh_player' && !gameFitsTable(details.game, table.category)) {
      throw new BookingError('INVALID_DETAILS', `Этот стол предназначен для категории «${TABLE_CATEGORY_LABEL[table.category]}»`);
    }

    const bookings = await getTableReservations(tx, [tableId], openAt, closeAt);
    const eventBlocks = await getTableBlocks([tableId], openAt, closeAt);
    // B1: присоединение — время уже идущей сессии; новая игра — полная длительность или до следующей занятости стола
    const session = bookings.find(
      (b) => b.tableId === tableId && b.serviceId === service.id && b.startsAt.getTime() === startsAt.getTime(),
    );
    const endsAt =
      session?.endsAt ??
      tableFitEnd({ tableId, startsAt, fullEnd: fullEndsAt, bookings, blocks: eventBlocks, minMinutes: bookingConfig.minShortenedMinutes });
    if (!endsAt) {
      throw new BookingError('SLOT_UNAVAILABLE', `Less than ${bookingConfig.minShortenedMinutes / 60} hours are free at this table from this time`);
    }
    if (table.category === 'small' && (await paintingBookedDuring(tx, startsAt, endsAt))) {
      throw new BookingError('SLOT_UNAVAILABLE', 'Painting is booked at this time');
    }
    const check = checkTableSession({
      tableId,
      serviceId: service.id,
      startsAt,
      endsAt,
      partySize,
      seatsPerTable: mode.seatsPerTable,
      bookings,
      blocks: eventBlocks,
    });

    if (!check.ok) {
      const messages = {
        BLOCKED: 'The table is reserved at this time',
        BUSY: 'The table is already taken at this time',
        FULL: 'This game is already full',
        TOO_MANY: `partySize cannot exceed ${mode.seatsPerTable}`,
      } as const;
      throw new BookingError(
        check.reason === 'TOO_MANY' ? 'INVALID_PARTY_SIZE' : 'SLOT_UNAVAILABLE',
        messages[check.reason],
      );
    }

    // присоединение к игре: игра (40K / AoS / Kill Team) — как у первого игрока за столом
    if (check.isJoin && session && details?.kind === 'wh_player') {
      const [host] = await tx.select({ details: reservationsTable.details }).from(reservationsTable).where(eq(reservationsTable.id, session.id)).limit(1);
      const hostGame = host?.details?.kind === 'wh_player' ? (host.details.game ?? '40k') : null;
      if (hostGame && hostGame !== (details.game ?? '40k')) {
        throw new BookingError('INVALID_DETAILS', `This table plays ${gameLabel(hostGame)}`);
      }
    }

    if (
      check.isJoin &&
      bookings.some(
        (booking) =>
          booking.userId === input.userId &&
          booking.startsAt.getTime() === startsAt.getTime(),
      )
    ) {
      throw new BookingError(
        'SLOT_UNAVAILABLE',
        'You are already booked for this game',
      );
    }

    const [created] = await tx
      .insert(reservationsTable)
      .values({
        userId: input.userId,
        serviceId: service.id,
        tableId,
        partySize,
        seatClubArmyOptions,
        buyArmyOptions,
        details,
        startsAt,
        endsAt,
      })
      .returning();

    return {
      reservation: created!,
      joined: check.isJoin,
      others: check.others.map((other) => (other as BookingRow).id),
    };
  });

  void notifyAfterCreate(service, result.reservation, {
    joined: result.joined,
    others: result.others,
    seatsPerTable: mode.seatsPerTable,
  });

  return { ...result.reservation, joinedSession: result.joined };
}

// ----------------------------------------------------------------------------
// Уведомления о записях
// ----------------------------------------------------------------------------

type UserBrief = {
  id: string;
  telegramId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
};

async function loadUsersForReservations(
  reservationIds: string[],
): Promise<Array<{ reservationId: string; user: UserBrief; details: ReservationDetails | null }>> {
  if (reservationIds.length === 0) return [];

  const rows = await db
    .select({
      reservationId: reservationsTable.id,
      details: reservationsTable.details,
      id: usersTable.id,
      telegramId: usersTable.telegramId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
    })
    .from(reservationsTable)
    .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
    .where(inArray(reservationsTable.id, reservationIds));

  return rows.map((row) => ({
    reservationId: row.reservationId,
    details: (row.details as ReservationDetails | null) ?? null,
    user: {
      id: row.id,
      telegramId: row.telegramId,
      firstName: row.firstName,
      lastName: row.lastName,
      username: row.username,
    },
  }));
}

async function getTableName(tableId: number | null): Promise<string> {
  if (tableId === null) return '—';
  const [table] = await db
    .select({ name: tablesTable.name })
    .from(tablesTable)
    .where(eq(tablesTable.id, tableId))
    .limit(1);
  return table?.name ?? `#${tableId}`;
}

function describePlayer(user: UserBrief, details: ReservationDetails | null) {
  const lines = [`Игрок: ${escapeHtml(formatUserName(user))}`];
  if (details?.kind === 'wh_player') {
    lines.push(
      `Игра: ${escapeHtml(gameLabel(details.game))}`,
      escapeHtml(armyLine(details.game, details.army)),
      ...(details.points != null ? [`Очки: ${details.points}`] : []),
      `Опыт: ${escapeHtml(experienceLabel(details.experienceLevel))}`,
    );
  }
  return lines.join('\n');
}

function serviceTitle(service: { slug: string; title: string | null }) {
  return escapeHtml(service.title ?? service.slug);
}

async function notifyAfterCreate(
  service: ServiceRow,
  reservation: Reservation,
  context: { joined: boolean; others: string[]; seatsPerTable?: number },
  reason: 'created' | 'help-requested' = 'created',
): Promise<void> {
  try {
    const [booker] = await loadUsersForReservations([reservation.id]);
    if (!booker) return;

    const when = formatClubDateTime(reservation.startsAt, reservation.endsAt);
    const details = (reservation.details as ReservationDetails | null) ?? null;
    const seats = context.seatsPerTable;
    const atTable = !!seats && seats >= 2 && reservation.tableId !== null;
    const others = atTable && context.joined ? await loadUsersForReservations(context.others) : [];

    // соперникам за столом — что к их игре присоединились
    for (const other of others) {
      notifyUser(
        other.user.telegramId,
        [
          `⚔️ <b>К вашей игре присоединился соперник!</b>`,
          `${serviceTitle(service)} — ${when}`,
          describePlayer(booker.user, details),
        ].join('\n'),
      );
    }

    // администраторам — одно полное сообщение о каждой записи (N1)
    const text = bookingNoticeText({
      reason,
      serviceTitle: service.title ?? service.slug,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      createdAt: reservation.createdAt,
      tableName: reservation.tableId !== null ? await getTableName(reservation.tableId) : null,
      user: booker.user,
      partySize: reservation.partySize,
      seatClubArmyOptions: reservation.seatClubArmyOptions,
      buyArmyOptions: reservation.buyArmyOptions,
      details,
      table: atTable ? { occupied: others.length + 1, seats: seats! } : null,
      fullMinutes: serviceDuration(service),
    });
    const playersAtTable = others.map((other) => describePlayer(other.user, other.details));
    notifyAdmins(playersAtTable.length ? `${text}\n— за столом также:\n${playersAtTable.join('\n')}` : text);
  } catch (error) {
    console.warn('[notify] booking notification failed', error);
  }
}

async function notifyAfterCancel(
  reservation: Reservation,
  cancelledBy: 'user' | 'admin',
): Promise<void> {
  try {
    const service = await loadService(db, reservation.serviceId);
    if (!service || !isWhService(service.slug)) return;
    if (!reservation.startsAt || reservation.startsAt.getTime() < Date.now()) {
      return;
    }

    const [booker] = await loadUsersForReservations([reservation.id]);
    const when = formatClubDateTime(reservation.startsAt, reservation.endsAt);
    const mode = resolveMode(service);
    const seats = mode.mode === 'table' ? mode.seatsPerTable : 0;

    let remaining: Awaited<ReturnType<typeof loadUsersForReservations>> = [];
    if (reservation.tableId !== null && seats >= 2) {
      const sessionMates = await db
        .select({ id: reservationsTable.id })
        .from(reservationsTable)
        .where(
          and(
            eq(reservationsTable.tableId, reservation.tableId),
            eq(reservationsTable.serviceId, reservation.serviceId),
            eq(reservationsTable.startsAt, reservation.startsAt),
            inArray(reservationsTable.status, [...ACTIVE_RESERVATION_STATUSES]),
            ne(reservationsTable.id, reservation.id),
          ),
        );
      remaining = await loadUsersForReservations(sessionMates.map((r) => r.id));

      for (const mate of remaining) {
        notifyUser(
          mate.user.telegramId,
          [
            `ℹ️ <b>Соперник отменил запись</b>`,
            `${serviceTitle(service)} — ${when}`,
            'Ваша запись сохранена, место за столом снова свободно.',
          ].join('\n'),
        );
      }
    }

    if (cancelledBy === 'admin' && booker) {
      notifyUser(
        booker.user.telegramId,
        [
          `❌ <b>Ваша запись отменена администратором</b>`,
          `${serviceTitle(service)} — ${when}`,
        ].join('\n'),
      );
    }

    notifyAdmins(
      [
        `❌ <b>${serviceTitle(service)}: запись отменена</b>${
          cancelledBy === 'admin' ? ' (администратором)' : ''
        }`,
        `Дата: ${when}`,
        `Стол: ${escapeHtml(await getTableName(reservation.tableId))}`,
        booker ? describePlayer(booker.user, booker.details) : '',
        seats >= 2 && reservation.tableId !== null
          ? `Теперь за столом: ${remaining.length}/${seats}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  } catch (error) {
    console.warn('[notify] cancel notification failed', error);
  }
}

// ----------------------------------------------------------------------------
// Просмотр записей
// ----------------------------------------------------------------------------

export type UserReservationView = {
  id: string;
  userId: string;
  serviceId: number;
  serviceSlug: string;
  serviceTitle: string | null;
  tableId: number | null;
  tableName: string | null;
  partySize: number | null;
  seatClubArmyOptions: boolean[] | null;
  buyArmyOptions: boolean[] | null;
  details: ReservationDetails | null;
  startsAt: string | null;
  endsAt: string | null;
  status: 'pending' | 'confirmed' | 'cancelled';
  cancelledAt: string | null;
  createdAt: string;
  user: {
    telegramId: number;
    firstName: string;
    lastName: string | null;
    username: string | null;
  };
};

/** Другие игроки той же игры (стол + начало + услуга), без отменённых; для «Мои записи» (31.10.2026) */
export type ReservationWithTablemates = UserReservationView & { tablemates: SessionPlayerView[] };

export type UserMyReservationsView = {
  reservations: ReservationWithTablemates[];
  event: UserUpcomingEventView | null;
};

export type ListReservationsFilters = {
  date?: string;
  serviceId?: number;
  tableId?: number;
  status?: 'pending' | 'confirmed' | 'cancelled';
  userId?: string;
  startsAt?: string;
  endsAt?: string;
  sortBy?: 'startsAt' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
  /** Максимум записей на странице (по умолчанию 50, максимум 100) */
  limit?: number;
  /** Смещение от начала выборки */
  offset?: number;
};

export function toReservationResponse(reservation: Reservation) {
  return {
    id: reservation.id,
    serviceId: reservation.serviceId,
    tableId: reservation.tableId,
    partySize: reservation.partySize,
    seatClubArmyOptions: reservation.seatClubArmyOptions,
    buyArmyOptions: reservation.buyArmyOptions,
    details: reservation.details ?? null,
    startsAt: reservation.startsAt?.toISOString() ?? null,
    endsAt: reservation.endsAt?.toISOString() ?? null,
    status: reservation.status,
  };
}

function buildReservationFilters(filters: ListReservationsFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.serviceId !== undefined) {
    conditions.push(eq(reservationsTable.serviceId, filters.serviceId));
  }

  if (filters.tableId !== undefined) {
    conditions.push(eq(reservationsTable.tableId, filters.tableId));
  }

  if (filters.status !== undefined) {
    conditions.push(eq(reservationsTable.status, filters.status));
  }

  if (filters.userId !== undefined) {
    conditions.push(eq(reservationsTable.userId, filters.userId));
  }

  if (filters.date !== undefined) {
    const dateParts = parseDateParam(filters.date);
    const { openAt, closeAt } = getClubSessionBounds(dateParts);
    // Пересечение с клубной сменой даты: 12:00 → 10:00 следующего дня
    conditions.push(
      and(
        lt(reservationsTable.startsAt, closeAt),
        gt(reservationsTable.endsAt, openAt),
      )!,
    );
  }

  if (filters.startsAt !== undefined) {
    conditions.push(
      gte(reservationsTable.startsAt, parseIsoDateTime(filters.startsAt)),
    );
  }

  if (filters.endsAt !== undefined) {
    conditions.push(
      lte(reservationsTable.endsAt, parseIsoDateTime(filters.endsAt)),
    );
  }

  return conditions;
}

function buildReservationOrderBy(filters: ListReservationsFilters) {
  const sortBy = filters.sortBy ?? 'startsAt';
  const sortOrder = filters.sortOrder ?? 'desc';

  const column =
    sortBy === 'createdAt'
      ? reservationsTable.createdAt
      : sortBy === 'status'
        ? reservationsTable.status
        : reservationsTable.startsAt;

  return sortOrder === 'asc' ? asc(column) : desc(column);
}

export async function listReservations(
  filters: ListReservationsFilters = {},
): Promise<UserReservationView[]> {
  const conditions = buildReservationFilters(filters);
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  const rows = await db
    .select({
      id: reservationsTable.id,
      userId: reservationsTable.userId,
      serviceId: reservationsTable.serviceId,
      serviceSlug: servicesTable.slug,
      serviceTitle: servicesTable.title,
      tableId: reservationsTable.tableId,
      tableName: tablesTable.name,
      partySize: reservationsTable.partySize,
      seatClubArmyOptions: reservationsTable.seatClubArmyOptions,
      buyArmyOptions: reservationsTable.buyArmyOptions,
      details: reservationsTable.details,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
      status: reservationsTable.status,
      cancelledAt: reservationsTable.cancelledAt,
      createdAt: reservationsTable.createdAt,
      telegramId: usersTable.telegramId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
    })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
    .leftJoin(tablesTable, eq(reservationsTable.tableId, tablesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(buildReservationOrderBy(filters))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    serviceId: row.serviceId,
    serviceSlug: row.serviceSlug,
    serviceTitle: row.serviceTitle,
    tableId: row.tableId,
    tableName: row.tableName,
    partySize: row.partySize,
    seatClubArmyOptions: row.seatClubArmyOptions,
    buyArmyOptions: row.buyArmyOptions,
    details: (row.details as ReservationDetails | null) ?? null,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    status: row.status as UserReservationView['status'],
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    user: {
      telegramId: row.telegramId,
      firstName: row.firstName,
      lastName: row.lastName,
      username: row.username,
    },
  }));
}

export async function countReservations(
  filters: ListReservationsFilters = {},
): Promise<number> {
  const conditions = buildReservationFilters(filters);

  const [row] = await db
    .select({ value: count() })
    .from(reservationsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return Number(row?.value ?? 0);
}

export async function getUserReservations(
  userId: string,
): Promise<UserMyReservationsView> {
  const [reservations, event] = await Promise.all([
    listReservations({ userId }),
    getNearestUpcomingEventForUser(userId),
  ]);

  return { reservations: await withTablemates(userId, reservations), event };
}

/** Соперники за тем же столом в той же игре — как сессии в доступности (groupSessions: стол + начало + услуга). */
async function withTablemates(
  userId: string,
  reservations: UserReservationView[],
): Promise<ReservationWithTablemates[]> {
  const tableBookings = reservations.filter(
    (r) => r.tableId !== null && r.startsAt !== null && r.status !== 'cancelled',
  );
  if (tableBookings.length === 0) return reservations.map((r) => ({ ...r, tablemates: [] }));

  const rows = await db
    .select({
      serviceId: reservationsTable.serviceId,
      tableId: reservationsTable.tableId,
      startsAt: reservationsTable.startsAt,
      createdAt: reservationsTable.createdAt,
      userId: reservationsTable.userId,
      details: reservationsTable.details,
      firstName: usersTable.firstName,
      username: usersTable.username,
    })
    .from(reservationsTable)
    .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
    .where(
      and(
        inArray(reservationsTable.tableId, [...new Set(tableBookings.map((r) => r.tableId!))]),
        inArray(reservationsTable.startsAt, [...new Set(tableBookings.map((r) => r.startsAt!))].map((iso) => new Date(iso))),
        inArray(reservationsTable.status, ['pending', 'confirmed']),
        ne(reservationsTable.userId, userId),
      ),
    )
    .orderBy(asc(reservationsTable.createdAt));

  const key = (serviceId: number, tableId: number | null, startsAt: Date | string | null) =>
    `${serviceId}:${tableId}:${startsAt ? new Date(startsAt).getTime() : ''}`;
  const byGame = new Map<string, SessionPlayerView[]>();
  for (const row of rows) {
    const k = key(row.serviceId, row.tableId, row.startsAt);
    const list = byGame.get(k) ?? [];
    list.push(toPlayerView(row.firstName, (row.details as ReservationDetails | null) ?? null, row.username));
    byGame.set(k, list);
  }

  return reservations.map((r) => ({
    ...r,
    tablemates: r.status === 'cancelled' || r.tableId === null ? [] : (byGame.get(key(r.serviceId, r.tableId, r.startsAt)) ?? []),
  }));
}

async function getReservationById(
  reservationId: string,
): Promise<Reservation | undefined> {
  const [reservation] = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.id, reservationId))
    .limit(1);

  return reservation;
}

export async function cancelReservation(
  userId: string,
  reservationId: string,
): Promise<Reservation> {
  const [reservation] = await db
    .select()
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.id, reservationId),
        eq(reservationsTable.userId, userId),
      ),
    )
    .limit(1);

  if (!reservation) {
    throw new BookingError('RESERVATION_NOT_FOUND', 'Reservation not found');
  }

  if (reservation.status === 'cancelled') {
    throw new BookingError(
      'RESERVATION_ALREADY_CANCELLED',
      'Reservation is already cancelled',
    );
  }

  const [updated] = await db
    .update(reservationsTable)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
    })
    .where(eq(reservationsTable.id, reservationId))
    .returning();

  void notifyAfterCancel(updated!, 'user');

  return updated!;
}

/** Пользователь меняет армию/очки/опыт или данные покраски до начала записи */
export async function updateReservationDetails(
  userId: string,
  reservationId: string,
  rawDetails: unknown,
): Promise<Reservation> {
  const [row] = await db
    .select({
      reservation: reservationsTable,
      slug: servicesTable.slug,
    })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .where(
      and(
        eq(reservationsTable.id, reservationId),
        eq(reservationsTable.userId, userId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new BookingError('RESERVATION_NOT_FOUND', 'Reservation not found');
  }

  const { reservation, slug } = row;

  if (reservation.status === 'cancelled') {
    throw new BookingError(
      'RESERVATION_ALREADY_CANCELLED',
      'Reservation is cancelled',
    );
  }

  if (!reservation.startsAt || reservation.startsAt.getTime() <= Date.now()) {
    throw new BookingError(
      'RESERVATION_STARTED',
      'The booking has already started',
    );
  }

  if (detailsKindForSlug(slug) === null) {
    throw new BookingError(
      'INVALID_DETAILS',
      'This booking has no editable details',
    );
  }

  const details = parseDetails(slug, rawDetails);
  const previous = (reservation.details as ReservationDetails | null) ?? null;

  if (details.kind === 'wh_player' && reservation.tableId !== null) {
    const [table] = await db.select({ category: tablesTable.category }).from(tablesTable).where(eq(tablesTable.id, reservation.tableId)).limit(1);
    if (table && !gameFitsTable(details.game, table.category)) {
      throw new BookingError('INVALID_DETAILS', `Этот стол предназначен для категории «${TABLE_CATEGORY_LABEL[table.category]}»`);
    }
  }

  const [updated] = await db
    .update(reservationsTable)
    .set({ details })
    .where(eq(reservationsTable.id, reservationId))
    .returning();

  if (
    details?.kind === 'painting' &&
    details.needsHelp &&
    !(previous?.kind === 'painting' && previous.needsHelp)
  ) {
    const service = await loadService(db, reservation.serviceId);
    if (service) {
      void notifyAfterCreate(service, updated!, { joined: false, others: [] }, 'help-requested');
    }
  }

  return updated!;
}

export async function confirmReservation(
  reservationId: string,
): Promise<Reservation> {
  const reservation = await getReservationById(reservationId);

  if (!reservation) {
    throw new BookingError('RESERVATION_NOT_FOUND', 'Reservation not found');
  }

  if (reservation.status === 'cancelled') {
    throw new BookingError(
      'RESERVATION_ALREADY_CANCELLED',
      'Reservation is cancelled',
    );
  }

  if (reservation.status === 'confirmed') {
    throw new BookingError(
      'RESERVATION_ALREADY_CONFIRMED',
      'Reservation is already confirmed',
    );
  }

  const [updated] = await db
    .update(reservationsTable)
    .set({ status: 'confirmed' })
    .where(eq(reservationsTable.id, reservationId))
    .returning();

  return updated!;
}

export async function rejectReservation(
  reservationId: string,
): Promise<Reservation> {
  const reservation = await getReservationById(reservationId);

  if (!reservation) {
    throw new BookingError('RESERVATION_NOT_FOUND', 'Reservation not found');
  }

  if (reservation.status === 'cancelled') {
    throw new BookingError(
      'RESERVATION_ALREADY_CANCELLED',
      'Reservation is already cancelled',
    );
  }

  const [updated] = await db
    .update(reservationsTable)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
    })
    .where(eq(reservationsTable.id, reservationId))
    .returning();

  void notifyAfterCancel(updated!, 'admin');

  return updated!;
}

export async function extendReservation(
  reservationId: string,
  endsAt: Date,
): Promise<Reservation> {
  const reservation = await getReservationById(reservationId);

  if (!reservation) {
    throw new BookingError('RESERVATION_NOT_FOUND', 'Reservation not found');
  }

  if (reservation.status === 'cancelled') {
    throw new BookingError(
      'RESERVATION_ALREADY_CANCELLED',
      'Reservation is cancelled',
    );
  }

  if (!reservation.startsAt) {
    throw new BookingError('INVALID_ENDS_AT', 'Reservation has no start time');
  }

  if (endsAt.getTime() <= reservation.startsAt.getTime()) {
    throw new BookingError('INVALID_ENDS_AT', 'endsAt must be after startsAt');
  }

  const dateParts = toLocalDateParts(reservation.startsAt);
  const { closeAt } = getClubSessionBounds(dateParts);

  if (endsAt.getTime() > closeAt.getTime()) {
    throw new BookingError(
      'INVALID_ENDS_AT',
      'endsAt cannot be later than club closing time',
    );
  }

  const [updated] = await db
    .update(reservationsTable)
    .set({ endsAt })
    .where(eq(reservationsTable.id, reservationId))
    .returning();

  return updated!;
}

// ----------------------------------------------------------------------------
// Администратор: столы Warhammer и покраска
// ----------------------------------------------------------------------------

export type AdminPlayerView = {
  reservationId: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  partySize: number;
  details: ReservationDetails | null;
  seatClubArmyOptions: boolean[] | null;
  user: {
    id: string;
    telegramId: number;
    firstName: string;
    lastName: string | null;
    username: string | null;
  };
};

export type AdminSessionView = {
  serviceId: number;
  serviceSlug: string;
  serviceTitle: string | null;
  hasTrainer: boolean;
  tableId: number;
  tableName: string;
  startsAt: string;
  endsAt: string;
  occupied: number;
  capacity: number;
  freeSeats: number;
  players: AdminPlayerView[];
};

export type AdminPoolBookingView = AdminPlayerView & {
  serviceId: number;
  serviceSlug: string;
  serviceTitle: string | null;
  startsAt: string;
  endsAt: string;
};

export type AdminWarhammerDayView = {
  date: string;
  tables: Array<{ id: number; name: string }>;
  sessions: AdminSessionView[];
  painting: AdminPoolBookingView[];
  paintingCapacity: number | null;
  /** брони столов администратором в эту смену */
  holds: TableHoldView[];
};

export async function getAdminWarhammerDay(
  date: string,
): Promise<AdminWarhammerDayView> {
  const dateParts = parseDateParam(date);
  const { openAt, closeAt } = getClubSessionBounds(dateParts);
  const tables = await getActiveTables();
  const tableNames = new Map(tables.map((table) => [table.id, table.name]));

  const services = await db
    .select({ id: servicesTable.id })
    .from(servicesTable)
    .where(inArray(servicesTable.slug, [...WH_SERVICE_SLUGS, PAINTING_SLUG]));
  const serviceRows = (
    await Promise.all(services.map((s) => loadService(db, s.id)))
  ).filter((s): s is ServiceRow => Boolean(s));

  const rows = await db
    .select({
      id: reservationsTable.id,
      serviceId: reservationsTable.serviceId,
      tableId: reservationsTable.tableId,
      partySize: reservationsTable.partySize,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
      status: reservationsTable.status,
      details: reservationsTable.details,
      seatClubArmyOptions: reservationsTable.seatClubArmyOptions,
      userId: usersTable.id,
      telegramId: usersTable.telegramId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
    })
    .from(reservationsTable)
    .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
    .where(
      and(
        inArray(
          reservationsTable.serviceId,
          serviceRows.map((s) => s.id),
        ),
        inArray(reservationsTable.status, [...ACTIVE_RESERVATION_STATUSES]),
        lt(reservationsTable.startsAt, closeAt),
        gt(reservationsTable.endsAt, openAt),
      ),
    )
    .orderBy(asc(reservationsTable.startsAt));

  const toPlayer = (row: (typeof rows)[number]): AdminPlayerView => ({
    reservationId: row.id,
    status: row.status as AdminPlayerView['status'],
    partySize: row.partySize ?? 1,
    details: (row.details as ReservationDetails | null) ?? null,
    seatClubArmyOptions: row.seatClubArmyOptions,
    user: {
      id: row.userId,
      telegramId: row.telegramId,
      firstName: row.firstName,
      lastName: row.lastName,
      username: row.username,
    },
  });

  const sessions: AdminSessionView[] = [];
  const painting: AdminPoolBookingView[] = [];
  let paintingCapacity: number | null = null;

  for (const service of serviceRows) {
    const mode = resolveMode(service);
    const serviceBookings = rows.filter(
      (row) =>
        row.serviceId === service.id &&
        row.startsAt !== null &&
        row.endsAt !== null,
    );

    if (mode.mode === 'pool') {
      if (service.slug === PAINTING_SLUG) paintingCapacity = mode.capacity;
      for (const row of serviceBookings) {
        painting.push({
          ...toPlayer(row),
          serviceId: service.id,
          serviceSlug: service.slug,
          serviceTitle: service.title,
          startsAt: formatLocalIso(row.startsAt!),
          endsAt: formatLocalIso(row.endsAt!),
        });
      }
      continue;
    }

    if (mode.mode !== 'table') continue;

    const grouped = groupSessions(
      serviceBookings
        .filter((row) => row.tableId !== null)
        .map((row) => ({
          id: row.id,
          tableId: row.tableId,
          serviceId: row.serviceId,
          partySize: row.partySize ?? 1,
          startsAt: row.startsAt!,
          endsAt: row.endsAt!,
        })),
      service.id,
    );

    for (const session of grouped) {
      const ids = new Set(session.bookings.map((booking) => booking.id));
      sessions.push({
        serviceId: service.id,
        serviceSlug: service.slug,
        serviceTitle: service.title,
        hasTrainer: service.hasTrainer,
        tableId: session.tableId,
        tableName:
          tableNames.get(session.tableId) ?? `Неактивный стол #${session.tableId}`,
        startsAt: formatLocalIso(session.startsAt),
        endsAt: formatLocalIso(session.endsAt),
        occupied: session.occupied,
        capacity: mode.seatsPerTable,
        freeSeats: Math.max(0, mode.seatsPerTable - session.occupied),
        players: rows.filter((row) => ids.has(row.id)).map(toPlayer),
      });
    }
  }

  sessions.sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.tableId - b.tableId,
  );

  const holds = await listHoldsBetween(openAt, closeAt);

  return { date, tables, sessions, painting, paintingCapacity, holds };
}

/** Администратор пересаживает игрока за другой стол (то же время) */
export async function moveReservationToTable(
  reservationId: string,
  targetTableId: number,
): Promise<Reservation> {
  const reservation = await getReservationById(reservationId);

  if (!reservation) {
    throw new BookingError('RESERVATION_NOT_FOUND', 'Reservation not found');
  }
  if (reservation.status === 'cancelled') {
    throw new BookingError(
      'RESERVATION_ALREADY_CANCELLED',
      'Reservation is cancelled',
    );
  }
  if (!reservation.startsAt || !reservation.endsAt) {
    throw new BookingError('INVALID_TIME', 'Reservation has no time');
  }
  if (reservation.tableId === targetTableId) {
    return reservation;
  }

  const service = await loadService(db, reservation.serviceId);
  const mode = service ? resolveMode(service) : { mode: 'none' as const };
  if (!service || mode.mode !== 'table') {
    throw new BookingError(
      'TABLE_NOT_ALLOWED',
      'Only table bookings can be moved',
    );
  }

  const startsAt = reservation.startsAt;
  const endsAt = reservation.endsAt;
  const { openAt, closeAt } = getClubSessionBounds(toLocalDateParts(startsAt));
  const lockIds = [targetTableId, reservation.tableId ?? targetTableId].sort(
    (a, b) => a - b,
  );

  const updated = await db.transaction(async (tx) => {
    for (const id of new Set(lockIds)) {
      await lockKey(tx, LOCK_TABLE, id);
    }

    const [table] = await tx
      .select({ id: tablesTable.id, category: tablesTable.category })
      .from(tablesTable)
      .where(
        and(eq(tablesTable.id, targetTableId), eq(tablesTable.isActive, true)),
      )
      .limit(1);
    if (!table) {
      throw new BookingError('TABLE_NOT_FOUND', 'Table not found');
    }
    if (reservation.details?.kind === 'wh_player' && !gameFitsTable(reservation.details.game, table.category)) {
      throw new BookingError('INVALID_DETAILS', `Этот стол предназначен для категории «${TABLE_CATEGORY_LABEL[table.category]}»`);
    }
    if (table.category === 'small' && (await paintingBookedDuring(tx, startsAt, endsAt))) {
      throw new BookingError('SLOT_UNAVAILABLE', 'Painting is booked at this time');
    }

    const bookings = (
      await getTableReservations(tx, [targetTableId], openAt, closeAt)
    ).filter((booking) => booking.id !== reservation.id);
    const blocks = await getTableBlocks([targetTableId], openAt, closeAt);
    const check = checkTableSession({
      tableId: targetTableId,
      serviceId: reservation.serviceId,
      startsAt,
      endsAt,
      partySize: reservation.partySize ?? 1,
      seatsPerTable: mode.seatsPerTable,
      bookings,
      blocks,
    });

    if (!check.ok) {
      throw new BookingError(
        'SLOT_UNAVAILABLE',
        'The target table is not free for this game',
      );
    }

    const [row] = await tx
      .update(reservationsTable)
      .set({ tableId: targetTableId })
      .where(eq(reservationsTable.id, reservation.id))
      .returning();

    return row!;
  });

  void (async () => {
    const [booker] = await loadUsersForReservations([reservation.id]);
    if (!booker) return;
    notifyUser(
      booker.user.telegramId,
      [
        `🔁 <b>Администратор пересадил вас за другой стол</b>`,
        `${serviceTitle(service)} — ${formatClubDateTime(startsAt, endsAt)}`,
        'Время игры не изменилось. Подробности — в разделе «Мои записи».',
      ].join('\n'),
    );
  })().catch((error) => console.warn('[notify] move notification failed', error));

  return updated;
}
