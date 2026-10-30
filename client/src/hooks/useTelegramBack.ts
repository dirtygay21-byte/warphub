import { useEffect, useRef } from "react";

/**
 * Кнопка «Назад» Telegram (UI-аудит U1, 30.10.2026): пока onBack задан, Telegram показывает «Назад» вместо «✕»
 * и вызывает onBack; null — кнопка скрыта (верхний уровень, где «✕» закрывает приложение).
 * Вне Telegram ничего не делает. WarpBuilder управляет кнопкой сам (features/roster/ui/App.tsx).
 */
export function useTelegramBack(onBack: (() => void) | null) {
  const handler = useRef(onBack);
  useEffect(() => {
    handler.current = onBack;
  });
  const active = onBack !== null;
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!active || !webApp?.initData) return;
    const onClick = () => handler.current?.();
    webApp.BackButton.onClick(onClick);
    webApp.BackButton.show();
    return () => {
      webApp.BackButton.offClick(onClick);
      webApp.BackButton.hide();
    };
  }, [active]);
}
