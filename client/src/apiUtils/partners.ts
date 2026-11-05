import { apiRequest } from "@/apiUtils/general";

export type PartnerLane = 1 | 2;
export type PartnerSettings = {
  partner1Title: string;
  partner2Title: string;
  footerText: string;
  updatedAt: string | null;
};
export type PartnerCard = {
  id: number;
  lane: PartnerLane;
  title: string;
  text: string;
  url: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type PartnerShowcase = { settings: PartnerSettings; cards: PartnerCard[] };
export type PartnerCardInput = {
  lane: PartnerLane;
  title: string;
  text?: string;
  url: string;
  imageUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
};
export type PartnerMetadata = { title: string; text: string; imageUrl: string; url: string };

export const getPartners = () => apiRequest<PartnerShowcase>("/partners");
export const getAdminPartners = () => apiRequest<PartnerShowcase>("/admin/partners");
export const updatePartnerSettings = (input: Pick<PartnerSettings, "partner1Title" | "partner2Title" | "footerText">) =>
  apiRequest<PartnerSettings>("/admin/partners/settings", { method: "PUT", body: JSON.stringify(input) });
export const createPartnerCard = (input: PartnerCardInput) =>
  apiRequest<PartnerCard>("/admin/partners/cards", { method: "POST", body: JSON.stringify(input) });
export const updatePartnerCard = (id: number, input: Partial<PartnerCardInput>) =>
  apiRequest<PartnerCard>(`/admin/partners/cards/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const deletePartnerCard = (id: number) =>
  apiRequest<PartnerCard>(`/admin/partners/cards/${id}`, { method: "DELETE" });
export const fetchPartnerMetadata = (url: string) =>
  apiRequest<PartnerMetadata>("/admin/partners/metadata", { method: "POST", body: JSON.stringify({ url }) });
