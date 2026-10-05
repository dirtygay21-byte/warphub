import { apiRequest } from "@/apiUtils/general";
import { getApiAuthToken } from "@/apiUtils/authToken";
import { mapReservation } from "@/apiUtils/reservations";
import type {
  AdminReservation,
  AdminReservationsPage,
  AdminReservationsQuery,
  AdminUploadResponse,
  Event,
  EventUpdatePayload,
  NewsItem,
  NewsPayload,
  ReservationTable,
  Service,
  TelegramUser,
} from "@/types";

type UserApi = {
  id?: string;
  telegramId?: number;
  telegram_id?: number;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  username?: string;
  photoUrl?: string;
  photo_url?: string;
};

type ServiceApi = {
  id?: number;
  disciplineId?: number;
  discipline_id?: number;
  slug?: string;
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  duration?: number | null;
  visitorsCapacity?: number | null;
  visitors_capacity?: number | null;
  isActive?: boolean;
  is_active?: boolean;
  sortOrder?: number;
  sort_order?: number;
  tableCapacityProfile?: string | null;
  table_capacity_profile?: string | null;
};

type TableApi = {
  id: number;
  name: string;
};

type AdminReservationApi = {
  id: string;
  userId?: string;
  user_id?: string;
  tableId?: number | null;
  table_id?: number | null;
  startsAt?: string;
  starts_at?: string;
  endsAt?: string;
  ends_at?: string;
  status: string;
  remindAt?: string | null;
  remind_at?: string | null;
  cancelledAt?: string | null;
  cancelled_at?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  serviceId?: number;
  service_id?: number;
  partySize?: number;
  party_size?: number;
  seatClubArmyOptions?: boolean[];
  seat_club_army_options?: boolean[];
  user?: UserApi | null;
  service?: ServiceApi | null;
  table?: TableApi | null;
};

const mapUser = (user: UserApi): TelegramUser => ({
  id: user.id ?? "",
  telegramId: user.telegramId ?? user.telegram_id ?? 0,
  firstName: user.firstName ?? user.first_name ?? "",
  lastName: user.lastName ?? user.last_name ?? "",
  username: user.username ?? "",
  photoUrl: user.photoUrl ?? user.photo_url ?? "",
});

const mapService = (service: ServiceApi): Service => ({
  id: service.id ?? 0,
  disciplineId: service.disciplineId ?? service.discipline_id ?? 0,
  slug: service.slug ?? "",
  title: service.title ?? "",
  description: service.description ?? null,
  duration: service.duration ?? null,
  visitorsCapacity: service.visitorsCapacity ?? service.visitors_capacity ?? null,
  isActive: service.isActive ?? service.is_active ?? true,
  sortOrder: service.sortOrder ?? service.sort_order ?? 0,
  tableCapacityProfile:
    service.tableCapacityProfile ?? service.table_capacity_profile ?? null,
});

const mapTable = (table: TableApi): ReservationTable => ({
  id: table.id,
  name: table.name,
});

const mapAdminReservation = (
  reservation: AdminReservationApi,
): AdminReservation => ({
  ...mapReservation(reservation),
  user: reservation.user ? mapUser(reservation.user) : null,
  service: reservation.service ? mapService(reservation.service) : null,
  table: reservation.table ? mapTable(reservation.table) : null,
});

const appendSearchParam = (
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
) => {
  if (value === undefined || value === "") return;

  params.set(key, String(value));
};

const buildAdminReservationsPath = (query: AdminReservationsQuery) => {
  const params = new URLSearchParams();

  appendSearchParam(params, "date", query.date);
  appendSearchParam(params, "serviceId", query.serviceId);
  appendSearchParam(params, "tableId", query.tableId);
  appendSearchParam(params, "status", query.status);
  appendSearchParam(params, "userId", query.userId);
  appendSearchParam(params, "startsAt", query.startsAt);
  appendSearchParam(params, "endsAt", query.endsAt);
  appendSearchParam(params, "limit", query.limit);
  appendSearchParam(params, "offset", query.offset);

  const search = params.toString();

  return search ? `/admin/reservations?${search}` : "/admin/reservations";
};

