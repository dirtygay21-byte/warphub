/**
 * Чистые функции правил бронирования (без БД) — их покрывают тесты
 * в tests/booking-rules.test.ts.
 */
import {
  bookingConfig,
  bookingOptions,
  gameHasPoints,
  isExperienceLevel,
  isPaintSource,
  isWhGame,
  type ExperienceLevel,
  type PaintSource,
  type WhGame,
} from '../../config/booking';

// ----------------------------------------------------------------------------
// Время клуба (UTC+5)
// ----------------------------------------------------------------------------

export type DateParts = { year: number; month: number; day: number };

const MINUTE_MS = 60 * 1000;

export function parseDateParam(date: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error('Invalid date format');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error('Invalid date');
  }

  return { year, month, day };
}

export function addCalendarDays(parts: DateParts, days: number): DateParts {
  const probe = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return {
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
  };
}

export function localDateTimeToUtc(
  parts: DateParts,
  hour: number,
  minute: number,
): Date {
  const utcMs =
    Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0, 0) -
    bookingConfig.timezoneOffsetMinutes * MINUTE_MS;

  return new Date(utcMs);
}

/** Календарная дата в часовом поясе клуба */
export function toLocalDateParts(date: Date): DateParts {
  const shifted = new Date(
    date.getTime() + bookingConfig.timezoneOffsetMinutes * MINUTE_MS,
  );

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** ISO-день недели (1 = пн … 7 = вс) календарной даты */
export function isoWeekday(parts: DateParts): number {
  const jsDay = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  ).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function formatDateKey(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day,
  ).padStart(2, '0')}`;
}

/** ISO-строка в часовом поясе клуба, например 2026-10-10T18:00:00+05:00 */
export function formatLocalIso(date: Date): string {
  const shifted = new Date(
    date.getTime() + bookingConfig.timezoneOffsetMinutes * MINUTE_MS,
  );
  const pad = (value: number) => String(value).padStart(2, '0');
  const offsetHours = pad(Math.floor(bookingConfig.timezoneOffsetMinutes / 60));
  const offsetMinutes = pad(bookingConfig.timezoneOffsetMinutes % 60);

  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(
    shifted.getUTCSeconds(),
  )}+${offsetHours}:${offsetMinutes}`;
}

/** Границы клубной смены для календарной даты записи */
export function getClubSessionBounds(dateParts: DateParts): {
  openAt: Date;
  bookingUntil: Date;
  closeAt: Date;
} {
  const nextDay = addCalendarDays(dateParts, 1);
  const openHour =
    bookingConfig.openHourByWeekday[isoWeekday(dateParts)] ??
    bookingConfig.openHour;

  return {
    openAt: localDateTimeToUtc(dateParts, openHour, 0),
    bookingUntil: localDateTimeToUtc(
      nextDay,
      bookingConfig.bookingUntilHourNextDay,
      0,
    ),
    closeAt: localDateTimeToUtc(nextDay, bookingConfig.closeHourNextDay, 0),
  };
}

export function buildSlotTimes(
  dateParts: DateParts,
  durationMinutes: number,
): Array<{ startsAt: Date; endsAt: Date }> {
  const slots: Array<{ startsAt: Date; endsAt: Date }> = [];
  const { openAt, bookingUntil, closeAt } = getClubSessionBounds(dateParts);
  const stepMs = bookingConfig.slotStepMinutes * MINUTE_MS;
  const durationMs = durationMinutes * MINUTE_MS;

  // startsAt: [12:00 .. 00:00 next day); endsAt по базовой длительности ≤ закрытия (10:00)
  for (
    let cursor = openAt.getTime();
    cursor < bookingUntil.getTime();
    cursor += stepMs
  ) {
    const endsAtMs = cursor + durationMs;
    if (endsAtMs > closeAt.getTime()) continue;

    slots.push({
      startsAt: new Date(cursor),
      endsAt: new Date(endsAtMs),
    });
  }

  return slots;
}

/** Попадает ли начало записи на сетку слотов клуба */
export function isOnSlotGrid(
  startsAt: Date,
  endsAt: Date,
  durationMinutes: number,
): boolean {
  const slots = buildSlotTimes(toLocalDateParts(startsAt), durationMinutes);
  return slots.some(
    (slot) =>
      slot.startsAt.getTime() === startsAt.getTime() &&
      slot.endsAt.getTime() === endsAt.getTime(),
  );
}

// ----------------------------------------------------------------------------
// Категории столов
// ----------------------------------------------------------------------------

