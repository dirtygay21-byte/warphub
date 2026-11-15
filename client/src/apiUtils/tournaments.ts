import { apiRequest } from "@/apiUtils/general";

/** Турнир ивента (этап 4, 15.11.2026): швейцарская система, 3/1/0, затем VP и очки соперников. */
export type TournamentGameRow = { id: string; tableNo: number; playerA: string; playerB: string | null; result: "a" | "b" | "draw" | null; vpA: number | null; vpB: number | null };

export type Tournament = {
  eventId: number;
  eventTitle: string;
  startsAt: string;
  game: string;
  gameLabel: string;
  rounds: number;
  currentRound: number;
  status: "setup" | "running" | "finished";
  roundComplete: boolean;
  players: { id: string; name: string; army: string | null; userId: string | null; dropped: boolean; me: boolean }[];
  pairings: { round: number; games: TournamentGameRow[] }[];
  standings: { rank: number; playerId: string; name: string; points: number; wins: number; draws: number; losses: number; vp: number; sos: number; me: boolean; dropped: boolean }[];
};

export const getEventTournament = async (eventId: number) => (await apiRequest<Tournament | null>(`/events/${eventId}/tournament`)) ?? null;

// администратор
export const getAdminTournament = async (eventId: number) => (await apiRequest<Tournament | null>(`/admin/events/${eventId}/tournament`)) ?? null;
export const createTournament = (eventId: number, game: string, rounds: number) =>
  apiRequest<Tournament>(`/admin/events/${eventId}/tournament`, { method: "POST", body: JSON.stringify({ game, rounds }) });
export const deleteTournament = (eventId: number) => apiRequest<{ ok: true }>(`/admin/events/${eventId}/tournament`, { method: "DELETE" });
export const addTournamentPlayer = (eventId: number, name: string, army?: string) =>
  apiRequest<Tournament>(`/admin/events/${eventId}/tournament/players`, { method: "POST", body: JSON.stringify({ name, army: army || undefined }) });
export const updateTournamentPlayer = (eventId: number, playerId: string, patch: { army?: string; dropped?: boolean }) =>
  apiRequest<Tournament>(`/admin/events/${eventId}/tournament/players/${playerId}`, { method: "PATCH", body: JSON.stringify(patch) });
export const startNextRound = (eventId: number) => apiRequest<Tournament>(`/admin/events/${eventId}/tournament/next-round`, { method: "POST" });
export const setTournamentResult = (eventId: number, gameId: string, body: { result: "a" | "b" | "draw" | null; vpA: number | null; vpB: number | null }) =>
  apiRequest<Tournament>(`/admin/events/${eventId}/tournament/games/${gameId}`, { method: "PUT", body: JSON.stringify(body) });
export const finishTournament = (eventId: number) => apiRequest<Tournament>(`/admin/events/${eventId}/tournament/finish`, { method: "POST" });
