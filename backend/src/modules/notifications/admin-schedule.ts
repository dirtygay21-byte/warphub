/**
 * Уведомления администраторам о записях — два раза в день (17.11.2026, решение владельца): сводки в 12:00 и 20:00
 * по времени клуба. Сразу — только то, что касается игры в игровой день: игра сегодня или раньше следующей сводки.
 * Чистые функции (без БД) — tests/admin-schedule.test.ts.
 */
import { bookingConfig } from '../../config/booking';

export const SUMMARY_HOURS = [12, 20] as const;
const HOUR = 3_600_000;
const OFFSET = bookingConfig.timezoneOffsetMinutes * 60_000;

const dateKey = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
const dayStart = (d: Date) => new Date(Date.parse(`${dateKey(d)}T00:00:00Z`) - OFFSET);

/** Последняя сводка не позже now (момент времени), и предыдущая перед ней. */
export function summarySlot(now: Date): { at: Date; hour: number; previous: Date } {
  const start = dayStart(now).getTime();
  const slots = [-1, 0].flatMap((day) => SUMMARY_HOURS.map((h) => ({ hour: h, at: new Date(start + (day * 24 + h) * HOUR) })));
  let i = slots.length - 1;
  while (i > 1 && slots[i]!.at > now) i--;
  return { at: slots[i]!.at, hour: slots[i]!.hour, previous: slots[i - 1]!.at };
}

/** Следующая сводка после now. */
export function nextSummaryAt(now: Date): Date {
  const start = dayStart(now).getTime();
  for (const h of [...SUMMARY_HOURS, 24 + SUMMARY_HOURS[0]]) {
    const at = new Date(start + h * HOUR);
    if (at > now) return at;
  }
  return new Date(start + (24 + SUMMARY_HOURS[0]) * HOUR);
}

/** Сообщать администраторам сразу: игра сегодня (дата клуба) или начнётся раньше следующей сводки. */
export function isUrgentForAdmins(startsAt: Date | null | undefined, now: Date): boolean {
  if (!startsAt) return false;
  if (startsAt.getTime() < now.getTime() - 6 * HOUR) return false;
  return dateKey(startsAt) === dateKey(now) || startsAt < nextSummaryAt(now);
}

export { dateKey as clubDateKeyOf, dayStart as clubDayStartOf };
