import { SERVICE_NAMES } from "./constants";
import type { Reservation } from "@/types";
import type { SortConfig, SortKey } from "./types";

export const getServiceName = (serviceId: number) =>
  SERVICE_NAMES[serviceId] ?? `Услуга #${serviceId}`;

export const getServiceOptions = () => [
  { value: "", label: "Все услуги" },
  ...Object.entries(SERVICE_NAMES).map(([id, title]) => ({
    value: id,
    label: title,
  })),
];

export const emptyToUndefined = (value: string) => value.trim() || undefined;

export const numberOrUndefined = (value: string) => {
  if (!value) return undefined;

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

export const dateTimeOrUndefined = (value: string) =>
  value ? new Date(value).toISOString() : undefined;

export const formatDateTime = (iso: string) => {
  if (!iso) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
};

export const formatTime = (iso: string) => {
  if (!iso) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
};

export const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    pending: "Ожидает",
    confirmed: "Подтверждена",
    completed: "Завершена",
    cancelled: "Отменена",
  };

  return labels[status.toLowerCase()] ?? status;
};

export const getStatusStyles = (status: string) => {
  const styles: Record<string, string> = {
    pending: "bg-yellow-400/15 text-yellow-300",
    confirmed: "bg-green-400/15 text-green-300",
    completed: "bg-white/10 text-white/60",
    cancelled: "bg-red-400/15 text-red-300",
  };

  return styles[status.toLowerCase()] ?? "bg-white/10 text-white/70";
};

export const truncateMiddle = (value: string, max: number) => {
  if (!value || value.length <= max) return value || "—";

  const side = Math.floor((max - 1) / 2);
  return `${value.slice(0, side)}…${value.slice(-side)}`;
};

export const getRecordsLabel = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "запись";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "записи";
  }

  return "записей";
};

export const sortReservations = (
  reservations: Reservation[],
  sort: SortConfig,
) =>
  [...reservations].sort((first, second) => {
    const firstValue = getSortValue(first, sort.key);
    const secondValue = getSortValue(second, sort.key);
    const direction = sort.direction === "asc" ? 1 : -1;

    if (typeof firstValue === "number" && typeof secondValue === "number") {
      return direction * (firstValue - secondValue);
    }

    return direction * String(firstValue).localeCompare(String(secondValue));
  });

const getSortValue = (reservation: Reservation, key: SortKey) => {
  switch (key) {
    case "id":
      return reservation.id;
    case "startsAt":
      return new Date(reservation.startsAt).getTime();
    case "telegramId":
      return reservation.telegramId ?? 0;
    case "serviceId":
      return reservation.serviceId;
    case "tableId":
      return reservation.tableId ?? 0;
    case "status":
      return reservation.status;
    case "partySize":
      return reservation.partySize;
    case "createdAt":
      return new Date(reservation.createdAt).getTime();
  }
};
