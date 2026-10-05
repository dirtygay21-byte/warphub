import { Elysia, status, t } from 'elysia';
import { env } from '../../config/env';
import { findUserByTelegramId, upsertUserFromTelegram } from '../users/service';

function toPublicUser(user: Awaited<ReturnType<typeof findUserByTelegramId>>) {
  if (!user) return undefined;

  return {
    id: user.id,
    telegramId: user.telegramId,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    photoUrl: user.photoUrl,
  };
}

export const internalModule = new Elysia({
  prefix: '/internal',
  detail: { hide: true },
})
  .onBeforeHandle(({ request }) => {
    const token = request.headers.get('x-internal-token');
    if (token !== env.botInternalSecret) {
      return status(403, { error: 'Forbidden' });
    }
  })
  .post(
    '/users/sync',
    async ({ body }) => {
      try {
        const user = await upsertUserFromTelegram(body);

        return toPublicUser(user)!;
      } catch (error) {
        console.log(error);
        return status(500, { error: 'Internal server error' });
      }
    },
    {
      body: t.Object({
        id: t.Number(),
        first_name: t.String({ minLength: 1 }),
        last_name: t.Optional(t.String()),
        username: t.Optional(t.String()),
        photo_url: t.Optional(t.String()),
      }),
    }
  )
  .get('/me', async ({ request }) => {
    const telegramUserId = request.headers.get('x-telegram-user-id');
    if (!telegramUserId) {
      return status(400, { error: 'Missing X-Telegram-User-Id header' });
    }

    const telegramId = Number(telegramUserId);
    if (!Number.isFinite(telegramId)) {
      return status(400, { error: 'Invalid X-Telegram-User-Id header' });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return status(404, { error: 'User not found' });
    }

    return toPublicUser(user)!;
  });
