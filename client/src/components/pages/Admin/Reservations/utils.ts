import type { AdminReservationsQuery } from "@/types";
import { fromClubDatetimeLocal } from "@/utils/clubTime";
import type { AdminFiltersForm, StatusAction } from "./types";

// Поля фильтра — время клуба (UTC+5)
export const datetimeLocalToApi = (value: string) =>
  fromClubDatetimeLocal(value) || undefined;

export const formToQuery = (
  form: AdminFiltersForm,
  limit: number,
  offset: number
): AdminReservationsQuery => {
  const query: AdminReservationsQuery = { limit, offset };

  if (form.date) query.date = form.date;
  if (form.serviceId) query.serviceId = Number(form.serviceId);
  if (form.tableId) query.tableId = Number(form.tableId);
  if (form.status) query.status = form.status;
  if (form.userId.trim()) query.userId = form.userId.trim();

  const startsAt = datetimeLocalToApi(form.startsAt);
  const endsAt = datetimeLocalToApi(form.endsAt);

  if (startsAt) query.startsAt = startsAt;
  if (endsAt) query.endsAt = endsAt;

  return query;
};

export const hasActiveFilters = (form: AdminFiltersForm) =>
  Object.values(form).some((value) => value.trim() !== "");

export const getAvailableStatusActions = (status: string): StatusAction[] => {
  switch (status.toLowerCase()) {
    case "pending":
      return ["confirm", "reject"];
    case "confirmed":
      return ["reject", "extend"];
    default:
      return [];
  }
};

export const addHoursToEndsAt = (endsAt: string, hours: number) =>
  new Date(new Date(endsAt).getTime() + hours * 60 * 60 * 1000).toISOString();
