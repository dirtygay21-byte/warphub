import { apiRequest } from "@/apiUtils/general";

export type DndGameStatus = "draft" | "open" | "closed" | "cancelled";

export type DndGame = {
  id: number;
  title: string;
  description: string | null;
  gameType: string;
  /** null — время примерное: дни недели и время суток, детали уточнит Мастер */
  startsAt: string | null;
  endsAt: string | null;
  daysOfWeek: number[];
  timesOfDay: string[];
  /** «пятница или суббота, вечер» или точная дата и время */
  scheduleLabel: string;
  capacity: number;
  occupied: number;
  available: number;
  imageUrl: string | null;
  status: DndGameStatus;
  isBookable: boolean;
};

export type DndBooking = {
  id: string;
  gameId: number;
  quantity: number;
  timeIsConvenient: boolean;
  experienceLevel: string | null;
  experienceLabel: string | null;
  status: "active" | "cancelled";
  createdAt: string;
  cancelledAt: string | null;
};

export type DndTrialStatus = "new" | "grouped" | "cancelled";

export type DndTrialRequest = {
  id: string;
  playersCount: number;
  preferredTimes: string[];
  preferredTimeLabels: string[];
  experienceLevel: string | null;
  experienceLabel: string | null;
  isPrivate: boolean;
  notes: string | null;
  status: DndTrialStatus;
  gameId: number | null;
  createdAt: string;
};

export type MyDnd = {
  bookings: Array<DndBooking & { game: DndGame }>;
  trialRequests: DndTrialRequest[];
};

export type DndUser = {
  id: string;
  telegramId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
};

// -------------------------- Пользователь --------------------------

export const getDndGames = () => apiRequest<DndGame[]>("/dnd/games");

export const getMyDnd = () => apiRequest<MyDnd>("/dnd/my");

export const bookDndGame = (
  gameId: number,
  payload: {
    quantity: number;
    timeIsConvenient: boolean;
    experienceLevel: string;
  },
) =>
  apiRequest<DndBooking>(`/dnd/games/${gameId}/bookings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const cancelDndBooking = (bookingId: string) =>
  apiRequest<DndBooking>(`/dnd/bookings/${bookingId}`, { method: "DELETE" });

export const createTrialRequest = (payload: {
  playersCount: number;
  preferredTimes: string[];
  experienceLevel: string | null;
  isPrivate: boolean;
  notes: string | null;
}) =>
  apiRequest<DndTrialRequest>("/dnd/trial-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const cancelTrialRequest = (requestId: string) =>
  apiRequest<DndTrialRequest>(`/dnd/trial-requests/${requestId}`, {
    method: "DELETE",
  });

// -------------------------- Администратор --------------------------

export type AdminDndGame = DndGame & {
  bookingsCount: number;
  trialRequestsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DndGamePayload = {
  title: string;
  description: string | null;
  gameType: string;
  startsAt: string | null;
  endsAt: string | null;
  daysOfWeek: number[];
  timesOfDay: string[];
  capacity: number;
  imageUrl: string | null;
  status: DndGameStatus;
};

/** Дни недели для примерного времени игры (1 — пн … 7 — вс) */
export const DND_WEEKDAY_OPTIONS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label, i) => ({
  value: String(i + 1),
  label,
}));

/** «Пятница или суббота, вечер» — расписание игры без точного времени с заглавной буквы */
export const flexibleLabel = (game: Pick<DndGame, "scheduleLabel">) =>
  game.scheduleLabel.charAt(0).toUpperCase() + game.scheduleLabel.slice(1);

/** Сообщение после записи на игру D&D */
export const DND_MASTER_CONTACT = "Мастер свяжется с вами, чтобы уточнить детали.";

export const getAdminDndGames = () =>
  apiRequest<AdminDndGame[]>("/admin/dnd/games");

export const createAdminDndGame = (payload: DndGamePayload) =>
  apiRequest<AdminDndGame>("/admin/dnd/games", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateAdminDndGame = (
  id: number,
  payload: Partial<DndGamePayload>,
) =>
  apiRequest<AdminDndGame>(`/admin/dnd/games/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const deleteAdminDndGame = (id: number) =>
  apiRequest<{ id: number }>(`/admin/dnd/games/${id}`, { method: "DELETE" });

export const getAdminDndGameBookings = (id: number) =>
  apiRequest<Array<DndBooking & { user: DndUser }>>(
    `/admin/dnd/games/${id}/bookings`,
  );

export const getAdminTrialRequests = (status?: DndTrialStatus) =>
  apiRequest<Array<DndTrialRequest & { user: DndUser }>>(
    `/admin/dnd/trial-requests${status ? `?status=${status}` : ""}`,
  );

export const updateAdminTrialRequest = (
  id: string,
  payload: { status: DndTrialStatus; gameId?: number },
) =>
  apiRequest<DndTrialRequest>(`/admin/dnd/trial-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const DND_GAME_STATUS_LABELS: Record<DndGameStatus, string> = {
  draft: "Черновик",
  open: "Запись открыта",
  closed: "Запись закрыта",
  cancelled: "Отменена",
};

export const DND_TRIAL_STATUS_LABELS: Record<DndTrialStatus, string> = {
  new: "Ждёт подбора группы",
  grouped: "Группа собрана",
  cancelled: "Отменена",
};

export const isDndBookingInactive = (booking: DndBooking & { game: DndGame }) =>
  booking.status === "cancelled" ||
  booking.game.status === "cancelled" ||
  (!!booking.game.startsAt && new Date(booking.game.startsAt).getTime() < Date.now());
