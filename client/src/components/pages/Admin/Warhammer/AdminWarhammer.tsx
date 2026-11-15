import { useNow } from "@/hooks/useNow";
import {
  getAdminWarhammerDay,
  moveAdminReservation,
  type AdminPlayer,
  type AdminSession,
} from "@/apiUtils/adminWarhammer";
import { experienceLabelOf, isPaintingDetails, isWhPlayerDetails, clubArmyLabel, gameHasPoints } from "@/apiUtils/booking";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { dateKeyOf, formatClubTimeRange, getClubToday } from "@/utils/clubTime";
import { formatCalendarDate } from "@/utils/date";
import { userLabel } from "@/utils/user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  HelpCircle,
  RefreshCw,
  Repeat,
  Lock,
  Swords,
} from "lucide-react";
import HoldCard from "@/components/pages/Admin/TableHolds/HoldCard";
import UpcomingHolds from "@/components/pages/Admin/TableHolds/UpcomingHolds";
import ClubArmyCalendar from "./ClubArmyCalendar";
import LeagueDisputes from "./LeagueDisputes";
import TableHoldSheet from "@/components/pages/Admin/TableHolds/TableHoldSheet";
import { DsButton, Skeleton } from "@/components/ui/ds";
import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";

const shiftDate = (dateKey: string, days: number) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return dateKeyOf(new Date(y!, m! - 1, d! + days));
};

const keyToDate = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

