import { and, asc, desc, eq, gt, inArray, isNull, or, sql, sum } from 'drizzle-orm';
import {
  bookingOptions,
  dndTimePreferenceLabel,
  experienceLabel,
  isDndTimePreference,
  isExperienceLevel,
} from '../../config/booking';
import { db } from '../../db';
import {
  DND_GAME_STATUSES,
  DND_TRIAL_STATUSES,
  dndGameBookingsTable,
  dndGamesTable,
  dndTrialRequestsTable,
  usersTable,
  type DndGameStatus,
  type DndTrialStatus,
} from '../../db/schema';
import { canBookDndSeats, dndAvailableSeats, formatLocalIso } from '../booking/rules';
import { gameStarted, parseSchedule, scheduleChanged, scheduleLabel, ScheduleError, type DndSchedule } from './schedule';
import {
  escapeHtml,
  formatUserName,
  notifyAdmins,
  notifyUser,
} from '../notifications/service';

export type DndErrorCode =
  | 'GAME_NOT_FOUND'
  | 'GAME_NOT_OPEN'
  | 'GAME_STARTED'
  | 'GAME_FULL'
  | 'GAME_HAS_BOOKINGS'
  | 'CAPACITY_BELOW_BOOKINGS'
  | 'ALREADY_BOOKED'
  | 'BOOKING_NOT_FOUND'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_ALREADY_OPEN'
  | 'INVALID_INPUT';

export class DndError extends Error {
  readonly code: DndErrorCode;

  constructor(code: DndErrorCode, message: string) {
    super(message);
    this.name = 'DndError';
    this.code = code;
  }
}

type GameRow = typeof dndGamesTable.$inferSelect;

export type DndGameView = {
  id: number;
  title: string;
  description: string | null;
  gameType: string;
  /** null — время примерное: дни недели и время суток (daysOfWeek, timesOfDay) */
  startsAt: string | null;
  endsAt: string | null;
  daysOfWeek: number[];
  timesOfDay: string[];
  /** «пятница или суббота, вечер» или точная дата и время */
  scheduleLabel: string;
  capacity: number;
  occupied: number;
  available: number;
  imageUrl: string | null;
  status: DndGameStatus;
  /** Можно ли сейчас записаться */
  isBookable: boolean;
};

export type DndBookingView = {
  id: string;
  gameId: number;
  quantity: number;
  timeIsConvenient: boolean;
  experienceLevel: string | null;
  experienceLabel: string | null;
  status: 'active' | 'cancelled';
  createdAt: string;
  cancelledAt: string | null;
};

export type DndTrialRequestView = {
  id: string;
  playersCount: number;
  preferredTimes: string[];
  preferredTimeLabels: string[];
  experienceLevel: string | null;
  experienceLabel: string | null;
  isPrivate: boolean;
  notes: string | null;
  status: DndTrialStatus;
  gameId: number | null;
  createdAt: string;
};

type UserInfo = {
  id: string;
  telegramId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
};

// ----------------------------------------------------------------------------
// Вспомогательные функции
// ----------------------------------------------------------------------------

async function getOccupancy(gameIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (gameIds.length === 0) return map;

  const rows = await db
    .select({
      gameId: dndGameBookingsTable.gameId,
      occupied: sum(dndGameBookingsTable.quantity),
    })
    .from(dndGameBookingsTable)
    .where(
      and(
        inArray(dndGameBookingsTable.gameId, gameIds),
        eq(dndGameBookingsTable.status, 'active'),
      ),
    )
    .groupBy(dndGameBookingsTable.gameId);

  for (const row of rows) map.set(row.gameId, Number(row.occupied ?? 0));
  return map;
}

