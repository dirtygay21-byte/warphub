import { LEAGUE_GAMES } from "@/apiUtils/league";
import {
  addTournamentPlayer,
  createTournament,
  deleteTournament,
  finishTournament,
  getAdminTournament,
  setTournamentResult,
  startNextRound,
  updateTournamentPlayer,
  type Tournament,
  type TournamentGameRow,
} from "@/apiUtils/tournaments";
import { DsButton, SectionLabel, Segmented, Skeleton } from "@/components/ui/ds";
import { StandingsTable } from "@/components/pages/Tournament/TournamentTables";
import { playerName } from "@/components/pages/Tournament/tournamentUtils";
import { toast } from "@/stores/useToastStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronLeft, Play, Trophy, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * Турнир ивента — администратор (этап 4, 15.11.2026): создать из ивента, участники, раунды по швейцарской
 * системе, результаты с VP, завершение. Результаты вносит только администратор.
 */
export default function AdminTournament() {
  const { eventId } = useParams();
  const id = Number(eventId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-tournament", id], queryFn: () => getAdminTournament(id), enabled: Number.isInteger(id) });
  const t = query.data;
  const apply = (next: Tournament | null) => queryClient.setQueryData(["admin-tournament", id], next);
  const onError = (e: unknown) => toast.error((e as Error).message || "Не получилось");

  const [tab, setTab] = useState<"round" | "players" | "table">("round");
  const [game, setGame] = useState("40k");
  const [rounds, setRounds] = useState(3);
  const [guest, setGuest] = useState("");

  const create = useMutation({ mutationFn: () => createTournament(id, game, rounds), onSuccess: (r) => (apply(r), toast.success("Турнир создан")), onError });
  const remove = useMutation({ mutationFn: () => deleteTournament(id), onSuccess: () => apply(null), onError });
  const next = useMutation({ mutationFn: () => startNextRound(id), onSuccess: (r) => (apply(r), setTab("round"), toast.success(`Раунд ${r.currentRound}: пары готовы, игрокам отправлены`)), onError });
  const finish = useMutation({ mutationFn: () => finishTournament(id), onSuccess: (r) => (apply(r), setTab("table"), toast.success("Турнир завершён")), onError });
  const add = useMutation({ mutationFn: () => addTournamentPlayer(id, guest), onSuccess: (r) => (apply(r), setGuest("")), onError });
  const drop = useMutation({ mutationFn: ({ playerId, dropped }: { playerId: string; dropped: boolean }) => updateTournamentPlayer(id, playerId, { dropped }), onSuccess: (r) => apply(r), onError });

  return (
    <div className="px-4 py-3 pb-28 text-fg sm:px-6">
      <button type="button" onClick={() => navigate("/admin/content")} className="ds-press mb-3 flex min-h-10 items-center gap-1 text-[14px] font-semibold text-fg-2">
        <ChevronLeft className="size-4" />К ивентам
      </button>
      <h1 className="font-display text-[28px] font-semibold uppercase leading-none">Турнир</h1>
      {query.isLoading && <Skeleton className="mt-4 h-[200px] rounded-[18px]" />}

      {query.isSuccess && !t && (
        <section className="mt-4 flex flex-col gap-3 rounded-[18px] border border-white/10 bg-app-elevated p-4">
          <p className="text-[14px] text-fg-2">Сделать из ивента турнир по швейцарской системе. Участники — все, кто записан на ивент; гостей можно добавить потом.</p>
          <SectionLabel>Игра</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {LEAGUE_GAMES.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={g.id === game}
                onClick={() => setGame(g.id)}
                className={clsx("ds-press min-h-11 rounded-[12px] text-[14px] font-semibold", g.id === game ? "bg-accent text-accent-foreground" : "border border-white/10 text-fg-2")}
              >
                {g.title}
              </button>
            ))}
          </div>
          <SectionLabel>Раундов</SectionLabel>
          <Segmented value={String(rounds)} onChange={(v) => setRounds(Number(v))} options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
          <DsButton variant="primary" size="lg" disabled={create.isPending} onClick={() => create.mutate()}>
            <Trophy className="size-5" />
            Создать турнир
          </DsButton>
        </section>
      )}

      {t && (
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-[14px] text-fg-2">
            {t.eventTitle} · {t.gameLabel} · {t.status === "setup" ? "подготовка" : t.status === "finished" ? "завершён" : `раунд ${t.currentRound} из ${t.rounds}`} · участников: {t.players.filter((p) => !p.dropped).length}
          </p>

          {t.status !== "finished" && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {t.currentRound < t.rounds ? (
                <DsButton variant="primary" size="lg" disabled={next.isPending || (t.currentRound > 0 && !t.roundComplete)} onClick={() => next.mutate()}>
                  <Play className="size-5" />
                  {t.currentRound === 0 ? "Начать: раунд 1" : `Раунд ${t.currentRound + 1}`}
                </DsButton>
              ) : (
                <DsButton variant="primary" size="lg" disabled={finish.isPending || !t.roundComplete} onClick={() => finish.mutate()}>
                  <Trophy className="size-5" />
                  Завершить турнир
                </DsButton>
              )}
              {t.currentRound > 0 && !t.roundComplete && <p className="self-center text-[13px] text-warn">Внесите все результаты раунда {t.currentRound}</p>}
              {t.status === "setup" && (
                <DsButton variant="secondary" disabled={remove.isPending} onClick={() => remove.mutate()}>
                  Удалить турнир
                </DsButton>
              )}
            </div>
          )}

          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "round", label: "Раунд" },
              { value: "players", label: "Участники" },
              { value: "table", label: "Таблица" },
            ]}
          />

          {tab === "round" &&
            (t.currentRound === 0 ? (
              <p className="rounded-[16px] bg-white/[0.05] px-4 py-3 text-sm text-fg-2">Раунды ещё не начались.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(t.pairings.find((p) => p.round === t.currentRound)?.games ?? []).map((g) => (
                  <ResultEditor key={g.id} t={t} g={g} eventId={id} onSaved={apply} disabled={t.status === "finished"} />
                ))}
              </div>
            ))}

          {tab === "players" && (
            <section className="flex flex-col gap-2">
              {t.status !== "finished" && (
                <div className="flex gap-2">
                  <input
                    value={guest}
                    onChange={(e) => setGuest(e.target.value)}
                    placeholder="Имя гостя"
                    maxLength={80}
                    className="h-11 min-w-0 flex-1 rounded-[12px] border border-white/10 bg-app-elevated px-3 text-[14px] text-fg outline-none focus:border-accent"
                  />
                  <DsButton variant="secondary" disabled={!guest.trim() || add.isPending} onClick={() => add.mutate()}>
                    <UserPlus className="size-4" />
                    Добавить
                  </DsButton>
                </div>
              )}
              <div className="overflow-hidden rounded-[16px] border border-white/10 bg-app-elevated">
                {t.players.map((p, i) => (
                  <div key={p.id} className={clsx("flex min-h-[52px] items-center gap-3 px-3.5", i > 0 && "border-t border-white/[0.06]", p.dropped && "opacity-50")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                      <span className="block text-[12.5px] text-fg-3">{p.userId ? "в приложении — идёт в лигу" : "гость"}</span>
                    </span>
                    {t.status !== "finished" && (
                      <button
                        type="button"
                        disabled={drop.isPending}
                        onClick={() => drop.mutate({ playerId: p.id, dropped: !p.dropped })}
                        className="ds-press min-h-9 rounded-[10px] bg-white/[0.07] px-3 text-[13px] font-semibold text-fg-2"
                      >
                        {p.dropped ? "Вернуть" : t.status === "setup" ? "Убрать" : "Снять"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === "table" && <StandingsTable t={t} />}
        </div>
      )}
    </div>
  );
}

function ResultEditor({ t, g, eventId, onSaved, disabled }: { t: Tournament; g: TournamentGameRow; eventId: number; onSaved: (t: Tournament) => void; disabled: boolean }) {
  const [result, setResult] = useState(g.result);
  const [vpA, setVpA] = useState(g.vpA?.toString() ?? "");
  const [vpB, setVpB] = useState(g.vpB?.toString() ?? "");
  const save = useMutation({
    mutationFn: () => setTournamentResult(eventId, g.id, { result, vpA: vpA === "" ? null : Number(vpA), vpB: vpB === "" ? null : Number(vpB) }),
    onSuccess: (r) => (onSaved(r), toast.success(`Стол ${g.tableNo}: сохранено`)),
    onError: (e) => toast.error((e as Error).message || "Не получилось"),
  });
  if (g.playerB === null)
    return (
      <div className="rounded-[14px] border border-white/10 bg-app-elevated px-3 py-2.5 text-[14px] text-fg-2">
        Бай: <span className="font-semibold text-fg">{playerName(t, g.playerA)}</span> — победа без VP
      </div>
    );
  const dirty = result !== g.result || vpA !== (g.vpA?.toString() ?? "") || vpB !== (g.vpB?.toString() ?? "");
  const vpInput = (value: string, set: (v: string) => void, label: string) => (
    <input
      inputMode="numeric"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 3))}
      placeholder="VP"
      className="h-10 w-16 shrink-0 rounded-[10px] border border-white/10 bg-app px-2 text-center text-[14px] text-fg outline-none focus:border-accent"
    />
  );
  const pick = (r: "a" | "b" | "draw") => (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={result === r}
      onClick={() => setResult(result === r ? null : r)}
      className={clsx("ds-press min-h-10 rounded-[10px] px-2 text-[13px] font-semibold", result === r ? "bg-accent text-accent-foreground" : "bg-white/[0.07] text-fg-2")}
    >
      {r === "draw" ? "Ничья" : "Победа"}
    </button>
  );
  return (
    <div className={clsx("rounded-[14px] border bg-app-elevated p-3", g.result ? "border-white/10" : "border-warn/50")}>
      <p className="mb-2 text-[13px] font-semibold text-fg-3">Стол {g.tableNo}</p>
      <div className="flex flex-col gap-2">
        {([["a", g.playerA, vpA, setVpA], ["b", g.playerB, vpB, setVpB]] as const).map(([side, pid, vp, setVp]) => (
          <div key={side} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{playerName(t, pid)}</span>
            {vpInput(vp, setVp, `VP ${playerName(t, pid)}`)}
            {pick(side)}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="flex-1">{pick("draw")}</span>
          <DsButton variant="primary" disabled={disabled || !dirty || save.isPending} onClick={() => save.mutate()}>
            Сохранить
          </DsButton>
        </div>
      </div>
    </div>
  );
}
