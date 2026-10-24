import { useNow } from "@/hooks/useNow";
import {
  deleteAdminDndGame,
  DND_GAME_STATUS_LABELS,
  DND_TRIAL_STATUS_LABELS,
  getAdminDndGameBookings,
  getAdminDndGames,
  getAdminTrialRequests,
  updateAdminTrialRequest,
  type AdminDndGame,
  type DndTrialRequest,
  type DndTrialStatus,
  type DndUser,
  flexibleLabel,
} from "@/apiUtils/dnd";
import { formatClub, formatClubTimeRange } from "@/utils/clubTime";
import { userLabel } from "@/utils/user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Lock,
  PencilLine,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { GameEditorModal } from "./GameEditorModal";
import { emptyGameDraft } from "./gameDraft";

const TABS = [
  { id: "games", label: "Игры" },
  { id: "trials", label: "Заявки «Хочу попробовать»" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminDnd() {
  const [tab, setTab] = useState<TabId>("games");

  return (
    <div className="px-4 py-3 pb-28 text-white sm:px-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">D&D</h1>
        <p className="mt-1 text-sm text-white/50">
          Игры по расписанию и заявки на пробную игру
        </p>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={clsx(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm",
              tab === item.id
                ? "bg-accent text-accent-foreground"
                : "border border-white/10 bg-white/3 text-white/80 active:bg-white/10",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "games" ? <GamesTab /> : <TrialsTab />}
    </div>
  );
}

const gameDateLabel = (game: AdminDndGame) =>
  game.startsAt
    ? `${formatClub(game.startsAt, { weekday: "short", day: "numeric", month: "long" })} · ${formatClubTimeRange(game.startsAt, game.endsAt)}`
    : `${flexibleLabel(game)} · время уточнит Мастер`;

/** Игра без точного времени не уходит в прошлое сама — её закрывает или отменяет администратор */
const notPast = (game: AdminDndGame, now: number) => !game.startsAt || new Date(game.startsAt).getTime() >= now;

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-white/10 text-white/70",
  open: "bg-green-400/15 text-green-300",
  closed: "bg-yellow-400/15 text-yellow-200",
  cancelled: "bg-red-400/15 text-red-300",
};

function GamesTab() {
  const gamesQuery = useQuery({
    queryKey: ["admin-dnd-games"],
    queryFn: getAdminDndGames,
  });
  const [editing, setEditing] = useState<AdminDndGame | "new" | null>(null);
  const [showPast, setShowPast] = useState(false);

  const games = gamesQuery.data ?? [];
  const now = useNow();
  // сначала игры без точного времени, затем по началу
  const upcoming = games
    .filter((game) => notPast(game, now))
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const past = games.filter((game) => !notPast(game, now));

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground active:scale-95"
        >
          <Plus className="size-4" />
          Новая игра
        </button>
        <button
          type="button"
          aria-label="Обновить"
          onClick={() => gamesQuery.refetch()}
          className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/3 active:bg-white/10"
        >
          <RefreshCw className={clsx("size-4", gamesQuery.isFetching && "animate-spin")} />
        </button>
      </div>

      {gamesQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <LoaderCircle className="size-8 animate-spin text-accent" />
        </div>
      ) : gamesQuery.isError ? (
        <p className="text-sm text-red-300">{gamesQuery.error.message}</p>
      ) : (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
          {upcoming.length === 0 && (
            <p className="rounded-xl border border-white/10 bg-app-elevated px-4 py-5 text-sm text-white/60 lg:col-span-2">
              Предстоящих игр нет. Нажмите «Новая игра», чтобы создать первую.
            </p>
          )}
          {upcoming.map((game) => (
            <AdminGameCard key={game.id} game={game} onEdit={() => setEditing(game)} />
          ))}

          {past.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPast((value) => !value)}
              className="mt-2 text-left text-sm font-medium text-white/60 hover:text-white lg:col-span-2"
            >
              {showPast ? "Скрыть прошедшие" : `Показать прошедшие (${past.length})`}
            </button>
          )}
          {showPast &&
            past.map((game) => (
              <AdminGameCard key={game.id} game={game} onEdit={() => setEditing(game)} />
            ))}
        </div>
      )}

      {editing && (
        <GameEditorModal
          game={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AdminGameCard({
  game,
  onEdit,
}: {
  game: AdminDndGame;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const bookingsQuery = useQuery({
    queryKey: ["admin-dnd-bookings", game.id],
    queryFn: () => getAdminDndGameBookings(game.id),
    enabled: expanded,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminDndGame(game.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-dnd-games"] });
      queryClient.invalidateQueries({ queryKey: ["dnd-games"] });
    },
  });

  return (
    <article className="rounded-xl border border-white/10 bg-app-elevated">
      <div className="flex gap-3 p-4">
        {game.imageUrl && (
          <img src={game.imageUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                STATUS_STYLES[game.status],
              )}
            >
              {DND_GAME_STATUS_LABELS[game.status]}
            </span>
            <span className="text-xs text-white/50">{game.gameType}</span>
          </div>
          <h3 className="mt-1 truncate text-base font-semibold">{game.title}</h3>
          <p className="text-sm text-white/60">{gameDateLabel(game)}</p>
          <p className="mt-1 text-sm">
            Занято <b>{game.occupied}</b> из {game.capacity} · записей: {game.bookingsCount}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold active:bg-white/10"
        >
          <PencilLine className="size-3.5" />
          Изменить
        </button>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold active:bg-white/10"
        >
          <Users className="size-3.5" />
          Записи
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        {game.occupied === 0 && (
          <button
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm(`Удалить игру «${game.title}»?`)) deleteMutation.mutate();
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-200 active:bg-red-400/10"
          >
            <Trash2 className="size-3.5" />
            Удалить
          </button>
        )}
      </div>
      {deleteMutation.isError && (
        <p className="px-4 pb-3 text-xs text-red-300">{deleteMutation.error.message}</p>
      )}

      {expanded && (
        <div className="border-t border-white/10 px-4 py-3">
          {bookingsQuery.isLoading ? (
            <LoaderCircle className="size-5 animate-spin text-accent" />
          ) : (bookingsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-white/50">Пока никто не записался.</p>
          ) : (
            <ul className="space-y-2">
              {bookingsQuery.data!.map((booking) => (
                <li
                  key={booking.id}
                  className={clsx(
                    "rounded-lg bg-white/3 px-3 py-2 text-sm",
                    booking.status === "cancelled" && "opacity-50",
                  )}
                >
                  <p className="font-semibold">{userLabel(booking.user)}</p>
                  <p className="text-xs text-white/65">
                    Мест: {booking.quantity} · время удобно:{" "}
                    {booking.timeIsConvenient ? "да" : "нет"} · опыт:{" "}
                    {booking.experienceLabel ?? "—"}
                    {booking.status === "cancelled" ? " · отменена" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

const TRIAL_FILTERS: Array<{ id: DndTrialStatus | "all"; label: string }> = [
  { id: "new", label: "Новые" },
  { id: "grouped", label: "Собраны" },
  { id: "cancelled", label: "Отменены" },
  { id: "all", label: "Все" },
];

type TrialRow = DndTrialRequest & { user: DndUser };

function TrialsTab() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<DndTrialStatus | "all">("new");
  const [selected, setSelected] = useState<string[]>([]);
  const [grouping, setGrouping] = useState(false);
  const [creatingGame, setCreatingGame] = useState(false);

  const trialsQuery = useQuery({
    queryKey: ["admin-dnd-trials", filter],
    queryFn: () => getAdminTrialRequests(filter === "all" ? undefined : filter),
  });
  const gamesQuery = useQuery({
    queryKey: ["admin-dnd-games"],
    queryFn: getAdminDndGames,
    enabled: grouping,
  });

  const trials = trialsQuery.data ?? [];
  const selectedTrials = trials.filter((trial) => selected.includes(trial.id));
  const selectedPlayers = selectedTrials.reduce((sum, t) => sum + t.playersCount, 0);

  const updateMutation = useMutation({
    mutationFn: ({ id, status, gameId }: { id: string; status: DndTrialStatus; gameId?: number }) =>
      updateAdminTrialRequest(id, { status, gameId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-dnd-trials"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dnd-games"] });
    },
  });

  const groupMutation = useMutation({
    mutationFn: async (gameId: number) => {
      for (const id of selected) {
        await updateAdminTrialRequest(id, { status: "grouped", gameId });
      }
    },
    onSuccess: () => {
      setSelected([]);
      setGrouping(false);
      queryClient.invalidateQueries({ queryKey: ["admin-dnd-trials"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dnd-games"] });
    },
  });

  const now = useNow();
  const upcomingGames = useMemo(
    () =>
      (gamesQuery.data ?? []).filter(
        (game) =>
          notPast(game, now) &&
          game.status !== "cancelled",
      ),
    [gamesQuery.data, now],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {TRIAL_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setFilter(item.id);
              setSelected([]);
            }}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-xs font-semibold",
              filter === item.id
                ? "bg-white text-black"
                : "border border-white/10 bg-white/3 text-white/80",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filter === "new" && (
        <div className="mb-4 rounded-xl border border-white/10 bg-app-elevated p-3 text-sm">
          <p className="text-white/70">
            Отметьте заявки и объедините их в игру — участники получат
            приглашение в Telegram и смогут записаться.
          </p>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => setGrouping(true)}
            className="mt-3 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:bg-white/10 disabled:text-white/40"
          >
            Объединить в игру
            {selected.length > 0 ? ` (${selected.length} заявк., ${selectedPlayers} игрок.)` : ""}
          </button>
        </div>
      )}

      {trialsQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <LoaderCircle className="size-8 animate-spin text-accent" />
        </div>
      ) : trials.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-app-elevated px-4 py-5 text-sm text-white/60">
          Заявок нет.
        </p>
      ) : (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
          {trials.map((trial) => (
            <TrialCard
              key={trial.id}
              trial={trial}
              selectable={trial.status === "new"}
              selected={selected.includes(trial.id)}
              onToggle={() =>
                setSelected((current) =>
                  current.includes(trial.id)
                    ? current.filter((id) => id !== trial.id)
                    : [...current, trial.id],
                )
              }
              onStatus={(status) => updateMutation.mutate({ id: trial.id, status })}
              busy={updateMutation.isPending && updateMutation.variables?.id === trial.id}
            />
          ))}
        </div>
      )}

      {grouping && !creatingGame && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/70 px-3 pb-4 pt-8 sm:items-center"
          onClick={() => !groupMutation.isPending && setGrouping(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-app-elevated p-5 text-white"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Объединить в игру</h2>
            <p className="mt-1 text-sm text-white/60">
              Заявок: {selected.length}, игроков: {selectedPlayers}
            </p>

            <button
              type="button"
              onClick={() => setCreatingGame(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground"
            >
              <Plus className="size-4" />
              Создать новую игру
            </button>

            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-accent">
              Или выберите существующую
            </p>
            {gamesQuery.isLoading ? (
              <LoaderCircle className="size-5 animate-spin text-accent" />
            ) : upcomingGames.length === 0 ? (
              <p className="text-sm text-white/50">Предстоящих игр нет.</p>
            ) : (
              <div className="space-y-2">
                {upcomingGames.map((game) => (
                  <button
                    key={game.id}
                    type="button"
                    disabled={groupMutation.isPending}
                    onClick={() => groupMutation.mutate(game.id)}
                    className="w-full rounded-lg border border-white/10 bg-white/3 px-3 py-2.5 text-left text-sm active:bg-white/10 disabled:opacity-60"
                  >
                    <p className="font-semibold">{game.title}</p>
                    <p className="text-xs text-white/60">
                      {gameDateLabel(game)} · свободно {game.available} из {game.capacity}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {groupMutation.isError && (
              <p className="mt-3 text-sm text-red-300">{groupMutation.error.message}</p>
            )}
            <button
              type="button"
              onClick={() => setGrouping(false)}
              className="mt-4 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {creatingGame && (
        <GameEditorModal
          title="Новая игра для заявок"
          initialDraft={emptyGameDraft({
            title: "Пробная игра D&D",
            gameType: "Пробная игра",
            capacity: String(Math.max(selectedPlayers, 1)),
          })}
          onClose={() => setCreatingGame(false)}
          onSaved={(game) => groupMutation.mutate(game.id)}
        />
      )}
    </div>
  );
}

function TrialCard({
  trial,
  selectable,
  selected,
  onToggle,
  onStatus,
  busy,
}: {
  trial: TrialRow;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onStatus: (status: DndTrialStatus) => void;
  busy: boolean;
}) {
  return (
    <article
      className={clsx(
        "rounded-xl border bg-app-elevated p-4 text-sm",
        selected ? "border-accent" : "border-white/10",
      )}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label="Выбрать заявку"
            className="mt-1 size-4 shrink-0 accent-accent"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{userLabel(trial.user)}</p>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/75">
              {DND_TRIAL_STATUS_LABELS[trial.status]}
            </span>
          </div>
          <p className="mt-1 text-white/75">
            Игроков: <b>{trial.playersCount}</b>
            {trial.isPrivate && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-accent">
                <Lock className="size-3" /> своей компанией
              </span>
            )}
          </p>
          <p className="text-white/75">
            Время:{" "}
            {trial.preferredTimeLabels.length ? trial.preferredTimeLabels.join(", ") : "любое"}
            {" · "}Опыт: {trial.experienceLabel ?? "не указан"}
          </p>
          {trial.notes && <p className="mt-1 text-white/60">«{trial.notes}»</p>}
          <p className="mt-1 text-xs text-white/40">
            {formatClub(trial.createdAt, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {trial.status !== "cancelled" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus("cancelled")}
            className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-semibold text-red-200 disabled:opacity-60"
          >
            Отменить заявку
          </button>
        )}
        {trial.status !== "new" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus("new")}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 disabled:opacity-60"
          >
            Вернуть в новые
          </button>
        )}
      </div>
    </article>
  );
}
