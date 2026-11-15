import type { Tournament } from "@/apiUtils/tournaments";
import clsx from "clsx";

/** Общие блоки страницы турнира (игрок и администратор): таблица и строка пары. */
export function StandingsTable({ t }: { t: Tournament }) {
  if (t.standings.length === 0) return <p className="rounded-[16px] bg-white/[0.05] px-4 py-3 text-sm text-fg-2">Участников пока нет.</p>;
  return (
    <div className="overflow-hidden rounded-[18px] border border-white/10 bg-app-elevated">
      {t.standings.map((row, i) => (
        <div key={row.playerId} className={clsx("flex min-h-[54px] items-center gap-3 px-3.5 py-2", i > 0 && "border-t border-white/[0.06]", row.me && "bg-accent/10", row.dropped && "opacity-50")}>
          <span
            className={clsx(
              "font-display flex size-8 shrink-0 items-center justify-center rounded-lg text-[15px] font-bold",
              row.rank <= 3 && t.currentRound > 0 ? "bg-accent text-accent-foreground" : "bg-white/[0.07] text-fg-2",
            )}
          >
            {row.rank}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold leading-tight">
              {row.name}
              {row.me ? " · вы" : ""}
              {row.dropped ? " · снят" : ""}
            </span>
            <span className="block text-[12.5px] text-fg-2">
              {row.wins}–{row.draws}–{row.losses} · VP {row.vp} · соп. {row.sos}
            </span>
          </span>
          <span className="font-display shrink-0 text-[20px] font-semibold">{row.points}</span>
        </div>
      ))}
    </div>
  );
}
