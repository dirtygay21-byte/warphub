import { validateInitData } from "@/apiUtils/telegram";
import { useAuthStore } from "@/stores/useAuthStore";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

export default function TelegramInitializer() {
  const initData =
    typeof window !== "undefined" ? window.Telegram?.WebApp?.initData : "";

  // Вне Telegram входить нечем — не держим админку в ожидании
  useEffect(() => {
    if (!initData) useAuthStore.getState().setAuthChecked(true);
  }, [initData]);

  useQuery({
    queryKey: ["telegram-init-data"],
    queryFn: () => validateInitData(initData),
    enabled: Boolean(initData),
    retry: false,
  });

  return null;
}
