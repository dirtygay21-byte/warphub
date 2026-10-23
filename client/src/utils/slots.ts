import type { AvailabilitySegment } from "@/apiUtils/booking";

const MINUTE = 60 * 1000;

/** Минимум для укороченной записи по умолчанию (как на сервере, config/booking.ts → minShortenedMinutes). */
export const DEFAULT_MIN_SHORTENED_MINUTES = 120;

type Parsed = { start: number; end: number; free: number };
const parse = (segments: AvailabilitySegment[]): Parsed[] =>
  segments.map((segment) => ({
    start: new Date(segment.startsAt).getTime(),
    end: new Date(segment.endsAt).getTime(),
    free: segment.freeSeats,
  }));

/** Конец записи с начала start: полная длительность или раньше — до первого сегмента, где мест меньше partySize (B1). */
function fitEnd(parsed: Parsed[], start: number, duration: number, partySize: number): number {
  let end = start + duration;
  for (const s of parsed) if (s.start > start && s.start < end && s.free < partySize) end = s.start;
  return end;
}

/**
 * Допустимые времена начала (каждые 30 минут) внутри окна `within`: в момент начала свободно не меньше partySize
 * мест, и до первой нехватки мест — хотя бы минимум (minMinutes, по умолчанию 2 ч; услуга короче — её длительность).
 * Если полная длительность не помещается, запись будет короче — см. getSlotEnd (B1). Сегменты — ответ
 * /availability одного стола (или общей вместимости); за последним сегментом (после 00:00) записей быть не может.
 */
export function getStartTimeOptions({
  segments,
  within,
  durationMinutes,
  partySize,
  minMinutes = DEFAULT_MIN_SHORTENED_MINUTES,
  stepMinutes = 30,
}: {
  segments: AvailabilitySegment[];
  within?: { startsAt: string; endsAt: string };
  durationMinutes: number;
  partySize: number;
  minMinutes?: number;
  stepMinutes?: number;
}): string[] {
  if (segments.length === 0) return [];
  const parsed = parse(segments);
  const windowStart = within ? new Date(within.startsAt).getTime() : Math.min(...parsed.map((s) => s.start));
  const windowEnd = within ? new Date(within.endsAt).getTime() : Math.max(...parsed.map((s) => s.end));
  const step = stepMinutes * MINUTE;
  const duration = durationMinutes * MINUTE;
  const min = Math.min(minMinutes, durationMinutes) * MINUTE;
  const result: string[] = [];

  for (let start = Math.ceil(windowStart / step) * step; start < windowEnd; start += step) {
    const startSegment = parsed.find((s) => s.start <= start && s.end > start);
    if (!startSegment || startSegment.free < partySize) continue;
    if (fitEnd(parsed, start, duration, partySize) - start < min) continue;
    result.push(new Date(start).toISOString());
  }

  return result;
}

/** Конец записи, начатой в startsAt (ISO): полная длительность или раньше, если дальше мест нет (B1). */
export function getSlotEnd({
  segments,
  startsAt,
  durationMinutes,
  partySize,
}: {
  segments: AvailabilitySegment[];
  startsAt: string;
  durationMinutes: number;
  partySize: number;
}): string {
  const start = new Date(startsAt).getTime();
  return new Date(fitEnd(parse(segments), start, durationMinutes * MINUTE, partySize)).toISOString();
}

/**
 * Сколько времени даёт свободное окно (для карточки слота, B1): full — полная длительность есть;
 * limited — только maxMinutes (до until); none — меньше минимума, записаться нельзя.
 */
export function getWindowLimit(input: {
  segments: AvailabilitySegment[];
  within?: { startsAt: string; endsAt: string };
  durationMinutes: number;
  partySize: number;
  minMinutes?: number;
}): { state: "full" } | { state: "limited"; maxMinutes: number; until: string } | { state: "none" } {
  const options = getStartTimeOptions(input);
  if (!options.length) return { state: "none" };
  let best = { minutes: 0, until: "" };
  for (const startsAt of options) {
    const until = getSlotEnd({ ...input, startsAt });
    const minutes = Math.round((new Date(until).getTime() - new Date(startsAt).getTime()) / MINUTE);
    if (minutes >= input.durationMinutes) return { state: "full" };
    if (minutes > best.minutes) best = { minutes, until };
  }
  return { state: "limited", maxMinutes: best.minutes, until: best.until };
}

/** «3 ч», «2 ч 30 мин» */
export const hoursLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} ч` : "", m ? `${m} мин` : ""].filter(Boolean).join(" ") || "0 мин";
};

/** Минимум свободных мест в сегментах (для подписи «свободно N») */
export const minFreeSeats = (segments: AvailabilitySegment[]) =>
  segments.length === 0 ? 0 : Math.min(...segments.map((s) => s.freeSeats));

export const maxFreeSeats = (segments: AvailabilitySegment[]) =>
  segments.length === 0 ? 0 : Math.max(...segments.map((s) => s.freeSeats));
