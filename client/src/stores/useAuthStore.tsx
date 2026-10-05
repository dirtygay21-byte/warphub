import { create } from "zustand";
import { setApiAuthToken } from "@/apiUtils/authToken";
import type { TelegramUser } from "@/types";

type AuthStore = {
  user: TelegramUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Проверка входа через Telegram завершена (успешно или нет) */
  authChecked: boolean;

  setUser: (user: TelegramUser) => void;
  setToken: (token: string) => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setAuthChecked: (checked: boolean) => void;
  resetAuth: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isAdmin:
    import.meta.env.VITE_EXECUTION_CONFIG === "production" ? false : true,
  setUser: (user: TelegramUser) => set({ user }),
  setToken: (token: string) => {
    setApiAuthToken(token);
    set({ token, isAuthenticated: true });
  },
  setIsAdmin: (isAdmin: boolean) => set({ isAdmin }),
  authChecked: import.meta.env.VITE_EXECUTION_CONFIG !== "production",
  setAuthChecked: (authChecked: boolean) => set({ authChecked }),
  resetAuth: () => {
    setApiAuthToken(null);
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
