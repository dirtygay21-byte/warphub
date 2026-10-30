import { getRosterAccess } from "@/apiUtils/roster";
import type { BookingRoster, BookingGame } from "@/features/roster/bookingRosters";
import { useAuthStore } from "@/stores/useAuthStore";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Swords } from "lucide-react";
import { useState } from "react";

/**
 * «Из WarpBuilder» (W6 30.10.2026): выбрать сохранённый ростер выбранной игры — подставляются армия и очки.
 * Только для пользователей с доступом к WarpBuilder; без доступа ничего не показывается.
 * Модуль ростеров грузится динамически — в форму записи не попадает код WarpBuilder.
 */
export function RosterPick({ game, onPick }: { game: BookingGame; onPick: (r: BookingRoster) => void }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const access = useQuery({ queryKey: ["roster-access"], queryFn: getRosterAccess, enabled: isAuthenticated, retry: false });
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<BookingRoster[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<BookingGame | null>(null);
  if (!access.data?.hasAccess) return null;

  const load = async () => {
    setOpen((v) => !v);
    if (loadedFor === game) return;
    setList(null);
    setError(null);
    try {
      const { bookingRosters } = await import("@/features/roster/bookingRosters");
      setList(await bookingRosters(game));
      setLoadedFor(game);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const shown = loadedFor === game ? list : null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void load()}
        className="flex w-full items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-left text-sm font-semibold text-white active:bg-accent/20"
      >
        <Swords className="size-4 text-accent" />
        <span className="flex-1">Взять из WarpBuilder</span>
        <span className="text-xs font-normal text-white/50">{open ? "Скрыть" : "мои ростеры"}</span>
      </button>
      {open && (
        <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/3 p-2">
          {error ? (
            <p className="px-1 py-1 text-sm text-red-300">{error}</p>
          ) : !shown ? (
            <LoaderCircle className="mx-auto my-2 size-5 animate-spin text-white/50" />
          ) : !shown.length ? (
            <p className="px-1 py-1 text-sm text-white/55">Для этой игры сохранённых ростеров нет.</p>
          ) : (
            shown.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => (onPick(r), setOpen(false))}
                className="block w-full rounded-md px-2 py-1.5 text-left active:bg-white/10"
              >
                <span className="block truncate text-sm font-semibold text-white">{r.name}</span>
                <span className="block truncate text-xs text-white/50">
                  {r.army}
                  {r.points != null ? ` · ${r.points} оч.` : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
