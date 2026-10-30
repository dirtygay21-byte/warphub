import { formatClub, formatClubTimeRange } from "@/utils/clubTime";

export const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает подтверждения",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
  completed: "Завершена",
};

export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-400/15 text-yellow-300",
  confirmed: "bg-green-400/15 text-green-300",
  cancelled: "bg-red-400/15 text-red-300",
  completed: "bg-white/10 text-fg-2",
};

export const formatReservationDateTime = (date: string | null) => {
  if (!date) return "—";

  return formatClub(date, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatTimeRange = (startsAt: string, endsAt: string) =>
  formatClubTimeRange(startsAt, endsAt);

export const getStatusLabel = (status: string) =>
  STATUS_LABELS[status.toLowerCase()] ?? status;

export const getStatusStyle = (status: string) =>
  STATUS_STYLES[status.toLowerCase()] ?? "bg-white/10 text-fg-2";

export const isCancelledReservation = (reservation: {
  status: string;
  cancelledAt: string | null;
}) =>
  reservation.status.toLowerCase() === "cancelled" ||
  reservation.cancelledAt != null;

export { getUserDisplayName } from "./user";
