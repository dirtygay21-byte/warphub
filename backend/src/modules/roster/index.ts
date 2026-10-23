import { Elysia, status, t } from 'elysia';
import { isAdminUser } from '../../config/admin';
import { adminMiddleware } from '../../plugins/admin-middleware';
import { authMiddleware } from '../../plugins/auth-middleware';
import {
  RosterError,
  checkRosterData,
  cleanupAttempts,
  createAccessCode,
  hasRosterAccess,
  isRosterOwner,
  listAccess,
  listCodes,
  readRosterData,
  redeemCode,
  revokeAccess,
  revokeCode,
} from './service';

function mapRosterError(error: RosterError) {
  switch (error.code) {
    case 'BAD_FORMAT':
    case 'INVALID_CODE':
      return status(400, { error: error.message });
    case 'TOO_MANY_ATTEMPTS':
      return status(429, { error: error.message, retryAfterSec: error.retryAfterSec });
    case 'NOT_FOUND':
      return status(404, { error: error.message });
    case 'FORBIDDEN':
      return status(403, { error: error.message });
    default:
      error.code satisfies never;
      return status(500, { error: 'Unexpected roster error' });
  }
}

checkRosterData();

async function guard<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof RosterError) return mapRosterError(error);
    throw error;
  }
}

/** Roster Builder для пользователей: проверка доступа, ввод кода, данные. */
export const rosterModule = new Elysia({ prefix: '/roster', tags: ['Roster Builder'] })
  .use(authMiddleware)
  .guard({ detail: { security: [{ bearerAuth: [] }] } })
  .get('/access', async ({ user }) => ({ hasAccess: await hasRosterAccess(user), isOwner: isAdminUser(user) && isRosterOwner(user) }), {
    detail: { summary: 'Есть ли доступ к Roster Builder' },
  })
  .post('/redeem', ({ user, body }) => guard(() => redeemCode(user, body.code)), {
    body: t.Object({ code: t.String({ maxLength: 16 }) }),
    detail: { summary: 'Ввести код доступа (4 цифры)' },
  })
  .get(
    '/data/:name',
    async ({ user, params, set }) => {
      if (!(await hasRosterAccess(user))) return status(403, { error: 'Нет доступа к Roster Builder' });
      const file = readRosterData(params.name.replace(/\.json$/, ''));
      if (!file) return status(404, { error: 'Нет данных' });
      set.headers['content-type'] = 'application/json; charset=utf-8';
      set.headers['content-encoding'] = 'gzip';
      set.headers['cache-control'] = 'private, max-age=3600';
      return file.body;
    },
    { detail: { summary: 'Данные Roster Builder (index, battlefield, missions или код фракции)', hide: true } },
  )
  .get(
    '/data/aos/:name',
    async ({ user, params, set }) => {
      if (!(await hasRosterAccess(user))) return status(403, { error: 'Нет доступа к Roster Builder' });
      const file = readRosterData(params.name.replace(/\.json$/, ''), 'aos');
      if (!file) return status(404, { error: 'Нет данных' });
      set.headers['content-type'] = 'application/json; charset=utf-8';
      set.headers['content-encoding'] = 'gzip';
      set.headers['cache-control'] = 'private, max-age=3600';
      return file.body;
    },
    { detail: { summary: 'Данные Roster Builder: Age of Sigmar (index или код фракции)', hide: true } },
  );

/** Управление доступом — только администраторы. */
export const rosterAdminModule = new Elysia({ prefix: '/admin/roster', tags: ['Admin'] })
  .use(adminMiddleware)
  .guard({ detail: { security: [{ bearerAuth: [] }] } })
  .post(
    '/codes',
    ({ user }) =>
      guard(async () => {
        void cleanupAttempts().catch(() => undefined);
        return createAccessCode(user);
      }),
    { detail: { summary: 'Создать одноразовый код и отправить его в Telegram' } },
  )
  .get('/codes', () => listCodes(), { detail: { summary: 'Последние коды' } })
  .delete('/codes/:id', ({ params }) => guard(async () => (await revokeCode(Number(params.id)), { ok: true })), {
    params: t.Object({ id: t.Numeric() }),
    detail: { summary: 'Отозвать неиспользованный код' },
  })
  .get('/access', () => listAccess(), { detail: { summary: 'Кому открыт Roster Builder' } })
  .delete('/access/:userId', ({ params }) => guard(async () => (await revokeAccess(params.userId), { ok: true })), {
    params: t.Object({ userId: t.String({ format: 'uuid' }) }),
    detail: { summary: 'Закрыть доступ пользователю' },
  });
