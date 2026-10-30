/**
 * Открыто вне Telegram (U6): в боевой сборке без initData войти нечем. В разработке (не production) — считаем,
 * что вход есть, как и useAuthStore.authChecked.
 */
export const isOutsideTelegram = (): boolean =>
  import.meta.env.VITE_EXECUTION_CONFIG === "production" && typeof window !== "undefined" && !window.Telegram?.WebApp?.initData;