export const TABLE_CATEGORY_LABEL = {
  wh: 'Полномасштабный варгейм',
  small: 'Тактические игры',
} as const;

/** Категория стола для игры: 40k/aos → wh, kt/warcry → small; неизвестная игра → null */
export function tableCategoryForGame(game: string | null | undefined): 'wh' | 'small' | null {
  return bookingConfig.tableCategoryByGame[game ?? '40k'] ?? null;
}

/** Подходит ли игра столу данной категории */
export function gameFitsTable(game: string | null | undefined, tableCategory: string): boolean {
  return tableCategoryForGame(game) === tableCategory;
}

// ----------------------------------------------------------------------------
// Дни недели
// ----------------------------------------------------------------------------

/**
 * Разрешённые дни для обычных (не D&D) активностей: пересечение общего
 * правила «пт–вс» и расписания дисциплины.
 */
export function getAllowedWeekdays(disciplineWeekdays?: number[] | null) {
  const base = bookingConfig.allowedWeekdays;
  if (!disciplineWeekdays || disciplineWeekdays.length === 0) return [...base];
  return base.filter((day) => disciplineWeekdays.includes(day));
}

export function isDateAllowed(
  parts: DateParts,
  disciplineWeekdays?: number[] | null,
): boolean {
  return getAllowedWeekdays(disciplineWeekdays).includes(isoWeekday(parts));
}

// ----------------------------------------------------------------------------
// Сессии за столом (Warhammer: игра, тренировки)
// ----------------------------------------------------------------------------

export type TableBooking = {
  id?: string;
  tableId: number | null;
  serviceId: number;
  partySize: number;
  startsAt: Date;
  endsAt: Date;
};

export type TableBlock = { tableId: number; startsAt: Date; endsAt: Date };

