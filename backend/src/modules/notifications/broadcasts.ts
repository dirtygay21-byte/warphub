/**
 * Рассылки владельца (14.11.2026): текст, картинка, до 3 кнопок, аудитория и расписание — сейчас, один раз
 * в заданное время, каждую неделю (дни + время) или каждый месяц (число + время), с датой окончания.
 * Проверка «пора» — раз в минуту (worker.ts); отправка — через общую очередь (тихие часы, «не получает»).
 * Рассылки владельца не входят в дневной лимит автоматических объявлений, но учитывают настройку «Новости» игрока.
 */
import { and, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { getAdminTelegramIds } from '../../config/admin';
import { bookingConfig } from '../../config/booking';
import { db } from '../../db';
import {
  broadcastsTable,
  notificationPrefsTable,
  reservationsTable,
  usersEventsTable,
  type BroadcastAudience,
  type BroadcastSchedule,
  type NotificationButton,
} from '../../db/schema';
import { BROADCAST_KIND } from './catalog';
import { allRecipients, announce, recipientsOf, type Recipient } from './hub';
import { sendTelegramMessageDetailed } from './service';

const MIN = 60_000;
const OFFSET = bookingConfig.timezoneOffsetMinutes * MIN;

export class BroadcastError extends Error {
  constructor(
    public code: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID',
    message: string,
  ) {
    super(message);
  }
}

/** Кто может управлять уведомлениями: владелец (BROADCAST_OWNER_IDS в .env, по умолчанию — Telegram ID владельца). */
export function notificationOwnerIds(): string[] {
  const raw = process.env.BROADCAST_OWNER_IDS ?? '269942222';
  return raw
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^\d+$/.test(x));
}

export const isNotificationOwner = (user: { telegramId: number }) => notificationOwnerIds().includes(String(user.telegramId));

export type BroadcastInput = {
  title: string;
  text: string;
  imageUrl?: string | null;
  buttons?: NotificationButton[];
  audience: BroadcastAudience;
  schedule: BroadcastSchedule;
};

/** «18:30» → минуты от полуночи; неверно — null. */
function minutesOf(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

/**
 * Следующий запуск после момента after (время клуба UTC+5). null — больше запусков нет.
 * once — в at (если ещё не прошло), weekly — ближайший из дней недели (1 — пн … 7 — вс) в time,
 * monthly — число месяца (если в месяце его нет — последний день) в time; until — последний день включительно.
 */
export function nextRun(schedule: BroadcastSchedule, after: Date): Date | null {
  if (schedule.type === 'now') return null;
  if (schedule.type === 'once') {
    const at = new Date(schedule.at);
    return Number.isNaN(at.getTime()) || at.getTime() <= after.getTime() ? null : at;
  }
  const minutes = minutesOf(schedule.time);
  if (minutes === null) return null;
  const until = schedule.until ? Date.parse(`${schedule.until}T23:59:59Z`) - OFFSET : null;
  const local = new Date(after.getTime() + OFFSET);
  for (let i = 0; i <= 62; i++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i));
    const candidate = new Date(day.getTime() + minutes * MIN - OFFSET);
    if (candidate.getTime() <= after.getTime()) continue;
    if (until !== null && candidate.getTime() > until) return null;
    if (schedule.type === 'weekly') {
      const wd = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
      if (schedule.days.includes(wd)) return candidate;
    } else {
      const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
      if (day.getUTCDate() === Math.min(schedule.day, last)) return candidate;
    }
  }
  return null;
}

