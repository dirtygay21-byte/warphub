import type { AvailabilitySegment, TableSession } from "@/apiUtils/booking";
import { formatClubTime, formatClubTimeRange } from "@/utils/clubTime";
import { getWindowLimit, hoursLabel } from "@/utils/slots";
import { formatDurationLabel } from "@/utils/duration";
import clsx from "clsx";
import { GraduationCap, Swords, UserRound, UsersRound } from "lucide-react";
import type { ReactNode } from "react";

type WindowLimit = ReturnType<typeof getWindowLimit>;

function OccupancyBadge({
  occupied,
  capacity,
}: {
  occupied: number;
  capacity: number;
}) {
  const full = occupied >= capacity;
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
        full
          ? "bg-red-400/15 text-red-300"
          : occupied > 0
            ? "bg-yellow-400/15 text-yellow-200"
            : "bg-green-400/15 text-green-300",
      )}
    >
      {occupied}/{capacity}
    </span>
  );
}

export function TrainerBadge({ players }: { players: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
      <GraduationCap className="size-3.5" />
      {players === 1 ? "1 игрок + тренер" : `${players} игрока + тренер`}
    </span>
  );
}

/** Игра 1/2: виден первый игрок, можно присоединиться */
export function OpenSessionCard({
  session,
  hasTrainer,
  onJoin,
}: {
  session: TableSession;
  hasTrainer: boolean;
  onJoin: () => void;
}) {
  return (
    <article className="rounded-xl border border-accent bg-app-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">
            {formatClubTimeRange(session.startsAt, session.endsAt)}
          </p>
          <p className="mt-1 text-xs text-white/55">
            {session.freeSeats === 1
              ? "Свободно 1 место"
              : `Свободно мест: ${session.freeSeats}`}
          </p>
        </div>
        <OccupancyBadge occupied={session.occupied} capacity={session.capacity} />
      </div>

      {hasTrainer && (
        <div className="mt-3">
          <TrainerBadge players={session.capacity} />
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {session.players.map((player, index) => (
          <li
            key={index}
            className="rounded-lg border border-white/10 bg-white/3 px-3 py-2.5"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <UserRound className="size-4 text-accent" />
              {player.firstName}
            </p>
            {player.army && (
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-white/45">Армия</dt>
                <dd className="text-white/85">{player.army}</dd>
                <dt className="text-white/45">Очки</dt>
                <dd className="text-white/85">{player.points}</dd>
                <dt className="text-white/45">Опыт</dt>
                <dd className="text-white/85">{player.experienceLabel}</dd>
              </dl>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onJoin}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
      >
        <Swords className="size-4" />
        Присоединиться
      </button>
    </article>
  );
}

/** Свободное время за столом — начать новую игру */
export function FreeSlotCard({
  label,
  segment,
  durationMinutes,
  limit,
  capacity,
  hasTrainer,
  onSelect,
}: {
  label: string;
  segment: AvailabilitySegment;
  durationMinutes: number;
  limit: WindowLimit;
  capacity: number;
  hasTrainer: boolean;
  onSelect: () => void;
}) {
  return (
    <article className={clsx("rounded-xl border bg-app-elevated p-4", limit.state === "none" ? "border-white/10 opacity-60" : limit.state === "limited" ? "border-red-400/50" : "border-white/15")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">{label}</p>
          <p className="mt-1 text-sm text-white/70">
            Свободно {formatClubTimeRange(segment.startsAt, segment.endsAt)}
          </p>
          {formatDurationLabel(durationMinutes) && (
            <p className="mt-1 text-xs font-medium text-accent">
              {formatDurationLabel(durationMinutes)}
            </p>
          )}
          <LimitNote limit={limit} durationMinutes={durationMinutes} />
        </div>
        <OccupancyBadge occupied={0} capacity={capacity} />
      </div>

      {hasTrainer && (
        <div className="mt-3">
          <TrainerBadge players={capacity} />
        </div>
      )}

      {limit.state !== "none" && (
        <button
          type="button"
          onClick={onSelect}
          className="mt-4 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
        >
          Выбрать
        </button>
      )}
    </article>
  );
}

/**
 * Предупреждение красным (B1): окно короче полной длительности — запись возможна, но только на N часов;
 * короче минимума — записаться нельзя.
 */
export function LimitNote({ limit, durationMinutes }: { limit: WindowLimit; durationMinutes: number }) {
  if (limit.state === "full") return null;
  if (limit.state === "none")
    return <p className="mt-1.5 text-xs font-semibold text-red-300">Свободного времени не хватает даже на укороченную запись</p>;
  return (
    <p className="mt-1.5 rounded-lg border border-red-400/40 bg-red-400/10 px-2 py-1 text-xs font-semibold text-red-300">
      Только {hoursLabel(limit.maxMinutes)} вместо {hoursLabel(durationMinutes)} — до {formatClubTime(limit.until)}
    </p>
  );
}

export function FullSessionRow({ session }: { session: TableSession }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/3 px-3 py-2.5 text-sm text-white/60">
      <span>{formatClubTimeRange(session.startsAt, session.endsAt)}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs">Мест нет</span>
        <OccupancyBadge occupied={session.occupied} capacity={session.capacity} />
      </span>
    </div>
  );
}

/** Общая вместимость (покраска): занято N из M */
export function PoolSlotCard({
  segment,
  capacity,
  durationMinutes,
  limit,
  onSelect,
}: {
  segment: AvailabilitySegment;
  capacity: number;
  durationMinutes: number;
  limit: WindowLimit;
  onSelect: () => void;
}) {
  const occupied = capacity - segment.freeSeats;
  const full = segment.freeSeats <= 0 || limit.state === "none";

  return (
    <article
      className={clsx(
        "rounded-xl border bg-app-elevated p-4",
        full ? "border-white/10 opacity-60" : "border-accent",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">
            {formatClubTimeRange(segment.startsAt, segment.endsAt)}
          </p>
          <p className="mt-1 text-sm text-white/70">
            {full
              ? "Мест нет"
              : `Занято ${occupied} из ${capacity} · свободно ${segment.freeSeats}`}
          </p>
          {formatDurationLabel(durationMinutes) && (
            <p className="mt-1 text-xs font-medium text-accent">
              {formatDurationLabel(durationMinutes)}
            </p>
          )}
          {segment.freeSeats > 0 && <LimitNote limit={limit} durationMinutes={durationMinutes} />}
        </div>
        <OccupancyBadge occupied={occupied} capacity={capacity} />
      </div>

      {!full && (
        <button
          type="button"
          onClick={onSelect}
          className="mt-4 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
        >
          Выбрать
        </button>
      )}
    </article>
  );
}

export function SectionTitle({
  icon,
  children,
  hint,
}: {
  icon?: ReactNode;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-2 text-xl font-medium">
        {icon}
        {children}
      </h2>
      {hint && <p className="mt-1 text-xs text-white/50">{hint}</p>}
    </div>
  );
}

export const PlayersIcon = () => <UsersRound className="size-5 text-accent" />;