export function overlapsInterval(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

export type SessionCheck =
  | { ok: true; isJoin: boolean; occupiedBefore: number; others: TableBooking[] }
  | { ok: false; reason: 'BLOCKED' | 'BUSY' | 'FULL' | 'TOO_MANY' };

/**
 * Можно ли занять стол на интервал [startsAt, endsAt).
 *
 * Стол — это «сессия»: игроки одной услуги, начавшие в одно время.
 * - пустой стол → новая сессия;
 * - на столе уже есть игроки той же услуги, начавшие в то же время,
 *   и есть свободные места → присоединение;
 * - что угодно другое (иная услуга, сдвинутое время, ивент) → занято.
 */
export function checkTableSession(input: {
  tableId: number;
  serviceId: number;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  seatsPerTable: number;
  bookings: TableBooking[];
  blocks?: TableBlock[];
}): SessionCheck {
  const interval = { startsAt: input.startsAt, endsAt: input.endsAt };

  if (input.partySize > input.seatsPerTable) {
    return { ok: false, reason: 'TOO_MANY' };
  }

  const blocked = (input.blocks ?? []).some(
    (block) =>
      block.tableId === input.tableId && overlapsInterval(block, interval),
  );
  if (blocked) return { ok: false, reason: 'BLOCKED' };

  const overlapping = input.bookings.filter(
    (booking) =>
      booking.tableId === input.tableId && overlapsInterval(booking, interval),
  );

  if (overlapping.length === 0) {
    return { ok: true, isJoin: false, occupiedBefore: 0, others: [] };
  }

  const sameSession = overlapping.every(
    (booking) =>
      booking.serviceId === input.serviceId &&
      booking.startsAt.getTime() === input.startsAt.getTime(),
  );
  if (!sameSession) return { ok: false, reason: 'BUSY' };

  const occupied = overlapping.reduce((sum, b) => sum + b.partySize, 0);
  if (occupied + input.partySize > input.seatsPerTable) {
    return { ok: false, reason: 'FULL' };
  }

  return {
    ok: true,
    isJoin: true,
    occupiedBefore: occupied,
    others: overlapping,
  };
}

/**
 * Конец новой игры за столом (B1): полная длительность или раньше — до начала следующей занятости стола
 * (запись или мероприятие). null — свободно меньше minMinutes (тогда записаться нельзя).
 * Занятость, которая уже идёт в момент начала, здесь не учитывается — её отклоняет checkTableSession.
 */
export function tableFitEnd(input: {
  tableId: number;
  startsAt: Date;
  fullEnd: Date;
  bookings: TableBooking[];
  blocks?: TableBlock[];
  minMinutes: number;
}): Date | null {
  const start = input.startsAt.getTime();
  let end = input.fullEnd.getTime();
  for (const b of [...input.bookings, ...(input.blocks ?? [])]) {
    if (b.tableId !== input.tableId) continue;
    const s = b.startsAt.getTime();
    if (s > start && s < end) end = s;
  }
  if (end < input.fullEnd.getTime() && end - start < input.minMinutes * 60_000) return null;
  return new Date(end);
}

/**
 * Конец записи без стола (покраска, посещение клуба — общий запас мест, B1): полная длительность или раньше —
 * до момента, когда свободных мест станет меньше partySize. null — так свободно меньше minMinutes.
 */
export function poolFitEnd(input: {
  startsAt: Date;
  fullEnd: Date;
  bookings: Array<{ partySize: number; startsAt: Date; endsAt: Date }>;
  capacity: number;
  partySize: number;
  minMinutes: number;
}): Date | null {
  const free = (end: number) => poolFreeSeats({ startsAt: input.startsAt, endsAt: new Date(end) }, input.bookings, input.capacity);
  const start = input.startsAt.getTime();
  const full = input.fullEnd.getTime();
  if (free(full) >= input.partySize) return new Date(full);
  // свободных мест становится меньше только в начале чужой записи — проверяем эти моменты по порядку
  const points = [...new Set(input.bookings.map((b) => b.startsAt.getTime()).filter((t) => t > start && t < full))].sort((a, b) => a - b);
  let end = start;
  for (const p of points) {
    if (free(p) >= input.partySize) end = p;
    else break;
  }
  if (end - start < input.minMinutes * 60_000) return null;
  return new Date(end);
}

export type TableSession = {
  tableId: number;
  startsAt: Date;
  endsAt: Date;
  occupied: number;
  bookings: TableBooking[];
};

/** Группирует записи одной услуги в сессии (стол + время начала) */
export function groupSessions(
  bookings: TableBooking[],
  serviceId: number,
): TableSession[] {
  const map = new Map<string, TableSession>();

  for (const booking of bookings) {
    if (booking.serviceId !== serviceId || booking.tableId === null) continue;
    const key = `${booking.tableId}:${booking.startsAt.getTime()}`;
    const session = map.get(key);

    if (session) {
      session.occupied += booking.partySize;
      session.bookings.push(booking);
      if (booking.endsAt > session.endsAt) session.endsAt = booking.endsAt;
    } else {
      map.set(key, {
        tableId: booking.tableId,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        occupied: booking.partySize,
        bookings: [booking],
      });
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.tableId - b.tableId,
  );
}

// ----------------------------------------------------------------------------
// Общая вместимость без столов (покраска, посещение клуба)
// ----------------------------------------------------------------------------

/** Минимум свободных мест на интервале при общей вместимости capacity */
export function poolFreeSeats(
  interval: { startsAt: Date; endsAt: Date },
  bookings: Array<{ partySize: number; startsAt: Date; endsAt: Date }>,
  capacity: number,
): number {
  const overlapping = bookings.filter((b) => overlapsInterval(b, interval));
  const points = new Set<number>([interval.startsAt.getTime()]);
  for (const booking of overlapping) {
    if (booking.startsAt > interval.startsAt) {
      points.add(booking.startsAt.getTime());
    }
  }

  let maxOccupied = 0;
  for (const point of points) {
    const occupied = overlapping
      .filter(
        (b) => b.startsAt.getTime() <= point && b.endsAt.getTime() > point,
      )
      .reduce((sum, b) => sum + b.partySize, 0);
    maxOccupied = Math.max(maxOccupied, occupied);
  }

  return Math.max(0, capacity - maxOccupied);
}

// ----------------------------------------------------------------------------
// Данные игрока и формы покраски
// ----------------------------------------------------------------------------

export type WhPlayerDetails = {
  kind: 'wh_player';
  /** игра (24.10.2026); в записях до этого поля нет — значит 40K */
  game?: WhGame;
  /** армия (40K, AoS) или команда (Kill Team) */
  army: string;
  /** лимит очков; у Kill Team очков нет — null */
  points: number | null;
  experienceLevel: ExperienceLevel;
  /**
   * Очки армии клуба (14.11.2026, решение владельца): обучающие игры — всегда 1000;
   * обычная игра — сколько выбрал игрок. Есть только при «Нужна армия клуба».
   */
  clubArmyPoints?: number | null;
  /**
   * Пожелание к обучению (21.11.2026, решение владельца): на тренировках армию не выбирают — пишут, за кого хотят
   * поиграть («хочу за Orks или Necrons»); армия и очки — только если приложили ростер из WarpBuilder.
   */
  comment?: string | null;
};

/** Армия клуба на обучающих играх — 1000 очков (решение владельца 14.11.2026). */
export const TRAINING_CLUB_ARMY_POINTS = 1000;
export const TRAINING_SLUGS = new Set(['wh_group_training', 'wh_solo_training']);

/**
 * Очки армии клуба для записи: обучение — 1000, игра — выбор игрока, иначе очки игры.
 * Kill Team и Warcry — без очков (null): команда/варбанда клуба стандартная, аренда считается как 1000 очков (pricing).
 */
export function clubArmyPointsFor(slug: string, details: WhPlayerDetails, wantsClubArmy: boolean): number | null {
  if (!wantsClubArmy || !gameHasPoints(details.game)) return null;
  if (TRAINING_SLUGS.has(slug)) return TRAINING_CLUB_ARMY_POINTS;
  return details.clubArmyPoints ?? details.points ?? TRAINING_CLUB_ARMY_POINTS;
}

export type PaintingDetails = {
  kind: 'painting';
  faction: string;
  model: string;
  paintSource: PaintSource;
  needsHelp: boolean;
  comment: string | null;
};

export type ReservationDetails = WhPlayerDetails | PaintingDetails;

export type DetailsKind = ReservationDetails['kind'];

export const WH_PLAYER_SERVICE_SLUGS = [
  'wh_game',
  'wh_group_training',
  'wh_solo_training',
] as const;

export function detailsKindForSlug(slug: string): DetailsKind | null {
  if ((WH_PLAYER_SERVICE_SLUGS as readonly string[]).includes(slug)) {
    return 'wh_player';
  }
  if (slug === 'wh_painting') return 'painting';
  return null;
}

export class DetailsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DetailsValidationError';
  }
}

