import { getMyLeagueStats } from "@/apiUtils/league";
import { SectionLabel } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

/** Профиль: статистика лиги по играм — партии, победы, рейтинг и место в текущем сезоне (этап 3, 15.11.2026). */
export default function LeagueStatsCard() {
  const navigate = useNavigate();
  const stats = useQuery({ queryKey: ["league-stats"], queryFn: getMyLeagueStats, retry: false });
  const games = stats.data?.games ?? [];
  if (games.length === 0) return null;
  return (
    <section>
      <SectionLabel>Лига · {stats.data!.seasonLabel}</SectionLabel>
      <button
        type="button"
        onClick={() => (haptic.tap(), navigate("/league"))}
        className="ds-press w-full overflow-hidden rounded-[18px] border border-white/10 bg-app-elevated text-left"
      >
        {games.map((g, i) => (
          <span key={g.game} className={`flex min-h-[56px] items-center gap-3 px-3.5 py-2 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold leading-tight">{g.gameLabel}</span>
              <span className="block text-[12.5px] text-fg-2">
                Всего: {g.games} · {g.wins}–{g.draws}–{g.losses}
                {g.rank ? ` · место ${g.rank} из ${g.players}` : " · в этом сезоне партий нет"}
              </span>
            </span>
            {g.rating !== null && <span className="font-display shrink-0 text-[20px] font-semibold text-accent">{g.rating}</span>}
            {i === 0 && <ChevronRight className="size-5 shrink-0 text-fg-3" />}
          </span>
        ))}
      </button>
    </section>
  );
}
