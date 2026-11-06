import type { DndGame } from "@/apiUtils/dnd";
import { DsButton } from "@/components/ui/ds";
import { useDialogExit } from "@/components/ui/ds/useDialogExit";
import { CalendarDays, Clock3, UsersRound, X } from "lucide-react";
import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function DndGameDetailsModal({
  game,
  imageUrl,
  dateLabel,
  timeLabel,
  availabilityLabel,
  onClose,
}: {
  game: DndGame;
  imageUrl: string;
  dateLabel: string;
  timeLabel: string;
  availabilityLabel: string;
  onClose: () => void;
}) {
  const leaving = useDialogExit();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = `dnd-game-details-title-${game.id}`;
  const descriptionId = `dnd-game-details-description-${game.id}`;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus({ preventScroll: true });
      previousFocusRef.current = null;
    };
  }, []);

  return (
    <div
      className={`ds-fade fixed inset-0 z-[80] flex items-end justify-center bg-overlay/75 px-3 pb-4 pt-6 sm:items-center sm:p-6${leaving ? " ds-leaving pointer-events-none" : ""}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="ds-sheet flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-app-elevated text-fg shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
              {game.gameType}
            </span>
            <h2 id={titleId} className="mt-2 text-xl font-semibold leading-tight">
              {game.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Закрыть полное описание"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-fg-2 transition-colors hover:bg-white/[0.07] hover:text-fg active:bg-white/10"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <img
            src={imageUrl}
            alt={`Иллюстрация к игре «${game.title}»`}
            className="aspect-[16/8] w-full object-cover"
          />

          <div className="space-y-5 px-4 py-5 sm:px-5">
            <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/85">
              <p className="flex items-start gap-2.5">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{dateLabel}</span>
              </p>
              <p className="flex items-start gap-2.5">
                <Clock3 className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{timeLabel}</span>
              </p>
              <p className="flex items-start gap-2.5">
                <UsersRound className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className={game.isBookable ? "text-green-300" : "text-fg-3"}>
                  {availabilityLabel}
                </span>
              </p>
            </div>

            <section aria-labelledby={`${descriptionId}-heading`}>
              <h3 id={`${descriptionId}-heading`} className="text-sm font-semibold uppercase tracking-[0.08em] text-fg-3">
                Описание игры
              </h3>
              <p id={descriptionId} className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-fg-2">
                {game.description}
              </p>
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.08] px-4 py-3 sm:px-5">
          <DsButton variant="secondary" className="w-full" onClick={onClose}>
            Закрыть
          </DsButton>
        </div>
      </div>
    </div>
  );
}
