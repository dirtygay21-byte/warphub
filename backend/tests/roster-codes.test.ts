import { describe, expect, test } from 'bun:test';
import {
  ATTEMPT_WINDOW_MS,
  MAX_FAILED_GLOBAL,
  MAX_FAILED_PER_USER,
  checkAttempts,
  findMatchingCode,
  generateCode,
  hashCode,
  normalizeCode,
  rosterOwnerIds,
} from '../src/modules/roster/codes';

const SECRET = 'test-secret';
const now = new Date('2026-10-06T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('коды доступа к Roster Builder', () => {
  test('код — 4 цифры с ведущими нулями', () => {
    expect(generateCode(() => false, () => 7)).toBe('0007');
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{4}$/);
  });

  test('не выдаёт код, совпадающий с активным', () => {
    const seq = [1234, 1234, 5678];
    const code = generateCode((c) => c === '1234', () => seq.shift()!);
    expect(code).toBe('5678');
  });

  test('ввод нормализуется: пробелы и дефисы игнорируются', () => {
    expect(normalizeCode(' 12-34 ')).toBe('1234');
    expect(normalizeCode('123')).toBeNull();
    expect(normalizeCode('12345')).toBeNull();
    expect(normalizeCode('abcd')).toBeNull();
  });

  test('в базе хранится не код, а HMAC; разные секреты дают разные хэши', () => {
    const h = hashCode(SECRET, '1234');
    expect(h).not.toContain('1234');
    expect(h).toHaveLength(64);
    expect(hashCode('other', '1234')).not.toBe(h);
  });

  test('находит только активный код: не использованный, не отозванный, не просроченный', () => {
    const row = (id: number, code: string, patch: object = {}) => ({
      id,
      codeHash: hashCode(SECRET, code),
      expiresAt: new Date(now.getTime() + 3600_000),
      usedAt: null as Date | null,
      revokedAt: null as Date | null,
      ...patch,
    });
    const rows = [
      row(1, '1111', { usedAt: minutesAgo(5) }),
      row(2, '2222', { revokedAt: minutesAgo(5) }),
      row(3, '3333', { expiresAt: minutesAgo(1) }),
      row(4, '4444'),
    ];
    expect(findMatchingCode(rows, SECRET, '1111', now)).toBeUndefined();
    expect(findMatchingCode(rows, SECRET, '2222', now)).toBeUndefined();
    expect(findMatchingCode(rows, SECRET, '3333', now)).toBeUndefined();
    expect(findMatchingCode(rows, SECRET, '4444', now)?.id).toBe(4);
    expect(findMatchingCode(rows, SECRET, '5555', now)).toBeUndefined();
  });

  test('ограничение перебора: 5 неудач в час на человека', () => {
    const fails = Array.from({ length: MAX_FAILED_PER_USER - 1 }, (_, i) => minutesAgo(10 + i));
    expect(checkAttempts(fails, 0, now).allowed).toBe(true);
    const blocked = checkAttempts([...fails, minutesAgo(1)], 0, now);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterMs).toBeGreaterThan(0);
    // старые попытки (больше часа назад) не считаются
    const old = Array.from({ length: 10 }, () => new Date(now.getTime() - ATTEMPT_WINDOW_MS - 1000));
    expect(checkAttempts(old, 0, now).allowed).toBe(true);
  });

  test('общий лимит неудач на всех пользователей', () => {
    expect(checkAttempts([], MAX_FAILED_GLOBAL - 1, now).allowed).toBe(true);
    expect(checkAttempts([], MAX_FAILED_GLOBAL, now).allowed).toBe(false);
  });

  test('владельцы кодов: ROSTER_ADMIN_TELEGRAM_IDS или все администраторы', () => {
    delete process.env.ROSTER_ADMIN_TELEGRAM_IDS;
    expect(rosterOwnerIds(['1', '2'])).toEqual(['1', '2']);
    process.env.ROSTER_ADMIN_TELEGRAM_IDS = '388930001, 42';
    expect(rosterOwnerIds(['1', '2'])).toEqual(['388930001', '42']);
    delete process.env.ROSTER_ADMIN_TELEGRAM_IDS;
  });
});
