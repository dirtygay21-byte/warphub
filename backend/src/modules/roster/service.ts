import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { getBuiltinAdminIds, isAdminUser } from '../../config/admin';
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
  // владельцы Roster Builder — только встроенные администраторы (добавленные в админке ими не становятся)
  return rosterOwnerIds(getBuiltinAdminIds()).includes(user.telegramId.toString());
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

/** Номер advisory-блокировки для ввода кодов (пространство 41 — не пересекается с бронированием: 1, 2). */
const LOCK_ROSTER_REDEEM = 41;
let globalAlertAt = 0;

type RedeemOutcome =
  | { kind: 'ok' }
  | { kind: 'limited'; retryAfterMs: number; global: boolean }
  | { kind: 'invalid'; left: number };

/**
 * Ввод кода пользователем. Проверка лимитов, поиск кода, запись попытки и выдача доступа идут в одной
 * транзакции под общей блокировкой: параллельные запросы выполняются по очереди, поэтому лимит попыток
 * нельзя обойти «пачкой» одновременных запросов, а код не сгорит без выдачи доступа.
 */
export async function redeemCode(user: User, input: string) {
  if (await hasRosterAccess(user)) return { hasAccess: true };
  const code = normalizeCode(input);
  if (!code) throw new RosterError('BAD_FORMAT', 'Код — это 4 цифры');

  const outcome: RedeemOutcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_ROSTER_REDEEM}::int, 1)`);

    const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
    const fails = await tx
      .select({ userId: rosterCodeAttemptsTable.userId, at: rosterCodeAttemptsTable.createdAt })
      .from(rosterCodeAttemptsTable)
      .where(and(eq(rosterCodeAttemptsTable.success, false), gt(rosterCodeAttemptsTable.createdAt, since)));
    const userFails = fails.filter((f) => f.userId === user.id).map((f) => f.at);
    const verdict = checkAttempts(
      userFails,
      fails.map((f) => f.at),
    );
    if (!verdict.allowed) return { kind: 'limited', retryAfterMs: verdict.retryAfterMs, global: verdict.global };

    const active = await tx
      .select()
      .from(rosterAccessCodesTable)
      .where(and(isNull(rosterAccessCodesTable.usedAt), isNull(rosterAccessCodesTable.revokedAt), gt(rosterAccessCodesTable.expiresAt, new Date())));
    const match = findMatchingCode(active, env.jwtSecret, code);
    // «гасим» код условием used_at IS NULL — даже без блокировки сработал бы только один ввод
    const used = match
      ? await tx
          .update(rosterAccessCodesTable)
          .set({ usedAt: new Date(), usedBy: user.id })
          .where(and(eq(rosterAccessCodesTable.id, match.id), isNull(rosterAccessCodesTable.usedAt), isNull(rosterAccessCodesTable.revokedAt)))
          .returning({ id: rosterAccessCodesTable.id, createdBy: rosterAccessCodesTable.createdBy })
      : [];

    if (!used.length) {
      await tx.insert(rosterCodeAttemptsTable).values({ userId: user.id, success: false });
      return { kind: 'invalid', left: MAX_FAILED_PER_USER - userFails.length - 1 };
    }

    await tx.insert(rosterCodeAttemptsTable).values({ userId: user.id, success: true });
    await tx
      .insert(rosterAccessTable)
      .values({ userId: user.id, grantedBy: used[0]!.createdBy, codeId: used[0]!.id })
      .onConflictDoNothing();
    return { kind: 'ok' };
  });

  if (outcome.kind === 'limited') {
    // сработал общий лимит на всех — похоже на перебор: сообщаем владельцу (не чаще раза в час)
    if (outcome.global && Date.now() - globalAlertAt > ATTEMPT_WINDOW_MS) {
      globalAlertAt = Date.now();
      for (const id of rosterOwnerIds(getBuiltinAdminIds())) {
        void sendTelegramMessage(id, '⚠️ Roster Builder: слишком много неверных кодов за последний час — ввод кодов временно приостановлен. Возможно, кто-то подбирает код.');
      }
    }
    const min = Math.max(1, Math.ceil(outcome.retryAfterMs / 60000));
    throw new RosterError('TOO_MANY_ATTEMPTS', `Слишком много попыток. Попробуйте через ${min} мин.`, Math.ceil(outcome.retryAfterMs / 1000));
  }
  if (outcome.kind === 'invalid') {
    throw new RosterError(
      'INVALID_CODE',
      outcome.left > 0 ? `Неверный или устаревший код. Осталось попыток: ${outcome.left}` : 'Неверный код. Попытки закончились — попробуйте позже.',
    );
  }

  for (const id of rosterOwnerIds(getBuiltinAdminIds())) {
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

// Данные Wahapedia для Roster Builder — в ./data (без зависимостей от БД).
export { checkRosterData, readRosterData, rosterDataDir } from './data';
