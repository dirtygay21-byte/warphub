import { apiRequest } from "@/apiUtils/general";
import { haptic } from "@/utils/haptic";
import { GAME_OPTIONS, getNotificationPrefs, saveNotificationPrefs, type NotificationPrefs, type OpponentGame } from "@/apiUtils/notifications";
import { ToggleRow } from "@/components/ui/ds";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { BellRing, LoaderCircle } from "lucide-react";
import { useState } from "react";

type TestResult = { ok: boolean; message: string; needsStart?: boolean };

const webApp = () => (typeof window !== "undefined" ? window.Telegram?.WebApp : undefined);

/**
 * Уведомления от бота (13.11.2026). Бот может написать только тому, кто разрешил ему сообщения: нажал «Старт»
 * в чате или дал разрешение здесь (Telegram.WebApp.requestWriteAccess, Bot API 6.9+). Без разрешения подтверждения
 * записей, сообщения о сопернике и об отмене не дойдут. «Проверить» — бот присылает тестовое сообщение.
 */
/** Вкладка «Уведомления» профиля (14.11.2026): разрешение боту и «Что присылать» — отдельными карточками. */
export default function NotificationsTab() {
  return (
    <div className="space-y-4">
      <NotificationsSection />
      <section className="rounded-2xl border border-white/10 bg-app-elevated p-4" aria-labelledby="notify-prefs-title">
        <NotificationPrefsBlock />
      </section>
    </div>
  );
}

function NotificationsSection() {
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
    <section className="rounded-2xl border border-white/10 bg-app-elevated p-4" aria-labelledby="notify-title">
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

/**
 * Что присылать (14.11.2026): поиск соперника — по играм, которые игрок включил сам (по умолчанию выключен);
 * новости, ивенты, акции — включены; напоминание накануне — выключено. О своих записях бот пишет всегда.
 */
function NotificationPrefsBlock() {
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: ["notification-prefs"], queryFn: getNotificationPrefs });
  const save = useMutation({
    mutationFn: (input: Partial<NotificationPrefs>) => saveNotificationPrefs(input),
    onSuccess: (data) => queryClient.setQueryData(["notification-prefs"], data),
  });
  const p = save.isPending && save.variables ? { ...prefs.data!, ...save.variables } : prefs.data;
  const set = (input: Partial<NotificationPrefs>) => (haptic.select(), save.mutate(input));
  const toggleGame = (g: OpponentGame) =>
    p && set({ opponentGames: p.opponentGames.includes(g) ? p.opponentGames.filter((x) => x !== g) : [...p.opponentGames, g] });

  return (
    <div>
      <p id="notify-prefs-title" className="text-sm font-semibold text-fg">Что присылать</p>
      <div className="mt-3 space-y-3">
          {!p ? (
            <p className="text-sm text-fg-3">{prefs.isError ? "Не удалось загрузить настройки." : "Загружаем…"}</p>
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold text-fg">Поиск соперника</p>
                <p className="mt-0.5 text-[13px] text-fg-2">Когда кто-то записался за стол и ищет соперника в вашей игре — пришлём приглашение.</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {GAME_OPTIONS.map((g) => {
                    const on = p.opponentGames.includes(g.value);
                    return (
                      <button
                        key={g.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleGame(g.value)}
                        className={clsx(
                          "min-h-11 rounded-xl border px-2 text-[13px] font-semibold",
                          on ? "border-accent bg-accent text-accent-foreground" : "border-white/[0.14] text-fg-2",
                        )}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <ToggleRow title="Напоминание накануне" subtitle="Вечером перед днём записи" checked={p.eveReminder} onChange={(v) => set({ eveReminder: v })} />
              <ToggleRow title="Новости и объявления клуба" checked={p.news} onChange={(v) => set({ news: v })} />
              <ToggleRow title="Ивенты и игры D&D" subtitle="Новые ивенты, свободные игры на выходных, мало мест" checked={p.events} onChange={(v) => set({ events: v })} />
              <ToggleRow title="Ранги и приглашения" subtitle="Новый ранг, «давно не заходили»" checked={p.promos} onChange={(v) => set({ promos: v })} />
              <p className="text-[12px] text-fg-3">О ваших записях (подтверждение, соперник, отмена, напоминание за 3 часа) бот пишет всегда. Ночью (23:00–10:00) объявления не приходят.</p>
              {save.isError && <p className="text-[13px] text-red-300">Не сохранилось — попробуйте ещё раз.</p>}
            </>
          )}
      </div>
    </div>
  );
}
