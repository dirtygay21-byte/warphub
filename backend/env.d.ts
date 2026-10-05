declare namespace NodeJS {
  interface ProcessEnv {
    POSTGRES_URI: string;
    TELEGRAM_BOT_TOKEN: string;
    JWT_SECRET: string;
    BOT_INTERNAL_SECRET: string;
    INIT_DATA_MAX_AGE_SEC: string;
    PORT: string;
    PUBLIC_API_URL?: string;
    SWAGGER_USER?: string;
    SWAGGER_PASSWORD?: string;
    ADMIN_ID: string;
    ADMIN_TELEGRAM_ID: string;
    S3_PUBLIC_URL: string;
    S3_BUCKET: string;
    S3_ACCESS_KEY: string;
    S3_SECRET_KEY: string;
  }
}
