import { apiRequest } from "@/apiUtils/general";

/** Цель брони стола администратором (сервер: modules/table-holds/rules.ts) */
export type HoldPurpose = "tournament" | "club_event" | "private_game" | "dnd" | "other";

export const HOLD_PURPOSE_LABELS: Record<HoldPurpose, string> = {
  tournament: "Турнирная игра",
  club_event: "Внутреннее мероприятие клуба",
  private_game: "Закрытая игра",
  dnd: "Игра D&D",
  other: "Другое мероприятие",
};

export type TableHold = {
  id: number;
  tableId: number;
  tableName: string;
  startsAt: string;
  endsAt: string;
  purpose: HoldPurpose;
  title: string;
  description: string | null;
  dndGameId: number | null;
  createdAt: string;
};

export type TableHoldPayload = {
  tableId: number;
  startsAt: string;
  endsAt: string;
  purpose: HoldPurpose;
  title: string;
  description: string | null;
  dndGameId: number | null;
};

export const listTableHolds = () => apiRequest<TableHold[]>("/admin/table-holds");

export const createTableHold = (payload: TableHoldPayload) =>
  apiRequest<TableHold>("/admin/table-holds", { method: "POST", body: JSON.stringify(payload) });

export const deleteTableHold = (id: number) =>
  apiRequest<{ id: number }>(`/admin/table-holds/${id}`, { method: "DELETE" });
