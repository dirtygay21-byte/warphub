import type { Reservation } from "@/types";
import { isCancelledReservation } from "@/utils/reservationDisplay";

export const buildSeatClubArmyOptions = (
  options: boolean[],
  partyCount: number,
) =>
  Array.from(
    { length: Math.max(partyCount, 0) },
    (_, index) => options[index] ?? false,
  );

export const isPastReservation = (reservation: Reservation) => {
  const endTime = reservation.endsAt
    ? new Date(reservation.endsAt).getTime()
    : new Date(reservation.startsAt).getTime();

  return endTime < Date.now();
};

export const isInactiveReservation = (reservation: Reservation) =>
  isCancelledReservation(reservation) || isPastReservation(reservation);

const sortByStartsAtAsc = (a: Reservation, b: Reservation) =>
  new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();

export const sortReservationsForDisplay = (reservations: Reservation[]) => {
  const upcoming = reservations
    .filter((reservation) => !isPastReservation(reservation))
    .sort(sortByStartsAtAsc);
  const past = reservations
    .filter((reservation) => isPastReservation(reservation))
    .sort(sortByStartsAtAsc);

  return [...upcoming, ...past];
};
