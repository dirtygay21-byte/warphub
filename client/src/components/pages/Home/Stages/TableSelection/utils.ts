import type { Table } from "@/types";
import type { AvailableSlot } from "./types";
import {
  formatDateDot,
  formatSegmentTime,
  formatTime,
  getDateKey,
  getToday,
} from "@/utils/date";
import {
  getBuyFigureSeatLabel,
  getSeatLabel,
} from "@/utils/plural";
import { clamp } from "@/utils/number";

export {
  formatDateDot as formatDate,
  formatSegmentTime,
  formatTime,
  getDateKey,
  getToday,
  getBuyFigureSeatLabel,
  getSeatLabel,
  clamp,
};

export const getAvailableSlots = (tables: Table[]): AvailableSlot[] =>
  tables.flatMap((table) =>
    table.segments?.length
      ? table.segments.map((segment) => ({ table, segment }))
      : [],
  );

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс",
};

export const getApiWeekday = (date: Date) => {
  const jsDay = date.getDay();

  return jsDay === 0 ? 7 : jsDay;
};

export const isDateInSchedule = (
  date: Date,
  scheduleWeekdays?: number[],
) => {
  if (scheduleWeekdays == null) return true;
  if (scheduleWeekdays.length === 0) return false;

  return scheduleWeekdays.includes(getApiWeekday(date));
};

export const formatScheduleWeekdays = (scheduleWeekdays: number[]) =>
  [...scheduleWeekdays]
    .sort((a, b) => a - b)
    .map((weekday) => WEEKDAY_LABELS[weekday] ?? String(weekday))
    .join(", ");
