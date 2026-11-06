import { usePresence } from "motion/react";
import { useEffect } from "react";
import { useFx } from "@/stores/useEffectsStore";

/** Длительность закрытия окна; совпадает с анимацией .ds-leaving в global.css */
export const DIALOG_EXIT_MS = 180;

/**
 * Закрытие окна с анимацией (stage 4). Вызов в окне + <AnimatePresence> вокруг `{open && <Окно/>}` там, где окно
 * показывается: после закрытия окно остаётся на экране, пока играет .ds-leaving, затем снимается.
 * Возвращает true, пока окно закрывается (повесить .ds-leaving на корень окна). При «Уменьшить движение» — сразу.
 * Без <AnimatePresence> окно ведёт себя как раньше.
 */
export function useDialogExit(): boolean {
  const [isPresent, safeToRemove] = usePresence();
  const { reduced } = useFx();

  useEffect(() => {
    if (isPresent || !safeToRemove) return;
    if (reduced) {
      safeToRemove();
      return;
    }
    const timer = window.setTimeout(safeToRemove, DIALOG_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [isPresent, reduced, safeToRemove]);

  return !isPresent;
}
