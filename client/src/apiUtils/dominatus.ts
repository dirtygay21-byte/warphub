import { apiRequest } from "@/apiUtils/general";
import type { SupporterRow } from "@/apiUtils/supporters";
import type { CampaignResponse } from "@/features/roster/dominatus/api";
import type { AllianceId } from "@/features/roster/dominatus/types";

/** Dominatus для Warmaster (DM2): backend/src/modules/dominatus (/admin/dominatus). */
export type PhaseOutcome = {
  phase: number;
  phaseHonours: Partial<Record<AllianceId, number>>;
  agendas: Partial<Record<AllianceId, number>>;
  controller: AllianceId | null;
  tied: AllianceId[];
  ascendant: AllianceId[];
  narrative: Partial<Record<AllianceId, number>>;
  relics: { playerId: number; name: string; draw: number }[];
};

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
export const adminDominatus = () => apiRequest<CampaignResponse>("/admin/dominatus/campaign");
export const adminCreateCampaign = (name: string) => apiRequest<unknown>("/admin/dominatus/campaign", json("POST", { name }));
export const adminFinishCampaign = (winnerAlliance: AllianceId | null) => apiRequest<unknown>("/admin/dominatus/campaign/finish", json("POST", { winnerAlliance }));
export const adminSearchDominatusPlayers = (q: string) => apiRequest<SupporterRow[]>(`/admin/dominatus/players/search?q=${encodeURIComponent(q)}`);
export const adminSetDominatusPlayer = (userId: string, alliance: AllianceId) => apiRequest<unknown>(`/admin/dominatus/players/${userId}`, json("PUT", { alliance }));
export const adminRemoveDominatusPlayer = (id: number) => apiRequest<unknown>(`/admin/dominatus/players/${id}`, { method: "DELETE" });
export const adminStartPhase = (phase: number, locationId: string, roll: number | null) => apiRequest<unknown>("/admin/dominatus/phases", json("POST", { phase, locationId, roll }));
export const adminPreviewPhaseEnd = (pick: AllianceId | null) => apiRequest<PhaseOutcome>(`/admin/dominatus/phases/end${pick ? `?pick=${pick}` : ""}`);
export const adminResolvePhase = (warmasterPick: AllianceId | null) => apiRequest<PhaseOutcome>("/admin/dominatus/phases/end", json("POST", { warmasterPick }));
