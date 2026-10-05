/**
 * Коды доступа к Roster Builder: чистые функции без базы данных (тестируются в tests/roster-codes.test.ts).
 *
 * Правила:
 *  - код — 4 цифры, генерируется криптографически случайно;
 *  - в базе хранится только HMAC-SHA256(JWT_SECRET, код), сам код знает только администратор;
 *  - код одноразовый и действует ROSTER_CODE_TTL_HOURS часов (по умолчанию 24);
 *  - перебор ограничен: не больше MAX_FAILED_PER_USER неудачных попыток в час на человека
 *    и не больше MAX_FAILED_GLOBAL в час на всех вместе.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const CODE_LENGTH = 4;
export const MAX_FAILED_PER_USER = 5;
export const MAX_FAILED_GLOBAL = 30;
export const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

export function codeTtlMs(): number {
  const hours = Number(process.env.ROSTER_CODE_TTL_HOURS ?? 24);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
}

/** Случайный код из 4 цифр (с ведущими нулями), не совпадающий с уже активными. */
export function generateCode(isTaken: (code: string) => boolean = () => false, rand: (max: number) => number = randomInt): string {
  for (let i = 0; i < 50; i++) {
    const code = String(rand(10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
    if (!isTaken(code)) return code;
  }
  throw new Error('Не удалось подобрать свободный код — слишком много активных кодов');
}

export function normalizeCode(input: string): string | null {
  const digits = String(input ?? '').replace(/\D/g, '');
  return digits.length === CODE_LENGTH ? digits : null;
}

export function hashCode(secret: string, code: string): string {
  return createHmac('sha256', secret).update(`roster-code:${code}`).digest('hex');
}

export function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export type AttemptVerdict = { allowed: true } | { allowed: false; retryAfterMs: number };

/** Можно ли сейчас пробовать код, если известны времена недавних неудачных попыток. */
export function checkAttempts(userFailures: Date[], globalFailures: number, now: Date = new Date()): AttemptVerdict {
  const since = now.getTime() - ATTEMPT_WINDOW_MS;
  const recent = userFailures.filter((d) => d.getTime() > since).sort((a, b) => a.getTime() - b.getTime());
  if (recent.length >= MAX_FAILED_PER_USER) {
    return { allowed: false, retryAfterMs: recent[recent.length - MAX_FAILED_PER_USER]!.getTime() + ATTEMPT_WINDOW_MS - now.getTime() };
  }
  if (globalFailures >= MAX_FAILED_GLOBAL) return { allowed: false, retryAfterMs: 10 * 60 * 1000 };
  return { allowed: true };
}

export type CodeRow = { id: number; codeHash: string; expiresAt: Date; usedAt: Date | null; revokedAt: Date | null };

export function isActive(row: CodeRow, now: Date = new Date()): boolean {
  return !row.usedAt && !row.revokedAt && row.expiresAt.getTime() > now.getTime();
}

/** Найти активный код, совпадающий с введённым. */
export function findMatchingCode<T extends CodeRow>(rows: T[], secret: string, code: string, now: Date = new Date()): T | undefined {
  const h = hashCode(secret, code);
  return rows.find((r) => isActive(r, now) && hashesEqual(r.codeHash, h));
}

/**
 * Кто может создавать коды: ROSTER_ADMIN_TELEGRAM_IDS (через запятую), иначе — все администраторы.
 */
export function rosterOwnerIds(adminIds: string[]): string[] {
  const raw = process.env.ROSTER_ADMIN_TELEGRAM_IDS;
  const list = (raw ?? '')
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^\d+$/.test(x));
  return list.length ? list : adminIds;
}
