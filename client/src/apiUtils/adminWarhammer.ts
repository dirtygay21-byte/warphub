import type { TableHold } from "@/apiUtils/tableHolds";
import { apiRequest } from "@/apiUtils/general";
import type { ReservationDetails } from "@/apiUtils/booking";

export type AdminPlayer = {
  reservationId: string;
  status: "pending" | "confirmed" | "cancelled";
  partySize: number;
  details: ReservationDetails | null;
  seatClubArmyOptions: boolean[] | null;
  user: {
    id: string;
    telegramId: number;
    firstName: string;
    lastName: string | null;
    username: string | null;
  };
};

export type AdminSession = {
  serviceId: number;
  serviceSlug: string;
  serviceTitle: string | null;
  hasTrainer: boolean;
  tableId: number;
  tableName: string;
  startsAt: string;
  endsAt: string;
  occupied: number;
  capacity: number;
  freeSeats: number;
  players: AdminPlayer[];
};

export type AdminPaintingBooking = AdminPlayer & {
  serviceId: number;
  serviceSlug: string;
  serviceTitle: string | null;
  startsAt: string;
  endsAt: string;
};

export type AdminWarhammerDay = {
  date: string;
  tables: Array<{ id: number; name: string }>;
  sessions: AdminSession[];
  painting: AdminPaintingBooking[];
  paintingCapacity: number | null;
  /** брони столов администратором в эту смену */
  holds: TableHold[];
};

export const getAdminWarhammerDay = (date: string) =>
  apiRequest<AdminWarhammerDay>(
    `/admin/warhammer/day?date=${encodeURIComponent(date)}`,
  );

export const moveAdminReservation = (reservationId: string, tableId: number) =>
  apiRequest<unknown>(`/admin/reservations/${reservationId}/move`, {
    method: "PATCH",
    body: JSON.stringify({ tableId }),
  });

/** Календарь армий клуба на 14 дней (этап 2, 15.11.2026). */
export type ClubArmyBooking = {
  reservationId: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  service: string;
  tableName: string | null;
  player: { firstName: string; lastName: string | null; username: string | null };
  label: string;
  game: string | null;
  army: string | null;
  points: number | null;
  seats: number;
};

export const getClubArmyCalendar = () => apiRequest<ClubArmyBooking[]>("/admin/club-armies");
