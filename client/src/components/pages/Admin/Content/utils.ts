export { formatEventDateTime, formatEventPeriod } from "@/utils/eventDisplay";
import type { ImageCrop } from "@/types";
import { fromClubDatetimeLocal, toClubDatetimeLocal } from "@/utils/clubTime";

export type EventDraft = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  seatsPerTable: number;
  bannerUrl: string;
  bannerCrop: ImageCrop | null;
  tableIds: number[];
};

export const createEmptyEventDraft = (): EventDraft => ({
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  seatsPerTable: 1,
  bannerUrl: "",
  bannerCrop: null,
  tableIds: [],
});

// Поля datetime-local в админке — всегда время клуба (UTC+5)
export const toDatetimeLocal = (iso: string) => toClubDatetimeLocal(iso);

export const fromDatetimeLocal = (value: string) => fromClubDatetimeLocal(value);

const tableIdsEqual = (left: number[], right: number[]) =>
  left.length === right.length && left.every((id) => right.includes(id));

export const eventToDraft = (event: {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  seatsPerTable: number;
  bannerUrl: string;
  bannerCrop: ImageCrop | null;
  tableIds: number[];
}): EventDraft => ({
  title: event.title,
  description: event.description,
  startsAt: toDatetimeLocal(event.startsAt),
  endsAt: toDatetimeLocal(event.endsAt),
  seatsPerTable: event.seatsPerTable,
  bannerUrl: event.bannerUrl,
  bannerCrop: event.bannerCrop,
  tableIds: [...event.tableIds],
});

export const draftToPayload = (draft: EventDraft, bannerUrl: string) => ({
  title: draft.title.trim(),
  description: draft.description.trim(),
  startsAt: fromDatetimeLocal(draft.startsAt),
  endsAt: fromDatetimeLocal(draft.endsAt),
  seatsPerTable: Math.max(1, draft.seatsPerTable),
  bannerUrl,
  bannerCrop: draft.bannerCrop,
  tableIds: draft.tableIds,
});

export const draftsEqual = (left: EventDraft, right: EventDraft) =>
  left.title === right.title &&
  left.description === right.description &&
  left.startsAt === right.startsAt &&
  left.endsAt === right.endsAt &&
  left.seatsPerTable === right.seatsPerTable &&
  left.bannerUrl === right.bannerUrl &&
  JSON.stringify(left.bannerCrop) === JSON.stringify(right.bannerCrop) &&
  tableIdsEqual(left.tableIds, right.tableIds);
