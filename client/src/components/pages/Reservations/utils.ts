import type { RegisteredEvent } from "@/types";

export const isPastEvent = (event: RegisteredEvent) =>
  new Date(event.endsAt).getTime() < Date.now();
