import type { BoostyKind } from "./boosty";
import clsx from "clsx";
import { CircleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type BoostyContext = "selection" | "booking";

const COPY: Record<BoostyKind, Record<BoostyContext, string>> = {
  warhammer: {
    selection:
      "Планируете регулярно играть в Warhammer? На Boosty можно оформить подписку в поддержку клуба — она включает безлимитное посещение клуба.",
    booking:
      "Для игр в Warhammer на Boosty доступна подписка в поддержку клуба. Она включает безлимитное посещение клуба.",
  },
  painting: {
    selection:
      "Планируете регулярно красить миниатюры? На Boosty можно оформить подписку с безлимитным доступом к покраске.",
    booking:
      "На Boosty можно оформить подписку с безлимитным доступом к покраске миниатюр.",
  },
};

export default function BoostySubscriptionInfo({
  kind,
  context = "booking",
  className,
}: {
  kind: BoostyKind;
  context?: BoostyContext;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const label =
    kind === "warhammer"
      ? "О подписке Boosty для Warhammer"
      : "О подписке Boosty для покраски";

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={clsx(
          "ds-hit flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-accent active:bg-white/10",
          className,
        )}
      >
        <CircleAlert className="size-4" />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-overlay/75 px-4 pb-6 pt-6 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="boosty-subscription-title"
              className="w-full max-w-sm overflow-hidden rounded-[20px] border border-white/10 bg-app-elevated text-fg shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4">
                <CircleAlert className="size-5 shrink-0 text-accent" />
                <h2
                  id="boosty-subscription-title"
                  className="min-w-0 flex-1 font-display text-lg font-semibold uppercase"
                >
                  Подписка Boosty
                </h2>
                <button
                  type="button"
                  aria-label="Закрыть"
                  onClick={() => setOpen(false)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-fg-2 active:bg-white/10"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="px-5 py-5 text-[15px] leading-relaxed text-fg-2">
                {COPY[kind][context]}
              </p>
              <div className="border-t border-white/[0.07] px-5 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground active:scale-[0.99]"
                >
                  Понятно
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
