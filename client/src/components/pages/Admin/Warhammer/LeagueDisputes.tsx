import { getAdminResults, resolveAdminResult, type AdminResult } from "@/apiUtils/league";
import { DateTile } from "@/components/ui/ds";
import { toast } from "@/stores/useToastStore";
import { formatClubTimeRange } from "@/utils/clubTime";
import { userLabel } from "@/utils/user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const OUTCOME = (r: AdminResult) =>
  r.outcome === "draw" ? "ничья" : r.outcome === "a" ? `победа: ${userLabel(r.playerA)}` : r.outcome === "b" ? `победа: ${userLabel(r.playerB)}` : "не внесён";

/** Споры клубной лиги (этап 3, 15.11.2026): администратор засчитывает победу, ничью или исключает партию. */
export default function LeagueDisputes() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-results", "disputed"], queryFn: () => getAdminResults("disputed"), staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  const resolve = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: "a" | "b" | "draw" | "void" }) => resolveAdminResult(id, outcome),
    onSuccess: () => {
      toast.success("Спор решён");
      void queryClient.invalidateQueries({ queryKey: ["admin-results"] });
    },
    onError: (e) => toast.error((e as Error).message || "Не получилось"),
  });
  const list = query.data ?? [];

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`ds-press flex w-full items-center gap-3 rounded-[16px] border bg-app-elevated px-4 py-3 text-left ${list.length > 0 ? "border-warn/60" : "border-white/10"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">Споры лиги</span>
          <span className="mt-0.5 block text-[13px] text-fg-2">
            {query.isLoading ? "Загружаем…" : query.isError ? "Не удалось загрузить" : list.length === 0 ? "Споров нет" : `Ждут решения: ${list.length}`}
          </span>
        </span>
        <ChevronDown className={`size-5 shrink-0 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && list.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {list.map((r) => (
            <div key={r.id} className="rounded-[14px] border border-white/10 bg-app-elevated p-3">
              <div className="flex items-center gap-3">
                <DateTile date={r.startsAt} tone="warn" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{r.gameLabel}</span>
                  <span className="block text-[13px] text-fg">{formatClubTimeRange(r.startsAt, r.endsAt)}</span>
                  <span className="block truncate text-[13px] text-fg-2">
                    {userLabel(r.playerA)} — {userLabel(r.playerB)}
                  </span>
                </span>
              </div>
              <p className="mt-2 text-[13px] text-fg-2">
                Внёс {userLabel(r.reportedBy)}: {OUTCOME(r)}
                {r.note ? ` · «${r.note}»` : ""}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  ["a", `Победа: ${r.playerA?.firstName ?? "A"}`],
                  ["b", `Победа: ${r.playerB?.firstName ?? "B"}`],
                  ["draw", "Ничья"],
                  ["void", "Не учитывать"],
                ] as const).map(([outcome, label]) => (
                  <button
                    key={outcome}
                    type="button"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: r.id, outcome })}
                    className="ds-press min-h-10 truncate rounded-[11px] bg-white/[0.07] px-2 text-[13px] font-semibold text-fg disabled:opacity-60"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
