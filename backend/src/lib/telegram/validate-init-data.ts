import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TelegramWebAppUser, ValidatedInitData } from './types';

export class InitDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitDataValidationError';
  }
}

function secureCompareHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSec: number,
): ValidatedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');

  if (!hash) {
    throw new InitDataValidationError('Missing initData hash');
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const calculatedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!secureCompareHex(calculatedHash, hash)) {
    throw new InitDataValidationError('Invalid initData signature');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) {
    throw new InitDataValidationError('Missing auth_date');
  }

  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec < 0 || ageSec > maxAgeSec) {
    throw new InitDataValidationError('initData expired');
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    throw new InitDataValidationError('Missing user in initData');
  }

  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw new InitDataValidationError('Invalid user payload in initData');
  }

  if (!Number.isFinite(user.id) || !user.first_name) {
    throw new InitDataValidationError('Invalid user payload in initData');
  }

  return { authDate, user };
}