function toGameView(game: GameRow, occupied: number): DndGameView {
  const available = dndAvailableSeats(game.capacity, [occupied]);
  return {
    id: game.id,
    title: game.title,
    description: game.description,
    gameType: game.gameType,
    startsAt: game.startsAt ? formatLocalIso(game.startsAt) : null,
    endsAt: game.endsAt ? formatLocalIso(game.endsAt) : null,
    // обычные массивы: integer[] из драйвера БД — Int32Array, в JSON он становится объектом {"0": …}
    daysOfWeek: Array.from(game.daysOfWeek, Number),
    timesOfDay: Array.from(game.timesOfDay, String),
    scheduleLabel: scheduleLabel(game),
    capacity: game.capacity,
    occupied,
    available,
    imageUrl: game.imageUrl,
    status: game.status as DndGameStatus,
    isBookable:
      game.status === 'open' &&
      !gameStarted(game) &&
      available > 0,
  };
}

function toBookingView(row: typeof dndGameBookingsTable.$inferSelect): DndBookingView {
  return {
    id: row.id,
    gameId: row.gameId,
    quantity: row.quantity,
    timeIsConvenient: row.timeIsConvenient,
    experienceLevel: row.experienceLevel,
    experienceLabel: row.experienceLevel
      ? experienceLabel(row.experienceLevel)
      : null,
    status: row.status as DndBookingView['status'],
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}

function toTrialView(
  row: typeof dndTrialRequestsTable.$inferSelect,
): DndTrialRequestView {
  return {
    id: row.id,
    playersCount: row.playersCount,
    preferredTimes: row.preferredTimes,
    preferredTimeLabels: row.preferredTimes.map(dndTimePreferenceLabel),
    experienceLevel: row.experienceLevel,
    experienceLabel: row.experienceLevel
      ? experienceLabel(row.experienceLevel)
      : null,
    isPrivate: row.isPrivate,
    notes: row.notes,
    status: row.status as DndTrialStatus,
    gameId: row.gameId,
    createdAt: row.createdAt.toISOString(),
  };
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new DndError('INVALID_INPUT', `${field} must be text`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new DndError(
      'INVALID_INPUT',
      `${field} must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

function requiredText(value: unknown, field: string, maxLength: number) {
  const text = optionalText(value, field, maxLength);
  if (!text) throw new DndError('INVALID_INPUT', `${field} is required`);
  return text;
}

function parseExperience(value: unknown, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new DndError('INVALID_INPUT', 'experienceLevel is required');
    }
    return null;
  }
  if (!isExperienceLevel(value)) {
    throw new DndError('INVALID_INPUT', 'experienceLevel is invalid');
  }
  return value;
}

function schedule(input: GameInput, prev?: DndSchedule): DndSchedule {
  try {
    return parseSchedule(input, prev);
  } catch (e) {
    if (e instanceof ScheduleError) throw new DndError('INVALID_INPUT', e.message);
    throw e;
  }
}

/** Порядок игр: сначала с примерным временем (идут, пока открыты), затем по точному началу */
const byStart = sql`${dndGamesTable.startsAt} asc nulls first`;
const byStartDesc = sql`${dndGamesTable.startsAt} desc nulls first`;

async function getGameRow(gameId: number): Promise<GameRow | undefined> {
  const [game] = await db
    .select()
    .from(dndGamesTable)
    .where(eq(dndGamesTable.id, gameId))
    .limit(1);
  return game;
}

async function getUser(userId: string): Promise<UserInfo | undefined> {
  const [user] = await db
    .select({
      id: usersTable.id,
      telegramId: usersTable.telegramId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user;
}

function gameLine(game: Pick<GameRow, 'title' | 'gameType' | 'startsAt' | 'endsAt' | 'daysOfWeek' | 'timesOfDay'>) {
  return `«${escapeHtml(game.title)}» (${escapeHtml(game.gameType)}) — ${scheduleLabel(game)}`;
}

// ----------------------------------------------------------------------------
// Публичные игры и запись
// ----------------------------------------------------------------------------

export async function listPublicGames(): Promise<DndGameView[]> {
  const games = await db
    .select()
    .from(dndGamesTable)
    .where(
      and(
        inArray(dndGamesTable.status, ['open', 'closed']),
        or(isNull(dndGamesTable.startsAt), gt(dndGamesTable.startsAt, new Date())),
      ),
    )
    .orderBy(byStart);

  const occupancy = await getOccupancy(games.map((game) => game.id));
  return games.map((game) => toGameView(game, occupancy.get(game.id) ?? 0));
}

export async function getPublicGame(
  gameId: number,
): Promise<DndGameView | undefined> {
  const game = await getGameRow(gameId);
  if (!game || game.status === 'draft') return undefined;
  const occupancy = await getOccupancy([game.id]);
  return toGameView(game, occupancy.get(game.id) ?? 0);
}

export type BookDndGameInput = {
  quantity: number;
  timeIsConvenient: boolean;
  experienceLevel?: string | null;
};

export async function bookDndGame(
  userId: string,
  gameId: number,
  input: BookDndGameInput,
): Promise<DndBookingView> {
  if (typeof input.timeIsConvenient !== 'boolean') {
    throw new DndError('INVALID_INPUT', 'timeIsConvenient must be true or false');
  }
  const experienceLevel = parseExperience(input.experienceLevel, true);
  const quantity = Number(input.quantity);
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > bookingOptions.dndMaxPlayersPerRequest
  ) {
    throw new DndError(
      'INVALID_INPUT',
      `quantity must be from 1 to ${bookingOptions.dndMaxPlayersPerRequest}`,
    );
  }

  const { booking, game } = await db.transaction(async (tx) => {
    // Блокируем строку игры: параллельные записи проверяются по очереди
    const [game] = await tx
      .select()
      .from(dndGamesTable)
      .where(eq(dndGamesTable.id, gameId))
      .limit(1)
      .for('update');

    if (!game || game.status === 'draft') {
      throw new DndError('GAME_NOT_FOUND', 'Game not found');
    }
    if (game.status !== 'open') {
      throw new DndError('GAME_NOT_OPEN', 'Booking for this game is closed');
    }
    if (gameStarted(game)) {
      throw new DndError('GAME_STARTED', 'This game has already started');
    }

    const active = await tx
      .select({
        userId: dndGameBookingsTable.userId,
        quantity: dndGameBookingsTable.quantity,
      })
      .from(dndGameBookingsTable)
      .where(
        and(
          eq(dndGameBookingsTable.gameId, gameId),
          eq(dndGameBookingsTable.status, 'active'),
        ),
      );

    if (active.some((row) => row.userId === userId)) {
      throw new DndError(
        'ALREADY_BOOKED',
        'You are already booked for this game',
      );
    }

    const quantities = active.map((row) => row.quantity);
    if (!canBookDndSeats(game.capacity, quantities, quantity)) {
      const available = dndAvailableSeats(game.capacity, quantities);
      throw new DndError(
        'GAME_FULL',
        available === 0
          ? 'No places left in this game'
          : `Only ${available} places left in this game`,
      );
    }

    const [booking] = await tx
      .insert(dndGameBookingsTable)
      .values({
        gameId,
        userId,
        quantity,
        timeIsConvenient: input.timeIsConvenient,
        experienceLevel,
      })
      .returning();

    return { booking: booking!, game };
  });

  void (async () => {
    const user = await getUser(userId);
    const occupancy = await getOccupancy([gameId]);
    const occupied = occupancy.get(gameId) ?? 0;
    notifyAdmins(
      [
        '🐉 <b>D&D: новая запись на игру</b>',
        gameLine(game),
        `Игрок: ${escapeHtml(user ? formatUserName(user) : '—')}`,
        `Мест: ${booking.quantity}`,
        game.startsAt ? `Время удобно: ${booking.timeIsConvenient ? 'да' : 'нет'}` : 'Время примерное — свяжитесь с игроком и согласуйте детали',
        `Опыт: ${escapeHtml(experienceLabel(booking.experienceLevel))}`,
        `Занято: ${occupied}/${game.capacity}`,
      ].join('\n'),
    );
  })().catch((error) => console.warn('[notify] dnd booking failed', error));

  return toBookingView(booking);
}

export async function cancelDndBooking(
  userId: string,
  bookingId: string,
): Promise<DndBookingView> {
  const [row] = await db
    .select({ booking: dndGameBookingsTable, game: dndGamesTable })
    .from(dndGameBookingsTable)
    .innerJoin(dndGamesTable, eq(dndGameBookingsTable.gameId, dndGamesTable.id))
    .where(
      and(
        eq(dndGameBookingsTable.id, bookingId),
        eq(dndGameBookingsTable.userId, userId),
      ),
    )
    .limit(1);

  if (!row || row.booking.status !== 'active') {
    throw new DndError('BOOKING_NOT_FOUND', 'Booking not found');
  }
  if (gameStarted(row.game)) {
    throw new DndError('GAME_STARTED', 'This game has already started');
  }

  const [updated] = await db
    .update(dndGameBookingsTable)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(eq(dndGameBookingsTable.id, bookingId))
    .returning();

  void (async () => {
    const user = await getUser(userId);
    notifyAdmins(
      [
        '🐉 <b>D&D: запись отменена</b>',
        gameLine(row.game),
        `Игрок: ${escapeHtml(user ? formatUserName(user) : '—')}`,
        `Освободилось мест: ${row.booking.quantity}`,
      ].join('\n'),
    );
  })().catch((error) => console.warn('[notify] dnd cancel failed', error));

  return toBookingView(updated!);
}

// ----------------------------------------------------------------------------
// Заявки «Хочу попробовать»
// ----------------------------------------------------------------------------

export type CreateTrialRequestInput = {
  playersCount: number;
  preferredTimes?: string[];
  experienceLevel?: string | null;
  isPrivate?: boolean;
  notes?: string | null;
};

export async function createTrialRequest(
  userId: string,
  input: CreateTrialRequestInput,
): Promise<DndTrialRequestView> {
  const playersCount = Number(input.playersCount);
  if (
    !Number.isInteger(playersCount) ||
    playersCount < 1 ||
    playersCount > bookingOptions.dndMaxPlayersPerRequest
  ) {
    throw new DndError(
      'INVALID_INPUT',
      `playersCount must be from 1 to ${bookingOptions.dndMaxPlayersPerRequest}`,
    );
  }

  const preferredTimes = [...new Set(input.preferredTimes ?? [])];
  if (!preferredTimes.every(isDndTimePreference)) {
    throw new DndError('INVALID_INPUT', 'preferredTimes contains invalid values');
  }

  const experienceLevel = parseExperience(input.experienceLevel, false);
  const notes = optionalText(input.notes, 'notes', 500);

  const [open] = await db
    .select({ id: dndTrialRequestsTable.id })
    .from(dndTrialRequestsTable)
    .where(
      and(
        eq(dndTrialRequestsTable.userId, userId),
        eq(dndTrialRequestsTable.status, 'new'),
      ),
    )
    .limit(1);

  if (open) {
    throw new DndError(
      'REQUEST_ALREADY_OPEN',
      'You already have an open request. Cancel it to send a new one.',
    );
  }

  const [created] = await db
    .insert(dndTrialRequestsTable)
    .values({
      userId,
      playersCount,
      preferredTimes,
      experienceLevel,
      isPrivate: input.isPrivate === true,
      notes,
    })
    .returning();

  void (async () => {
    const user = await getUser(userId);
    notifyAdmins(
      [
        '🎲 <b>D&D: заявка «Хочу попробовать»</b>',
        `От: ${escapeHtml(user ? formatUserName(user) : '—')}`,
        `Игроков: ${created!.playersCount}${created!.isPrivate ? ' (своей компанией)' : ''}`,
        `Удобное время: ${
          created!.preferredTimes.length
            ? created!.preferredTimes.map(dndTimePreferenceLabel).join(', ')
            : 'не указано'
        }`,
        created!.experienceLevel
          ? `Опыт: ${escapeHtml(experienceLabel(created!.experienceLevel))}`
          : '',
        created!.notes ? `Комментарий: ${escapeHtml(created!.notes)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  })().catch((error) => console.warn('[notify] trial request failed', error));

  return toTrialView(created!);
}

export async function cancelTrialRequest(
  userId: string,
  requestId: string,
): Promise<DndTrialRequestView> {
  const [updated] = await db
    .update(dndTrialRequestsTable)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(dndTrialRequestsTable.id, requestId),
        eq(dndTrialRequestsTable.userId, userId),
        eq(dndTrialRequestsTable.status, 'new'),
      ),
    )
    .returning();

  if (!updated) {
    throw new DndError('REQUEST_NOT_FOUND', 'Request not found');
  }

  return toTrialView(updated);
}

