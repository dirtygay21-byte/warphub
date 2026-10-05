import { Elysia, status } from 'elysia';
import { apiModels } from '../../lib/api-schemas';
import { env } from '../../config/env';
import {
  InitDataValidationError,
  validateInitData,
} from '../../lib/telegram/validate-init-data';
import { jwtPlugin } from '../../plugins/jwt-plugin';
import { upsertUserFromTelegram } from '../users/service';

export const authModule = new Elysia({ prefix: '/auth', tags: ['Auth'] })
  .model(apiModels)
  .use(jwtPlugin)
  .post(
    '/telegram',
    async ({ body, jwt }) => {
      let validated;
      try {
        validated = validateInitData(
          body.initData,
          env.telegramBotToken,
          env.initDataMaxAgeSec,
        );
      } catch (error) {
        if (error instanceof InitDataValidationError) {
          return status(401, { error: error.message });
        }
        throw error;
      }

      const user = await upsertUserFromTelegram(validated.user);
      const token = await jwt.sign({
        sub: user.id,
        telegramId: user.telegramId,
      });
      return {
        token,
        user,
      };
    },
    {
      body: apiModels.AuthTelegramBody,
      detail: {
        summary: 'Авторизация через Telegram',
        description:
          'Проверяет initData из Telegram Web App и возвращает JWT-токен.',
      },
    },
  );
