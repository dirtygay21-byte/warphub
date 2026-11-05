import { asc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { partnerCardsTable, partnerSettingsTable } from '../../db/schema';

export type PartnerSettingsView = { partner1Title: string; partner2Title: string; footerText: string; updatedAt: string | null };
export type PartnerCardView = {
  id: number;
  lane: 1 | 2;
  title: string;
  text: string;
  url: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type PartnerCardInput = {
  lane: 1 | 2;
  title: string;
  text?: string;
  url: string;
  imageUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
};
export type PartnerSettingsInput = { partner1Title: string; partner2Title: string; footerText: string };

export class PartnerError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_INPUT', message: string) {
    super(message);
    this.name = 'PartnerError';
  }
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const requiredText = (value: unknown, max: number, label: string) => {
  const text = clean(value, max);
  if (!text) throw new PartnerError('INVALID_INPUT', `${label} is required`);
  return text;
};

export function partnerUrl(value: unknown): string {
  const raw = clean(value, 2048);
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
    if (url.username || url.password) throw new Error('credentials');
    return url.toString();
  } catch {
    throw new PartnerError('INVALID_INPUT', 'A public http(s) URL without credentials is required');
  }
}

export function normalizePartnerCard(input: PartnerCardInput): Required<PartnerCardInput> {
  if (input.lane !== 1 && input.lane !== 2) throw new PartnerError('INVALID_INPUT', 'Lane must be 1 or 2');
  const sortOrder = input.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) throw new PartnerError('INVALID_INPUT', 'Invalid sort order');
  const imageUrl = input.imageUrl?.trim() ? partnerUrl(input.imageUrl) : '';
  return {
    lane: input.lane,
    title: requiredText(input.title, 180, 'Title'),
    text: clean(input.text, 600),
    url: partnerUrl(input.url),
    imageUrl,
    sortOrder,
    isActive: input.isActive !== false,
  };
}

export function normalizePartnerSettings(input: PartnerSettingsInput): PartnerSettingsInput {
  return {
    partner1Title: requiredText(input.partner1Title, 120, 'Partner 1 title'),
    partner2Title: requiredText(input.partner2Title, 120, 'Partner 2 title'),
    footerText: clean(input.footerText, 600),
  };
}

const toCard = (row: typeof partnerCardsTable.$inferSelect): PartnerCardView => ({
  id: row.id,
  lane: row.lane as 1 | 2,
  title: row.title,
  text: row.text,
  url: row.url,
  imageUrl: row.imageUrl,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toSettings = (row?: typeof partnerSettingsTable.$inferSelect): PartnerSettingsView => ({
  partner1Title: row?.partner1Title ?? 'Партнёр 1',
  partner2Title: row?.partner2Title ?? 'Партнёр 2',
  footerText: row?.footerText ?? 'Мини-ки по скидке',
  updatedAt: row?.updatedAt.toISOString() ?? null,
});

export async function getPartnerShowcase(includeHidden = false) {
  const [settings] = await db.select().from(partnerSettingsTable).where(eq(partnerSettingsTable.id, 1)).limit(1);
  const rows = await db.select().from(partnerCardsTable).orderBy(asc(partnerCardsTable.lane), asc(partnerCardsTable.sortOrder), asc(partnerCardsTable.id));
  return { settings: toSettings(settings), cards: rows.filter((row) => includeHidden || row.isActive).map(toCard) };
}

export async function updatePartnerSettings(input: PartnerSettingsInput): Promise<PartnerSettingsView> {
  const value = normalizePartnerSettings(input);
  const [row] = await db.insert(partnerSettingsTable).values({ id: 1, ...value }).onConflictDoUpdate({ target: partnerSettingsTable.id, set: value }).returning();
  return toSettings(row);
}

export async function createPartnerCard(input: PartnerCardInput): Promise<PartnerCardView> {
  const value = normalizePartnerCard(input);
  const siblings = await db.select({ sortOrder: partnerCardsTable.sortOrder }).from(partnerCardsTable).where(eq(partnerCardsTable.lane, value.lane));
  const sortOrder = input.sortOrder ?? Math.max(-1, ...siblings.map((row) => row.sortOrder)) + 1;
  const [row] = await db.insert(partnerCardsTable).values({ ...value, sortOrder }).returning();
  return toCard(row);
}

export async function updatePartnerCard(id: number, input: Partial<PartnerCardInput>): Promise<PartnerCardView> {
  const [existing] = await db.select().from(partnerCardsTable).where(eq(partnerCardsTable.id, id)).limit(1);
  if (!existing) throw new PartnerError('NOT_FOUND', 'Partner card not found');
  const value = normalizePartnerCard({
    lane: input.lane ?? existing.lane as 1 | 2,
    title: input.title ?? existing.title,
    text: input.text ?? existing.text,
    url: input.url ?? existing.url,
    imageUrl: input.imageUrl ?? existing.imageUrl,
    sortOrder: input.sortOrder ?? existing.sortOrder,
    isActive: input.isActive ?? existing.isActive,
  });
  const [row] = await db.update(partnerCardsTable).set(value).where(eq(partnerCardsTable.id, id)).returning();
  return toCard(row);
}

export async function deletePartnerCard(id: number): Promise<PartnerCardView> {
  const [row] = await db.delete(partnerCardsTable).where(eq(partnerCardsTable.id, id)).returning();
  if (!row) throw new PartnerError('NOT_FOUND', 'Partner card not found');
  return toCard(row);
}