export type MyDndView = {
  bookings: Array<DndBookingView & { game: DndGameView }>;
  trialRequests: DndTrialRequestView[];
};

export async function getMyDnd(userId: string): Promise<MyDndView> {
  const bookingRows = await db
    .select({ booking: dndGameBookingsTable, game: dndGamesTable })
    .from(dndGameBookingsTable)
    .innerJoin(dndGamesTable, eq(dndGameBookingsTable.gameId, dndGamesTable.id))
    .where(eq(dndGameBookingsTable.userId, userId))
    .orderBy(byStartDesc)
    .limit(50);

  const occupancy = await getOccupancy([
    ...new Set<number>(bookingRows.map((row) => row.game.id as number)),
  ]);

  const trialRows = await db
    .select()
    .from(dndTrialRequestsTable)
    .where(eq(dndTrialRequestsTable.userId, userId))
    .orderBy(desc(dndTrialRequestsTable.createdAt))
    .limit(20);

  return {
    bookings: bookingRows.map((row) => ({
      ...toBookingView(row.booking),
      game: toGameView(row.game, occupancy.get(row.game.id) ?? 0),
    })),
    trialRequests: trialRows.map(toTrialView),
  };
}

// ----------------------------------------------------------------------------
// Администратор
// ----------------------------------------------------------------------------

