import {
  createRosterCode,
  getRosterAccess,
  getRosterAccessList,
  getRosterCodes,
  revokeRosterAccess,
  revokeRosterCode,
  type CreatedRosterCode,
  type RosterCode,
} from "@/apiUtils/roster";
import { confirmAsk } from "@/features/roster/telegram";
import { formatClub } from "@/utils/clubTime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { KeyRound, LoaderCircle, RefreshCw, Send, Swords, UserX, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

/** «6 окт., 14:30» во времени клуба */
const when = (value: string) => formatClub(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const STATUS: Record<RosterCode["status"], { label: string; className: string }> = {
  active: { label: "Активен", className: "bg-accent text-accent-foreground" },
  used: { label: "Использован", className: "bg-white/10 text-fg-2" },
  expired: { label: "Истёк", className: "bg-white/5 text-fg-3" },
  revoked: { label: "Отозван", className: "bg-red-400/10 text-red-300" },
};

export default function AdminRoster() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [created, setCreated] = useState<CreatedRosterCode | null>(null);

  const me = useQuery({ queryKey: ["roster-access"], queryFn: getRosterAccess });
  const codes = useQuery({ queryKey: ["admin-roster-codes"], queryFn: getRosterCodes });
  const access = useQuery({ queryKey: ["admin-roster-access"], queryFn: getRosterAccessList });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-roster-codes"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-roster-access"] });
  };

  const create = useMutation({
    meta: { success: "Код доступа создан", error: true },
    mutationFn: createRosterCode,
    onSuccess: (data) => {
      setCreated(data);
      refresh();
    },
  });
  const revokeCode = useMutation({ meta: { success: "Код отозван", error: true }, mutationFn: revokeRosterCode, onSuccess: refresh });
  const revokeAccess = useMutation({ meta: { success: "Доступ отозван", error: true }, mutationFn: revokeRosterAccess, onSuccess: refresh });

  const activeCount = codes.data?.filter((c) => c.status === "active").length ?? 0;

  return (
    <div className="px-4 py-3 pb-28 text-white sm:px-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold uppercase leading-none">WarpBuilder</h1>
          <p className="mt-1 text-sm text-fg-3">
            Скрытый раздел. Открывается по одноразовому коду из 4 цифр.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          aria-label="Обновить"
          className="flex ds-hit size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-fg-2 active:bg-white/10"
        >
          <RefreshCw className={clsx("size-4", (codes.isFetching || access.isFetching) && "animate-spin")} />
        </button>
      </div>

      <div className="mb-6 grid gap-2">
        {me.data?.isOwner ? (
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-accent-foreground transition-transform active:scale-95 disabled:opacity-60"
          >
            {create.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Создать код доступа
          </button>
        ) : (
          <p className="rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm text-fg-2">
            Коды создаёт владелец раздела. Здесь можно посмотреть и отозвать доступ.
          </p>
        )}
        <button
          type="button"
          onClick={() => navigate("/roster", { state: { from: "/admin/roster" } })}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm font-semibold text-white/85 active:bg-white/10"
        >
          <Swords className="size-4" />
          Открыть WarpBuilder
        </button>
      </div>

      {[create, revokeCode, revokeAccess].map((m, i) =>
        m.isError ? (
          <div key={i} className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {m.error.message}
          </div>
        ) : null,
      )}

      {created && (
        <div className="mb-6 rounded-2xl border border-accent/40 bg-app-elevated p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Send className="size-5" />
            </div>
            <div className="min-w-0 flex-1 text-sm">
              {created.delivered ? (
                <>
                  <p className="font-semibold">Код отправлен вам в Telegram</p>
                  <p className="mt-1 text-fg-2">Действует до {when(created.expiresAt)}, один раз.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Бот не смог отправить сообщение</p>
                  <p className="mt-1 text-fg-2">
                    Нажмите «Старт» у @WarpHubBot. Код показан только вам — передайте его сами:
                  </p>
                  <p className="mt-3 text-center text-3xl font-semibold tracking-[0.4em] text-accent tabular-nums">{created.code}</p>
                  <p className="mt-2 text-fg-2">Действует до {when(created.expiresAt)}, один раз.</p>
                </>
              )}
            </div>
            <button type="button" aria-label="Скрыть" onClick={() => setCreated(null)} className="text-fg-3">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-3 flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-fg-3">
          <span>Доступ открыт</span>
          <span className="text-fg-3">{access.data?.length ?? 0}</span>
        </h2>
        {access.isLoading ? (
          <LoaderCircle className="mx-auto size-6 animate-spin text-accent" />
        ) : access.isError ? (
          <LoadError message={access.error.message} onRetry={() => access.refetch()} />
        ) : !access.data?.length ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-fg-3">
            Пока ни у кого. Администраторы видят раздел всегда.
          </p>
        ) : (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-app-elevated">
            {access.data.map((u) => (
              <li key={u.userId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {[u.firstName, u.lastName].filter(Boolean).join(" ")}
                    {u.username && <span className="ml-1.5 font-normal text-fg-3">@{u.username}</span>}
                  </p>
                  <p className="text-xs text-fg-3">с {when(u.grantedAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={revokeAccess.isPending}
                  onClick={async () => {
                    if (await confirmAsk(`Закрыть доступ к WarpBuilder для ${u.firstName}?`)) revokeAccess.mutate(u.userId);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-red-400/30 px-2.5 py-1.5 text-xs font-semibold text-red-300 active:bg-red-400/10"
                >
                  <UserX className="size-3.5" />
                  Закрыть
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-fg-3">
          <span>Коды</span>
          <span className="text-fg-3">активных: {activeCount}</span>
        </h2>
        {codes.isLoading ? (
          <LoaderCircle className="mx-auto size-6 animate-spin text-accent" />
        ) : codes.isError ? (
          <LoadError message={codes.error.message} onRetry={() => codes.refetch()} />
        ) : !codes.data?.length ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-fg-3">Кодов ещё не было.</p>
        ) : (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-app-elevated">
            {codes.data.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    Код №{c.id}
                    <span className={clsx("ml-2 rounded-md px-1.5 py-0.5 text-[12px] font-semibold", STATUS[c.status].className)}>
                      {STATUS[c.status].label}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-fg-3">
                    {c.status === "used"
                      ? `${c.usedByName ?? "—"}${c.usedByUsername ? ` (@${c.usedByUsername})` : ""} · ${when(c.usedAt!)}`
                      : `создан ${when(c.createdAt)} · до ${when(c.expiresAt)}`}
                  </p>
                </div>
                {c.status === "active" && (
                  <button
                    type="button"
                    disabled={revokeCode.isPending}
                    onClick={() => revokeCode.mutate(c.id)}
                    className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-fg-2 active:bg-white/10"
                  >
                    Отозвать
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-4 text-center text-sm">
      <p className="text-red-200">Не удалось загрузить: {message}</p>
      <button type="button" onClick={onRetry} className="mt-2 font-semibold text-white/80 underline">
        Повторить
      </button>
    </div>
  );
}
