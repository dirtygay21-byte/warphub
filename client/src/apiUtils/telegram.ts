import { useAuthStore } from "@/stores/useAuthStore";
import type { TelegramAuthResponse } from "@/types";

export async function validateInitData(
  initDataRaw: string,
): Promise<TelegramAuthResponse> {
  try {
    return await authenticate(initDataRaw);
  } finally {
    useAuthStore.getState().setAuthChecked(true);
  }
}

async function authenticate(
  initDataRaw: string,
): Promise<TelegramAuthResponse> {
  const response = await fetch(
    `${import.meta.env.VITE_BACKEND_API_URL}/auth/telegram`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ initData: initDataRaw }),
    },
  );

  if (!response.ok) {
    throw new Error("Telegram auth failed");
  }

  const data = (await response.json()) as TelegramAuthResponse;

  useAuthStore.getState().setUser(data.user);
  useAuthStore.getState().setToken(data.token);
  
  const adminResponse = await fetch(
    `${import.meta.env.VITE_BACKEND_API_URL}/admin/reservations`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${data.token}`,
      },
    },
  );

  useAuthStore.getState().setIsAdmin(adminResponse.ok);

  return data;
}