export type AdminDndGameView = DndGameView & {
  bookingsCount: number;
  trialRequestsCount: number;
  createdAt: string;
  updatedAt: string;
};

export async function listAllGames(): Promise<AdminDndGameView[]> {
  const games = await db
    .select()
    .from(dndGamesTable)
    .orderBy(byStartDesc);

  const ids = games.map((game) => game.id);
  const occupancy = await getOccupancy(ids);

  const bookingCounts = new Map<number, number>();
  const trialCounts = new Map<number, number>();

  if (ids.length > 0) {
    const bookingRows = await db
      .select({
        gameId: dndGameBookingsTable.gameId,
        value: sql<number>`count(*)::int`,
      })
      .from(dndGameBookingsTable)
      .where(
        and(
          inArray(dndGameBookingsTable.gameId, ids),
          eq(dndGameBookingsTable.status, 'active'),
        ),
      )
      .groupBy(dndGameBookingsTable.gameId);
    for (const row of bookingRows) bookingCounts.set(row.gameId, Number(row.value));

    const trialRows = await db
      .select({
        gameId: dndTrialRequestsTable.gameId,
        value: sql<number>`count(*)::int`,
      })
      .from(dndTrialRequestsTable)
      .where(inArray(dndTrialRequestsTable.gameId, ids))
      .groupBy(dndTrialRequestsTable.gameId);
    for (const row of trialRows) {
      if (row.gameId !== null) trialCounts.set(row.gameId, Number(row.value));
    }
  }

  return games.map((game) => ({
    ...toGameView(game, occupancy.get(game.id) ?? 0),
    bookingsCount: bookingCounts.get(game.id) ?? 0,
    trialRequestsCount: trialCounts.get(game.id) ?? 0,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  }));
}

