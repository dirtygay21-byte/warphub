import { apiRequest } from "@/apiUtils/general";
import type { NewsItem } from "@/types";

type NewsApi = {
  id?: number;
  coverUrl?: string;
  cover_url?: string;
  coverCrop?: NewsItem["coverCrop"];
  cover_crop?: NewsItem["coverCrop"];
  title?: string;
  text?: string;
  publishedAt?: string;
  published_at?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

export const mapNews = (news: NewsApi): NewsItem => ({
  id: news.id ?? 0,
  coverUrl: news.coverUrl ?? news.cover_url ?? "",
  coverCrop: news.coverCrop ?? news.cover_crop ?? null,
  title: news.title ?? "",
  text: news.text ?? "",
  publishedAt: news.publishedAt ?? news.published_at ?? "",
  createdAt: news.createdAt ?? news.created_at,
  updatedAt: news.updatedAt ?? news.updated_at,
});

const parseNewsResponse = (data: unknown): NewsApi[] => {
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== "object") return [];

  const payload = data as Record<string, unknown>;

  return (
    (Array.isArray(payload.items) ? payload.items : null) ??
    (Array.isArray(payload.data) ? payload.data : null) ??
    []
  ) as NewsApi[];
};

export const getNews = async (): Promise<NewsItem[]> => {
  const data = await apiRequest<unknown>("/news");

  return parseNewsResponse(data).map(mapNews);
};

export const getNewsById = async (id: number): Promise<NewsItem> => {
  const data = await apiRequest<NewsApi>(`/news/${id}`);

  return mapNews(data);
};