const parseAdminReservationsResponse = (
  data: unknown,
): { items: AdminReservationApi[]; total: number | null } => {
  if (Array.isArray(data)) {
    return { items: data, total: null };
  }

  if (!data || typeof data !== "object") {
    return { items: [], total: 0 };
  }

  const payload = data as Record<string, unknown>;
  const items =
    (Array.isArray(payload.items) ? payload.items : null) ??
    (Array.isArray(payload.data) ? payload.data : null) ??
    (Array.isArray(payload.content) ? payload.content : null) ??
    (Array.isArray(payload.results) ? payload.results : null) ??
    [];

  const total =
    typeof payload.total === "number"
      ? payload.total
      : typeof payload.count === "number"
        ? payload.count
        : typeof payload.totalElements === "number"
          ? payload.totalElements
          : null;

  return { items: items as AdminReservationApi[], total };
};

export const getAdminReservations = async (
  query: AdminReservationsQuery,
): Promise<AdminReservationsPage> => {
  const data = await apiRequest<unknown>(buildAdminReservationsPath(query));
  const { items, total } = parseAdminReservationsResponse(data);

  return {
    items: items.map(mapAdminReservation),
    total,
  };
};

export const getUserById = (id: string) =>
  apiRequest<TelegramUser>(`/admin/users/${id}`);

export const confirmAdminReservation = (id: string) =>
  apiRequest<void>(`/admin/reservations/${id}/confirm`, {
    method: "PATCH",
  });

export const rejectAdminReservation = (id: string) =>
  apiRequest<void>(`/admin/reservations/${id}/reject`, {
    method: "PATCH",
  });

export const extendAdminReservation = (id: string, endsAt: string) =>
  apiRequest<void>(`/admin/reservations/${id}/extend`, {
    method: "PATCH",
    body: JSON.stringify({ endsAt }),
  });

type EventApi = {
  id?: number;
  title?: string;
  description?: string;
  startsAt?: string;
  starts_at?: string;
  endsAt?: string;
  ends_at?: string;
  capacity?: number;
  seatsPerTable?: number;
  seats_per_table?: number;
  bannerUrl?: string;
  banner_url?: string;
  tableIds?: number[];
  table_ids?: number[];
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

const mapEvent = (event: EventApi): Event => ({
  id: event.id ?? 0,
  title: event.title ?? "",
  description: event.description ?? "",
  startsAt: event.startsAt ?? event.starts_at ?? "",
  endsAt: event.endsAt ?? event.ends_at ?? "",
  seatsPerTable: event.seatsPerTable ?? event.seats_per_table ?? 0,
  capacity: event.capacity ?? 0,
  bannerUrl: event.bannerUrl ?? event.banner_url ?? "",
  tableIds: event.tableIds ?? event.table_ids ?? [],
  createdAt: event.createdAt ?? event.created_at ?? "",
  updatedAt: event.updatedAt ?? event.updated_at ?? "",
});

const parseEventsResponse = (data: unknown): EventApi[] => {
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== "object") return [];

  const payload = data as Record<string, unknown>;

  return (
    (Array.isArray(payload.items) ? payload.items : null) ??
    (Array.isArray(payload.data) ? payload.data : null) ??
    []
  ) as EventApi[];
};

export const getAdminEvents = async (): Promise<Event[]> => {
  const data = await apiRequest<unknown>("/admin/events");

  return parseEventsResponse(data).map(mapEvent);
};

export const getAdminEventById = async (id: number): Promise<Event> => {
  const data = await apiRequest<EventApi>(`/admin/events/${id}`);

  return mapEvent(data);
};

const parseTablesResponse = (data: unknown): TableApi[] => {
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== "object") return [];

  const payload = data as Record<string, unknown>;

  return (
    (Array.isArray(payload.items) ? payload.items : null) ??
    (Array.isArray(payload.data) ? payload.data : null) ??
    []
  ) as TableApi[];
};