export type GameInput = {
  title?: unknown;
  description?: unknown;
  gameType?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  daysOfWeek?: unknown;
  timesOfDay?: unknown;
  capacity?: unknown;
  imageUrl?: unknown;
  status?: unknown;
};

function parseCapacity(value: unknown): number {
  const capacity = Number(value);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    throw new DndError('INVALID_INPUT', 'capacity must be from 1 to 100');
  }
  return capacity;
}

function parseStatus(value: unknown): DndGameStatus {
  if (!(DND_GAME_STATUSES as readonly unknown[]).includes(value)) {
    throw new DndError('INVALID_INPUT', 'status is invalid');
  }
  return value as DndGameStatus;
}

export async function createGame(input: GameInput): Promise<AdminDndGameView> {
  const when = schedule(input);

  const [game] = await db
    .insert(dndGamesTable)
    .values({
      title: requiredText(input.title, 'title', 120),
      description: optionalText(input.description, 'description', 4000),
      gameType: requiredText(input.gameType, 'gameType', 60),
      ...when,
      capacity: parseCapacity(input.capacity),
      imageUrl: optionalText(input.imageUrl, 'imageUrl', 1000),
      status: input.status === undefined ? 'open' : parseStatus(input.status),
    })
    .returning();

  return {
    ...toGameView(game!, 0),
    bookingsCount: 0,
    trialRequestsCount: 0,
    createdAt: game!.createdAt.toISOString(),
    updatedAt: game!.updatedAt.toISOString(),
  };
}

