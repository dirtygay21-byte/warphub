function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  const commentIndex = trimmed.indexOf('#');
  const raw =
    commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex).trim();

  return raw || undefined;
}

export const env = {
  postgresUri: requireEnv(process.env.POSTGRES_URI, 'POSTGRES_URI'),
  telegramBotToken: requireEnv(
    process.env.TELEGRAM_BOT_TOKEN,
    'TELEGRAM_BOT_TOKEN',
  ),
  jwtSecret: requireEnv(process.env.JWT_SECRET, 'JWT_SECRET'),
  botInternalSecret: requireEnv(
    process.env.BOT_INTERNAL_SECRET,
    'BOT_INTERNAL_SECRET',
  ),
  initDataMaxAgeSec: Number(process.env.INIT_DATA_MAX_AGE_SEC ?? 86400),
  port: Number(process.env.PORT ?? 4000),
  /** Базовый URL API для Swagger (например https://warphub.ru/api) */
  publicApiUrl:
    optionalEnv(process.env.PUBLIC_API_URL) ??
    `http://127.0.0.1:${Number(process.env.PORT ?? 4000)}/api`,
  /** Если задан — /swagger защищён HTTP Basic Auth */
  swaggerUser: optionalEnv(process.env.SWAGGER_USER) ?? 'admin',
  swaggerPassword: optionalEnv(process.env.SWAGGER_PASSWORD),
  localApiUrl:
    optionalEnv(process.env.LOCAL_API_URL) ?? 'http://localhost:4000',
  s3AccessKey: requireEnv(process.env.S3_ACCESS_KEY, 'S3_ACCESS_KEY'),
  s3SecretKey: requireEnv(process.env.S3_SECRET_KEY, 'S3_SECRET_KEY'),
  s3Bucket: requireEnv(process.env.S3_BUCKET, 'S3_BUCKET'),
  /** Публичный базовый URL файлов, напр. https://s3.warphub.ru/warphub */
  s3PublicUrl: requireEnv(process.env.S3_PUBLIC_URL, 'S3_PUBLIC_URL'),
} as const;
