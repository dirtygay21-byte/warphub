import type { ImageCrop, NewsItem, NewsPayload } from "@/types";
import { formatClub } from "@/utils/clubTime";

export type NewsDraft = {
  title: string;
  text: string;
  coverUrl: string;
  coverCrop: ImageCrop | null;
};

export const createEmptyNewsDraft = (): NewsDraft => ({
  title: "",
  text: "",
  coverUrl: "",
  coverCrop: null,
});

export const newsToDraft = (news: NewsItem): NewsDraft => ({
  title: news.title,
  text: news.text,
  coverUrl: news.coverUrl,
  coverCrop: news.coverCrop,
});

export const draftToPayload = (draft: NewsDraft, coverUrl: string): NewsPayload => ({
  title: draft.title.trim(),
  text: draft.text.trim(),
  coverUrl,
  coverCrop: draft.coverCrop,
});

export const draftsEqual = (left: NewsDraft, right: NewsDraft) =>
  left.title === right.title &&
  left.text === right.text &&
  left.coverUrl === right.coverUrl &&
  JSON.stringify(left.coverCrop) === JSON.stringify(right.coverCrop);

export const formatNewsDate = (iso: string) => {
  if (!iso) return "—";

  return formatClub(iso, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
