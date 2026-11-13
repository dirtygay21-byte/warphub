import type { AdminReservation } from "@/types";

export type AdminFiltersForm = {
  date: string;
  serviceId: string;
  tableId: string;
  status: string;
  userId: string;
  startsAt: string;
  endsAt: string;
};

export type AdminReservationRow = AdminReservation & {
  userLabel: string;
  serviceTitle: string;
  disciplineTitle?: string;
  tableLabel: string;
  timeRange: string;
  clubArmyCount: number;
  /** Армия · очки · опыт или данные покраски */
  detailsLabel: string;
  needsHelp: boolean;
  /** Игра за столом (13.11.2026): все участники с подписью и выбором; onPage — запись есть на этой странице */
  gamePlayers: AdminGamePlayerRow[];
};

export type AdminGamePlayerRow = {
  reservationId: string;
  name: string;
  status: string;
  detailsLabel: string;
  onPage: boolean;
};

export type StatusAction = "confirm" | "reject" | "extend";

export type PendingStatusAction = {
  reservation: AdminReservationRow;
  action: StatusAction;
};
