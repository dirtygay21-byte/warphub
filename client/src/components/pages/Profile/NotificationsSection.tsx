import { apiRequest } from "@/apiUtils/general";
import { haptic } from "@/utils/haptic";
import { useMutation } from "@tanstack/react-query";
import { BellRing, LoaderCircle } from "lucide-react";
import { useState } from "react";

type TestResult = { ok: boolean; message: string; needsStart?: boolean };

const webApp = () => (typeof window !== "undefined" ? window.Telegram?.WebApp : undefined);

/**
 * Уведомления от бота (13.11.2026). Бот может написать только тому, кто разрешил ему сообщения: нажал «Старт»
 * в чате или дал разрешение здесь (Telegram.WebApp.requestWriteAccess, Bot API 6.9+). Без разрешения подтверждения
 * записей, сообщения о сопернике и об отмене не дойдут. «Проверить» — бот присылает тестовое сообщение.
 */
export default function NotificationsSection() {
  const tg = webApp();
  const [allowed, setAllowed] = useState<boolean | null>(() => (tg?.initDataUnsafe?.user?.allows_write_to_pm ? true : null));
  const [denied, setDenied] = useState(false);
  const test = useMutation<TestResult>({
    mutationFn: () => apiRequest<TestResult>("/me/notifications/test", { method: "POST" }),
    onSuccess: (r) => {
      if (r.ok) setAllowed(true);
      else if (r.needsStart) setAllowed(false);
    },
  });
  if (!tg?.initData) return null;
  const canAsk = typeof tg.requestWriteAccess === "function" && (tg.isVersionAtLeast?.("6.9") ?? false);
  const ask = () => {
    haptic.tap();
    setDenied(false);
    tg.requestWriteAccess((ok) => {
      setAllowed(ok);
      setDenied(!ok);
      if (ok) test.mutate();
    });
  };
  const result = test.data;
  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-app-elevated p-4 lg:col-span-2" aria-labelledby="notify-title">
      <div className="flex items-center gap-3">
        <BellRing className="size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p id="notify-title" className="text-sm font-semibold">Уведомления от бота</p>
          <p className="text-[13px] text-fg-2">
            {allowed ? "Бот может писать вам: подтверждения записей, соперник, отмены." : "Разрешите боту писать вам — иначе сообщения о записях не дойдут."}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!allowed && canAsk && (
          <button type="button" onClick={ask} className="ds-press inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground">
            Разрешить уведомления
          </button>
        )}
        <button
          type="button"
          disabled={test.isPending}
          onClick={() => (haptic.tap(), test.mutate())}
          className="ds-press inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 text-sm font-semibold text-accent disabled:opacity-60"
        >
          {test.isPending && <LoaderCircle className="size-4 animate-spin" />}
          Проверить
        </button>
      </div>
      {denied && <p className="mt-2 text-[13px] text-fg-2">Разрешение не выдано. Его можно дать позже — здесь или кнопкой «Старт» в чате с ботом.</p>}
      {result && <p className={result.ok ? "mt-2 text-[13px] text-accent" : "mt-2 text-[13px] text-red-300"}>{result.ok ? "✅ " : "⚠️ "}{result.message}</p>}
      {test.isError && <p className="mt-2 text-[13px] text-red-300">Не удалось выполнить проверку — сервер не ответил.</p>}
    </section>
  );
}
