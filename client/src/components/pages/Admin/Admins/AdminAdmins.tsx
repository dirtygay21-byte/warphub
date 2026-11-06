import { addAdmin, getAdmins, removeAdmin, type AdminEntry } from "@/apiUtils/admin";
import { confirmAsk } from "@/features/roster/telegram";
import { formatClub } from "@/utils/clubTime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { LoaderCircle, RefreshCw, ShieldCheck, ShieldPlus, UserX } from "lucide-react";
import { useState } from "react";

/** «6 окт., 14:30» во времени клуба */
const when = (value: string) => formatClub(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Администраторы (N3): основные (из кода и .env сервера — удалить нельзя) и добавленные по Telegram ID.
 * Добавлять и удалять могут только основные администраторы; доступ появляется и пропадает сразу.
 */
export default function AdminAdmins() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["admin-admins"], queryFn: getAdmins });
  const [telegramId, setTelegramId] = useState("");
  const [note, setNote] = useState("");
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin-admins"] });

  const add = useMutation({
    meta: { success: "Администратор добавлен", error: true },
    mutationFn: () => addAdmin(telegramId.trim(), note.trim()),
    onSuccess: () => {
      setTelegramId("");
      setNote("");
      refresh();
    },
  });
  const remove = useMutation({ meta: { success: "Администратор удалён", error: true }, mutationFn: removeAdmin, onSuccess: refresh });
  const idOk = /^\d{1,15}$/.test(telegramId.trim()) && Number(telegramId) > 0;
  const canManage = list.data?.canManage ?? false;

  const ask = async (a: AdminEntry) => {
    if (await confirmAsk(`Убрать права администратора у ${a.name ?? a.telegramId}?`)) remove.mutate(a.telegramId);
  };

  return (
    <div className="px-4 py-3 pb-28 text-white sm:px-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Администраторы</h1>
          <p className="mt-1 text-sm text-fg-3">Доступ к админке по Telegram ID.</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          aria-label="Обновить"
          className="flex ds-hit size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-fg-2 active:bg-white/10"
        >
          <RefreshCw className={clsx("size-4", list.isFetching && "animate-spin")} />
        </button>
      </div>

      {canManage ? (
        <form
          className="mb-6 grid gap-2 rounded-2xl border border-white/10 bg-white/3 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (idOk) add.mutate();
          }}
        >
          <label className="text-sm text-fg-2" htmlFor="admin-tg-id">
            Telegram ID нового администратора
          </label>
          <input
            id="admin-tg-id"
            inputMode="numeric"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="например, 123456789"
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-base text-white outline-none focus:border-accent"
          />
          <input
            value={note}
            maxLength={100}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Пометка (необязательно): имя, кто это"
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!idOk || add.isPending}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95 disabled:opacity-50"
          >
            {add.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldPlus className="size-4" />}
            Добавить администратора
          </button>
          <p className="text-xs text-fg-3">
            Telegram ID человек может узнать, например, у бота @userinfobot. Доступ появится сразу; бот пришлёт ему сообщение, если он нажимал «Старт».
          </p>
        </form>
      ) : (
        <p className="mb-6 rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm text-fg-2">
          Добавлять и удалять администраторов могут только основные администраторы.
        </p>
      )}

      {[add, remove].map((m, i) =>
        m.isError ? (
          <div key={i} className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {m.error.message}
          </div>
        ) : null,
      )}

      {list.isLoading && <LoaderCircle className="mx-auto size-8 animate-spin text-accent" />}
      {list.isError && <p className="text-sm text-red-300">Не удалось загрузить список администраторов.</p>}

      <ul className="grid gap-2">
        {list.data?.admins.map((a) => (
          <li key={a.telegramId} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/3 px-3 py-3">
            <div className={clsx("flex size-10 shrink-0 items-center justify-center rounded-full", a.builtin ? "bg-accent/15 text-accent" : "bg-white/10 text-white/80")}>
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {a.name ?? "Ещё не входил в приложение"}
                {a.username && <span className="font-normal text-fg-3"> @{a.username}</span>}
              </p>
              <p className="text-xs text-fg-3">
                ID {a.telegramId}
                {a.builtin ? " · основной" : a.addedAt ? ` · добавлен ${when(a.addedAt)}` : ""}
                {a.note ? ` · ${a.note}` : ""}
              </p>
            </div>
            {canManage && !a.builtin && (
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => void ask(a)}
                className="flex items-center gap-1.5 rounded-lg border border-red-400/30 px-2.5 py-1.5 text-xs font-semibold text-red-300 active:bg-red-400/10 disabled:opacity-50"
              >
                <UserX className="size-3.5" />
                Убрать
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
