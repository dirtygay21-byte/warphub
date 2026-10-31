import type { AvailabilitySegment, TableSession } from "@/apiUtils/booking";
import { formatClubTime, formatClubTimeRange } from "@/utils/clubTime";
import { getWindowLimit, hoursLabel } from "@/utils/slots";
import { formatDurationLabel } from "@/utils/duration";
import clsx from "clsx";
import { ChevronDown, ChevronRight, GraduationCap, Swords, UsersRound } from "lucide-react";
import { PlayerInfo } from "@/components/booking/PlayerInfo";
import { useState } from "react";
import type { ReactNode } from "react";
import { Badge, DsButton } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";

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
    <Badge tone={full ? "danger" : occupied > 0 ? "warn" : "muted"} className="tabular-nums" >
      {occupied}/{capacity}
    </Badge>
  );
}

export function TrainerBadge({ players }: { players: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-accent/15 px-2 py-1 text-[12px] font-semibold text-accent">
      <GraduationCap className="size-3.5" />
      {players === 1 ? "1 игрок + тренер" : `${players} игрока + тренер`}
    </span>
  );
}

/** Игра 1/2: свёрнутая карточка (время, игрок, игра); по нажатию — игроки (ник, армия, очки, опыт) и «Присоединиться» */
export function OpenSessionCard({
  session,
  hasTrainer,
  onJoin,
}: {
  session: TableSession;
  hasTrainer: boolean;
  onJoin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const first = session.players[0];
  const summary = [first?.firstName, first?.experienceLabel, first?.army ? first.gameLabel ?? "Warhammer 40,000" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={clsx("overflow-hidden rounded-[16px] border bg-app-elevated transition-colors duration-200", open ? "border-accent" : "border-accent/40")}>
      <button
        type="button"
        onClick={() => {
          haptic.tap();
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        className="ds-press flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">{formatClubTimeRange(session.startsAt, session.endsAt)}</span>
          {summary && <span className="mt-0.5 block truncate text-sm text-fg-2">{summary}</span>}
        </span>
        <OccupancyBadge occupied={session.occupied} capacity={session.capacity} />
        <ChevronDown className={clsx("size-5 shrink-0 text-accent transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="ds-fade border-t border-white/[0.06] px-4 pb-4 pt-3">
          {hasTrainer && (
            <div className="mb-3">
              <TrainerBadge players={session.capacity} />
            </div>
          )}
          <ul className="space-y-2">
            {session.players.map((player, index) => (
              <li key={index}>
                <PlayerInfo player={player} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-fg-2">
            {session.freeSeats === 1 ? "Свободно 1 место" : `Свободно мест: ${session.freeSeats}`}
          </p>
          <DsButton variant="primary" onClick={onJoin} className="mt-3 w-full">
            <Swords className="size-4" />
            Присоединиться к игре
          </DsButton>
        </div>
      )}
    </article>
  );
}

/** Строка-выбор: вся карточка нажимается (концепт «Начать новую игру»). */
function PickCard({
  disabled,
  tone,
  onSelect,
  children,
  aside,
}: {
  disabled: boolean;
  tone: "normal" | "limited" | "none";
  onSelect: () => void;
  children: ReactNode;
  aside: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        haptic.tap();
        onSelect();
      }}
      className={clsx(
        "flex min-h-[64px] w-full items-center gap-3.5 rounded-[16px] border bg-app-elevated px-4 py-3.5 text-left",
        disabled ? "cursor-not-allowed border-white/[0.08] opacity-60" : "ds-press active:border-accent",
        !disabled && (tone === "limited" ? "border-danger/50" : "border-white/[0.14]"),
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <span className="flex shrink-0 items-center gap-2">
        {aside}
        {!disabled && <ChevronRight className="size-5 text-fg-3" />}
      </span>
    </button>
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
  const duration = formatDurationLabel(durationMinutes);
  return (
    <PickCard
      disabled={limit.state === "none"}
      tone={limit.state === "limited" ? "limited" : limit.state === "none" ? "none" : "normal"}
      onSelect={onSelect}
      aside={<OccupancyBadge occupied={0} capacity={capacity} />}
    >
      <span className="block text-base font-bold">{label}</span>
      <span className="mt-0.5 block text-sm text-fg-2">
        Свободно {formatClubTimeRange(segment.startsAt, segment.endsAt)}
        {duration && <span className="whitespace-nowrap"> · {duration}</span>}
      </span>
      {hasTrainer && (
        <span className="mt-2 block">
          <TrainerBadge players={capacity} />
        </span>
      )}
      <LimitNote limit={limit} durationMinutes={durationMinutes} />
    </PickCard>
  );
}

/**
 * Предупреждение красным (B1): окно короче полной длительности — запись возможна, но только на N часов;
 * короче минимума — записаться нельзя.
 */
export function LimitNote({ limit, durationMinutes }: { limit: WindowLimit; durationMinutes: number }) {
  if (limit.state === "full") return null;
  if (limit.state === "none")
    return <span className="mt-1.5 block text-[13px] font-semibold text-danger">Свободного времени не хватает даже на укороченную запись</span>;
  return (
    <span className="mt-1.5 block rounded-lg border border-danger/40 bg-danger/10 px-2 py-1 text-[13px] font-semibold text-danger">
      Только {hoursLabel(limit.maxMinutes)} вместо {hoursLabel(durationMinutes)} — до {formatClubTime(limit.until)}
    </span>
  );
}

export function FullSessionRow({ session }: { session: TableSession }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-fg-2">
      <span>{formatClubTimeRange(session.startsAt, session.endsAt)}</span>
      <span className="flex items-center gap-2">
        <span className="text-[13px]">Мест нет</span>
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
  const duration = formatDurationLabel(durationMinutes);

  return (
    <PickCard
      disabled={full}
      tone={limit.state === "limited" ? "limited" : "normal"}
      onSelect={onSelect}
      aside={<OccupancyBadge occupied={occupied} capacity={capacity} />}
    >
      <span className="block text-base font-bold">{formatClubTimeRange(segment.startsAt, segment.endsAt)}</span>
      <span className="mt-0.5 block text-sm text-fg-2">
        {full ? "Мест нет" : `Занято ${occupied} из ${capacity} · свободно ${segment.freeSeats}`}
        {!full && duration && <span className="whitespace-nowrap"> · {duration}</span>}
      </span>
      {segment.freeSeats > 0 && <LimitNote limit={limit} durationMinutes={durationMinutes} />}
    </PickCard>
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
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold uppercase leading-tight">
        {icon}
        {children}
      </h2>
      {hint && <p className="mt-1 text-sm text-fg-2">{hint}</p>}
    </div>
  );
}

export const PlayersIcon = () => <UsersRound className="size-5 text-accent" />;
