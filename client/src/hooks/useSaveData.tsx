/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import type { WebAppInitData } from "telegram-web-app";

/**
 * Хук для получения провалидированных данных о Web App
 *
 * @returns saveData - данные из initDataUnsafe
 */
export default function useSaveData() {
  const [saveData, setSaveData] = useState<WebAppInitData | undefined>(
    undefined
  );

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      // валидация данных
      setSaveData(tg.initDataUnsafe);
    }
  }, []);

  return { saveData };
}
