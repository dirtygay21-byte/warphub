/**
 * Группа подписчиков Boosty (17.11.2026): участникам выбранной группы WarpBuilder открывается сразу при вступлении
 * (бот WarpHub — администратор группы) и закрывается при выходе. Группу выбирает основной администратор.
 */
import { getBoostyGroups, getBoostyMembers, selectBoostyGroup } from "@/apiUtils/roster";
import { confirmAsk } from "@/features/roster/telegram";
import { formatClub } from "@/utils/clubTime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { LoaderCircle, Users } from "lucide-react";

const when = (value: string) => formatClub(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const MODE: Record<string, string> = {
  polling: "Бот получает события группы — доступ открывается сразу при вступлении.",
  "webhook-elsewhere": "Бот подключён к другому сервису — события не приходят; доступ проверяется при входе в WarpBuilder.",
  error: "Нет связи с Telegram — доступ проверяется при входе в WarpBuilder.",
  off: "Получение событий выключено на сервере — доступ проверяется при входе в WarpBuilder.",
};

export default function BoostyGroup({ isOwner }: { isOwner: boolean }) {
  const queryClient = useQueryClient();
  const groups = useQuery({ queryKey: ["admin-boosty-groups"], queryFn: getBoostyGroups, refetchInterval: 30_000 });
  const selected = groups.data?.groups.find((g) => g.selected) ?? null;
  const members = useQuery({ queryKey: ["admin-boosty-members"], queryFn: getBoostyMembers, enabled: !!selected });
  const select = useMutation({
    meta: { success: "Группа сохранена", error: true },
    mutationFn: selectBoostyGroup,
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-boosty-groups"], data);
      void queryClient.invalidateQueries({ queryKey: ["admin-boosty-members"] });
    },
  });

  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-fg-3">
        <span>Подписчики Boosty</span>
        {selected && <span className="text-fg-3">с доступом: {members.data?.length ?? "…"}</span>}
      </h2>
      <div className="rounded-2xl border border-white/10 bg-app-elevated p-4 text-sm">
        {groups.isLoading ? (
          <LoaderCircle className="mx-auto size-6 animate-spin text-accent" />
        ) : groups.isError ? (
          <p className="text-red-200">Не удалось загрузить: {groups.error.message}</p>
        ) : (
          <>
            <p className="text-fg-2">
              {selected ? (
                <>
                  Группа: <span className="font-semibold text-fg">{selected.title || selected.chatId}</span>. Её участникам WarpBuilder открыт, пока они в
                  группе.
                </>
              ) : (
                "Выберите группу подписчиков Boosty — её участникам WarpBuilder откроется сам, без кода."
              )}
            </p>
            <p className="mt-1 text-xs text-fg-3">{MODE[groups.data!.updates.mode] ?? ""}</p>
            {isOwner && (
              <div className="mt-3">
                <p className="mb-2 text-xs text-fg-3">Группы, где есть бот WarpHub (нет нужной — напишите в ней любое сообщение):</p>
                {groups.data!.groups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-fg-3">Бот пока не видел ни одной группы.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {groups.data!.groups.map((g) => (
                      <button
                        key={g.chatId}
                        type="button"
                        disabled={select.isPending}
                        aria-pressed={g.selected}
                        onClick={async () => {
                          if (g.selected) {
                            if (await confirmAsk("Отключить группу? Доступ через Boosty перестанет действовать.")) select.mutate(null);
                          } else select.mutate(g.chatId);
                        }}
                        className={clsx(
                          "flex min-h-11 items-center gap-2 rounded-xl px-3 text-left font-semibold disabled:opacity-60",
                          g.selected ? "bg-accent text-accent-foreground" : "bg-white/[0.06] text-fg active:bg-white/10",
                        )}
                      >
                        <Users className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{g.title || `Группа ${g.chatId}`}</span>
                        {!g.botIsAdmin && <span className={clsx("text-xs font-medium", g.selected ? "" : "text-fg-3")}>бот не админ?</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {selected && !!members.data?.length && (
              <ul className="mt-3 divide-y divide-white/10 border-t border-white/10">
                {members.data.map((m) => (
                  <li key={m.telegramId} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">
                      {m.firstName ?? `ID ${m.telegramId}`}
                      {m.lastName ? ` ${m.lastName}` : ""}
                      {m.username ? <span className="text-fg-3"> @{m.username}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-fg-3">через Boosty · {when(m.since)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
