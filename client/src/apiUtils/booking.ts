import { apiRequest } from "@/apiUtils/general";

// -------------------------- Справочники --------------------------

export type OptionItem = { value: string; label: string; hint?: string };

export type BookingOptions = {
  experienceLevels: OptionItem[];
  factions: string[];
  paintSources: OptionItem[];
  dndTimePreferences: OptionItem[];
  dndMaxPlayersPerRequest: number;
  pointsPresets: number[];
  maxPoints: number;
  allowedWeekdays: number[];
  timeZone: string;
};

/** Запасные значения, пока справочник грузится с сервера */
export const DEFAULT_BOOKING_OPTIONS: BookingOptions = {
  experienceLevels: [
    { value: "beginner", label: "Новичок", hint: "1–5 игр" },
    { value: "player", label: "Игрок", hint: "5–15 игр" },
    { value: "experienced", label: "Опытный", hint: "15–30 игр" },
    { value: "veteran", label: "Ветеран", hint: "30–60 игр" },
  ],
  factions: [],
  paintSources: [
    { value: "own", label: "Свои краски" },
    { value: "club", label: "Краски клуба" },
  ],
  dndTimePreferences: [
    { value: "morning", label: "Утро" },
    { value: "afternoon", label: "День" },
    { value: "evening", label: "Вечер" },
  ],
  dndMaxPlayersPerRequest: 6,
  pointsPresets: [500, 1000, 1500, 2000],
  maxPoints: 10000,
  allowedWeekdays: [5, 6, 7],
  timeZone: "Asia/Yekaterinburg",
};

export const getBookingOptions = () =>
  apiRequest<BookingOptions>("/booking-options");

export const experienceLabelOf = (
  options: BookingOptions,
  value: string | null | undefined,
) =>
  options.experienceLevels.find((level) => level.value === value)?.label ??
  "—";

// -------------------------- Данные записи --------------------------

export type WhPlayerDetails = {
  kind?: "wh_player";
  army: string;
  points: number;
  experienceLevel: string;
};

export type PaintingDetails = {
  kind?: "painting";
  faction: string;
  model: string;
  paintSource: string;
  needsHelp: boolean;
  comment?: string | null;
};

export type ReservationDetails = WhPlayerDetails | PaintingDetails;

export type DetailsKind = "wh_player" | "painting";

const WH_PLAYER_SLUGS = ["wh_game", "wh_group_training", "wh_solo_training"];

export const detailsKindForSlug = (
  slug: string | null | undefined,
): DetailsKind | null => {
  if (!slug) return null;
  if (WH_PLAYER_SLUGS.includes(slug)) return "wh_player";
  if (slug === "wh_painting") return "painting";
  return null;
};

export const isWhPlayerDetails = (
  details: ReservationDetails | null | undefined,
): details is WhPlayerDetails =>
  details != null && "army" in details && "points" in details;

export const isPaintingDetails = (
  details: ReservationDetails | null | undefined,
): details is PaintingDetails =>
  details != null && "faction" in details && "paintSource" in details;

/** Краткое описание данных записи для таблиц и списков */
export const summarizeDetails = (
  details: ReservationDetails | null | undefined,
  options: BookingOptions,
): string => {
  if (isWhPlayerDetails(details)) {
    return `${details.army} · ${details.points} оч. · ${experienceLabelOf(options, details.experienceLevel)}`;
  }
  if (isPaintingDetails(details)) {
    const paints =
      options.paintSources.find((s) => s.value === details.paintSource)?.label ??
      details.paintSource;
    return `${details.faction} · ${details.model} · ${paints}${details.needsHelp ? " · нужна помощь" : ""}`;
  }
  return "—";
};

// -------------------------- Доступность --------------------------

export type AvailabilitySegment = {
  startsAt: string;
  endsAt: string;
  freeSeats: number;
};

export type SessionPlayer = {
  firstName: string;
  army: string | null;
  points: number | null;
  experienceLevel: string | null;
  experienceLabel: string | null;
};

export type TableSession = {
  tableId: number;
  tableName: string;
  startsAt: string;
  endsAt: string;
  occupied: number;
  capacity: number;
  freeSeats: number;
  players: SessionPlayer[];
};

export type ServiceAvailability = {
  date: string;
  dateAllowed: boolean;
  allowedWeekdays: number[];
  service: {
    id: number;
    slug: string;
    duration: number;
    visitorsCapacity: number | null;
    mode: "table" | "pool" | "none";
    seatsPerTable: number | null;
    poolCapacity: number | null;
    hasTrainer: boolean;
  };
  slots: Array<{
    table: { id: number; name: string; seatCapacity: number };
    segments: AvailabilitySegment[];
  }>;
  sessions: TableSession[];
};

export const getAvailability = async (
  serviceId: number,
  date: string,
): Promise<ServiceAvailability> => {
  const data = await apiRequest<Partial<ServiceAvailability>>(
    `/services/${serviceId}/availability?date=${encodeURIComponent(date)}`,
  );

  return {
    date: data.date ?? date,
    dateAllowed: data.dateAllowed ?? true,
    allowedWeekdays: data.allowedWeekdays ?? [5, 6, 7],
    service: {
      id: data.service?.id ?? serviceId,
      slug: data.service?.slug ?? "",
      duration: data.service?.duration ?? 60,
      visitorsCapacity: data.service?.visitorsCapacity ?? null,
      mode: data.service?.mode ?? "none",
      seatsPerTable: data.service?.seatsPerTable ?? null,
      poolCapacity: data.service?.poolCapacity ?? null,
      hasTrainer: data.service?.hasTrainer ?? false,
    },
    slots: data.slots ?? [],
    sessions: data.sessions ?? [],
  };
};

// -------------------------- Запись --------------------------

export type CreateBookingPayload = {
  serviceId: number;
  startsAt: string;
  tableId?: number;
  partySize?: number;
  seatClubArmyOptions?: boolean[];
  details?: ReservationDetails;
};

export type CreatedBooking = {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  joinedSession?: boolean;
};

export const createBooking = (payload: CreateBookingPayload) =>
  apiRequest<CreatedBooking>("/reservations", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateBookingDetails = (
  reservationId: string,
  details: ReservationDetails,
) =>
  apiRequest<unknown>(`/reservations/${reservationId}/details`, {
    method: "PATCH",
    body: JSON.stringify({ details }),
  });
