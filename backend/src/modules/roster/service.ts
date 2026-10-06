import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { getAdminTelegramIds, isAdminUser } from '../../config/admin';
import { env } from '../../config/env';
import { db } from '../../db';
import { rosterAccessCodesTable, rosterAccessTable, rosterCodeAttemptsTable, usersTable } from '../../db/schema';
import { escapeHtml, formatUserName, sendTelegramMessage } from '../notifications/service';
import type { User } from '../users/service';
import {
  ATTEMPT_WINDOW_MS,
  MAX_FAILED_PER_USER,
  checkAttempts,
  codeTtlMs,
  findMatchingCode,
  generateCode,
  hashCode,
  normalizeCode,
  rosterOwnerIds,
} from './codes';

export class RosterError extends Error {
  constructor(
    public code: 'INVALID_CODE' | 'BAD_FORMAT' | 'TOO_MANY_ATTEMPTS' | 'NOT_FOUND' | 'FORBIDDEN',
    message: string,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}

const codeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Yekaterinburg',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export function isRosterOwner(user: Pick<User, 'telegramId'>): boolean {
  return rosterOwnerIds(getAdminTelegramIds()).includes(user.telegramId.toString());
}

export async function hasRosterAccess(user: User): Promise<boolean> {
  if (isAdminUser(user)) return true;
  const [row] = await db.select({ id: rosterAccessTable.userId }).from(rosterAccessTable).where(eq(rosterAccessTable.userId, user.id)).limit(1);
  return !!row;
}

async function activeCodes() {
  return db
    .select()
    .from(rosterAccessCodesTable)
    .where(and(isNull(rosterAccessCodesTable.usedAt), isNull(rosterAccessCodesTable.revokedAt), gt(rosterAccessCodesTable.expiresAt, new Date())));
}

/** Создать код и отправить его владельцу Roster Builder в Telegram. */
export async function createAccessCode(admin: User) {
  if (!isRosterOwner(admin)) throw new RosterError('FORBIDDEN', 'Создавать коды может только владелец Roster Builder');
  const active = await activeCodes();
  const taken = new Set(active.map((r) => r.codeHash));
  const code = generateCode((c) => taken.has(hashCode(env.jwtSecret, c)));
  const expiresAt = new Date(Date.now() + codeTtlMs());
  const [row] = await db
    .insert(rosterAccessCodesTable)
    .values({ codeHash: hashCode(env.jwtSecret, code), createdBy: admin.id, expiresAt })
    .returning({ id: rosterAccessCodesTable.id });

  const delivered = await sendTelegramMessage(
    admin.telegramId,
    [
      '🔑 <b>Код доступа к Roster Builder</b>',
      '',
      `<code>${code}</code>`,
      '',
      `Действует до ${escapeHtml(codeFormatter.format(expiresAt))}, один раз.`,
      'Человек вводит его в WarpHub: Профиль → «Есть код?».',
    ].join('\n'),
  );

  // Если бот не смог написать (не нажат «Старт»), показываем код только в ответе этому же админу.
  return { id: row!.id, expiresAt, delivered, code: delivered ? undefined : code };
}

export async function listCodes() {
  const rows = await db
    .select({
      id: rosterAccessCodesTable.id,
      createdAt: rosterAccessCodesTable.createdAt,
      expiresAt: rosterAccessCodesTable.expiresAt,
      usedAt: rosterAccessCodesTable.usedAt,
      revokedAt: rosterAccessCodesTable.revokedAt,
      usedByName: usersTable.firstName,
      usedByUsername: usersTable.username,
    })
    .from(rosterAccessCodesTable)
    .leftJoin(usersTable, eq(usersTable.id, rosterAccessCodesTable.usedBy))
    .orderBy(desc(rosterAccessCodesTable.createdAt))
    .limit(30);
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    status: r.usedAt ? 'used' : r.revokedAt ? 'revoked' : r.expiresAt.getTime() <= now ? 'expired' : 'active',
  }));
}

export async function revokeCode(id: number) {
  const res = await db
    .update(rosterAccessCodesTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(rosterAccessCodesTable.id, id), isNull(rosterAccessCodesTable.usedAt), isNull(rosterAccessCodesTable.revokedAt)))
    .returning({ id: rosterAccessCodesTable.id });
  if (!res.length) throw new RosterError('NOT_FOUND', 'Код не найден или уже использован');
}

