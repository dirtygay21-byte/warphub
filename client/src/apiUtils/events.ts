import { apiRequest } from "@/apiUtils/general";
import type { Event, RegisteredEvent } from "@/types";

export type EventApi = {
  id?: number;
  title?: string;
  description?: string;
  startsAt?: string;
  starts_at?: string;
  endsAt?: string;
  ends_at?: string;
  capacity?: number;
  seatsPerTable?: number;
  seats_per_table?: number;
  bannerUrl?: string;
  banner_url?: string;
  tableIds?: number[];
  table_ids?: number[];
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  freeSeats?: number;
  free_seats?: number;
  registeredCount?: number;
  registered_count?: number;
  registeredSeats?: number;
  registered_seats?: number;
  isRegistered?: boolean;
  is_registered?: boolean;
  partySize?: number;
  party_size?: number;
};

const resolveFreeSeats = (event: EventApi): number | undefined => {
  if (event.freeSeats != null) return event.freeSeats;
  if (event.free_seats != null) return event.free_seats;

  const registered =
    event.registeredCount ??
    event.registered_count ??
    event.registeredSeats ??
    event.registered_seats;

  if (registered != null) {
    return Math.max(0, (event.capacity ?? 0) - registered);
  }

  return undefined;
};

export const mapEvent = (event: EventApi): Event => ({
  id: event.id ?? 0,
  title: event.title ?? "",
  description: event.description ?? "",
  startsAt: event.startsAt ?? event.starts_at ?? "",
  endsAt: event.endsAt ?? event.ends_at ?? "",
  seatsPerTable: event.seatsPerTable ?? event.seats_per_table ?? 0,
  capacity: event.capacity ?? 0,
  bannerUrl: event.bannerUrl ?? event.banner_url ?? "",
  tableIds: event.tableIds ?? event.table_ids ?? [],
  createdAt: event.createdAt ?? event.created_at ?? "",
  updatedAt: event.updatedAt ?? event.updated_at ?? "",
  freeSeats: resolveFreeSeats(event),
});

export const mapRegisteredEvent = (event: EventApi): RegisteredEvent => ({
  ...mapEvent(event),
  registeredCount: event.registeredCount ?? event.registered_count ?? 0,
  isRegistered: event.isRegistered ?? event.is_registered ?? true,
  partySize: event.partySize ?? event.party_size ?? 1,
});

export const getNearestEvent = async (): Promise<Event | null> => {
  try {
    const data = await apiRequest<EventApi>("/events/nearest");

    return mapEvent(data);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("404")
    ) {
      return null;
    }

    throw error;
  }
};

export const getEventById = async (id: number): Promise<Event> => {
  const data = await apiRequest<EventApi>(`/events/${id}`);

  return mapEvent(data);
};

export const registerForEvent = (id: number, partySize: number) =>
  apiRequest<void>(`/events/${id}/register`, {
    method: "POST",
    body: JSON.stringify({ partySize }),
  });

export const unregisterFromEvent = (id: number) =>
  apiRequest<void>(`/events/${id}/register`, {
    method: "DELETE",
  });
