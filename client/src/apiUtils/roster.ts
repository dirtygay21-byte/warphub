import { apiRequest } from "@/apiUtils/general";

export type RosterAccess = { hasAccess: boolean; isOwner: boolean };

export type RosterCode = {
  id: number;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  usedByName: string | null;
  usedByUsername: string | null;
  status: "active" | "used" | "revoked" | "expired";
};

export type RosterAccessUser = {
  userId: string;
  grantedAt: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  telegramId: number;
};

export type CreatedRosterCode = {
  id: number;
  expiresAt: string;
  /** удалось ли отправить код в Telegram */
  delivered: boolean;
  /** код — только если бот не смог его отправить */
  code?: string;
};

export const getRosterAccess = () => apiRequest<RosterAccess>("/roster/access");

export const redeemRosterCode = (code: string) =>
  apiRequest<{ hasAccess: boolean }>("/roster/redeem", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const createRosterCode = () =>
  apiRequest<CreatedRosterCode>("/admin/roster/codes", { method: "POST" });

export const getRosterCodes = () => apiRequest<RosterCode[]>("/admin/roster/codes");

export const revokeRosterCode = (id: number) =>
  apiRequest<{ ok: boolean }>(`/admin/roster/codes/${id}`, { method: "DELETE" });

export const getRosterAccessList = () =>
  apiRequest<RosterAccessUser[]>("/admin/roster/access");

export const revokeRosterAccess = (userId: string) =>
  apiRequest<{ ok: boolean }>(`/admin/roster/access/${userId}`, {
    method: "DELETE",
  });

/** Группа подписчиков Boosty (17.11.2026): её участникам WarpBuilder открыт, пока они в группе. */
export type BoostyGroups = {
  updates: { mode: "off" | "polling" | "webhook-elsewhere" | "error"; detail: string | null; lastUpdateAt: string | null };
  groups: { chatId: number; title: string; botIsAdmin: boolean; selected: boolean }[];
};
export type BoostyMember = { telegramId: number; since: string; firstName: string | null; lastName: string | null; username: string | null };

export const getBoostyGroups = () => apiRequest<BoostyGroups>("/admin/roster/group");
export const getBoostyMembers = () => apiRequest<BoostyMember[]>("/admin/roster/group/members");
export const selectBoostyGroup = (chatId: number | null) =>
  apiRequest<BoostyGroups>("/admin/roster/group", { method: "PUT", body: JSON.stringify({ chatId }) });