export async function updateGame(
  gameId: number,
  input: GameInput,
): Promise<AdminDndGameView> {
  const existing = await getGameRow(gameId);
  if (!existing) throw new DndError('GAME_NOT_FOUND', 'Game not found');

  const when = schedule(input, existing);

  const capacity =
    input.capacity === undefined ? existing.capacity : parseCapacity(input.capacity);
  const occupied = (await getOccupancy([gameId])).get(gameId) ?? 0;
  if (capacity < occupied) {
    throw new DndError(
      'CAPACITY_BELOW_BOOKINGS',
      `Capacity cannot be less than ${occupied} already booked places`,
    );
  }

  const status =
    input.status === undefined
      ? (existing.status as DndGameStatus)
      : parseStatus(input.status);

  const [game] = await db
    .update(dndGamesTable)
    .set({
      title:
        input.title === undefined
          ? existing.title
          : requiredText(input.title, 'title', 120),
      description:
        input.description === undefined
          ? existing.description
          : optionalText(input.description, 'description', 4000),
      gameType:
        input.gameType === undefined
          ? existing.gameType
          : requiredText(input.gameType, 'gameType', 60),
      ...when,
      capacity,
      imageUrl:
        input.imageUrl === undefined
          ? existing.imageUrl
          : optionalText(input.imageUrl, 'imageUrl', 1000),
      status,
    })
    .where(eq(dndGamesTable.id, gameId))
    .returning();

  const timeChanged = scheduleChanged(existing, game!);
  const cancelled = existing.status !== 'cancelled' && game!.status === 'cancelled';
  // не беспокоим игроков из-за правок давно прошедшей игры (примерная — не прошла, пока не закрыта)
  const recent = !game!.startsAt || game!.startsAt.getTime() > Date.now() - 86_400_000;

  if ((timeChanged || cancelled) && recent) {
    void notifyGamePlayers(gameId, cancelled
      ? [
          '❌ <b>Игра D&D отменена</b>',
          `«${escapeHtml(game!.title)}» — ${scheduleLabel(existing)}`,
          'Приносим извинения. Следите за новыми играми в приложении.',
        ].join('\n')
      : [
          '🕒 <b>Игра D&D перенесена</b>',
          `«${escapeHtml(game!.title)}»`,
          `Было: ${scheduleLabel(existing)}`,
          `Стало: ${scheduleLabel(game!)}`,
          'Если новое время не подходит — отмените запись в разделе «Мои записи».',
        ].join('\n'));
  }

  return (await listAllGames()).find((view) => view.id === gameId)!;
}

async function notifyGamePlayers(gameId: number, text: string) {
  try {
    const rows = await db
      .select({ telegramId: usersTable.telegramId })
      .from(dndGameBookingsTable)
      .innerJoin(usersTable, eq(dndGameBookingsTable.userId, usersTable.id))
      .where(
        and(
          eq(dndGameBookingsTable.gameId, gameId),
          eq(dndGameBookingsTable.status, 'active'),
        ),
      );
    for (const row of rows) notifyUser(row.telegramId, text);
  } catch (error) {
    console.warn('[notify] dnd game players failed', error);
  }
}

