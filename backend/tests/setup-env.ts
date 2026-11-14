/**
 * Заглушки окружения для юнит-тестов (13.11.2026). Часть тестов правил импортирует модули, которым нужен config/env;
 * раньше значения выставлял только partners-rules.test.ts, и результат зависел от порядка файлов: если другой тест
 * импортировал config/env первым, падали три файла («Missing required environment variable»), а шаг e2e не запускался.
 * Значения — только если переменная не задана; сквозные тесты включаются отдельно (WARPHUB_E2E=1), к базе тут никто не ходит.
 */
process.env.POSTGRES_URI ??= 'postgres://postgres:postgres@127.0.0.1:5432/wh_e2e';
process.env.TELEGRAM_BOT_TOKEN ??= '123456:TEST_TOKEN_FOR_LOCAL_RUN';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.BOT_INTERNAL_SECRET ??= 'test-internal-secret';
process.env.S3_ACCESS_KEY ??= 'test';
process.env.S3_SECRET_KEY ??= 'test';
process.env.S3_BUCKET ??= 'test';
process.env.S3_PUBLIC_URL ??= 'http://127.0.0.1/test';
process.env.TELEGRAM_NOTIFICATIONS ??= 'off';
process.env.NOTIFICATION_LOG ??= 'off';
