/**
 * Отклик Telegram (вибрация) для микроанимаций дизайн-системы (D2, 30.10.2026). Вне Telegram — ничего.
 * WarpBuilder использует свой features/roster/telegram.ts → haptic с теми же вызовами.
 */
const fb = () => (typeof window !== "undefined" ? window.Telegram?.WebApp?.HapticFeedback : undefined);

export const haptic = {
  tap: () => fb()?.impactOccurred("light"),
  select: () => fb()?.selectionChanged(),
  ok: () => fb()?.notificationOccurred("success"),
  error: () => fb()?.notificationOccurred("error"),
};