export async function deleteGame(gameId: number): Promise<{ id: number }> {
  const occupied = (await getOccupancy([gameId])).get(gameId) ?? 0;
  if (occupied > 0) {
    throw new DndError(
      'GAME_HAS_BOOKINGS',
      'The game has bookings. Set its status to "cancelled" instead of deleting.',
    );
  }

  const [deleted] = await db
    .delete(dndGamesTable)
    .where(eq(dndGamesTable.id, gameId))
    .returning({ id: dndGamesTable.id });

  if (!deleted) throw new DndError('GAME_NOT_FOUND', 'Game not found');
  return deleted;
}

export type AdminDndBookingView = DndBookingView & { user: UserInfo };

export async function listGameBookings(
  gameId: number,
): Promise<AdminDndBookingView[]> {
  const rows = await db
    .select({ booking: dndGameBookingsTable, user: usersTable })
    .from(dndGameBookingsTable)
    .innerJoin(usersTable, eq(dndGameBookingsTable.userId, usersTable.id))
    .where(eq(dndGameBookingsTable.gameId, gameId))
    .orderBy(asc(dndGameBookingsTable.createdAt));

  return rows.map((row) => ({
    ...toBookingView(row.booking),
    user: {
      id: row.user.id,
      telegramId: row.user.telegramId,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      username: row.user.username,
    },
  }));
}

export type AdminTrialRequestView = DndTrialRequestView & { user: UserInfo };

export async function listTrialRequests(
  status?: DndTrialStatus,
): Promise<AdminTrialRequestView[]> {
  const rows = await db
    .select({ request: dndTrialRequestsTable, user: usersTable })
    .from(dndTrialRequestsTable)
    .innerJoin(usersTable, eq(dndTrialRequestsTable.userId, usersTable.id))
    .where(status ? eq(dndTrialRequestsTable.status, status) : undefined)
    .orderBy(desc(dndTrialRequestsTable.createdAt))
    .limit(200);

  return rows.map((row) => ({
    ...toTrialView(row.request),
    user: {
      id: row.user.id,
      telegramId: row.user.telegramId,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      username: row.user.username,
    },
  }));
}

/**
 * Администратор меняет статус заявки. «grouped» + gameId — заявка
 * объединена в игру: пользователь получает приглашение записаться.
 */
export async function updateTrialRequest(
  requestId: string,
  input: { status: unknown; gameId?: unknown },
): Promise<DndTrialRequestView> {
  if (!(DND_TRIAL_STATUSES as readonly unknown[]).includes(input.status)) {
    throw new DndError('INVALID_INPUT', 'status is invalid');
  }
  const status = input.status as DndTrialStatus;

  let game: GameRow | undefined;
  if (status === 'grouped') {
    const gameId = Number(input.gameId);
    if (!Number.isInteger(gameId)) {
      throw new DndError('INVALID_INPUT', 'gameId is required to group a request');
    }
    game = await getGameRow(gameId);
    if (!game) throw new DndError('GAME_NOT_FOUND', 'Game not found');
  }

  const [existing] = await db
    .select()
    .from(dndTrialRequestsTable)
    .where(eq(dndTrialRequestsTable.id, requestId))
    .limit(1);
  if (!existing) throw new DndError('REQUEST_NOT_FOUND', 'Request not found');

  const [updated] = await db
    .update(dndTrialRequestsTable)
    .set({ status, gameId: status === 'grouped' ? game!.id : null })
    .where(eq(dndTrialRequestsTable.id, requestId))
    .returning();

  if (
    status === 'grouped' &&
    game &&
    (existing.status !== 'grouped' || existing.gameId !== game.id)
  ) {
    void (async () => {
      const user = await getUser(existing.userId);
      notifyUser(
        user?.telegramId,
        [
          '🎉 <b>Мы подобрали вам игру D&D!</b>',
          gameLine(game),
          'Откройте приложение клуба → D&D, чтобы записаться и подтвердить время.',
        ].join('\n'),
      );
    })().catch((error) => console.warn('[notify] dnd grouped failed', error));
  }

  return toTrialView(updated!);
}
