import { Elysia, status, t } from 'elysia';
import { authMiddleware } from '../../plugins/auth-middleware';
import { hasRosterAccess } from '../roster/service';
import { appendOnlineEvent, createOnlineGame, getOnlineEvents, joinOnlineGame, listOnlineGames, OnlineGameError } from './service';

const CODES = { NOT_FOUND: 404, FORBIDDEN: 403, FULL_GAME: 409, BAD_CODE: 400, CONFLICT: 409, BAD_EVENT: 400, SEAT: 403, TOO_LARGE: 413, FULL: 409 } as const;

async function guard<T>(user: Parameters<typeof hasRosterAccess>[0], fn: () => Promise<T>) {
  if (!(await hasRosterAccess(user))) return status(403, { error: 'Нет доступа к WarpBuilder' });
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof OnlineGameError)) throw error;
    return status(CODES[error.code], { error: error.message, code: error.code, ...(error.lastSeq !== undefined ? { lastSeq: error.lastSeq } : {}) });
  }
}

/** «Начать игру» на двух телефонах (T1): игра, вход по коду, журнал событий. Только для доступа к Roster Builder. */
export const onlineGamesModule = new Elysia({ prefix: '/roster/games', tags: ['Roster Builder'] })
  .use(authMiddleware)
  .guard({ detail: { security: [{ bearerAuth: [] }] } })
  .get('/', ({ user }) => guard(user, () => listOnlineGames(user)), { detail: { summary: 'Мои игры на двух телефонах' } })
  .post('/', ({ user }) => guard(user, () => createOnlineGame(user)), { detail: { summary: 'Создать игру на двух телефонах (вы — игрок 1)' } })
  .post('/join', ({ user, body }) => guard(user, () => joinOnlineGame(user, body.code)), {
    body: t.Object({ code: t.String({ maxLength: 16 }) }),
    detail: { summary: 'Войти в игру по коду (игрок 2)' },
  })
  .get('/:id/events', ({ user, params, query }) => guard(user, () => getOnlineEvents(user, params.id, Number(query.after ?? 0) || 0)), {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    query: t.Object({ after: t.Optional(t.String({ maxLength: 10 })) }),
    detail: { summary: 'События игры после номера after' },
  })
  .post('/:id/events', ({ user, params, body }) => guard(user, () => appendOnlineEvent(user, params.id, body.expectedSeq, body.event)), {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    body: t.Object({ expectedSeq: t.Integer({ minimum: 0 }), event: t.Any() }),
    detail: { summary: 'Добавить событие (expectedSeq — номер последнего известного события; иначе 409 и lastSeq)' },
  });
