import { Elysia, status, t } from 'elysia';
import { authMiddleware } from '../../plugins/auth-middleware';
import { adminMiddleware } from '../../plugins/admin-middleware';
import { hasRosterAccess } from '../roster/service';
import { findPlayers } from '../supporters/service';
import { enqueueDominatusExport, getDominatusExport } from './export';
import { getDominatusGitExport, saveDominatusBattleToGit } from './git-export';
import {
  claimCard,
  createCampaign,
  DominatusError,
  finishCampaign,
  getCampaignView,
  previewPhaseEnd,
  recordBattle,
  removePlayer,
  resolvePhase,
  setPlayer,
  startPhase,
  type BattleInput,
} from './service';

const CODES = { NO_CAMPAIGN: 404, CAMPAIGN_EXISTS: 409, NOT_FOUND: 404, BAD_INPUT: 400, FORBIDDEN: 403, CONFLICT: 409, NO_DATA: 503 } as const;

async function handle<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof DominatusError)) throw error;
    return status(CODES[error.code], { error: error.message, code: error.code });
  }
}

async function guard<T>(user: Parameters<typeof hasRosterAccess>[0], fn: () => Promise<T>) {
  if (!(await hasRosterAccess(user))) return status(403, { error: 'Нет доступа к WarpBuilder' });
  return handle(fn);
}

/** Кампания Dominatus для игроков (DM2): просмотр, запись битвы, выбор оставленной карты. Только с доступом к WarpBuilder. */
export const dominatusModule = new Elysia({ prefix: '/roster/dominatus', tags: ['Roster Builder'] })
  .use(authMiddleware)
  .guard({ detail: { security: [{ bearerAuth: [] }] } })
  .get('/campaign', ({ user }) => guard(user, () => getCampaignView(user.id)), { detail: { summary: 'Dominatus: активная кампания' } })
  .get('/git-export/:gameKey', ({ user, params }) => guard(user, () => getDominatusGitExport(user.id, params.gameKey)), {
    params: t.Object({ gameKey: t.String({ minLength: 4, maxLength: 80 }) }),
    detail: { summary: 'Dominatus: файл битвы в GitHub, если он уже сохранён' },
  })
  .post('/git-export', ({ user, body }) => guard(user, () => saveDominatusBattleToGit(user.id, body.gameKey)), {
    body: t.Object({ gameKey: t.String({ minLength: 4, maxLength: 80 }) }),
    detail: { summary: 'Dominatus: сохранить полный JSON битвы в отдельную GitHub-ветку' },
  })
  .get('/exports/:gameKey', ({ user, params }) => guard(user, () => getDominatusExport(user.id, params.gameKey)), {
    params: t.Object({ gameKey: t.String({ minLength: 4, maxLength: 80 }) }),
    detail: { summary: 'Dominatus: статус загрузки битвы на сайт' },
  })
  .post('/exports', ({ user, body }) => guard(user, () => enqueueDominatusExport(user.id, body.gameKey)), {
    body: t.Object({ gameKey: t.String({ minLength: 4, maxLength: 80 }) }),
    detail: { summary: 'Dominatus: загрузить битву на сайт' },
  })
  .post('/exports/:gameKey/retry', ({ user, params }) => guard(user, () => enqueueDominatusExport(user.id, params.gameKey)), {
    params: t.Object({ gameKey: t.String({ minLength: 4, maxLength: 80 }) }),
    detail: { summary: 'Dominatus: повторить загрузку битвы на сайт' },
  })
  .post('/battles', ({ user, body }) => guard(user, () => recordBattle(user.id, body as BattleInput)), {
    body: t.Unknown(),
    detail: { summary: 'Dominatus: записать битву открытой фазы (участник битвы)' },
  })
  .post('/cards/:id/claim', ({ user, params, body }) => guard(user, () => claimCard(user.id, params.id, body.name)), {
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({ name: t.String({ maxLength: 80 }) }),
    detail: { summary: 'Dominatus: какую карту игрок оставил' },
  });

/** Dominatus для Warmaster (администраторы): кампания, игроки, фазы. */
export const dominatusAdminModule = new Elysia({ prefix: '/admin/dominatus', tags: ['Admin'] })
  .use(adminMiddleware)
  .get('/campaign', () => handle(() => getCampaignView(null)), { detail: { summary: 'Dominatus: кампания (Warmaster)' } })
  .post('/campaign', ({ body, user }) => handle(() => createCampaign(body.name, Number(user.telegramId))), {
    body: t.Object({ name: t.String() }),
    detail: { summary: 'Dominatus: создать кампанию' },
  })
  .post('/campaign/finish', ({ body }) => handle(() => finishCampaign(body.winnerAlliance)), {
    body: t.Object({ winnerAlliance: t.Optional(t.Nullable(t.String())) }),
    detail: { summary: 'Dominatus: завершить кампанию' },
  })
  .get('/players/search', ({ query }) => findPlayers(query.q ?? ''), {
    query: t.Object({ q: t.Optional(t.String({ description: '@username или Telegram ID' })) }),
    detail: { summary: 'Dominatus: поиск игрока' },
  })
  .put('/players/:userId', ({ params, body }) => handle(() => setPlayer(params.userId, body.alliance)), {
    params: t.Object({ userId: t.String({ format: 'uuid' }) }),
    body: t.Object({ alliance: t.String() }),
    detail: { summary: 'Dominatus: добавить игрока или сменить альянс' },
  })
  .delete('/players/:id', ({ params }) => handle(() => removePlayer(params.id)), {
    params: t.Object({ id: t.Numeric() }),
    detail: { summary: 'Dominatus: убрать игрока без битв' },
  })
  .post('/phases', ({ body }) => handle(() => startPhase(body.phase, body.locationId, body.roll ?? null)), {
    body: t.Object({ phase: t.Integer(), locationId: t.String(), roll: t.Optional(t.Nullable(t.Integer())) }),
    detail: { summary: 'Dominatus: начать фазу (локация по D6 или выбор Warmaster)' },
  })
  .get('/phases/end', ({ query }) => handle(() => previewPhaseEnd(query.pick ?? null)), {
    query: t.Object({ pick: t.Optional(t.String()) }),
    detail: { summary: 'Dominatus: итог текущей фазы без записи' },
  })
  .post('/phases/end', ({ body }) => handle(() => resolvePhase(body.warmasterPick ?? null)), {
    body: t.Object({ warmasterPick: t.Optional(t.Nullable(t.String())) }),
    detail: { summary: 'Dominatus: завершить текущую фазу' },
  });
