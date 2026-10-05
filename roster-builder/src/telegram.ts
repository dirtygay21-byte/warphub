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

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg: TgWebApp | undefined = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor?.('#111110');
    tg.setBackgroundColor?.('#111110');
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.();
  } catch {
    /* старые клиенты */
  }
}

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

/**
 * Мягкое ограничение доступа: VITE_ALLOWED_USERNAMES="KorenevEgor,другой".
 * Это не защита (клиентский код), а защита от случайных посетителей.
 * Настоящую закрывайте на уровне Nginx (basic auth / allow-список) или проверкой initData на бэкенде.
 */
export function accessAllowed(): boolean {
  const list = (import.meta.env.VITE_ALLOWED_USERNAMES as string | undefined)?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list?.length) return true;
  const name = tg?.initDataUnsafe.user?.username?.toLowerCase();
  return !!name && list.includes(name);
}
