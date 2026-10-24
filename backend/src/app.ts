import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { apiModels } from './lib/api-schemas';
import { apiModule } from './modules/api';
import { onlineGamesModule } from './modules/online-games';
import { adminModule } from './modules/admin';
import { authModule } from './modules/auth';
import { internalModule } from './modules/internal';
import { rosterAdminModule, rosterModule } from './modules/roster';
import { jwtPlugin } from './plugins/jwt-plugin';
import { protectedOpenapiPlugin } from './plugins/swagger-auth-plugin';
import { openapiPlugin } from './plugins/openapi-plugin';

export function createApp() {
  return new Elysia()
    .use(protectedOpenapiPlugin(openapiPlugin))
    .model(apiModels)
    .use(
      cors({
        origin: true,
        credentials: true,
        allowedHeaders: [
          'Authorization',
          'Content-Type',
          'X-Internal-Token',
          'X-Telegram-User-Id',
        ],
      }),
    )
    .use(jwtPlugin)
    .get('/health', () => ({ ok: true }), {
      detail: {
        tags: ['Health'],
        summary: 'Проверка состояния',
        description: 'Возвращает `{ ok: true }`, если сервер работает.',
      },
    })
    .use(authModule)
    .use(internalModule)
    .use(adminModule)
    .use(rosterAdminModule)
    .use(rosterModule)
    .use(onlineGamesModule)
    .use(apiModule);
}
