import { MotionConfig } from "motion/react";
import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { useEffectsStore, useFx, watchSystemReducedMotion } from "@/stores/useEffectsStore";

/**
 * Один источник уровня эффектов для всего приложения:
 *  - <html data-fx="full|base|reduced"> — CSS: яркие эффекты (.fx-strong, .fx-strong-only) работают только при full;
 *  - MotionConfig — анимации библиотеки motion отключаются при reduced.
 */
export default function EffectsRoot({ children }: { children: ReactNode }) {
  const { level, reduced } = useFx();
  const setSystemReduced = useEffectsStore((s) => s.setSystemReduced);

  useEffect(() => watchSystemReducedMotion(setSystemReduced), [setSystemReduced]);

  useLayoutEffect(() => {
    document.documentElement.dataset.fx = level;
  }, [level]);

  return <MotionConfig reducedMotion={reduced ? "always" : "never"}>{children}</MotionConfig>;
}
