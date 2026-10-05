import {
  dateKeyOf,
  formatClub,
  formatClubTime,
  formatClubTimeRange,
  getClubToday,
} from "@/utils/clubTime";

const pad = (value: number) => String(value).padStart(2, "0");

/** «Сегодня» по календарю клуба */
export const getToday = () => getClubToday();

export const getDateKey = (date: Date) => dateKeyOf(date);

export const formatDateDot = (date: Date) =>
  `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;

// Календарная дата (Date с числами клуба) — форматируется без смены пояса
export const formatCalendarDate = (date: Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(date);

export const formatSelectedDate = (
  date: Date | null,
  emptyLabel = "Дата не выбрана",
) => (date ? formatCalendarDate(date) : emptyLabel);

// Моменты с сервера — во времени клуба
export const formatReservationDate = (date: string | null) => {
  if (!date) return "—";

  return formatClub(date, {
    day: "numeric",
    month: "long",
    weekday: "short",
  });
};

export const formatTime = (date: string | Date) => formatClubTime(date);

export const formatSegmentTime = (startsAt: string, endsAt: string) =>
  formatClubTimeRange(startsAt, endsAt);
