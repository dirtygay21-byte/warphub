import { getEventTournament } from "@/apiUtils/tournaments";
import { LimeHero, LimeChip, SectionLabel, Segmented, Skeleton } from "@/components/ui/ds";
import { useTelegramBack } from "@/hooks/useTelegramBack";
import { haptic } from "@/utils/haptic";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { StandingsTable } from "./TournamentTables";
import { isMine, playerName } from "./tournamentUtils";
import type { Tournament, TournamentGameRow } from "@/apiUtils/tournaments";

/**
 * Турнир ивента для игроков (этап 4, 15.11.2026): моя пара в текущем раунде, пары по раундам, таблица.
 * Обновляется сама каждые 30 секунд, пока турнир идёт.
 */
export default function TournamentPage() {
  const { eventId } = useParams();
  const id = Number(eventId);
  const navigate = useNavigate();
  const location = useLocation();
  const back = () => (location.key !== "default" ? navigate(-1) : navigate("/", { replace: true }));
  useTelegramBack(back);
  const query = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => getEventTournament(id),
    enabled: Number.isInteger(id),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 30_000 : false),
  });
  const t = query.data;
  const [tab, setTab] = useState<"pairs" | "table">("pairs");
  const [round, setRound] = useState<number | null>(null);
  const shownRound = round ?? t?.currentRound ?? 0;
  const games = t?.pairings.find((p) => p.round === shownRound)?.games ?? [];
  const myGame = t?.pairings.find((p) => p.round === t.currentRound)?.games.find((g) => isMine(t, g.playerA) || isMine(t, g.playerB));

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
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">Турнир</p>
      </div>

      <div className="flex flex-col gap-5 px-5 pt-1">
        {query.isLoading && <Skeleton className="h-[160px] rounded-[20px]" />}
        {(query.isError || (query.isSuccess && !t)) && (
          <p className="rounded-[16px] bg-white/[0.05] px-4 py-3 text-sm text-fg-2">У этого ивента нет турнира.</p>
        )}
        {t && (
          <>
            <LimeHero
              kicker={`${t.gameLabel} · швейцарская система`}
              title={t.eventTitle}
              size="sm"
              tone={t.status === "finished" ? "neutral" : "lime"}
            >
              <p>
                {t.status === "setup"
                  ? `Участников: ${t.players.length}. Пары появятся, когда организатор запустит первый раунд.`
                  : t.status === "finished"
                    ? `Турнир завершён. Победитель: ${t.standings[0]?.name ?? "—"}.`
                    : `Раунд ${t.currentRound} из ${t.rounds}`}
              </p>
              {myGame && t.status === "running" && (
                <div className="flex flex-wrap gap-1.5">
                  <LimeChip accent>{myGame.playerB === null ? "Бай" : `Стол ${myGame.tableNo}`}</LimeChip>
                  {myGame.playerB !== null && <LimeChip>Соперник: {playerName(t, isMine(t, myGame.playerA) ? myGame.playerB : myGame.playerA)}</LimeChip>}
                </div>
              )}
            </LimeHero>

            <Segmented value={tab} onChange={setTab} options={[{ value: "pairs", label: "Пары" }, { value: "table", label: "Таблица" }]} />

            {tab === "pairs" && (
              <section className="flex flex-col gap-3">
                {t.currentRound === 0 ? (
                  <p className="rounded-[16px] bg-white/[0.05] px-4 py-3 text-sm text-fg-2">Раунды ещё не начались.</p>
                ) : (
                  <>
                    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
                      {Array.from({ length: t.currentRound }, (_, i) => i + 1).map((r) => (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={r === shownRound}
                          onClick={() => (haptic.select(), setRound(r))}
                          className={clsx(
                            "ds-press min-h-10 shrink-0 rounded-[12px] px-3.5 text-[14px] font-semibold",
                            r === shownRound ? "bg-accent text-accent-foreground" : "border border-white/10 bg-app-elevated text-fg-2",
                          )}
                        >
                          Раунд {r}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2">
                      {games.map((g) => (
                        <PairRow key={g.id} t={t} g={g} />
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {tab === "table" && (
              <section className="flex flex-col gap-2">
                <SectionLabel>{t.status === "finished" ? "Итоги" : `После раунда ${t.currentRound}`}</SectionLabel>
                <StandingsTable t={t} />
                <p className="text-[12.5px] leading-snug text-fg-3">Победа 3, ничья 1, поражение 0. При равенстве — сумма VP, затем очки соперников.</p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PairRow({ t, g }: { t: Tournament; g: TournamentGameRow }) {
  const mine = isMine(t, g.playerA) || isMine(t, g.playerB);
  const side = (id: string | null, won: boolean, vp: number | null) => (
    <span className={clsx("min-w-0 flex-1 truncate text-[14.5px]", won ? "font-bold text-fg" : "text-fg-2")}>
      {playerName(t, id)}
      {vp !== null ? <span className="ml-1 text-[12.5px] text-fg-3">{vp}</span> : null}
    </span>
  );
  return (
    <div className={clsx("flex items-center gap-3 rounded-[14px] border bg-app-elevated px-3 py-2.5", mine ? "border-accent/70" : "border-white/10")}>
      <span className="font-display flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-[15px] font-bold">{g.playerB === null ? "—" : g.tableNo}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {side(g.playerA, g.result === "a" || g.playerB === null, g.vpA)}
        {g.playerB === null ? <span className="text-[13px] text-fg-3">Бай — засчитана победа</span> : side(g.playerB, g.result === "b", g.vpB)}
      </span>
      <span className="shrink-0 text-[12.5px] font-semibold text-fg-3">{g.playerB === null ? "" : !g.result ? "идёт" : g.result === "draw" ? "ничья" : ""}</span>
    </div>
  );
}
