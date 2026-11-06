import { BOOSTY_GENERAL_URL, BOOSTY_SUBSCRIPTION_URL, type BoostyKind } from "./boosty";
import clsx from "clsx";
import { DsButton } from "@/components/ui/ds";
import { CircleAlert, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { useDialogExit } from "@/components/ui/ds/useDialogExit";
import { createPortal } from "react-dom";

type BoostyContext = "selection" | "booking";

const CLOSE_LABELS = ["угу", "ок", "ладно", "понял", "понятно", "спасибо", "принял", "добро", "ясно", "круто", "кайф", "окей", "связь"] as const;

function nextCloseLabel(previous: string) {
  const options = CLOSE_LABELS.filter((label) => label !== previous);
  return options[Math.floor(Math.random() * options.length)] ?? "Понятно";
}

function openBoostySubscription(url: string) {
  const webApp = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  if (webApp && typeof webApp.openLink === "function") {
    webApp.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

const COPY: Record<BoostyKind, Record<BoostyContext, string>> = {
  warhammer: {
    selection:
      "Планируете регулярно играть в Warhammer? На Boosty можно оформить подписку в поддержку клуба — она включает безлимитное посещение клуба.",
    booking:
      "У нас есть WarpBuilder — конструктор ростеров и игровые инструменты клуба. Доступ к нему можно получить по подписке на Boosty. Будем рады вашей поддержке!",
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
  const [closeLabel, setCloseLabel] = useState("Понятно");
  const label =
    kind === "warhammer"
      ? "О подписке Boosty для Warhammer"
      : "О подписке Boosty для покраски";
  const linkUrl = kind === "warhammer" && context === "booking" ? BOOSTY_SUBSCRIPTION_URL : BOOSTY_GENERAL_URL;

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
          setCloseLabel((previous) => nextCloseLabel(previous));
          setOpen(true);
        }}
        className={clsx(
          "ds-hit flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-white/[0.04] hover:text-fg active:bg-white/[0.06]",
          className,
        )}
      >
        <CircleAlert className="size-4" />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
          <BoostySheet onClose={() => setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="boosty-subscription-title"
              className="ds-sheet w-full max-w-sm overflow-hidden rounded-[20px] border border-white/10 bg-app-elevated text-fg shadow-2xl"
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
              <div className="flex flex-col gap-1 border-t border-white/[0.07] px-5 py-3">
                <DsButton
                  variant="primary"
                  className="w-full"
                  aria-label={kind === "warhammer" && context === "booking" ? "Поддержать WarpBuilder на Boosty" : "Поддержать клуб на Boosty"}
                  onClick={() => openBoostySubscription(linkUrl)}
                >
                  Поддержать на Boosty
                </DsButton>
                <button
                  type="button"
                  aria-label="Закрыть диалог"
                  onClick={() => setOpen(false)}
                  className="min-h-10 w-full rounded-xl px-4 py-2 text-sm font-medium text-fg-3 transition-colors hover:bg-white/[0.04] hover:text-fg active:bg-white/[0.06]"
                >
                  {closeLabel}
                </button>
              </div>
            </div>
          </BoostySheet>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/** Фон окна Boosty: закрытие с анимацией (useDialogExit) — содержимое передаёт BoostySubscriptionInfo. */
function BoostySheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const leaving = useDialogExit();
  return (
    <div
      className={`ds-fade fixed inset-0 z-[80] flex items-end justify-center bg-overlay/75 px-4 pb-6 pt-6 sm:items-center${leaving ? " ds-leaving" : ""}`}
      onClick={onClose}
    >
      {children}
    </div>
  );
}
