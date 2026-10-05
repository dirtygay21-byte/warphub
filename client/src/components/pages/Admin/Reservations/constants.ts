import { getStatusStyle } from "@/utils/reservationDisplay";
import type { AdminFiltersForm, StatusAction } from "./types";

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;

export const STATUS_FILTER_OPTIONS = [
  { value: "", label: "Все статусы" },
  { value: "pending", label: "Запланирована" },
  { value: "confirmed", label: "Подтверждена" },
  { value: "cancelled", label: "Отменена" },
  { value: "completed", label: "Завершена" },
] as const;

export const EMPTY_FILTERS: AdminFiltersForm = {
  date: "",
  serviceId: "",
  tableId: "",
  status: "",
  userId: "",
  startsAt: "",
  endsAt: "",
};

export const EXTEND_HOUR_OPTIONS = [1, 2, 3, 4, 6] as const;

export const STATUS_ACTION_OPTIONS: Record<
  StatusAction,
  { label: string; style: string }
> = {
  confirm: { label: "Подтвердить", style: getStatusStyle("confirmed") },
  reject: { label: "Отменить", style: getStatusStyle("cancelled") },
  extend: { label: "Продлить", style: "bg-blue-400/15 text-blue-300" },
};
