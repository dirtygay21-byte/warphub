import { apiRequest } from "@/apiUtils/general";

// -------------------------- Справочники --------------------------

export type OptionItem = { value: string; label: string; hint?: string };

export type BookingOptions = {
  experienceLevels: OptionItem[];
  /** игры в записи на Warhammer: 40k / aos / kt / warcry */
  games: OptionItem[];
  /** фракции 40K */
  factions: string[];
  /** фракции Age of Sigmar (из данных Roster Builder) */
  aosFactions: string[];
  /** фракции Warcry (из данных WarpBuilder) */
  warcryFactions: string[];
  /** команды Kill Team списком */
  killTeams: string[];
  /** команды Kill Team по фракциям (как на Wahapedia): Imperium → Space Marines → [Deathwatch, …] */
  killTeamGroups: { group: string; factions: { faction: string; teams: string[] }[] }[];
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
  games: [
    { value: "40k", label: "Warhammer 40,000" },
    { value: "aos", label: "Age of Sigmar" },
    { value: "kt", label: "Kill Team" },
    { value: "warcry", label: "Warcry" },
  ],
  factions: [],
  aosFactions: [],
  warcryFactions: [],
  killTeams: [],
  killTeamGroups: [],
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

export type WhGame = "40k" | "aos" | "kt" | "warcry";

export type WhPlayerDetails = {
  kind?: "wh_player";
  /** игра; в старых записях нет — 40K */
  game?: WhGame;
  /** армия (40K, AoS), команда (Kill Team) или варбанда (Warcry) */
  army: string;
  /** у Kill Team очков нет — null */
  points: number | null;
  experienceLevel: string;
};

/** «Pathfinders (T'au Empire)»; команды нет в списке — как есть */
export const killTeamWithFaction = (options: BookingOptions, team: string) => {
  const f = options.killTeamGroups.flatMap((g) => g.factions).find((x) => x.teams.includes(team));
  return f ? `${team} (${f.faction})` : team;
};

export const gameLabelOf = (options: BookingOptions, game: string | null | undefined) =>
  options.games.find((g) => g.value === (game ?? "40k"))?.label ?? "Warhammer 40,000";

/** «Kill Team · Pathfinders · Игрок» / «Warhammer 40,000 · Orks · 1000 оч. · Игрок» */
export const playerLine = (
  d: { game?: string | null; army: string | null; points: number | null; experienceLevel?: string | null },
  options: BookingOptions,
) =>
  [gameLabelOf(options, d.game), d.game === "kt" && d.army ? killTeamWithFaction(options, d.army) : d.army, d.points != null ? `${d.points} оч.` : null, d.experienceLevel ? experienceLabelOf(options, d.experienceLevel) : null]
    .filter(Boolean)
    .join(" · ");

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
    return playerLine(details, options);
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
  /** ник в Telegram без «@»; null — не указан (или запрос без входа) */
  username?: string | null;
  game?: string | null;
  gameLabel?: string | null;
  army: string | null;
  points: number | null;
  experienceLevel: string | null;
  experienceLabel: string | null;
};

export type TableSession = {
  tableId: number;
  tableName: string;
  /** категория стола: wh — Full-scale Wargaming, small — Tactical Games */
  tableCategory?: "wh" | "small";
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
    /** B1: минимум для укороченной записи, минут (если до следующей занятости меньше полной длительности) */
    minDuration: number;
  };
  slots: Array<{
    table: { id: number; name: string; seatCapacity: number; category?: "wh" | "small" };
    segments: AvailabilitySegment[];
  }>;
  sessions: TableSession[];
  /** клуб закрыт на игру D&D (с часом после игры), 31.10.2026 */
  closures: { startsAt: string; endsAt: string; title: string }[];
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
      minDuration: data.service?.minDuration ?? Math.min(data.service?.duration ?? 60, 120),
    },
    slots: data.slots ?? [],
    sessions: data.sessions ?? [],
    closures: data.closures ?? [],
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
