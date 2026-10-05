import { formatClub, getClubParts } from "@/utils/clubTime";

const pad = (value: number) => String(value).padStart(2, "0");

export const formatNewsBadgeDate = (iso: string) => {
  if (!iso) return "—";

  const { day, month, hour, minute } = getClubParts(iso);

  return `${pad(day)}.${pad(month)} В ${pad(hour)}:${pad(minute)}`;
};

export const formatNewsPublishedAt = (iso: string) => {
  if (!iso) return "—";

  return formatClub(iso, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getNewsCountLabel = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return "новость";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "новости";
  }

  return "новостей";
};
