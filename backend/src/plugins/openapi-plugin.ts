import { openapi } from '@elysiajs/openapi';
import { env } from '../config/env';

export const openapiPlugin = openapi({
  path: '/swagger',
  provider: 'swagger-ui',
  embedSpec: true,
  documentation: {
    servers: [
      {
        url: env.publicApiUrl,
        description: 'API',
      },
      {
        url: env.localApiUrl,
        description: 'Internal API',
      },
    ],
    info: {
      title: 'WarpHub API',
      version: '1.0.50',
      description: [
        'API бронирования клуба WarpHub. Авторизация через Telegram Web App initData.',
        '',
        '### Тестирование с заголовками',
        '1. Вызовите `POST /auth/telegram` и скопируйте `token` из ответа.',
        '2. Нажмите **Authorize** (вверху справа) → вставьте токен **без** префикса `Bearer`.',
        '3. Swagger автоматически добавит заголовок `Authorization: Bearer <token>` ко всем защищённым запросам.',
        '',
        'Токен сохраняется между запросами и перезагрузкой страницы (`persistAuthorization`).',
        '',
        '### Доступ к документации',
        'Если задан `SWAGGER_PASSWORD`, страница `/swagger` защищена HTTP Basic Auth (логин: `SWAGGER_USER`, по умолчанию `admin`).',
      ].join('\n'),
    },
    tags: [
      { name: 'Health', description: 'Состояние сервиса' },
      { name: 'Auth', description: 'Авторизация' },
      { name: 'Users', description: 'Профиль пользователя' },
      { name: 'Booking', description: 'Доступность и бронирование' },
      { name: 'Admin', description: 'Администрирование (только для админа)' },
      { name: 'Events', description: 'Ивенты клуба' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT-токен из ответа POST /auth/telegram',
        },
      },
    },
  },
  exclude: {
    paths: ['/internal/**'],
  },
  swagger: {
    persistAuthorization: true,
    tryItOutEnabled: true,
    displayRequestDuration: true,
  },
});
