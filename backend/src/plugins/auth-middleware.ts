import { bearer } from '@elysiajs/bearer';
import { Elysia } from 'elysia';
import type { JwtPayload } from '../lib/telegram/types';
import { findUserById, type User } from '../modules/users/service';
import { jwtPlugin } from './jwt-plugin';

function isJwtPayload(value: unknown): value is JwtPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sub' in value &&
    typeof value.sub === 'string' &&
    'telegramId' in value &&
    typeof value.telegramId === 'number'
  );
}

export async function findUserFromBearer(
  bearer: string | undefined,
  jwt: { verify: (token: string) => Promise<unknown> },
): Promise<User | undefined> {
  if (!bearer) return undefined;

  const payload = await jwt.verify(bearer);
  if (!isJwtPayload(payload)) return undefined;

  const user = await findUserById(payload.sub);
  if (!user || user.telegramId !== payload.telegramId) return undefined;

  return user;
}

export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  .use(jwtPlugin)
  .use(bearer())
  .resolve({ as: 'scoped' }, async ({ bearer, jwt, status: statusFn }) => {
    const user = await findUserFromBearer(bearer, jwt);
    if (!user) {
      return statusFn(401, { error: 'Unauthorized' });
    }

    return { user };
  });
