import { apiRequest } from "@/apiUtils/general";

/** Клубная лига (этап 3, 15.11.2026): Эло по игре, сезоны — кварталы; результат подтверждает соперник. */
export type LeagueGame = "40k" | "aos" | "kt" | "warcry";

export const LEAGUE_GAMES: { id: LeagueGame; short: string; title: string }[] = [
  { id: "40k", short: "40K", title: "Warhammer 40,000" },
  { id: "aos", short: "AoS", title: "Age of Sigmar" },
  { id: "kt", short: "Kill Team", title: "Kill Team" },
  { id: "warcry", short: "Warcry", title: "Warcry" },
];

export type MyResult = {
  id: string;
  game: string;
  gameLabel: string;
  startsAt: string;
  endsAt: string | null;
  tableName: string | null;
  opponent: { firstName: string; lastName: string | null; username: string | null };
  status: "awaiting" | "reported" | "confirmed" | "disputed" | "void";
  result: "win" | "loss" | "draw" | null;
  reportedByMe: boolean;
  action: "report" | "confirm" | "none";
  season: string;
  side: "a" | "b";
};

export type LeagueRow = {
  rank: number;
  userId: string;
  name: string;
  username: string | null;
  rating: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  lastDelta: number;
  me: boolean;
};

export type LeagueTable = {
  game: LeagueGame;
  season: string;
  seasonLabel: string;
  seasons: { id: string; label: string }[];
  rows: LeagueRow[];
};

export type LeagueStats = {
  season: string;
  seasonLabel: string;
  games: { game: LeagueGame; gameLabel: string; games: number; wins: number; draws: number; losses: number; rating: number | null; rank: number | null; players: number }[];
};

export const getLeagueTable = (game: LeagueGame, season?: string) =>
  apiRequest<LeagueTable>(`/league?game=${game}${season ? `&season=${encodeURIComponent(season)}` : ""}`);
export const getMyLeagueStats = () => apiRequest<LeagueStats>("/league/my-stats");
export const getMyResults = () => apiRequest<MyResult[]>("/results/my");
export const reportResult = (id: string, result: "win" | "loss" | "draw") =>
  apiRequest<{ ok: true }>(`/results/${id}/report`, { method: "POST", body: JSON.stringify({ result }) });
export const confirmResult = (id: string) => apiRequest<{ ok: true }>(`/results/${id}/confirm`, { method: "POST" });
export const disputeResult = (id: string, note?: string) =>
  apiRequest<{ ok: true }>(`/results/${id}/dispute`, { method: "POST", body: JSON.stringify({ note }) });

export type AdminResult = {
  id: string;
  game: string;
  gameLabel: string;
  startsAt: string;
  endsAt: string | null;
  playerA: { id: string; firstName: string; lastName: string | null; username: string | null } | null;
  playerB: { id: string; firstName: string; lastName: string | null; username: string | null } | null;
  outcome: "a" | "b" | "draw" | null;
  status: string;
  reportedBy: { id: string; firstName: string; lastName: string | null; username: string | null } | null;
  note: string | null;
};
export const getAdminResults = (status: "disputed" | "reported" | "all" = "disputed") => apiRequest<AdminResult[]>(`/admin/results?status=${status}`);
export const resolveAdminResult = (id: string, outcome: "a" | "b" | "draw" | "void") =>
  apiRequest<{ ok: true }>(`/admin/results/${id}/resolve`, { method: "POST", body: JSON.stringify({ outcome }) });

/** Публичная ссылка на картинку результата (этап 3b). */
export const resultCardUrl = (r: Pick<MyResult, "id" | "side">) => `${import.meta.env.VITE_BACKEND_API_URL}/results/${r.id}/card.png?side=${r.side}`;
