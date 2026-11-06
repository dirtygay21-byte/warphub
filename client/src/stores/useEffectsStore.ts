import { create } from "zustand";

/**
 * Уровень эффектов (решение владельца 06.11.2026):
 *  - full    — базовые анимации + яркие эффекты (по умолчанию);
 *  - base    — только базовые анимации (переключатель «Яркие эффекты» в профиле выключен);
 *  - reduced — в системе включено «Уменьшить движение»: ярких эффектов нет, базовые сокращены.
 * Настройка хранится на устройстве (localStorage): на слабом телефоне её можно выключить, на сильном — оставить.
 * Уровень попадает в <html data-fx="…"> (CSS) и в MotionConfig (библиотека motion) — см. EffectsRoot.
 */
export type FxLevel = "full" | "base" | "reduced";

const STORAGE_KEY = "warphub:fx-strong";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

export function resolveFxLevel(strongEnabled: boolean, systemReduced: boolean): FxLevel {
  if (systemReduced) return "reduced";
  return strongEnabled ? "full" : "base";
}

function readStrongEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "1";
  } catch {
    return true;
  }
}

function readSystemReduced(): boolean {
  try {
    return window.matchMedia(REDUCED_QUERY).matches;
  } catch {
    return false;
  }
}

type EffectsStore = {
  strongEnabled: boolean;
  systemReduced: boolean;
  setStrongEnabled: (value: boolean) => void;
  setSystemReduced: (value: boolean) => void;
};

export const useEffectsStore = create<EffectsStore>((set) => ({
  strongEnabled: readStrongEnabled(),
  systemReduced: readSystemReduced(),
  setStrongEnabled: (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // нет доступа к хранилищу — настройка действует до перезапуска
    }
    set({ strongEnabled: value });
  },
  setSystemReduced: (value) => set({ systemReduced: value }),
}));

/** Текущий уровень эффектов: strong — можно показывать яркие эффекты, reduced — движение сведено к минимуму */
export function useFx(): { level: FxLevel; strong: boolean; reduced: boolean } {
  const level = useEffectsStore((s) => resolveFxLevel(s.strongEnabled, s.systemReduced));
  return { level, strong: level === "full", reduced: level === "reduced" };
}

/** Подписка на системную настройку «Уменьшить движение»; возвращает отписку */
export function watchSystemReducedMotion(onChange: (reduced: boolean) => void): () => void {
  try {
    const mql = window.matchMedia(REDUCED_QUERY);
    const handler = (event: MediaQueryListEvent) => onChange(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  } catch {
    return () => {};
  }
}
