import { formatClubTime } from "@/utils/clubTime";

export const formatDurationLabel = (
  durationMinutes: number | null | undefined,
) => {
  if (durationMinutes == null || durationMinutes <= 0) return null;

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours > 0 && minutes === 0) return `бронь на ${hours}ч`;
  if (hours === 0) return `бронь на ${minutes}м`;

  return `бронь на ${hours}ч ${minutes}м`;
};

export const calculateReservationEnd = (
  startsAt: Date,
  durationMinutes: number | null,
) => {
  const reservationEnd = new Date(startsAt);

  if (durationMinutes && durationMinutes > 0) {
    reservationEnd.setMinutes(reservationEnd.getMinutes() + durationMinutes);
  }

  return reservationEnd;
};

export const formatTimeValue = (date: Date | string) => formatClubTime(date);

export const formatReservationTimeRange = (
  startsAt: Date | string,
  endsAt: Date | string,
) => `${formatTimeValue(startsAt)} - ${formatTimeValue(endsAt)}`;
