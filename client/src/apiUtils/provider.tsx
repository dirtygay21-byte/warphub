import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "@/stores/useToastStore";

/**
 * Сообщения о результате действия (06.11.2026): мутация описывает их в meta, общий обработчик показывает toast.
 *   meta: { success: "Карточка сохранена" }            — подтверждение успеха;
 *   meta: { error: true } | { error: "Не удалось …" }  — ошибка всплывающим сообщением (только если на экране её
 *                                                         больше негде показать; иначе ошибка остаётся в форме).
 * Правила — docs/design-code.md §7.
 */
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { success?: string; error?: boolean | string };
  }
}

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const success = mutation.meta?.success;
      if (success) toast.success(success);
    },
    onError: (error, _variables, _context, mutation) => {
      const setting = mutation.meta?.error;
      if (!setting) return;
      const fallback = "Не удалось выполнить действие. Попробуйте ещё раз";
      toast.error(typeof setting === "string" ? setting : error instanceof Error && error.message ? error.message : fallback);
    },
  }),
});

export default function TanstackProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
