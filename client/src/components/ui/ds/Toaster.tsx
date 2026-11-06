import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import clsx from "clsx";
import { useToastStore, type ToastKind } from "@/stores/useToastStore";

const ICON: Record<ToastKind, typeof CheckCircle2> = { success: CheckCircle2, error: CircleAlert, info: Info };
const EASE_OUT_SOFT = [0.2, 0.8, 0.2, 1] as const;

/**
 * Место всплывающих сообщений: внизу над панелью разделов (на широком экране с боковой панелью — у нижнего края).
 * Появление снизу и угасание — базовые анимации; значок успеха «подпрыгивает» только при ярких эффектах.
 * При «Уменьшить движение» MotionConfig (EffectsRoot) отключает анимации motion.
 */
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:pl-[276px]"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.18 } }}
              transition={{ duration: 0.22, ease: EASE_OUT_SOFT }}
              role={t.kind === "error" ? "alert" : "status"}
              className={clsx(
                "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border bg-app-elevated py-2 pl-4 pr-1.5 text-fg shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
                t.kind === "success" && "border-accent/40",
                t.kind === "error" && "border-danger/50",
                t.kind === "info" && "border-white/10",
              )}
            >
              <Icon
                aria-hidden="true"
                className={clsx(
                  "size-5 shrink-0",
                  t.kind === "success" && "fx-strong fx-bump text-accent",
                  t.kind === "error" && "text-danger",
                  t.kind === "info" && "text-fg-2",
                )}
              />
              <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{t.message}</p>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => dismiss(t.id)}
                className="ds-hit flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-3 active:bg-white/10"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
