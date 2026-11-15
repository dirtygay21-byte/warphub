import { confirmResult, disputeResult, reportResult, type MyResult } from "@/apiUtils/league";
import { DateTile } from "@/components/ui/ds";
import { toast } from "@/stores/useToastStore";
import { formatClubTimeRange } from "@/utils/clubTime";
import { haptic } from "@/utils/haptic";
import { userLabel } from "@/utils/user";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";

const RESULT_LABEL = { win: "Победа", loss: "Поражение", draw: "Ничья" } as const;
const STATUS_LABEL: Record<MyResult["status"], string> = {
  awaiting: "Ждёт результата",
  reported: "Ждёт подтверждения",
  confirmed: "Засчитано",
  disputed: "Спор — решит администратор",
  void: "Не учитывается",
};

/** Партия лиги: внести результат, подтвердить или оспорить (этап 3, 15.11.2026). */
export default function ResultCard({ r }: { r: MyResult }) {
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["my-results"] });
    void queryClient.invalidateQueries({ queryKey: ["league"] });
    void queryClient.invalidateQueries({ queryKey: ["league-stats"] });
  };
  const onError = (e: unknown) => toast.error((e as Error).message || "Не получилось — попробуйте ещё раз");
  const report = useMutation({
    mutationFn: (res: "win" | "loss" | "draw") => reportResult(r.id, res),
    onSuccess: () => (haptic.ok(), setChanging(false), toast.success("Результат отправлен сопернику"), done()),
    onError,
  });
  const confirm = useMutation({ mutationFn: () => confirmResult(r.id), onSuccess: () => (haptic.ok(), toast.success("Результат засчитан"), done()), onError });
  const dispute = useMutation({ mutationFn: () => disputeResult(r.id), onSuccess: () => (toast.success("Спор передан администратору"), done()), onError });
  const busy = report.isPending || confirm.isPending || dispute.isPending;

  const tone = r.action !== "none" ? "lime" : r.status === "disputed" ? "warn" : r.status === "void" ? "muted" : "plain";
  const opponent = userLabel(r.opponent);
  const showReport = r.action === "report" && (r.status === "awaiting" || changing);

  return (
    <article className={clsx("rounded-[18px] border bg-app-elevated p-3", r.action !== "none" ? "border-accent/60" : "border-white/10")}>
      <div className="flex items-center gap-3">
        <DateTile date={r.startsAt} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-tight">{r.gameLabel}</span>
          <span className="mt-0.5 block text-[13.5px] text-fg">
            {formatClubTimeRange(r.startsAt, r.endsAt)}
            {r.tableName ? ` · ${r.tableName}` : ""}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-fg-2">Соперник: {opponent}</span>
        </span>
        {r.result && (
          <span
            className={clsx(
              "shrink-0 rounded-[9px] px-2 py-1 text-[12.5px] font-bold",
              r.result === "win" ? "bg-accent text-accent-foreground" : r.result === "loss" ? "bg-white/10 text-fg" : "bg-white/[0.06] text-fg-2",
            )}
          >
            {RESULT_LABEL[r.result]}
          </span>
        )}
      </div>

      <p className="mt-2 text-[13px] text-fg-2">
        {r.status === "reported" && !r.reportedByMe
          ? `${opponent} внёс результат — у вас ${RESULT_LABEL[r.result ?? "draw"].toLowerCase()}. Верно?`
          : r.status === "reported"
            ? "Ждём, пока соперник подтвердит. Без ответа засчитается через 48 часов."
            : STATUS_LABEL[r.status]}
      </p>

      {showReport && (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {(["win", "draw", "loss"] as const).map((res) => (
            <button
              key={res}
              type="button"
              disabled={busy}
              onClick={() => (haptic.tap(), report.mutate(res))}
              className={clsx(
                "ds-press min-h-11 rounded-[12px] text-[14px] font-bold disabled:opacity-60",
                res === "win" ? "bg-accent text-accent-foreground" : "bg-white/[0.07] text-fg",
              )}
            >
              {res === "win" ? "Я победил" : res === "loss" ? "Я проиграл" : "Ничья"}
            </button>
          ))}
        </div>
      )}
      {r.action === "report" && r.status === "reported" && !changing && (
        <button type="button" onClick={() => setChanging(true)} className="ds-press mt-2 min-h-10 text-[13.5px] font-semibold text-accent">
          Изменить результат
        </button>
      )}
      {r.action === "confirm" && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => (haptic.tap(), confirm.mutate())} className="ds-press min-h-11 rounded-[12px] bg-accent text-[14px] font-bold text-accent-foreground disabled:opacity-60">
            Подтвердить
          </button>
          <button type="button" disabled={busy} onClick={() => (haptic.tap(), dispute.mutate())} className="ds-press min-h-11 rounded-[12px] bg-white/[0.07] text-[14px] font-bold text-fg disabled:opacity-60">
            Оспорить
          </button>
        </div>
      )}
    </article>
  );
}