export const getAdminEmptyTables = async (
  startsAt: string,
  endsAt: string,
  excludeEventId?: number,
): Promise<ReservationTable[]> => {
  const params = new URLSearchParams({
    startsAt,
    endsAt,
  });

  appendSearchParam(params, "excludeEventId", excludeEventId);

  const data = await apiRequest<unknown>(
    `/admin/events/empty-tables?${params.toString()}`,
  );

  return parseTablesResponse(data).map(mapTable);
};

export const updateAdminEvent = async (
  id: number,
  payload: EventUpdatePayload,
): Promise<Event> => {
  const data = await apiRequest<EventApi>(`/admin/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return mapEvent(data);
};

export const createAdminEvent = async (
  payload: EventUpdatePayload,
): Promise<Event> => {
  const data = await apiRequest<EventApi>("/admin/events", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return mapEvent(data);
};

export const deleteAdminEvent = async (id: number): Promise<void> => {
  await apiRequest<void>(`/admin/events/${id}`, {
    method: "DELETE",
  });
};

type NewsApi = {
  id?: number;
  coverUrl?: string;
  cover_url?: string;
  title?: string;
  text?: string;
  publishedAt?: string;
  published_at?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

const mapNews = (news: NewsApi): NewsItem => ({
  id: news.id ?? 0,
  coverUrl: news.coverUrl ?? news.cover_url ?? "",
  title: news.title ?? "",
  text: news.text ?? "",
  publishedAt: news.publishedAt ?? news.published_at ?? "",
  createdAt: news.createdAt ?? news.created_at,
  updatedAt: news.updatedAt ?? news.updated_at,
});

const parseNewsResponse = (data: unknown): NewsApi[] => {
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== "object") return [];

  const payload = data as Record<string, unknown>;

  return (
    (Array.isArray(payload.items) ? payload.items : null) ??
    (Array.isArray(payload.data) ? payload.data : null) ??
    []
  ) as NewsApi[];
};

export const getAdminNews = async (): Promise<NewsItem[]> => {
  const data = await apiRequest<unknown>("/admin/news");

  return parseNewsResponse(data).map(mapNews);
};

export const getAdminNewsById = async (id: number): Promise<NewsItem> => {
  const data = await apiRequest<NewsApi>(`/admin/news/${id}`);

  return mapNews(data);
};

export const createAdminNews = async (
  payload: NewsPayload,
): Promise<NewsItem> => {
  const data = await apiRequest<NewsApi>("/admin/news", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return mapNews(data);
};

export const updateAdminNews = async (
  id: number,
  payload: NewsPayload,
): Promise<NewsItem> => {
  const data = await apiRequest<NewsApi>(`/admin/news/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return mapNews(data);
};

export const deleteAdminNews = async (id: number): Promise<void> => {
  await apiRequest<void>(`/admin/news/${id}`, {
    method: "DELETE",
  });
};

export const uploadAdminFile = async (
  file: File,
  dest: string,
): Promise<AdminUploadResponse> => {
  const formData = new FormData();
  formData.append("dest", dest);
  formData.append("file", file);

  const token = import.meta.env.VITE_EXECUTION_CONFIG === "production" ? getApiAuthToken() : `${import.meta.env.VITE_EXECUTION_DEVELOPMENT_TOKEN}`;
  const headers = new Headers();

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(
    `${import.meta.env.VITE_BACKEND_API_URL}/admin/upload`,
    {
      method: "POST",
      headers,
      body: formData,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed with status ${response.status}`;

    try {
      const data = JSON.parse(text) as { message?: string; error?: string };
      if (typeof data.message === "string") message = data.message;
      else if (typeof data.error === "string") message = data.error;
    } catch {
      // keep default message
    }

    throw new Error(message);
  }

  const text = await response.text();

  return JSON.parse(text) as AdminUploadResponse;
};

