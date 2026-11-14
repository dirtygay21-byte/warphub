import { apiRequest } from "@/apiUtils/general";

/** Система уведомлений (14.11.2026): настройки игрока, каталог автоматических, рассылки владельца, журнал. */

export type OpponentGame = "40k" | "aos" | "kt" | "warcry";
export type NotificationPrefs = { opponentGames: OpponentGame[]; news: boolean; events: boolean; promos: boolean; eveReminder: boolean };

export const getNotificationPrefs = () => apiRequest<NotificationPrefs>("/me/notifications/prefs");
export const saveNotificationPrefs = (input: Partial<NotificationPrefs>) =>
  apiRequest<NotificationPrefs>("/me/notifications/prefs", { method: "PUT", body: JSON.stringify(input) });

export type NotificationGroup = "bookings" | "match" | "content" | "engagement" | "admin";
export type NotificationKindView = {
  id: string;
  group: NotificationGroup;
  title: string;
  when: string;
  category: "match" | "news" | "events" | "promos" | "eve" | null;
  announcement: boolean;
  defaultText: string;
  vars: Record<string, string>;
  enabled: boolean;
  text: string | null;
  updatedAt: string | null;
};
export type NotificationConfig = { quietFrom: number; quietTo: number; dailyLimit: number };
export type NotificationCatalog = { canEdit: boolean; config: NotificationConfig; kinds: NotificationKindView[] };

export const getNotificationCatalog = () => apiRequest<NotificationCatalog>("/admin/notifications/catalog");
export const saveNotificationTemplate = (kind: string, input: { enabled?: boolean; text?: string | null }) =>
  apiRequest<{ kind: string; enabled: boolean; text: string | null }>(`/admin/notifications/templates/${kind}`, { method: "PUT", body: JSON.stringify(input) });
export const testNotificationTemplate = (kind: string, text: string | null) =>
  apiRequest<{ ok: boolean; error?: string }>(`/admin/notifications/templates/${kind}/test`, { method: "POST", body: JSON.stringify({ text }) });
export const saveNotificationConfig = (input: NotificationConfig) =>
  apiRequest<NotificationConfig>("/admin/notifications/config", { method: "PUT", body: JSON.stringify(input) });

export type NotificationLogRow = { id: number; at: string; telegramId: number; kind: string; broadcastId: number | null; ok: boolean; reason: string | null; status: number | null; description: string | null };
export type NotificationLogView = { rows: NotificationLogRow[]; day: { sent: number; delivered: number }; week: { sent: number; delivered: number }; queued: number };
export const getNotificationLog = (kind?: string) =>
  apiRequest<NotificationLogView>(`/admin/notifications/log?limit=150${kind ? `&kind=${encodeURIComponent(kind)}` : ""}`);

export type BroadcastButton = { text: string; path?: string; url?: string };
export type BroadcastAudience = { kind: "all" | "game" | "recent" | "events" | "admins" | "me"; game?: string; days?: number };
export type BroadcastSchedule =
  | { type: "now" }
  | { type: "once"; at: string }
  | { type: "weekly"; days: number[]; time: string; until?: string | null }
  | { type: "monthly"; day: number; time: string; until?: string | null };
export type BroadcastInput = { title: string; text: string; imageUrl?: string | null; buttons?: BroadcastButton[]; audience: BroadcastAudience; schedule: BroadcastSchedule };
export type Broadcast = BroadcastInput & {
  id: number;
  status: "draft" | "scheduled" | "paused" | "done";
  nextRunAt: string | null;
  lastRunAt: string | null;
  runs: number;
  lastRecipients: number | null;
  createdAt: string;
  updatedAt: string;
};

export const listBroadcasts = () => apiRequest<Broadcast[]>("/admin/broadcasts");
export const createBroadcast = (input: BroadcastInput) => apiRequest<Broadcast>("/admin/broadcasts", { method: "POST", body: JSON.stringify(input) });
export const updateBroadcast = (id: number, input: BroadcastInput) =>
  apiRequest<Broadcast>(`/admin/broadcasts/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteBroadcast = (id: number) => apiRequest<{ id: number }>(`/admin/broadcasts/${id}`, { method: "DELETE" });
export const startBroadcast = (id: number) => apiRequest<Broadcast & { queued: number }>(`/admin/broadcasts/${id}/start`, { method: "POST" });
export const pauseBroadcast = (id: number) => apiRequest<Broadcast>(`/admin/broadcasts/${id}/pause`, { method: "POST" });
export const testBroadcast = (input: BroadcastInput) =>
  apiRequest<{ ok: boolean; error?: string }>("/admin/broadcasts/test", { method: "POST", body: JSON.stringify(input) });
export const audienceSize = (audience: BroadcastAudience) =>
  apiRequest<{ total: number }>("/admin/broadcasts/audience", { method: "POST", body: JSON.stringify({ audience }) });

/** Куда ведёт кнопка: страницы Mini App. */
export const BUTTON_TARGETS: { path: string; label: string }[] = [
  { path: "/", label: "Запись (главная)" },
  { path: "/reservations", label: "Мои записи" },
  { path: "/news", label: "Новости" },
  { path: "/games", label: "Мини-игры" },
  { path: "/roster", label: "WarpBuilder" },
  { path: "/profile", label: "Профиль" },
  { path: "/profile?tab=notifications", label: "Настройки уведомлений" },
];

export const GAME_OPTIONS: { value: OpponentGame; label: string }[] = [
  { value: "40k", label: "Warhammer 40,000" },
  { value: "aos", label: "Age of Sigmar" },
  { value: "kt", label: "Kill Team" },
  { value: "warcry", label: "Warcry" },
];
