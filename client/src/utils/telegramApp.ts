/**
 * Возможности Telegram Mini Apps (Bot API 8.0+), которыми пользуется WarpHub (15.11.2026):
 * скачать файл (календарь), значок на главном экране телефона, полноэкранный режим.
 * Вне Telegram или в старом клиенте функции отсутствуют — тогда открываем ссылку или ничего не делаем.
 */
type HomeScreenStatus = "unsupported" | "unknown" | "added" | "missed";

type WebAppExtras = {
  isVersionAtLeast?: (version: string) => boolean;
  downloadFile?: (params: { url: string; file_name: string }, callback?: (accepted: boolean) => void) => void;
  openLink?: (url: string) => void;
  addToHomeScreen?: () => void;
  checkHomeScreenStatus?: (callback: (status: HomeScreenStatus) => void) => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  isFullscreen?: boolean;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
};

const webApp = (): WebAppExtras | null =>
  (typeof window !== "undefined" ? ((window as unknown as { Telegram?: { WebApp?: WebAppExtras } }).Telegram?.WebApp ?? null) : null);

const atLeast8 = () => !!webApp()?.isVersionAtLeast?.("8.0");

/** Скачать файл через Telegram (8.0+), иначе — открыть ссылку. */
export function downloadFile(url: string, fileName: string) {
  const app = webApp();
  if (app?.downloadFile && atLeast8()) {
    app.downloadFile({ url, file_name: fileName });
    return;
  }
  if (app?.openLink) app.openLink(url);
  else window.open(url, "_blank", "noopener");
}

/** Статус значка на главном экране: колбэк получает статус, или "unsupported". */
export function checkHomeScreen(callback: (status: HomeScreenStatus) => void) {
  const app = webApp();
  if (!app?.checkHomeScreenStatus || !atLeast8()) {
    callback("unsupported");
    return;
  }
  app.checkHomeScreenStatus(callback);
}

export function addToHomeScreen() {
  const app = webApp();
  if (app?.addToHomeScreen && atLeast8()) app.addToHomeScreen();
}

export const canFullscreen = () => !!webApp()?.requestFullscreen && atLeast8();
export const isFullscreen = () => !!webApp()?.isFullscreen;

export function toggleFullscreen() {
  const app = webApp();
  if (!app || !canFullscreen()) return;
  if (app.isFullscreen) app.exitFullscreen?.();
  else app.requestFullscreen?.();
}

/** Подписка на смену полноэкранного режима; возвращает отписку. */
export function onFullscreenChanged(handler: () => void): () => void {
  const app = webApp();
  app?.onEvent?.("fullscreenChanged", handler);
  return () => app?.offEvent?.("fullscreenChanged", handler);
}
