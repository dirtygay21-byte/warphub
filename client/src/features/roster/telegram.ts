// Тонкая обёртка над Telegram WebApp API (работает и в обычном браузере).

interface CloudStorage {
  setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
  getItem(key: string, cb: (err: string | null, value?: string) => void): void;
  getItems(keys: string[], cb: (err: string | null, values?: Record<string, string>) => void): void;
  removeItems(keys: string[], cb?: (err: string | null, ok?: boolean) => void): void;
  getKeys(cb: (err: string | null, keys?: string[]) => void): void;
}
interface TgWebApp {
  version: string;
  initData: string;
  initDataUnsafe: { user?: { id: number; username?: string; first_name?: string } };
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  showConfirm?(msg: string, cb: (ok: boolean) => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void; notificationOccurred(t: 'error' | 'success' | 'warning'): void; selectionChanged(): void };
  CloudStorage?: CloudStorage;
  disableVerticalSwipes?(): void;
}

// Типы Telegram WebApp в клиенте уже объявлены (@types/telegram-web-app) — берём объект через узкий интерфейс выше.
const webApp = (): TgWebApp | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return w?.initData ? w : undefined;
};

export const tg: TgWebApp | undefined = webApp();

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred('light'),
  select: () => tg?.HapticFeedback?.selectionChanged(),
  ok: () => tg?.HapticFeedback?.notificationOccurred('success'),
  error: () => tg?.HapticFeedback?.notificationOccurred('error'),
};

export function cloudStorage(): CloudStorage | undefined {
  if (!tg?.CloudStorage) return undefined;
  try {
    return tg.isVersionAtLeast('6.9') ? tg.CloudStorage : undefined;
  } catch {
    return undefined;
  }
}

export function confirmAsk(message: string): Promise<boolean> {
  if (tg?.showConfirm && tg.isVersionAtLeast('6.2')) return new Promise((res) => tg!.showConfirm!(message, res));
  return Promise.resolve(window.confirm(message));
}

export function shareText(text: string) {
  const url = 'https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + encodeURIComponent(text.slice(0, 3500));
  if (tg) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

export function openExternal(url: string) {
  if (tg) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}
