import { apiRequest } from "@/apiUtils/general";
import { mapRegisteredEvent, type EventApi } from "@/apiUtils/events";
import type { MyReservations, Reservation } from "@/types";
import type { ReservationDetails, SessionPlayer } from "@/apiUtils/booking";

type CreateReservationPayload = {
  serviceId: number;
  startsAt: string;
  tableId?: number | null;
  partySize: number;
  seatClubArmyOptions: boolean[];
  buyArmyOptions: boolean[];
} | {
  serviceId: number;
};

export type ReservationApi = {
  id: string;
  serviceSlug?: string;
  serviceTitle?: string | null;
  details?: ReservationDetails | null;
  userId?: string;
  user_id?: string;
  telegramId?: number | null;
  telegram_id?: number | null;
  user?: {
    telegramId?: number | null;
    telegram_id?: number | null;
    username?: string | null;
  } | null;
  tableName?: string | null;
  tablemates?: SessionPlayer[];
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
  buyArmyOptions?: boolean[];
  buy_army_options?: boolean[];
};

export const mapReservation = (reservation: ReservationApi): Reservation => ({
  id: reservation.id,
  serviceSlug: reservation.serviceSlug,
  serviceTitle: reservation.serviceTitle ?? null,
  details: reservation.details ?? null,
  userId: reservation.userId ?? reservation.user_id ?? "",
  telegramId:
    reservation.telegramId ??
    reservation.telegram_id ??
    reservation.user?.telegramId ??
    reservation.user?.telegram_id ??
    null,
  tableId: reservation.tableId ?? reservation.table_id ?? null,
  startsAt: reservation.startsAt ?? reservation.starts_at ?? "",
  endsAt: reservation.endsAt ?? reservation.ends_at ?? "",
  status: reservation.status,
  remindAt: reservation.remindAt ?? reservation.remind_at ?? null,
  cancelledAt: reservation.cancelledAt ?? reservation.cancelled_at ?? null,
  createdAt: reservation.createdAt ?? reservation.created_at ?? "",
  updatedAt: reservation.updatedAt ?? reservation.updated_at ?? "",
  serviceId: reservation.serviceId ?? reservation.service_id ?? 0,
  partySize: reservation.partySize ?? reservation.party_size ?? 1,
  seatClubArmyOptions:
    reservation.seatClubArmyOptions ?? reservation.seat_club_army_options ?? [],
  buyArmyOptions:
    reservation.buyArmyOptions ?? reservation.buy_army_options ?? [],
  tableName: reservation.tableName ?? null,
  username: reservation.user?.username ?? null,
  tablemates: reservation.tablemates ?? [],
});

const isCancelled = (reservation: Reservation) =>
  reservation.status.toLowerCase() === "cancelled" ||
  reservation.cancelledAt != null;

const getStatusSortOrder = (reservation: Reservation) => {
  if (isCancelled(reservation)) return 100;

  switch (reservation.status.toLowerCase()) {
    case "pending":
      return 0;
    case "confirmed":
      return 1;
    case "completed":
      return 2;
    default:
      return 50;
  }
};

const sortReservations = (a: Reservation, b: Reservation) => {
  const statusDiff = getStatusSortOrder(a) - getStatusSortOrder(b);
  if (statusDiff !== 0) return statusDiff;

  return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
};

export const getReservations = async (): Promise<Reservation[]> => {
  const data = await apiRequest<ReservationApi[]>("/reservations");

  return data.map(mapReservation).sort(sortReservations);
};

type MyReservationsApi = {
  reservations: ReservationApi[];
  event: EventApi | null;
};

export const getMyReservations = async (): Promise<MyReservations> => {
  const data = await apiRequest<MyReservationsApi>("/reservations/my");

  return {
    reservations: data.reservations.map(mapReservation).sort(sortReservations),
    event: data.event ? mapRegisteredEvent(data.event) : null,
  };
};

export const cancelReservation = (id: string) =>
  apiRequest<void>(`/reservations/${id}/cancel`, {
    method: "DELETE",
  });

export const createReservation = (payload: CreateReservationPayload) =>
  apiRequest<unknown>("/reservations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
