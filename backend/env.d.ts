declare namespace NodeJS {
  interface ProcessEnv {
    POSTGRES_URI: string;
    TELEGRAM_BOT_TOKEN: string;
    /** обход блокировки api.telegram.org: свой обратный прокси (https://…) */
    TELEGRAM_API_BASE?: string;
    /** обход блокировки: HTTP(S)-прокси за границей (http://user:pass@host:port) */
    TELEGRAM_PROXY?: string;
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
    /** Roster Builder: кто создаёт коды (Telegram ID через запятую; по умолчанию — все администраторы) */
    ROSTER_ADMIN_TELEGRAM_IDS?: string;
    /** Roster Builder: срок жизни кода в часах (по умолчанию 24) */
    ROSTER_CODE_TTL_HOURS?: string;
    /** Roster Builder: папка с данными Wahapedia (по умолчанию ./roster-data) */
    ROSTER_DATA_DIR?: string;
  }
}

/** gifenc (анимированные картинки уведомлений) поставляется без типов — используемая часть. */
declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: number[][]; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number; dispose?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][]): Uint8Array;
}
