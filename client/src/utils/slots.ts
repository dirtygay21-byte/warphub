import type { AvailabilitySegment } from "@/apiUtils/booking";

const MINUTE = 60 * 1000;

/**
 * Допустимые времена начала (каждые 30 минут) внутри окна `within`,
 * при которых на всём интервале [start, start + duration) свободно
 * не меньше partySize мест. Сегменты — ответ /availability одного стола
 * (или общей вместимости). За последним сегментом (после 00:00)
 * записей быть не может, поэтому там считаем свободно.
 */
export function getStartTimeOptions({
  segments,
  within,
  durationMinutes,
  partySize,
  stepMinutes = 30,
}: {
  segments: AvailabilitySegment[];
  within?: { startsAt: string; endsAt: string };
  durationMinutes: number;
  partySize: number;
  stepMinutes?: number;
}): string[] {
  if (segments.length === 0) return [];

  const parsed = segments.map((segment) => ({
    start: new Date(segment.startsAt).getTime(),
    end: new Date(segment.endsAt).getTime(),
    free: segment.freeSeats,
  }));

  const windowStart = within
    ? new Date(within.startsAt).getTime()
    : Math.min(...parsed.map((s) => s.start));
  const windowEnd = within
    ? new Date(within.endsAt).getTime()
    : Math.max(...parsed.map((s) => s.end));

  const step = stepMinutes * MINUTE;
  const duration = durationMinutes * MINUTE;
  const result: string[] = [];

  for (
    let start = Math.ceil(windowStart / step) * step;
    start < windowEnd;
    start += step
  ) {
    const end = start + duration;
    const startSegment = parsed.find((s) => s.start <= start && s.end > start);
    if (!startSegment || startSegment.free < partySize) continue;

    const blocked = parsed.some(
      (s) => s.start < end && s.end > start && s.free < partySize,
    );
    if (blocked) continue;

    result.push(new Date(start).toISOString());
  }

  return result;
}

/** Минимум свободных мест в сегментах (для подписи «свободно N») */
export const minFreeSeats = (segments: AvailabilitySegment[]) =>
  segments.length === 0 ? 0 : Math.min(...segments.map((s) => s.freeSeats));

export const maxFreeSeats = (segments: AvailabilitySegment[]) =>
  segments.length === 0 ? 0 : Math.max(...segments.map((s) => s.freeSeats));
