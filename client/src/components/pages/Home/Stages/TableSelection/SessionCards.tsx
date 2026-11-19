import { formatClubTime, formatClubTimeRange } from "@/utils/clubTime";
import { getWindowLimit, hoursLabel } from "@/utils/slots";
import clsx from "clsx";
import { ChevronDown, GraduationCap, UsersRound } from "lucide-react";
import { CopyNick, PlayerInfo } from "@/components/booking/PlayerInfo";
import { StubTime, Ticket, TicketKicker, TicketTag } from "@/components/booking/Ticket";
import { gameHasPoints, gameLabelOf, killTeamWithFaction, type AvailabilitySegment, type TableSession } from "@/apiUtils/booking";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { useState } from "react";
import type { ReactNode } from "react";
import { Worm } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";

type WindowLimit = ReturnType<typeof getWindowLimit>;

export function TrainerBadge({ players }: { players: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-accent/15 px-2 py-1 text-[12px] font-semibold text-accent">
      <GraduationCap className="size-3.5" />
      {players === 1 ? "1 игрок + тренер" : `${players} игрока + тренер`}
    </span>
  );
}

/**
 * «Ищут соперника» (макет 17.11.2026): не билет, а раскрывающаяся карточка. Свёрнуто — лаймовая шапка с червяком:
 * кто, армия и очки, когда. Развёрнуто (плавно, остальное сдвигается вниз) — строка VS, 4 факта и одна кнопка.
 */
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
  const options = useBookingOptions();
  const first = session.players[0];
  const others = session.players.slice(1);
  const game = first?.game ?? (first?.army ? "40k" : null);
  const army = first?.army ? (game === "kt" ? killTeamWithFaction(options, first.army) : first.army) : null;
  const points = first?.points != null && gameHasPoints(game) ? first.points : null;
  const level = first?.experienceLevel ? options.experienceLevels.find((l) => l.value === first.experienceLevel) : undefined;
  const experienceLabel = first?.experienceLabel ?? level?.label ?? null;
  const experience = experienceLabel ? [experienceLabel, level?.hint].filter(Boolean).join(" · ") : null;
  const name = first?.firstName || "Игрок";
  const subtitle = [army, points != null ? `${points} очк.` : null].filter(Boolean).join(" · ") || experienceLabel || "Армия не указана";

  return (
    <article className={clsx("overflow-hidden rounded-[22px] border bg-app-elevated transition-colors duration-200", open ? "border-accent" : "border-accent/35")}>
      <button
        type="button"
        onClick={() => {
          haptic.tap();
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        className="ds-press relative isolate flex min-h-[68px] w-full items-center gap-3 overflow-hidden bg-accent px-3.5 py-3 text-left text-[#111110]"
      >
        <svg aria-hidden="true" width="190" height="90" viewBox="0 0 190 90" className="pointer-events-none absolute -right-[30px] -top-[14px] -z-10 opacity-[0.16]">
          <Worm x={20} y={70} angle={-24} period={120} amp={12} width={16} seconds={9} />
        </svg>
        <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[#111110] text-base font-extrabold text-accent">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-extrabold">{name}</span>
          <span className="mt-0.5 block truncate text-[13px] font-semibold opacity-75">{subtitle}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-display text-[18px] font-bold leading-none tabular-nums">{formatClubTime(session.startsAt)}</span>
          <span className="mt-[3px] block text-[12px] font-semibold opacity-75">до {formatClubTime(session.endsAt)}</span>
        </span>
        <ChevronDown className={clsx("size-[18px] shrink-0 transition-transform duration-300", open && "rotate-180")} strokeWidth={2.4} />
      </button>

      <div className={clsx("grid transition-[grid-template-rows] duration-[350ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="border-t border-white/[0.06] p-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 rounded-2xl bg-app-bg p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">{army ?? "Армия не указана"}</p>
                {points != null && <p className="mt-0.5 font-display text-[20px] font-bold leading-none tabular-nums">{points}</p>}
              </div>
              <span className="font-display text-[22px] font-bold text-accent">VS</span>
              <div className="min-w-0 text-right">
                <p className="text-sm font-extrabold text-accent">Вы</p>
                <p className="mt-0.5 text-[12px] text-fg-3">армия — на след. шаге</p>
              </div>
            </div>
            <dl className="mt-3.5 grid grid-cols-2 gap-x-3.5 gap-y-3">
              <Fact label="Опыт">{experience ?? "—"}</Fact>
              <Fact label="Стол">
                {session.tableName} · {session.occupied} из {session.capacity}
              </Fact>
              <Fact label="Игра">{first?.gameLabel ?? gameLabelOf(options, game)}</Fact>
              <Fact label="Telegram">
                <CopyNick username={first?.username} />
              </Fact>
            </dl>
            {hasTrainer && (
              <div className="mt-3">
                <TrainerBadge players={session.capacity} />
              </div>
            )}
            {others.length > 0 && (
              <ul className="mt-3 space-y-2">
                {others.map((player, index) => (
                  <li key={index}>
                    <PlayerInfo player={player} />
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                onJoin();
              }}
              className="ds-press fx-press mt-3.5 grid h-12 w-full place-items-center rounded-[14px] border-[1.5px] border-accent text-[15px] font-extrabold text-accent"
            >
              Играть с игроком {name}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-fg-3">{label}</dt>
      <dd className="mt-[3px] min-w-0 truncate text-sm font-bold">{children}</dd>
    </div>
  );
}

/** Корешок: время начала и «и позже» (окно длиннее брони) или «до HH:MM». */
function startStub(segment: AvailabilitySegment, durationMinutes: number, limit: WindowLimit) {
  if (limit.state === "limited") return <StubTime time={formatClubTime(segment.startsAt)} note={`до ${formatClubTime(limit.until)}`} />;
  const windowMinutes = (new Date(segment.endsAt).getTime() - new Date(segment.startsAt).getTime()) / 60000;
  return <StubTime time={formatClubTime(segment.startsAt)} note={windowMinutes > durationMinutes ? "и позже" : `до ${formatClubTime(segment.endsAt)}`} />;
}

/** Свободное время за столом — начать новую игру (билет: подпись стола, окно, метки; корешок — начало). */
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
  const none = limit.state === "none";
  return (
    <Ticket
      tone={none ? "busy" : "normal"}
      disabled={none}
      onClick={onSelect}
      ariaLabel={`${label}, свободно ${formatClubTimeRange(segment.startsAt, segment.endsAt)}`}
      stub={none ? <span className="text-[12.5px] font-bold text-fg-2">Не хватает времени</span> : startStub(segment, durationMinutes, limit)}
    >
      <TicketKicker>{label}</TicketKicker>
      <span className="mt-1 block text-base font-extrabold">Свободно {formatClubTimeRange(segment.startsAt, segment.endsAt)}</span>
      <span className="mt-2 flex flex-wrap gap-1.5">
        <LimitNote limit={limit} durationMinutes={durationMinutes} />
        {capacity >= 2 && <TicketTag>0/{capacity}</TicketTag>}
        {hasTrainer && <TrainerBadge players={capacity} />}
      </span>
    </Ticket>
  );
}

/**
 * Метка длительности (B1, по цветам 17.11.2026 — янтарь вместо красной рамки): окно короче полной длительности —
 * «2 ч вместо 3 ч»; короче минимума — записаться нельзя; иначе «Полные 3 ч».
 */
export function LimitNote({ limit, durationMinutes }: { limit: WindowLimit; durationMinutes: number }) {
  if (limit.state === "none") return <TicketTag tone="warn">Не хватает даже на укороченную запись</TicketTag>;
  if (limit.state === "limited")
    return (
      <TicketTag tone="warn">
        {hoursLabel(limit.maxMinutes)} вместо {hoursLabel(durationMinutes)}
      </TicketTag>
    );
  return <TicketTag>Полные {hoursLabel(durationMinutes)}</TicketTag>;
}

/** Занятый стол — штриховка (правило цветов: штриховка = занято). */
export function FullSessionRow({ session }: { session: TableSession }) {
  return (
    <Ticket tone="busy" stub={<span className="text-[12.5px] font-bold text-fg-2">Мест нет</span>}>
      <TicketKicker>{session.tableName}</TicketKicker>
      <span className="mt-1 block text-sm font-bold">
        Занято {formatClubTimeRange(session.startsAt, session.endsAt)} · {session.occupied}/{session.capacity}
      </span>
    </Ticket>
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
    <Ticket
      tone={full ? "busy" : "normal"}
      disabled={full}
      onClick={onSelect}
      ariaLabel={`Свободно ${formatClubTimeRange(segment.startsAt, segment.endsAt)}`}
      stub={full ? <span className="text-[12.5px] font-bold text-fg-2">Мест нет</span> : startStub(segment, durationMinutes, limit)}
    >
      <TicketKicker>Общий зал</TicketKicker>
      <span className="mt-1 block text-base font-extrabold">
        {full ? "Занято" : "Свободно"} {formatClubTimeRange(segment.startsAt, segment.endsAt)}
      </span>
      <span className="mt-2 flex flex-wrap gap-1.5">
        {segment.freeSeats > 0 && <LimitNote limit={limit} durationMinutes={durationMinutes} />}
        <TicketTag>
          {occupied}/{capacity}
        </TicketTag>
      </span>
    </Ticket>
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