export default function AdminWarhammer() {
  const [dateKey, setDateKey] = useState(() => dateKeyOf(getClubToday()));
  const [holdOpen, setHoldOpen] = useState(false);
  const options = useBookingOptions();

  const dayQuery = useQuery({
    queryKey: ["admin-warhammer-day", dateKey],
    queryFn: () => getAdminWarhammerDay(dateKey),
  });

  const day = dayQuery.data;
  const waiting = useMemo(
    () =>
      (day?.sessions ?? []).filter(
        (session) => session.capacity >= 2 && session.freeSeats > 0,
      ),
    [day],
  );
  const helpNeeded = (day?.painting ?? []).filter(
    (booking) => isPaintingDetails(booking.details) && booking.details.needsHelp,
  );

  return (
    <div className="px-4 py-3 pb-28 text-white sm:px-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold uppercase leading-none">Столы Warhammer</h1>
          <p className="mt-1 text-sm text-fg-3">
            Игры, тренировки и покраска за день (время клуба)
          </p>
        </div>
        <button
          type="button"
          onClick={() => dayQuery.refetch()}
          disabled={dayQuery.isFetching}
          aria-label="Обновить"
          className="flex ds-hit size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/3 active:bg-white/10 disabled:opacity-60"
        >
          <RefreshCw className={clsx("size-4", dayQuery.isFetching && "animate-spin")} />
        </button>
      </div>

      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          aria-label="Предыдущий день"
          onClick={() => setDateKey((key) => shiftDate(key, -1))}
          className="flex ds-hit size-10 items-center justify-center rounded-xl border border-white/10 bg-white/3 active:bg-white/10"
        >
          <ChevronLeft className="size-5" />
        </button>
        <input
          type="date"
          value={dateKey}
          onChange={(event) => event.target.value && setDateKey(event.target.value)}
          className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-accent [color-scheme:dark]"
        />
        <button
          type="button"
          aria-label="Следующий день"
          onClick={() => setDateKey((key) => shiftDate(key, 1))}
          className="flex ds-hit size-10 items-center justify-center rounded-xl border border-white/10 bg-white/3 active:bg-white/10"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <p className="-mt-3 mb-4 text-sm capitalize text-fg-2">
        {formatCalendarDate(keyToDate(dateKey))}
      </p>
      <DsButton variant="secondary" onClick={() => setHoldOpen(true)} className="mb-5 w-full">
        <Lock className="size-4" />
        Забронировать стол
      </DsButton>
      <AnimatePresence>
        {holdOpen && <TableHoldSheet prefill={{ dateKey }} onClose={() => setHoldOpen(false)} />}
      </AnimatePresence>
      <ClubArmyCalendar />
      <LeagueDisputes />

      {dayQuery.isLoading ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Загружаем день">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[96px] rounded-2xl" />
          ))}
        </div>
      ) : dayQuery.isError || !day ? (
        <p className="rounded-xl border border-white/10 bg-app-elevated px-4 py-5 text-sm text-fg-2">
          Не удалось загрузить данные: {dayQuery.error?.message}
        </p>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile
              label="Ждут соперника"
              value={waiting.length}
              highlight={waiting.length > 0}
            />
            <SummaryTile
              label="Покраска · нужна помощь"
              value={`${day.painting.length} · ${helpNeeded.length}`}
              highlight={helpNeeded.length > 0}
            />
          </div>

          {day.holds.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Брони столов в этот день</h2>
              <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-3">
                {day.holds.map((hold) => (
                  <HoldCard key={hold.id} hold={hold} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">Игры и тренировки</h2>
            {day.sessions.length === 0 ? (
              <EmptyBox>На этот день записей нет.</EmptyBox>
            ) : (
              <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-3">
                {day.sessions.map((session) => (
                  <SessionAdminCard
                    key={`${session.serviceId}-${session.tableId}-${session.startsAt}`}
                    session={session}
                    tables={day.tables}
                    experienceLabel={(value) => experienceLabelOf(options, value)}
                    dateKey={dateKey}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">Ближайшие брони столов</h2>
            <p className="mb-3 text-xs text-fg-3">Все брони, которые ещё не закончились, — по всем дням</p>
            <UpcomingHolds />
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">Покраска миниатюр</h2>
            <p className="mb-3 text-xs text-fg-3">
              Вместимость: {day.paintingCapacity ?? "—"} человек одновременно
            </p>
            {day.painting.length === 0 ? (
              <EmptyBox>Записей на покраску нет.</EmptyBox>
            ) : (
              <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-3">
                {day.painting.map((booking) => {
                  const details = isPaintingDetails(booking.details)
                    ? booking.details
                    : null;
                  return (
                    <article
                      key={booking.reservationId}
                      className={clsx(
                        "rounded-xl border bg-app-elevated p-4 text-sm",
                        details?.needsHelp ? "border-yellow-400/50" : "border-white/10",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{userLabel(booking.user)}</p>
                          <p className="mt-0.5 text-fg-2">
                            {formatClubTimeRange(booking.startsAt, booking.endsAt)} ·{" "}
                            {booking.partySize} чел.
                          </p>
                        </div>
                        {details?.needsHelp && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-yellow-400/15 px-2.5 py-1 text-xs font-semibold text-yellow-200">
                            <HelpCircle className="size-3.5" />
                            Нужна помощь
                          </span>
                        )}
                      </div>
                      {details ? (
                        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                          <dt className="text-fg-3">Фракция</dt>
                          <dd>{details.faction}</dd>
                          <dt className="text-fg-3">Модель</dt>
                          <dd>{details.model}</dd>
                          <dt className="text-fg-3">Краски</dt>
                          <dd>
                            {options.paintSources.find((s) => s.value === details.paintSource)
                              ?.label ?? details.paintSource}
                          </dd>
                          {details.comment && (
                            <>
                              <dt className="text-fg-3">Комментарий</dt>
                              <dd>{details.comment}</dd>
                            </>
                          )}
                        </dl>
                      ) : (
                        <p className="mt-2 text-xs text-fg-3">
                          Запись создана до обновления — данных формы нет.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border px-3 py-3",
        highlight ? "border-yellow-400/40 bg-yellow-400/10" : "border-white/10 bg-app-elevated",
      )}
    >
      <p className="text-xs text-fg-3">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-white/10 bg-app-elevated px-4 py-5 text-sm text-fg-2">
      {children}
    </p>
  );
}

function SessionAdminCard({
  session,
  tables,
  experienceLabel,
  dateKey,
}: {
  session: AdminSession;
  tables: Array<{ id: number; name: string }>;
  experienceLabel: (value: string) => string;
  dateKey: string;
}) {
  const waitingForOpponent = session.capacity >= 2 && session.freeSeats > 0;

  return (
    <article
      className={clsx(
        "rounded-xl border bg-app-elevated p-4",
        waitingForOpponent ? "border-yellow-400/50" : "border-white/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">
            {formatClubTimeRange(session.startsAt, session.endsAt)}
          </p>
          <p className="mt-0.5 text-sm text-fg-2">
            {session.serviceTitle ?? session.serviceSlug} · {session.tableName}
          </p>
        </div>
        <span
          className={clsx(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
            session.freeSeats <= 0
              ? "bg-green-400/15 text-green-300"
              : "bg-yellow-400/15 text-yellow-200",
          )}
        >
          {session.occupied}/{session.capacity}
          {waitingForOpponent ? " · ищет соперника" : ""}
        </span>
      </div>

      {session.hasTrainer && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
          <GraduationCap className="size-3.5" />+ Тренер
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {session.players.map((player) => (
          <PlayerRow
            key={player.reservationId}
            player={player}
            session={session}
            tables={tables}
            experienceLabel={experienceLabel}
            dateKey={dateKey}
          />
        ))}
      </ul>
    </article>
  );
}

function PlayerRow({
  player,
  session,
  tables,
  experienceLabel,
  dateKey,
}: {
  player: AdminPlayer;
  session: AdminSession;
  tables: Array<{ id: number; name: string }>;
  experienceLabel: (value: string) => string;
  dateKey: string;
}) {
  const queryClient = useQueryClient();
  const [moving, setMoving] = useState(false);
  const otherTables = tables.filter((table) => table.id !== session.tableId);
  const details = isWhPlayerDetails(player.details) ? player.details : null;
  const clubArmy = player.seatClubArmyOptions?.some(Boolean) ?? false;
  const now = useNow();
  const isFuture = new Date(session.startsAt).getTime() > now;

  const moveMutation = useMutation({
    meta: { success: "Запись перенесена на другой стол" },
    mutationFn: (tableId: number) =>
      moveAdminReservation(player.reservationId, tableId),
    onSuccess: () => {
      setMoving(false);
      queryClient.invalidateQueries({ queryKey: ["admin-warhammer-day", dateKey] });
      queryClient.invalidateQueries({ queryKey: ["admin-reservations"] });
    },
  });

  return (
    <li className="rounded-lg border border-white/10 bg-white/3 px-3 py-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-semibold">
            <Swords className="size-3.5 text-accent" />
            {userLabel(player.user)}
          </p>
          {details ? (
            <p className="mt-1 text-xs text-fg-2">
              {details.game === "kt" ? "Kill Team" : details.game === "warcry" ? "Warcry" : details.game === "aos" ? "Age of Sigmar" : "Warhammer 40,000"} · {details.army}
              {details.points != null && gameHasPoints(details.game) ? ` · ${details.points} очков` : ""} · {experienceLabel(details.experienceLevel)}
              {clubArmy ? ` · ${clubArmyLabel(details.game).toLowerCase()}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-fg-3">
              Данных игрока нет (запись до обновления)
            </p>
          )}
          {player.status === "pending" && (
            <p className="mt-1 text-[12px] text-yellow-300">Ожидает подтверждения</p>
          )}
        </div>

        {isFuture && otherTables.length > 0 && !moving && (
          <button
            type="button"
            onClick={() => setMoving(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs font-semibold text-white/80 active:bg-white/10"
          >
            <Repeat className="size-3.5" />
            Пересадить
          </button>
        )}
      </div>

      {moving && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-fg-3">Перенести за стол (время не меняется):</p>
          <div className="flex flex-wrap gap-2">
            {otherTables.map((table) => (
              <button
                key={table.id}
                type="button"
                disabled={moveMutation.isPending}
                onClick={() => moveMutation.mutate(table.id)}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-60"
              >
                {table.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMoving(false);
                moveMutation.reset();
              }}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80"
            >
              Отмена
            </button>
          </div>
          {moveMutation.isError && (
            <p className="text-xs text-red-300">{moveMutation.error.message}</p>
          )}
        </div>
      )}
    </li>
  );
}
