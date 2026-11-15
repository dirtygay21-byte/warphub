import { getLeagueTable, getMyResults, LEAGUE_GAMES, type LeagueGame } from "@/apiUtils/league";
import { LimeHero, SectionLabel, Segmented, Skeleton } from "@/components/ui/ds";
import { useTelegramBack } from "@/hooks/useTelegramBack";
import { useAuthStore } from "@/stores/useAuthStore";
import { haptic } from "@/utils/haptic";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { pluralizeRu } from "@/utils/plural";
import ResultCard from "./ResultCard";

/**
 * Клубная лига (этап 3, 15.11.2026, решение владельца): рейтинг Эло отдельно по каждой игре, сезон — квартал.
 * Вкладка «Мои партии» — внести, подтвердить или оспорить результат; «Таблица» — рейтинг сезона.
 */
export default function LeaguePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const back = () => (location.key !== "default" ? navigate(-1) : navigate("/", { replace: true }));
  useTelegramBack(back);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const results = useQuery({ queryKey: ["my-results"], queryFn: getMyResults, enabled: isAuthenticated });
  const pending = (results.data ?? []).filter((r) => r.action !== "none");
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"games" | "table">(params.get("tab") === "table" ? "table" : "games");
  const [game, setGame] = useState<LeagueGame>("40k");
  const [season, setSeason] = useState<string | undefined>(undefined);
  const table = useQuery({ queryKey: ["league", game, season ?? "current"], queryFn: () => getLeagueTable(game, season), enabled: isAuthenticated && tab === "table" });

  return (
    <div className="ds-enter pb-10 text-fg">
      <div className="sticky top-0 z-20 flex h-[64px] items-center gap-3 bg-app/95 px-4 backdrop-blur">
        <button
          type="button"
          onClick={() => (haptic.tap(), back())}
          aria-label="Назад"
          className="ds-press flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] bg-app-elevated text-fg"
        >
          <ChevronLeft className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">Клубная лига</p>
      </div>

      <div className="flex flex-col gap-5 px-5 pt-1">
        <LimeHero kicker="Рейтинг Эло · сезон — квартал" title={pending.length > 0 ? `Ждут результата: ${pending.length}` : "Играй — поднимайся в таблице"} size="sm">
          <p>После игры за столом на двоих бот спросит, кто победил. Результат засчитывается, когда соперник подтвердит.</p>
        </LimeHero>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "games", label: pending.length > 0 ? `Мои партии · ${pending.length}` : "Мои партии" },
            { value: "table", label: "Таблица" },
          ]}
        />

        {tab === "games" && (
          <section className="flex flex-col gap-2.5">
            {results.isLoading && Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-[120px] rounded-[18px]" />)}
            {results.isError && <p className="rounded-[16px] bg-white/[0.05] px-4 py-3 text-sm text-fg-2">Не удалось загрузить партии.</p>}
            {results.isSuccess && results.data.length === 0 && (
              <p className="rounded-[16px] bg-white/[0.05] px-4 py-3 text-sm text-fg-2">
                Партий пока нет. Запишитесь на игру за стол на двоих — после игры здесь появится результат.
              </p>
            )}
            {results.data?.map((r) => <ResultCard key={r.id} r={r} />)}
          </section>
        )}

        {tab === "table" && (
          <section className="flex flex-col gap-3">
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {LEAGUE_GAMES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => (haptic.select(), setGame(g.id))}
                  aria-pressed={g.id === game}
                  className={clsx(
                    "ds-press min-h-10 shrink-0 rounded-[12px] px-3.5 text-[14px] font-semibold",
                    g.id === game ? "bg-accent text-accent-foreground" : "border border-white/10 bg-app-elevated text-fg-2",
                  )}
                >
                  {g.short}
                </button>
              ))}
            </div>
            {table.data && table.data.seasons.length > 1 && (
              <select
                value={table.data.season}
                onChange={(e) => setSeason(e.target.value)}
                className="h-11 rounded-[12px] border border-white/10 bg-app-elevated px-3 text-[14px] text-fg outline-none [color-scheme:dark]"
                aria-label="Сезон"
              >
                {table.data.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            <SectionLabel>{table.data?.seasonLabel ?? "Сезон"}</SectionLabel>
            {table.isLoading && <Skeleton className="h-[200px] rounded-[18px]" />}
            {table.isError && <p className="rounded-[16px] bg-white/[0.05] px-4 py-3 text-sm text-fg-2">Не удалось загрузить таблицу.</p>}
            {table.data && table.data.rows.length === 0 && (
              <p className="rounded-[16px] bg-white/[0.05] px-4 py-3 text-sm text-fg-2">В этом сезоне ещё нет подтверждённых партий.</p>
            )}
            {table.data && table.data.rows.length > 0 && (
              <div className="overflow-hidden rounded-[18px] border border-white/10 bg-app-elevated">
                {table.data.rows.map((row, i) => (
                  <div key={row.userId} className={clsx("flex min-h-[56px] items-center gap-3 px-3.5 py-2", i > 0 && "border-t border-white/[0.06]", row.me && "bg-accent/10")}>
                    <span
                      className={clsx(
                        "font-display flex size-8 shrink-0 items-center justify-center rounded-lg text-[15px] font-bold",
                        row.rank <= 3 ? "bg-accent text-accent-foreground" : "bg-white/[0.07] text-fg-2",
                      )}
                    >
                      {row.rank}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold leading-tight">
                        {row.name}
                        {row.me ? " · вы" : ""}
                      </span>
                      <span className="block text-[12.5px] text-fg-2">
                        {row.games} {pluralizeRu(row.games, { one: "партия", few: "партии", many: "партий" })} · {row.wins}–{row.draws}–{row.losses}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="font-display block text-[18px] font-semibold leading-none">{row.rating}</span>
                      {row.lastDelta !== 0 && (
                        <span className={clsx("block text-[12px] font-semibold", row.lastDelta > 0 ? "text-accent" : "text-fg-3")}>
                          {row.lastDelta > 0 ? `+${row.lastDelta}` : row.lastDelta}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[12.5px] leading-snug text-fg-3">Победы–ничьи–поражения. Старт — 1000, K = 32. Учитываются только подтверждённые партии.</p>
          </section>
        )}
      </div>
    </div>
  );
}
