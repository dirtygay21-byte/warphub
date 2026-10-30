import { testAdminNotification, type NotificationTestResult } from "@/apiUtils/admin";
import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { BellRing, LoaderCircle } from "lucide-react";

/**
 * Проверка уведомлений о записях: бот отправляет вам тестовое сообщение,
 * а здесь видно, дошло ли оно, и если нет — почему (не нажат «Старт», токен, выключено, нет связи).
 */
export function NotificationCheck() {
  const test = useMutation<NotificationTestResult>({ mutationFn: testAdminNotification });
  const result = test.data;
  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-white/3 p-3">
      <div className="flex items-center gap-3">
        <BellRing className="size-5 shrink-0 text-accent" />
        <p className="min-w-0 flex-1 text-sm text-fg-2">Уведомления о записях приходят администраторам от бота.</p>
        <button
          type="button"
          disabled={test.isPending}
          onClick={() => test.mutate()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition-transform active:scale-95 disabled:opacity-60"
        >
          {test.isPending && <LoaderCircle className="size-4 animate-spin" />}
          Проверить
        </button>
      </div>
      {result && (
        <p className={clsx("mt-2 text-sm", result.ok ? "text-accent" : "text-red-300")}>
          {result.ok ? "✅ " : "⚠️ "}
          {result.message}
          {result.detail && <span className="block text-xs text-fg-3">Ответ Telegram: {result.detail}</span>}
          <span className="block text-xs text-fg-3">Получателей уведомлений: {result.recipients}</span>
        </p>
      )}
      {test.isError && <p className="mt-2 text-sm text-red-300">Не удалось выполнить проверку — сервер не ответил.</p>}
    </div>
  );
}
