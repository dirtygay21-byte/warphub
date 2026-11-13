import {
  getNotificationDiagnostics,
  testAdminNotification,
  type NotificationDiagnostics,
  type NotificationSendLog,
  type NotificationTestResult,
} from "@/apiUtils/admin";
import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { BellRing, LoaderCircle, Stethoscope } from "lucide-react";

/**
 * Проверка уведомлений о записях: бот отправляет вам тестовое сообщение,
 * а здесь видно, дошло ли оно, и если нет — почему (не нажат «Старт», токен, выключено, нет связи).
 */
export function NotificationCheck() {
  const test = useMutation<NotificationTestResult>({ mutationFn: testAdminNotification });
  const diag = useMutation<NotificationDiagnostics>({ mutationFn: getNotificationDiagnostics });
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
      <button
        type="button"
        disabled={diag.isPending}
        onClick={() => diag.mutate()}
        className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-fg-2 hover:text-fg disabled:opacity-60"
      >
        {diag.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Stethoscope className="size-4" />}
        Диагностика: доходят ли уведомления
      </button>
      {diag.data && <Diagnostics data={diag.data} />}
      {diag.isError && <p className="mt-2 text-sm text-red-300">Диагностика недоступна — сервер не ответил (возможно, на сервере старая версия).</p>}
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

const KIND: Record<string, string> = {
  admin: "админу о записи",
  user: "игроку",
  "test-admin": "проверка (админ)",
  "test-user": "проверка (игрок)",
  message: "сообщение",
};

function why(e: NotificationSendLog) {
  if (e.ok) return "доставлено";
  if (e.reason === "disabled") return "уведомления выключены на сервере";
  if (e.reason === "network") return `нет связи с Telegram${e.description ? ` (${e.description})` : ""}`;
  if (e.status === 403) return "человек не нажимал «Старт» у бота или заблокировал его";
  if (e.status === 400) return `Telegram отклонил: ${e.description ?? "чат не найден"}`;
  return `Telegram ${e.status ?? ""} ${e.description ?? ""}`.trim();
}

const time = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Yekaterinburg" });

/** Итог диагностики: включено ли, отвечает ли Telegram, кто получает, чем закончились последние отправки. */
function Diagnostics({ data }: { data: NotificationDiagnostics }) {
  const failed = data.recent.filter((e) => !e.ok).length;
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 text-[13px]">
      <p className={data.enabled ? "text-accent" : "text-red-300"}>{data.enabled ? "✅ Уведомления включены на сервере" : "⚠️ Уведомления выключены на сервере (TELEGRAM_NOTIFICATIONS=off)"}</p>
      {data.route && (
        <p className="text-fg-2">
          Маршрут к Telegram: {data.route.proxy ? `через прокси ${data.route.proxy}` : data.route.base === "https://api.telegram.org" ? "напрямую" : `через ${data.route.base}`}
        </p>
      )}
      <p className={data.bot.ok ? "text-accent" : "text-red-300"}>
        {data.bot.ok ? `✅ Telegram отвечает: бот @${data.bot.username ?? "?"}, ${data.bot.ms} мс` : `⚠️ ${data.bot.error} (${data.bot.ms} мс)`}
      </p>
      {!data.bot.ok && (
        <p className="text-fg-3">
          Сервер не может достучаться до Telegram — так бывает на российских серверах: провайдеры блокируют api.telegram.org.
          Нужен обход через сервер за границей (TELEGRAM_PROXY или TELEGRAM_API_BASE в .env backend).
        </p>
      )}
      <div>
        <p className="font-semibold text-fg-2">Получают уведомления о записях ({data.admins.length}):</p>
        <ul className="mt-1 space-y-0.5">
          {data.admins.map((a) => (
            <li key={a.telegramId} className="text-fg-2">
              {a.telegramId} — {a.last ? `${why(a.last)}, ${time(a.last.at)}` : "отправок ещё не было"}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold text-fg-2">
          Последние отправки с {time(data.since)}: {data.recent.length}
          {failed ? `, не дошло: ${failed}` : ""}
        </p>
        {data.recent.length === 0 ? (
          <p className="text-fg-3">Пока ничего не отправлялось.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {data.recent.map((e, i) => (
              <li key={`${e.at}-${i}`} className={e.ok ? "text-fg-2" : "text-red-300"}>
                {time(e.at)} · {KIND[e.kind] ?? e.kind} · {e.chatId} — {why(e)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