/** Ввод кода пользователем. */
export async function redeemCode(user: User, input: string) {
  if (await hasRosterAccess(user)) return { hasAccess: true };
  const code = normalizeCode(input);
  if (!code) throw new RosterError('BAD_FORMAT', 'Код — это 4 цифры');

  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  const userFails = await db
    .select({ at: rosterCodeAttemptsTable.createdAt })
    .from(rosterCodeAttemptsTable)
    .where(and(eq(rosterCodeAttemptsTable.userId, user.id), eq(rosterCodeAttemptsTable.success, false), gt(rosterCodeAttemptsTable.createdAt, since)));
  const [global] = await db
    .select({ n: count() })
    .from(rosterCodeAttemptsTable)
    .where(and(eq(rosterCodeAttemptsTable.success, false), gt(rosterCodeAttemptsTable.createdAt, since)));
  const verdict = checkAttempts(
    userFails.map((r) => r.at),
    Number(global?.n ?? 0),
  );
  if (!verdict.allowed) {
    const min = Math.ceil(verdict.retryAfterMs / 60000);
    throw new RosterError('TOO_MANY_ATTEMPTS', `Слишком много попыток. Попробуйте через ${min} мин.`, Math.ceil(verdict.retryAfterMs / 1000));
  }

  const match = findMatchingCode(await activeCodes(), env.jwtSecret, code);
  // атомарно «гасим» код: если его одновременно ввёл кто-то ещё, сработает только один
  const used = match
    ? await db
        .update(rosterAccessCodesTable)
        .set({ usedAt: new Date(), usedBy: user.id })
        .where(and(eq(rosterAccessCodesTable.id, match.id), isNull(rosterAccessCodesTable.usedAt), isNull(rosterAccessCodesTable.revokedAt)))
        .returning({ id: rosterAccessCodesTable.id, createdBy: rosterAccessCodesTable.createdBy })
    : [];

  if (!used.length) {
    await db.insert(rosterCodeAttemptsTable).values({ userId: user.id, success: false });
    const left = MAX_FAILED_PER_USER - userFails.length - 1;
    throw new RosterError('INVALID_CODE', left > 0 ? `Неверный или устаревший код. Осталось попыток: ${left}` : 'Неверный код. Попытки закончились — попробуйте позже.');
  }

  await db.insert(rosterCodeAttemptsTable).values({ userId: user.id, success: true });
  await db
    .insert(rosterAccessTable)
    .values({ userId: user.id, grantedBy: used[0]!.createdBy, codeId: used[0]!.id })
    .onConflictDoNothing();

  for (const id of rosterOwnerIds(getAdminTelegramIds())) {
    void sendTelegramMessage(id, `✅ ${escapeHtml(formatUserName(user))} открыл Roster Builder по коду.`);
  }
  return { hasAccess: true };
}

export async function listAccess() {
  return db
    .select({
      userId: rosterAccessTable.userId,
      grantedAt: rosterAccessTable.grantedAt,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
      telegramId: usersTable.telegramId,
    })
    .from(rosterAccessTable)
    .innerJoin(usersTable, eq(usersTable.id, rosterAccessTable.userId))
    .orderBy(desc(rosterAccessTable.grantedAt));
}

export async function revokeAccess(userId: string) {
  const res = await db.delete(rosterAccessTable).where(eq(rosterAccessTable.userId, userId)).returning({ id: rosterAccessTable.userId });
  if (!res.length) throw new RosterError('NOT_FOUND', 'У пользователя нет доступа');
}

/** Удалить старые попытки ввода (вызывается при создании кода). */
export async function cleanupAttempts() {
  await db.delete(rosterCodeAttemptsTable).where(sql`${rosterCodeAttemptsTable.createdAt} < now() - interval '7 days'`);
}

// ---------- данные Wahapedia для Roster Builder ----------

/** Папка с index.json и f/<фракция>.json (генерирует tools/roster-data). */
export function rosterDataDir(): string {
  return process.env.ROSTER_DATA_DIR || path.join(process.cwd(), 'roster-data');
}

const gzCache = new Map<string, { mtime: number; body: Uint8Array }>();

/** Файл данных (сжатый gzip, с кешем в памяти). name: 'index', 'battlefield' или код фракции. */
export function readRosterData(name: string): { body: Uint8Array; gzip: boolean } | null {
  if (!/^(index|battlefield|[A-Za-z]{1,6})$/.test(name)) return null;
  const file = name === 'index' || name === 'battlefield' ? path.join(rosterDataDir(), `${name}.json`) : path.join(rosterDataDir(), 'f', `${name}.json`);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const cached = gzCache.get(file);
  if (cached && cached.mtime === stat.mtimeMs) return { body: cached.body, gzip: true };
  const body = Bun.gzipSync(fs.readFileSync(file));
  gzCache.set(file, { mtime: stat.mtimeMs, body });
  return { body, gzip: true };
}
