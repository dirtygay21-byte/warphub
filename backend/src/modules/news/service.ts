import { and, desc, eq, lte } from 'drizzle-orm';
import { db } from '../../db';
import { newsTable } from '../../db/schema';
import { deleteImage } from '../../lib/storage/upload';

export type NewsView = {
  id: number;
  coverUrl: string;
  title: string;
  text: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type NewsErrorCode = 'NEWS_NOT_FOUND';

export class NewsError extends Error {
  readonly code: NewsErrorCode;

  constructor(code: NewsErrorCode, message: string) {
    super(message);
    this.name = 'NewsError';
    this.code = code;
  }
}

export type CreateNewsInput = {
  coverUrl: string;
  title: string;
  text: string;
  publishedAt?: Date;
};

export type UpdateNewsInput = {
  coverUrl?: string;
  title?: string;
  text?: string;
  publishedAt?: Date;
};

function toNewsView(row: typeof newsTable.$inferSelect): NewsView {
  return {
    id: row.id,
    coverUrl: row.coverUrl,
    title: row.title,
    text: row.text,
    publishedAt: row.publishedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function maybeDeleteCover(coverUrl: string | null | undefined) {
  if (!coverUrl) return;
  try {
    await deleteImage(coverUrl);
  } catch {
    // Cover may already be missing in storage.
  }
}

/** Все новости для админов (включая ещё не опубликованные), от новых к старым. */
export async function listAllNews(): Promise<NewsView[]> {
  const rows = await db
    .select()
    .from(newsTable)
    .orderBy(desc(newsTable.publishedAt), desc(newsTable.id));

  return rows.map(toNewsView);
}

/** Только опубликованные новости (publishedAt <= now), от новых к старым. */
export async function listPublishedNews(): Promise<NewsView[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(newsTable)
    .where(lte(newsTable.publishedAt, now))
    .orderBy(desc(newsTable.publishedAt), desc(newsTable.id));

  return rows.map(toNewsView);
}

export async function getNewsById(
  newsId: number,
  options?: { publishedOnly?: boolean },
): Promise<NewsView | undefined> {
  const conditions = [eq(newsTable.id, newsId)];

  if (options?.publishedOnly) {
    conditions.push(lte(newsTable.publishedAt, new Date()));
  }

  const [row] = await db
    .select()
    .from(newsTable)
    .where(and(...conditions))
    .limit(1);

  return row ? toNewsView(row) : undefined;
}

export async function createNews(input: CreateNewsInput): Promise<NewsView> {
  const [row] = await db
    .insert(newsTable)
    .values({
      coverUrl: input.coverUrl,
      title: input.title,
      text: input.text,
      publishedAt: input.publishedAt ?? new Date(),
    })
    .returning();

  return toNewsView(row);
}

export async function updateNews(
  newsId: number,
  input: UpdateNewsInput,
): Promise<NewsView> {
  const [existing] = await db
    .select()
    .from(newsTable)
    .where(eq(newsTable.id, newsId))
    .limit(1);

  if (!existing) {
    throw new NewsError('NEWS_NOT_FOUND', 'News not found');
  }

  const nextCoverUrl =
    input.coverUrl !== undefined ? input.coverUrl : existing.coverUrl;

  const [updated] = await db
    .update(newsTable)
    .set({
      coverUrl: nextCoverUrl,
      title: input.title ?? existing.title,
      text: input.text ?? existing.text,
      publishedAt: input.publishedAt ?? existing.publishedAt,
    })
    .where(eq(newsTable.id, newsId))
    .returning();

  if (input.coverUrl !== undefined && input.coverUrl !== existing.coverUrl) {
    await maybeDeleteCover(existing.coverUrl);
  }

  return toNewsView(updated);
}

export async function deleteNews(newsId: number): Promise<NewsView> {
  const [row] = await db
    .delete(newsTable)
    .where(eq(newsTable.id, newsId))
    .returning();

  if (!row) {
    throw new NewsError('NEWS_NOT_FOUND', 'News not found');
  }

  await maybeDeleteCover(row.coverUrl);

  return toNewsView(row);
}
