import type { Tournament } from "@/apiUtils/tournaments";

export const playerName = (t: Tournament, id: string | null) => (id ? (t.players.find((p) => p.id === id)?.name ?? "Игрок") : "Бай");
export const isMine = (t: Tournament, id: string | null) => !!id && !!t.players.find((p) => p.id === id)?.me;
