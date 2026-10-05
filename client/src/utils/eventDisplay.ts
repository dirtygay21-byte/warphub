import { clubDateKeyOf, formatClub } from "@/utils/clubTime";

export const formatEventPeriod = (startsAt: string, endsAt: string) => {
  const sameDay = clubDateKeyOf(startsAt) === clubDateKeyOf(endsAt);

  const date = (iso: string) =>
    formatClub(iso, { day: "numeric", month: "long", weekday: "short" });
  const time = (iso: string) =>
    formatClub(iso, { hour: "2-digit", minute: "2-digit" });

  if (sameDay) {
    return `${date(startsAt)} · ${time(startsAt)} – ${time(endsAt)}`;
  }

  return `${date(startsAt)} ${time(startsAt)} – ${date(endsAt)} ${time(endsAt)}`;
};

export const formatEventDateTime = (iso: string) =>
  formatClub(iso, {
    day: "numeric",
    month: "long",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
