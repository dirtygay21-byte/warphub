import { SUPPORTER_LABELS, type SupporterTitle } from "@/apiUtils/progress";
import { listSupporters, searchSupporterCandidates, setSupporterTitle, type SupporterRow } from "@/apiUtils/supporters";
import { inputClassName } from "@/components/booking/FormControls";
import { formatClub } from "@/utils/clubTime";
import { haptic } from "@/utils/haptic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { LoaderCircle, Search } from "lucide-react";
import { useState } from "react";

const TITLES: SupporterTitle[] = ["flame", "crown", "banner"];

const nameOf = (u: SupporterRow["user"]) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") + (u.username ? ` · @${u.username}` : "");

/**
 * Поддержка клуба (30.10.2026): найти игрока по @username или Telegram ID и назначить звание —
 * Пламя варпа, Корона клуба или Знамя (особая рамка аватара и значок в профиле); снять — «Без звания».
 */
export default function AdminSupporters() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const list = useQuery({ queryKey: ["admin-supporters"], queryFn: listSupporters });
  const search = useQuery({ queryKey: ["admin-supporters-search", query], queryFn: () => searchSupporterCandidates(query), enabled: query.length > 0 });

  return (
    <div className="px-4 py-3 pb-28 text-fg sm:px-6">
      <h1 className="text-2xl font-semibold">Поддержка клуба</h1>
      <p className="mt-1 text-sm text-fg-2">Особое звание для тех, кто поддерживает клуб: рамка аватара и значок в профиле игрока.</p>

      <form
        className="mt-5 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(q.trim());
        }}
      >
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="@username или Telegram ID" className={inputClassName} aria-label="Найти игрока" />
        <button type="submit" aria-label="Найти" className="ds-press flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Search className="size-5" />
        </button>
      </form>

      {query && (
        <section className="mt-4 space-y-3">
          {search.isLoading ? (
            <LoaderCircle className="size-6 animate-spin text-accent" />
          ) : (search.data ?? []).length === 0 ? (
            <p className="text-sm text-fg-2">Никого не нашли. Игрок должен хотя бы раз открыть приложение.</p>
          ) : (
            search.data!.map((row) => <PlayerCard key={row.user.id} row={row} />)
          )}
        </section>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Сейчас со званием</h2>
      {list.isLoading ? (
        <LoaderCircle className="size-6 animate-spin text-accent" />
      ) : list.isError ? (
        <p className="text-sm text-danger">Не удалось загрузить: {list.error.message}</p>
      ) : (list.data ?? []).length === 0 ? (
        <p className="rounded-[16px] border border-white/10 bg-app-elevated px-4 py-5 text-sm text-fg-2">Пока ни у кого нет звания.</p>
      ) : (
        <div className="space-y-3">
          {list.data!.map((row) => (
            <PlayerCard key={row.user.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerCard({ row }: { row: SupporterRow }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    meta: { success: "Статус поддержки обновлён" },
    mutationFn: (title: SupporterTitle | null) => setSupporterTitle(row.user.id, title),
    onSuccess: () => {
      haptic.ok();
      queryClient.invalidateQueries({ queryKey: ["admin-supporters"] });
      queryClient.invalidateQueries({ queryKey: ["admin-supporters-search"] });
    },
  });
  const current = mutation.data ? mutation.data.title : row.title;
  return (
    <article className="rounded-[16px] border border-white/10 bg-app-elevated p-4">
      <p className="text-base font-semibold">{nameOf(row.user)}</p>
      <p className="mt-0.5 text-[13px] text-fg-3">
        Telegram ID {row.user.telegramId}
        {current && row.grantedAt ? ` · звание с ${formatClub(row.grantedAt, { day: "numeric", month: "long" })}` : ""}
        {current && row.grantedByTelegramId ? ` · назначил ID ${row.grantedByTelegramId}` : ""}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[...TITLES, null].map((title) => (
          <button
            key={title ?? "none"}
            type="button"
            disabled={mutation.isPending}
            onClick={() => title !== current && mutation.mutate(title)}
            aria-pressed={title === current}
            className={clsx(
              "ds-press min-h-11 rounded-xl border px-3 text-[14px] font-semibold disabled:opacity-60",
              title === current ? "border-accent bg-accent text-accent-foreground" : "border-white/[0.14] bg-field text-fg",
            )}
          >
            {title ? `★ ${SUPPORTER_LABELS[title]}` : "Без звания"}
          </button>
        ))}
      </div>
      {mutation.isError && <p className="mt-2 text-[13px] text-danger">{mutation.error.message}</p>}
    </article>
  );
}
