import {
  DEFAULT_BOOKING_OPTIONS,
  getBookingOptions,
  type BookingOptions,
} from "@/apiUtils/booking";
import { useQuery } from "@tanstack/react-query";

/** Справочники форм (опыт, фракции, краски…) — с запасными значениями */
export function useBookingOptions(): BookingOptions {
  const query = useQuery({
    queryKey: ["booking-options"],
    queryFn: getBookingOptions,
    staleTime: 60 * 60 * 1000,
  });

  return query.data ?? DEFAULT_BOOKING_OPTIONS;
}
