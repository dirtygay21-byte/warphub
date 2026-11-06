import { create } from "zustand";
import { haptic } from "@/utils/haptic";

/**
 * Всплывающие сообщения (решение владельца 06.11.2026): короткое подтверждение действия, которое раньше
 * заканчивалось молча (отмена записи, сохранение данных…). Ошибки внутри окон остаются в окнах.
 * Вызов из любого места, в том числе из onSuccess мутаций: toast.success("Запись отменена").
 * Показывает Toaster (components/ui/ds/Toaster.tsx); правила — docs/design-code.md §7.
 */
export type ToastKind = "success" | "error" | "info";
export type Toast = { id: number; kind: ToastKind; message: string };

const MAX_VISIBLE = 2;
const DURATION_MS: Record<ToastKind, number> = { success: 3000, info: 3000, error: 5000 };

type ToastStore = {
  toasts: Toast[];
  show: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;
const timers = new Map<number, number>();

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (kind, message) => {
    const id = nextId++;
    // то же сообщение уже на экране — не дублировать
    if (get().toasts.some((t) => t.kind === kind && t.message === message)) return;
    set((state) => {
      const toasts = [...state.toasts, { id, kind, message }];
      for (const dropped of toasts.slice(0, Math.max(0, toasts.length - MAX_VISIBLE))) {
        window.clearTimeout(timers.get(dropped.id));
        timers.delete(dropped.id);
      }
      return { toasts: toasts.slice(-MAX_VISIBLE) };
    });
    timers.set(id, window.setTimeout(() => get().dismiss(id), DURATION_MS[kind]));
    if (kind === "error") haptic.error();
    else if (kind === "success") haptic.ok();
  },
  dismiss: (id) => {
    window.clearTimeout(timers.get(id));
    timers.delete(id);
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  success: (message: string) => useToastStore.getState().show("success", message),
  error: (message: string) => useToastStore.getState().show("error", message),
  info: (message: string) => useToastStore.getState().show("info", message),
};
