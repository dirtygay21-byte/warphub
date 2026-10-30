import type { AvailabilitySegment } from "@/apiUtils/booking";
import { formatClubTime } from "@/utils/clubTime";
import { haptic } from "@/utils/haptic";
import clsx from "clsx";
import { useEffect, useRef } from "react";

const MINUTE = 60 * 1000;
const STEP = 30 * MINUTE;

/**
 * Выбор времени начала лентой (концепт D3, замена барабана B2): чипы каждые 30 минут внутри выбранного окна,
 * листаются пальцем. Доступные — из options; занятые (мест меньше partySize) — пунктир и зачёркнуты; остальные
 * (не помещается минимум) — приглушены. short(option) — запись короче полной длительности (B1): красная рамка.
 */
export function TimeChips({
  options,
  value,
  onChange,
  within,
  segments,
  partySize,
  short,
}: {
  options: string[];
  value: string | null;
  onChange: (option: string) => void;
  within: { startsAt: string; endsAt: string };
  segments: AvailabilitySegment[];
  partySize: number;
  short?: (option: string) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const available = new Set(options.map((o) => new Date(o).getTime()));
  const start = Math.ceil(new Date(within.startsAt).getTime() / STEP) * STEP;
  const end = new Date(within.endsAt).getTime();
  const ticks: number[] = [];
  for (let t = start; t < end; t += STEP) ticks.push(t);
  const busyAt = (t: number) => segments.some((s) => new Date(s.startsAt).getTime() <= t && new Date(s.endsAt).getTime() > t && s.freeSeats < partySize);

  // выбранный чип — в зоне видимости
  const selected = value ? new Date(value).getTime() : null;
  useEffect(() => {
    const row = ref.current;
    const chip = row?.querySelector<HTMLElement>(`[data-time="${selected}"]`);
    if (!row || !chip) return;
    const left = chip.offsetLeft - row.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2;
    row.scrollTo({ left, behavior: "smooth" });
  }, [selected]);

  return (
    <div ref={ref} className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 py-1">
      {ticks.map((t) => {
        const iso = new Date(t).toISOString();
        const option = options.find((o) => new Date(o).getTime() === t) ?? iso;
        const isAvailable = available.has(t);
        const isBusy = !isAvailable && busyAt(t);
        const isSelected = t === selected;
        const isShort = isAvailable && short?.(option);
        return (
          <button
            key={t}
            type="button"
            data-time={t}
            disabled={!isAvailable}
            aria-pressed={isSelected}
            aria-label={`${formatClubTime(iso)}${isBusy ? " — занято" : !isAvailable ? " — недоступно" : isShort ? " — время ограничено" : ""}`}
            onClick={() => {
              haptic.select();
              onChange(option);
            }}
            className={clsx(
              "flex h-10 w-[58px] shrink-0 snap-start items-center justify-center rounded-xl text-[15px] font-semibold tabular-nums transition-colors duration-200",
              isSelected && "ds-selected-glow bg-accent text-accent-foreground",
              !isSelected && isAvailable && !isShort && "ds-press border border-white/[0.14] bg-app-elevated text-fg",
              !isSelected && isShort && "ds-press border border-danger/50 bg-danger/10 text-danger",
              isBusy && "border border-dashed border-white/[0.12] text-fg-3 line-through opacity-70",
              !isAvailable && !isBusy && "border border-white/[0.06] text-fg-3 opacity-50",
            )}
          >
            {formatClubTime(iso)}
          </button>
        );
      })}
    </div>
  );
}

/** Полоса дня (концепт): весь день стола/зала, занятые отрезки и ваша запись. */
export function DayBar({
  segments,
  partySize,
  startsAt,
  endsAt,
}: {
  segments: AvailabilitySegment[];
  partySize: number;
  startsAt: string | null;
  endsAt: string | null;
}) {
  if (segments.length === 0) return null;
  const from = Math.min(...segments.map((s) => new Date(s.startsAt).getTime()));
  const to = Math.max(...segments.map((s) => new Date(s.endsAt).getTime()));
  const span = to - from;
  if (span <= 0) return null;
  const pct = (t: number) => `${((t - from) / span) * 100}%`;
  const width = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  const busy = segments.filter((s) => s.freeSeats < partySize);
  const marks = [0, 1, 2, 3].map((i) => from + (span * i) / 3);

  return (
    <div className="mt-3">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.08]">
        {busy.map((s) => {
          const a = new Date(s.startsAt).getTime();
          const b = new Date(s.endsAt).getTime();
          return (
            <span
              key={s.startsAt}
              className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.22)_0_3px,transparent_3px_6px)]"
              style={{ left: pct(a), width: width(a, b) }}
            />
          );
        })}
        {startsAt && endsAt && (
          <span
            className="absolute inset-y-0 rounded-full bg-accent transition-[left,width] duration-300 ease-out-soft"
            style={{ left: pct(new Date(startsAt).getTime()), width: width(new Date(startsAt).getTime(), new Date(endsAt).getTime()) }}
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] tabular-nums text-fg-3">
        {marks.map((t) => (
          <span key={t}>{formatClubTime(new Date(Math.round(t / STEP) * STEP).toISOString())}</span>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-accent" />
          Ваше время
        </span>
        {busy.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.5)_0_2px,transparent_2px_4px)]" />
            Занято
          </span>
        )}
      </div>
    </div>
  );
}
