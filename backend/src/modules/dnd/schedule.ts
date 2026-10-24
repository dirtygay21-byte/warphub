/**
 * Расписание игры D&D (24.10.2026): точное время (startsAt/endsAt) или примерное — дни недели и время суток
 * (утро/день/вечер); детали Мастер согласует с игроками сам. Игра без точного времени не уходит в прошлое сама —
 * её закрывает администратор (решение владельца: вариант B, дни недели). Чистые функции — tests/dnd-schedule.test.ts.
 */
import { bookingOptions, dndTimePreferenceLabel, isDndTimePreference } from '../../config/booking';
import { formatClubDateTime } from '../../lib/telegram/format';

/** 1 — понедельник … 7 — воскресенье */
export const DND_WEEKDAYS = [
  { value: 1, short: 'Пн', label: 'понедельник' },
  { value: 2, short: 'Вт', label: 'вторник' },
  { value: 3, short: 'Ср', label: 'среда' },
  { value: 4, short: 'Чт', label: 'четверг' },
  { value: 5, short: 'Пт', label: 'пятница' },
  { value: 6, short: 'Сб', label: 'суббота' },
  { value: 7, short: 'Вс', label: 'воскресенье' },
] as const;

export type DndSchedule = {
  startsAt: Date | null;
  endsAt: Date | null;
  daysOfWeek: number[];
  timesOfDay: string[];
};

export class ScheduleError extends Error {}

/** Обычный массив: драйвер БД отдаёт integer[] как Int32Array (map в строки там даёт 0, JSON — объект) */
const list = <T>(a: ArrayLike<T> | null | undefined): T[] => Array.from(a ?? []);

const TIME_ORDER = bookingOptions.dndTimePreferences.map((o) => o.value as string);

function parseDate(value: unknown, field: string): Date {
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new ScheduleError(`${field} must be a valid date`);
  return date;
}

/**
 * Проверить и собрать расписание из ввода администратора; undefined — поле не меняется (берётся из prev).
 * Точное время и примерное взаимоисключающие: при startsAt дни и время суток очищаются, и наоборот.
 */
export function parseSchedule(
  input: { startsAt?: unknown; endsAt?: unknown; daysOfWeek?: unknown; timesOfDay?: unknown },
  prev?: DndSchedule,
): DndSchedule {
  const flexibleGiven = input.daysOfWeek !== undefined || input.timesOfDay !== undefined;
  const exactGiven = input.startsAt !== undefined && input.startsAt !== null && input.startsAt !== '';

  if (exactGiven || (!flexibleGiven && prev?.startsAt && input.startsAt === undefined)) {
    const startsAt = exactGiven ? parseDate(input.startsAt, 'startsAt') : prev!.startsAt!;
    const endsAt =
      input.endsAt === undefined ? (exactGiven ? null : prev!.endsAt) : input.endsAt === null || input.endsAt === '' ? null : parseDate(input.endsAt, 'endsAt');
    if (endsAt && endsAt <= startsAt) throw new ScheduleError('endsAt must be after startsAt');
    return { startsAt, endsAt, daysOfWeek: [], timesOfDay: [] };
  }

  const days = input.daysOfWeek === undefined ? list(prev?.daysOfWeek) : input.daysOfWeek;
  const times = input.timesOfDay === undefined ? list(prev?.timesOfDay) : input.timesOfDay;
  if (!Array.isArray(days) || !days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) {
    throw new ScheduleError('daysOfWeek must be numbers from 1 (Mon) to 7 (Sun)');
  }
  if (!Array.isArray(times) || !times.every(isDndTimePreference)) throw new ScheduleError('timesOfDay contains invalid values');
  if (!days.length || !times.length) throw new ScheduleError('Specify startsAt, or at least one day of the week and one time of day');
  return {
    startsAt: null,
    endsAt: null,
    daysOfWeek: [...new Set(days as number[])].sort((a, b) => a - b),
    timesOfDay: [...new Set(times as string[])].sort((a, b) => TIME_ORDER.indexOf(a) - TIME_ORDER.indexOf(b)),
  };
}

/** «пятница или суббота, вечер» / точная дата и время */
export function scheduleLabel(s: Pick<DndSchedule, 'startsAt' | 'endsAt' | 'daysOfWeek' | 'timesOfDay'>): string {
  if (s.startsAt) return formatClubDateTime(s.startsAt, s.endsAt);
  const days = list(s.daysOfWeek).map((d) => DND_WEEKDAYS.find((w) => w.value === d)?.label ?? String(d));
  const dayText = days.length > 1 ? `${days.slice(0, -1).join(', ')} или ${days.at(-1)}` : (days[0] ?? '—');
  const times = list(s.timesOfDay).map((t) => dndTimePreferenceLabel(t).toLowerCase()).join(' или ');
  return times ? `${dayText}, ${times}` : dayText;
}

/** Прошла ли игра: точное время — началась; примерная — никогда сама (закрывает администратор). */
export function gameStarted(s: Pick<DndSchedule, 'startsAt'>, now = Date.now()): boolean {
  return !!s.startsAt && s.startsAt.getTime() <= now;
}

/** Изменилось ли расписание (для сообщения записавшимся о переносе). */
export function scheduleChanged(a: DndSchedule, b: DndSchedule): boolean {
  return (
    (a.startsAt?.getTime() ?? null) !== (b.startsAt?.getTime() ?? null) ||
    (a.endsAt?.getTime() ?? null) !== (b.endsAt?.getTime() ?? null) ||
    list(a.daysOfWeek).join() !== list(b.daysOfWeek).join() ||
    list(a.timesOfDay).join() !== list(b.timesOfDay).join()
  );
}
