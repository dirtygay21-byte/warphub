/** Проверка брони стола без БД (tests/table-holds-rules.test.ts). */
import { bookingConfig } from '../../config/booking';

export const HOLD_PURPOSES = ['tournament', 'club_event', 'private_game', 'dnd', 'other'] as const;
export type HoldPurpose = (typeof HOLD_PURPOSES)[number];

export const HOLD_PURPOSE_LABELS: Record<HoldPurpose, string> = {
  tournament: 'Турнирная игра',
  club_event: 'Мероприятие клуба',
  private_game: 'Внутренняя игра',
  dnd: 'Игра D&D',
  other: 'Другое мероприятие',
};

export type HoldErrorCode =
  | 'INVALID_INPUT'
  | 'TABLE_NOT_FOUND'
  | 'DND_GAME_NOT_FOUND'
  | 'BOOKINGS_CONFLICT'
  | 'EVENT_CONFLICT'
  | 'HOLD_CONFLICT'
  | 'HOLD_NOT_FOUND';

export class HoldError extends Error {
  constructor(
    readonly code: HoldErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type HoldInput = {
  tableId: number;
  startsAt: Date;
  endsAt: Date;
  purpose: HoldPurpose;
  title: string;
  description: string | null;
  reservedBy: string | null;
  dndGameId: number | null;
};

const MINUTE = 60_000;
const OFFSET = bookingConfig.timezoneOffsetMinutes * MINUTE;

/** Начало клубной смены (openHour по времени клуба) для момента t: смена идёт с openHour до closeHourNextDay. */
export function shiftOpenAt(t: Date): Date {
  const local = new Date(t.getTime() + OFFSET);
  const open = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), bookingConfig.openHour) - OFFSET;
  // до открытия (ночью после полуночи) — это ещё смена предыдущего дня
  return new Date(t.getTime() < open ? open - 24 * 60 * MINUTE : open);
}

export function validateHoldInput(raw: unknown, now: Date): HoldInput {
  const bad = (message: string): never => {
    throw new HoldError('INVALID_INPUT', message);
  };
  if (!raw || typeof raw !== 'object') bad('Нет данных брони');
  const r = raw as Record<string, unknown>;

  const tableId = Number(r.tableId);
  if (!Number.isInteger(tableId) || tableId <= 0) bad('Выберите стол');

  const startsAt = typeof r.startsAt === 'string' ? new Date(r.startsAt) : null;
  const endsAt = typeof r.endsAt === 'string' ? new Date(r.endsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime()) || !endsAt || Number.isNaN(endsAt.getTime())) bad('Укажите начало и конец');
  if (endsAt!.getTime() <= startsAt!.getTime()) bad('Конец брони должен быть позже начала');
  if (endsAt!.getTime() <= now.getTime()) bad('Бронь уже закончилась бы — выберите будущее время');

  // в пределах одной клубной смены: с открытия до закрытия на следующий день
  const openAt = shiftOpenAt(startsAt!);
  const closeAt = new Date(openAt.getTime() + (24 - bookingConfig.openHour + bookingConfig.closeHourNextDay) * 60 * MINUTE);
  if (startsAt!.getTime() < openAt.getTime() || endsAt!.getTime() > closeAt.getTime()) {
    bad(`Бронь должна быть в пределах одной смены клуба: с ${bookingConfig.openHour}:00 до ${bookingConfig.closeHourNextDay}:00 следующего дня`);
  }

  const purpose = r.purpose as HoldPurpose;
  if (!HOLD_PURPOSES.includes(purpose)) bad('Выберите цель брони');

  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (!title) bad('Укажите название');
  if (title.length > 120) bad('Название — не длиннее 120 символов');

  const descriptionRaw = typeof r.description === 'string' ? r.description.trim() : '';
  if (descriptionRaw.length > 2000) bad('Описание — не длиннее 2000 символов');

  const reservedByRaw = typeof r.reservedBy === 'string' ? r.reservedBy.trim() : '';
  if (reservedByRaw.length > 100) bad('«Кто бронирует» — не длиннее 100 символов');

  const dndGameId = r.dndGameId == null || r.dndGameId === '' ? null : Number(r.dndGameId);
  if (dndGameId !== null && (!Number.isInteger(dndGameId) || dndGameId <= 0)) bad('Неверная игра D&D');

  return {
    tableId,
    startsAt: startsAt!,
    endsAt: endsAt!,
    purpose,
    title,
    description: descriptionRaw || null,
    reservedBy: reservedByRaw || null,
    dndGameId,
  };
}
