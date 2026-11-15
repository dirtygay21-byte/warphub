import { confirmResult, disputeResult, reportResult, resultCardUrl, type MyResult } from "@/apiUtils/league";
import { canShareToStory, downloadFile, shareToChat, shareToStory } from "@/utils/telegramApp";
import { Download, Send, Share2 } from "lucide-react";
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

const opponentShort = (r: MyResult) => r.opponent.firstName || "игрок клуба";

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
  const [sharing, setSharing] = useState(false);
  const shareText =
    r.result === "win"
      ? `Победа! ${r.gameLabel} в клубе WarpHub, соперник: ${opponentShort(r)}. Клубная лига — рейтинг Эло.`
      : r.result === "draw"
        ? `Ничья. ${r.gameLabel} в клубе WarpHub, соперник: ${opponentShort(r)}. Клубная лига — рейтинг Эло.`
        : `Партия ${r.gameLabel} в клубе WarpHub, соперник: ${opponentShort(r)}. Клубная лига — рейтинг Эло.`;
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
      {/* этап 3b: поделиться засчитанной партией — история Telegram, чат, картинка */}
      {r.status === "confirmed" && r.result && !sharing && (
        <button type="button" onClick={() => (haptic.tap(), setSharing(true))} className="ds-press mt-1 flex min-h-10 items-center gap-1.5 text-[13.5px] font-semibold text-accent">
          <Share2 className="size-4" />
          Поделиться
        </button>
      )}
      {r.status === "confirmed" && r.result && sharing && (
        <div className="mt-2.5 flex flex-col gap-2">
          <img src={resultCardUrl(r)} alt="Карточка результата" className="aspect-video w-full rounded-[12px] bg-white/[0.05] object-cover" loading="lazy" />
          <div className={clsx("grid gap-2", canShareToStory() ? "grid-cols-3" : "grid-cols-2")}>
            {canShareToStory() && (
              <button type="button" onClick={() => (haptic.tap(), shareToStory(resultCardUrl(r), shareText))} className="ds-press min-h-11 rounded-[12px] bg-accent text-[13.5px] font-bold text-accent-foreground">
                В историю
              </button>
            )}
            <button type="button" onClick={() => (haptic.tap(), shareToChat(shareText))} className="ds-press flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] bg-white/[0.07] text-[13.5px] font-bold text-fg">
              <Send className="size-4" />В чат
            </button>
            <button type="button" onClick={() => (haptic.tap(), downloadFile(resultCardUrl(r), "warphub-result.png"))} className="ds-press flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] bg-white/[0.07] text-[13.5px] font-bold text-fg">
              <Download className="size-4" />Картинка
            </button>
          </div>
        </div>
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
