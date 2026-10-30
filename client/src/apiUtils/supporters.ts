import { apiRequest } from "@/apiUtils/general";
import type { SupporterTitle } from "@/apiUtils/progress";

export type SupporterRow = {
  user: { id: string; telegramId: number; firstName: string; lastName: string | null; username: string | null };
  title: SupporterTitle | null;
  grantedAt: string | null;
  grantedByTelegramId: number | null;
};

export const listSupporters = () => apiRequest<SupporterRow[]>("/admin/supporters");
export const searchSupporterCandidates = (q: string) => apiRequest<SupporterRow[]>(`/admin/supporters/search?q=${encodeURIComponent(q)}`);
export const setSupporterTitle = (userId: string, title: SupporterTitle | null) =>
  apiRequest<SupporterRow>(`/admin/supporters/${userId}`, { method: "PUT", body: JSON.stringify({ title }) });
