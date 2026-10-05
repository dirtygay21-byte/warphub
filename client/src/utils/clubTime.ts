/**
 * Всё время в приложении — время клуба (Екатеринбург, UTC+5), а не время
 * телефона пользователя. Иначе у человека с другим часовым поясом на телефоне
 * съезжают часы, а около полуночи — и даты.
 *
 * Правило:
 *  - календарные даты (выбор дня) храним как Date «полночь по устройству»
 *    с числами клуба — с ними работают getDay/getDate и т.п.;
 *  - моменты времени с сервера (ISO) показываем через Intl с timeZone клуба;
 *  - моменты, которые отправляем на сервер, собираем явно с +05:00.
 */
export const CLUB_TIME_ZONE = "Asia/Yekaterinburg";
export const CLUB_UTC_OFFSET = "+05:00";

const pad = (value: number) => String(value).padStart(2, "0");

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLUB_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type ClubParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** Числа даты и времени момента во времени клуба */
export const getClubParts = (value: Date | string): ClubParts => {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = Object.fromEntries(
    partsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
  };
};

/** «Сегодня» по календарю клуба (Date на полночь устройства) */
export const getClubToday = (): Date => {
  const { year, month, day } = getClubParts(new Date());
  return new Date(year, month - 1, day);
};

/** YYYY-MM-DD календарной даты */
export const dateKeyOf = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** YYYY-MM-DD момента во времени клуба */
export const clubDateKeyOf = (value: Date | string) => {
  const { year, month, day } = getClubParts(value);
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** ISO-момент «дата + часы:минуты по времени клуба» */
export const clubIso = (dateKey: string, hour: number, minute = 0) =>
  `${dateKey}T${pad(hour)}:${pad(minute)}:00${CLUB_UTC_OFFSET}`;

/** Часы и минуты момента во времени клуба — строками «HH», «MM» */
export const getClubTimeParts = (value: Date | string) => {
  const { hour, minute } = getClubParts(value);
  return { hour: pad(hour), minute: pad(minute) };
};

export const formatClub = (
  value: Date | string,
  options: Intl.DateTimeFormatOptions,
) =>
  new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: CLUB_TIME_ZONE }).format(
    typeof value === "string" ? new Date(value) : value,
  );

/** «18:00» */
export const formatClubTime = (value: Date | string) =>
  formatClub(value, { hour: "2-digit", minute: "2-digit" });

/** «18:00 – 21:00» */
export const formatClubTimeRange = (
  startsAt: string | null | undefined,
  endsAt?: string | null,
) => {
  if (!startsAt) return "—";
  const start = formatClubTime(startsAt);
  return endsAt ? `${start} – ${formatClubTime(endsAt)}` : start;
};

/** «сб, 10 октября» */
export const formatClubDate = (value: Date | string) =>
  formatClub(value, { day: "numeric", month: "long", weekday: "short" });

/** Значение для <input type="datetime-local"> во времени клуба */
export const toClubDatetimeLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const { year, month, day, hour, minute } = getClubParts(iso);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
};

/** Значение <input type="datetime-local"> (время клуба) → ISO для сервера */
export const fromClubDatetimeLocal = (value: string) => {
  if (!value) return "";
  const normalized = value.length === 16 ? `${value}:00` : value.slice(0, 19);
  const date = new Date(`${normalized}${CLUB_UTC_OFFSET}`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

/** ISO-день недели (1 = пн … 7 = вс) календарной даты */
export const isoWeekdayOf = (date: Date) => {
  const day = date.getDay();
  return day === 0 ? 7 : day;
};