export function validateBroadcast(input: BroadcastInput) {
  if (!input.title.trim()) throw new BroadcastError('INVALID', 'Укажите название рассылки');
  if (!input.text.trim()) throw new BroadcastError('INVALID', 'Пустой текст');
  if (input.text.length > 4000) throw new BroadcastError('INVALID', 'Текст длиннее 4000 символов');
  if ((input.buttons ?? []).length > 3) throw new BroadcastError('INVALID', 'Не больше 3 кнопок');
  for (const b of input.buttons ?? []) {
    if (!b.text.trim() || (!b.path && !b.url)) throw new BroadcastError('INVALID', 'У кнопки нужен текст и куда она ведёт');
    if (b.url && !/^https:\/\//.test(b.url)) throw new BroadcastError('INVALID', 'Ссылка кнопки должна начинаться с https://');
  }
  const s = input.schedule;
  if (s.type === 'once' && Number.isNaN(Date.parse(s.at))) throw new BroadcastError('INVALID', 'Неверная дата отправки');
  if (s.type === 'weekly' && (!s.days.length || s.days.some((d) => d < 1 || d > 7))) throw new BroadcastError('INVALID', 'Выберите дни недели');
  if ((s.type === 'weekly' || s.type === 'monthly') && minutesOf(s.time) === null) throw new BroadcastError('INVALID', 'Время — в виде 18:30');
  if (s.type === 'monthly' && (s.day < 1 || s.day > 31)) throw new BroadcastError('INVALID', 'Число месяца — от 1 до 31');
}

/** Получатели по аудитории. */
export async function audienceRecipients(audience: BroadcastAudience, requester?: { telegramId: number }): Promise<Recipient[]> {
  const now = new Date();
  switch (audience.kind) {
    case 'me':
      return requester ? [{ telegramId: requester.telegramId }] : [];
    case 'admins':
      return getAdminTelegramIds().map((id) => ({ telegramId: Number(id) }));
    case 'events': {
      const rows = await db.selectDistinct({ userId: usersEventsTable.userId }).from(usersEventsTable);
      return recipientsOf(rows.map((r) => r.userId));
    }
    case 'recent': {
      const days = Math.max(1, Math.min(audience.days ?? 30, 365));
      const rows = await db
        .selectDistinct({ userId: reservationsTable.userId })
        .from(reservationsTable)
        .where(gte(reservationsTable.createdAt, new Date(now.getTime() - days * 24 * 60 * MIN)));
      return recipientsOf(rows.map((r) => r.userId));
    }
    case 'game': {
      // играли в эту игру (по записям) или подписались на поиск соперника по ней
      const game = audience.game ?? '';
      const booked = await db
        .selectDistinct({ userId: reservationsTable.userId })
        .from(reservationsTable)
        .where(and(isNotNull(reservationsTable.details), sql`${reservationsTable.details}->>'game' = ${game}`));
      const subs = await db.select({ userId: notificationPrefsTable.userId, games: notificationPrefsTable.opponentGames }).from(notificationPrefsTable);
      const ids = new Set([...booked.map((r) => r.userId), ...subs.filter((s) => (s.games ?? []).includes(game)).map((s) => s.userId)]);
      return recipientsOf([...ids]);
    }
    default:
      return allRecipients();
  }
}

export async function listBroadcasts() {
  const rows = await db.select().from(broadcastsTable).orderBy(desc(broadcastsTable.id));
  return rows.map(view);
}

function view(r: typeof broadcastsTable.$inferSelect) {
  return {
    ...r,
    nextRunAt: r.nextRunAt?.toISOString() ?? null,
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function createBroadcast(input: BroadcastInput, owner: { telegramId: number }) {
  validateBroadcast(input);
  const [row] = await db
    .insert(broadcastsTable)
    .values({ ...clean(input), status: 'draft', createdBy: owner.telegramId })
    .returning();
  return view(row!);
}

export async function updateBroadcast(id: number, input: BroadcastInput) {
  validateBroadcast(input);
  const [current] = await db.select().from(broadcastsTable).where(eq(broadcastsTable.id, id)).limit(1);
  if (!current) throw new BroadcastError('NOT_FOUND', 'Рассылка не найдена');
  const status = current.status === 'scheduled' ? 'scheduled' : current.status === 'done' ? 'draft' : current.status;
  const nextRunAt = status === 'scheduled' ? nextRun(input.schedule, new Date()) : null;
  const [row] = await db
    .update(broadcastsTable)
    .set({ ...clean(input), status: status === 'scheduled' && !nextRunAt ? 'done' : status, nextRunAt })
    .where(eq(broadcastsTable.id, id))
    .returning();
  return view(row!);
}

function clean(input: BroadcastInput) {
  return {
    title: input.title.trim(),
    text: input.text.trim(),
    imageUrl: input.imageUrl?.trim() || null,
    buttons: (input.buttons ?? []).map((b) => ({ text: b.text.trim(), ...(b.url ? { url: b.url.trim() } : { path: b.path || '/' }) })),
    audience: input.audience,
    schedule: input.schedule,
  };
}

export async function deleteBroadcast(id: number) {
  const rows = await db.delete(broadcastsTable).where(eq(broadcastsTable.id, id)).returning({ id: broadcastsTable.id });
  if (!rows.length) throw new BroadcastError('NOT_FOUND', 'Рассылка не найдена');
  return { id };
}

/** Запустить: «сейчас» — сразу в очередь, остальные — по расписанию. */
export async function startBroadcast(id: number, requester: { telegramId: number }) {
  const [row] = await db.select().from(broadcastsTable).where(eq(broadcastsTable.id, id)).limit(1);
  if (!row) throw new BroadcastError('NOT_FOUND', 'Рассылка не найдена');
  if (row.schedule.type === 'now') {
    const n = await runBroadcast(row, requester);
    const [done] = await db.update(broadcastsTable).set({ status: 'done', nextRunAt: null }).where(eq(broadcastsTable.id, id)).returning();
    return { ...view(done!), queued: n };
  }
  const next = nextRun(row.schedule, new Date());
  if (!next) throw new BroadcastError('INVALID', 'По расписанию больше нет запусков — проверьте дату');
  const [saved] = await db.update(broadcastsTable).set({ status: 'scheduled', nextRunAt: next }).where(eq(broadcastsTable.id, id)).returning();
  return { ...view(saved!), queued: 0 };
}

export async function pauseBroadcast(id: number) {
  const [row] = await db.update(broadcastsTable).set({ status: 'paused', nextRunAt: null }).where(eq(broadcastsTable.id, id)).returning();
  if (!row) throw new BroadcastError('NOT_FOUND', 'Рассылка не найдена');
  return view(row);
}

/** Тест: только владельцу, сразу (без очереди и тихих часов). */
export async function testBroadcast(input: BroadcastInput, owner: { telegramId: number }) {
  validateBroadcast(input);
  const c = clean(input);
  const result = await sendTelegramMessageDetailed(owner.telegramId, c.text, 'broadcast-test', { imageUrl: c.imageUrl, buttons: c.buttons });
  return result.ok ? { ok: true } : { ok: false, error: result.description ?? result.reason };
}

async function runBroadcast(row: typeof broadcastsTable.$inferSelect, requester?: { telegramId: number }) {
  const recipients = await audienceRecipients(row.audience, requester ?? (row.createdBy ? { telegramId: row.createdBy } : undefined));
  const personal = row.audience.kind === 'me' || row.audience.kind === 'admins';
  const n = await announce(BROADCAST_KIND, recipients, row.text, {
    imageUrl: row.imageUrl,
    buttons: row.buttons,
    broadcastId: row.id,
    category: personal ? null : 'news',
  });
  await db
    .update(broadcastsTable)
    .set({ runs: row.runs + 1, lastRunAt: new Date(), lastRecipients: n })
    .where(eq(broadcastsTable.id, row.id));
  return n;
}

/** Запустить рассылки, у которых подошло время (из worker.ts). */
export async function runDueBroadcasts(now = new Date()) {
  const due = await db
    .select()
    .from(broadcastsTable)
    .where(and(eq(broadcastsTable.status, 'scheduled'), lte(broadcastsTable.nextRunAt, now)));
  for (const row of due) {
    // сначала переносим время — повторного запуска не будет даже при ошибке отправки
    const next = nextRun(row.schedule, now);
    await db
      .update(broadcastsTable)
      .set({ nextRunAt: next, status: next ? 'scheduled' : 'done' })
      .where(eq(broadcastsTable.id, row.id));
    try {
      await runBroadcast(row);
    } catch (error) {
      console.warn('[broadcast] run failed', row.id, (error as Error).message);
    }
  }
  return due.length;
}

/** Сколько человек получит (для формы): с учётом настройки «Новости». */
export async function audienceCount(audience: BroadcastAudience, requester: { telegramId: number }) {
  const recipients = await audienceRecipients(audience, requester);
  return { total: recipients.length };
}

