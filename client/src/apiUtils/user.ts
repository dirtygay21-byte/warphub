import { apiRequest } from "@/apiUtils/general";
import type { TelegramUser } from "@/types";

export const getMe = () => apiRequest<TelegramUser>("/me");