function cleanText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new DetailsValidationError(`${field} is required`);
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new DetailsValidationError(`${field} is required`);
  if (trimmed.length > maxLength) {
    throw new DetailsValidationError(
      `${field} must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

/**
 * Проверяет и нормализует данные записи для услуги.
 * Возвращает null для услуг без дополнительных данных.
 */
export function validateDetails(
  kind: DetailsKind | null,
  raw: unknown,
  opts: { training?: boolean } = {},
): ReservationDetails | null {
  if (kind === null) {
    if (raw !== undefined && raw !== null) {
      throw new DetailsValidationError(
        'details are not supported for this service',
      );
    }
    return null;
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new DetailsValidationError('details are required for this service');
  }

  const data = raw as Record<string, unknown>;

  if (kind === 'wh_player') {
    const game = data.game === undefined || data.game === null ? '40k' : data.game;
    if (!isWhGame(game)) throw new DetailsValidationError('game must be 40k, aos, kt or warcry');
    // у Kill Team и Warcry очков нет — поле не нужно и не сохраняется (Warcry — решение владельца 15.11.2026)
    let points: number | null = null;
    // тренировки (21.11.2026): армия и очки необязательны — только из приложенного ростера
    const trainingNoPoints = opts.training && (data.points === undefined || data.points === null || data.points === '');
    if (gameHasPoints(game) && !trainingNoPoints) {
      points = Number(data.points);
      if (
        !Number.isInteger(points) ||
        points < 1 ||
        points > bookingOptions.maxPoints
      ) {
        throw new DetailsValidationError(
          `points must be a whole number from 1 to ${bookingOptions.maxPoints}`,
        );
      }
    }
    if (!isExperienceLevel(data.experienceLevel)) {
      throw new DetailsValidationError('experienceLevel is invalid');
    }

    let clubArmyPoints: number | null = null;
    if (gameHasPoints(game) && data.clubArmyPoints !== undefined && data.clubArmyPoints !== null && data.clubArmyPoints !== '') {
      clubArmyPoints = Number(data.clubArmyPoints);
      if (!Number.isInteger(clubArmyPoints) || clubArmyPoints < 1 || clubArmyPoints > bookingOptions.maxPoints) {
        throw new DetailsValidationError(`clubArmyPoints must be a whole number from 1 to ${bookingOptions.maxPoints}`);
      }
    }

    const army = opts.training && (data.army === undefined || data.army === null || (typeof data.army === 'string' && !data.army.trim())) ? '' : cleanText(data.army, 'army', 80);
    const comment = data.comment === undefined || data.comment === null || (typeof data.comment === 'string' && !data.comment.trim()) ? null : cleanText(data.comment, 'comment', 300);
    return {
      kind,
      game,
      army,
      points,
      experienceLevel: data.experienceLevel,
      ...(clubArmyPoints !== null ? { clubArmyPoints } : {}),
      ...(comment ? { comment } : {}),
    };
  }

  if (!isPaintSource(data.paintSource)) {
    throw new DetailsValidationError('paintSource is invalid');
  }
  if (typeof data.needsHelp !== 'boolean') {
    throw new DetailsValidationError('needsHelp must be true or false');
  }
  const comment =
    data.comment === undefined || data.comment === null || data.comment === ''
      ? null
      : cleanText(data.comment, 'comment', 500);

  return {
    kind,
    faction: cleanText(data.faction, 'faction', 80),
    model: cleanText(data.model, 'model', 120),
    paintSource: data.paintSource,
    needsHelp: data.needsHelp,
    comment,
  };
}

// ----------------------------------------------------------------------------
// Вместимость игр D&D
// ----------------------------------------------------------------------------

export function dndAvailableSeats(
  capacity: number,
  activeQuantities: number[],
): number {
  const occupied = activeQuantities.reduce((sum, q) => sum + q, 0);
  return Math.max(0, capacity - occupied);
}

export function canBookDndSeats(
  capacity: number,
  activeQuantities: number[],
  requested: number,
): boolean {
  return (
    Number.isInteger(requested) &&
    requested >= 1 &&
    requested <= bookingOptions.dndMaxPlayersPerRequest &&
    requested <= dndAvailableSeats(capacity, activeQuantities)
  );
}

/**
 * Игра за столом для админки (13.11.2026): записи одной услуги за одним столом с одним началом — одна игра
 * (то же правило, что checkTableSession). Отменённые не входят. Ключ — «услуга:стол:начало».
 */
export type TableGameMember<T> = T & { serviceId: number; tableId: number | null; startsAt: Date | string | null; status: string };

export const tableGameKey = (serviceId: number, tableId: number | null, startsAt: Date | string | null) =>
  tableId === null || startsAt === null ? null : `${serviceId}:${tableId}:${new Date(startsAt).getTime()}`;

export function groupTableGames<T>(rows: TableGameMember<T>[]): Map<string, TableGameMember<T>[]> {
  const games = new Map<string, TableGameMember<T>[]>();
  for (const row of rows) {
    if (row.status === 'cancelled') continue;
    const key = tableGameKey(row.serviceId, row.tableId, row.startsAt);
    if (!key) continue;
    const list = games.get(key) ?? [];
    list.push(row);
    games.set(key, list);
  }
  return games;
}

/**
 * Категории списка «Все записи» (14.11.2026): ожидают подтверждения и подтверждённые — ещё не закончились;
 * отменённые — любые по времени; прошедшие — закончились и не отменены. Админ выбирает несколько сразу.
 */
export const RESERVATION_CATEGORIES = ['pending', 'confirmed', 'cancelled', 'past'] as const;
export type ReservationCategory = (typeof RESERVATION_CATEGORIES)[number];

export function parseCategories(value: string | undefined): ReservationCategory[] {
  if (!value) return [];
  const set = new Set(value.split(',').map((x) => x.trim()));
  return RESERVATION_CATEGORIES.filter((c) => set.has(c));
}

/** Попадает ли запись в категорию (то же правило, что условие SQL в booking/service). */
export function inCategory(r: { status: string; endsAt: Date | string }, category: ReservationCategory, now: Date): boolean {
  const ended = new Date(r.endsAt).getTime() < now.getTime();
  if (category === 'cancelled') return r.status === 'cancelled';
  if (category === 'past') return r.status !== 'cancelled' && ended;
  return r.status === category && !ended;
}

/**
 * Напоминание о визите (14.11.2026): за REMIND_BEFORE до начала, одно на запись (reservations.remind_at — когда
 * отправлено). Не напоминает, если запись создана меньше чем за REMIND_MIN_AGE до этого момента (только что
 * пришло подтверждение) и если визит уже начался.
 */
export const REMIND_BEFORE_MS = 3 * 60 * 60_000;
export const REMIND_MIN_AGE_MS = 30 * 60_000;

export function dueForReminder(
  r: { status: string; startsAt: Date | null; createdAt: Date; remindAt: Date | null },
  now: Date,
): boolean {
  if (r.remindAt || !r.startsAt) return false;
  if (r.status !== 'pending' && r.status !== 'confirmed') return false;
  const left = r.startsAt.getTime() - now.getTime();
  if (left <= 0 || left > REMIND_BEFORE_MS) return false;
  return now.getTime() - r.createdAt.getTime() >= REMIND_MIN_AGE_MS;
}
