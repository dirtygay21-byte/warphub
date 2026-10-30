import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode, WheelEvent } from "react";
import { haptic } from "@/utils/haptic";
import {
  getDateKey,
  getToday,
  isDateInSchedule,
} from "./utils";

type DateSelectorProps = {
  selectedDate: Date;
  scheduleWeekdays?: number[];
  onDateSelected: (date: Date) => void;
  /** строка под лентой: выбранный день и что в нём свободно */
  info?: ReactNode;
};

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export default function DateSelector({
  selectedDate,
  scheduleWeekdays,
  onDateSelected,
  info,
}: DateSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const scrollStartLeft = useRef(0);
  const [isMouseDragging, setIsMouseDragging] = useState(false);

  const dates = useMemo(() => {
    const today = getToday();

    return Array.from({ length: 15 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      return date;
    });
  }, []);

  // Выбранный день всегда в зоне видимости (например, после автоперехода на пятницу)
  const selectedKey = getDateKey(selectedDate);
  useEffect(() => {
    const slider = scrollRef.current;
    const item = slider?.querySelector<HTMLElement>(`[data-date="${selectedKey}"]`);
    if (!slider || !item) return;
    slider.scrollTo({
      left: item.offsetLeft - slider.offsetLeft - slider.clientWidth / 2 + item.clientWidth / 2,
      behavior: "smooth",
    });
  }, [selectedKey]);

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const slider = scrollRef.current;
    if (!slider) return;

    isDragging.current = true;
    setIsMouseDragging(true);
    dragStartX.current = event.pageX - slider.offsetLeft;
    scrollStartLeft.current = slider.scrollLeft;
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const slider = scrollRef.current;
    if (!slider || !isDragging.current) return;

    event.preventDefault();
    const x = event.pageX - slider.offsetLeft;
    slider.scrollLeft = scrollStartLeft.current - (x - dragStartX.current);
  };

  const stopMouseDrag = () => {
    isDragging.current = false;
    setIsMouseDragging(false);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const slider = scrollRef.current;
    if (!slider) return;

    slider.scrollLeft += event.deltaX || event.deltaY;
  };

  const firstMonth = dates[0]!.getMonth();
  const lastMonth = dates[dates.length - 1]!.getMonth();
  const monthLabel =
    firstMonth === lastMonth
      ? capitalize(MONTHS[firstMonth]!)
      : `${capitalize(MONTHS[firstMonth]!)} — ${MONTHS[lastMonth]}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-fg-3">Выберите дату</h2>
        <span className="text-[13px] text-fg-3">{monthLabel}</span>
      </div>
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={stopMouseDrag}
        onMouseUp={stopMouseDrag}
        onWheel={handleWheel}
        className={clsx(
          "no-scrollbar -mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 py-1 select-none",
          isMouseDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {dates.map((date) => (
          <DateSelectorItem
            key={date.toISOString()}
            selectedDate={selectedDate}
            date={date}
            scheduleWeekdays={scheduleWeekdays}
            onClick={() => {
              haptic.select();
              onDateSelected(date);
            }}
          />
        ))}
      </div>
      {info && <p className="min-h-[18px] truncate text-[13px] text-fg-2">{info}</p>}
    </div>
  );
}

function DateSelectorItem({
  date,
  selectedDate,
  scheduleWeekdays,
  onClick,
}: {
  date: Date;
  selectedDate: Date;
  scheduleWeekdays?: number[];
  onClick: () => void;
}) {
  const dayName = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][date.getDay()];
  const isToday = getDateKey(date) === getDateKey(getToday());
  const isSelected = getDateKey(date) === getDateKey(selectedDate);
  const isAllowed = isDateInSchedule(date, scheduleWeekdays);

  return (
    <button
      type="button"
      data-date={getDateKey(date)}
      onClick={onClick}
      disabled={!isAllowed}
      aria-pressed={isSelected}
      aria-label={`${isToday ? "Сегодня, " : ""}${dayName}, ${date.getDate()}.${String(date.getMonth() + 1).padStart(2, "0")}${isAllowed ? "" : " — запись закрыта"}`}
      className={clsx(
        "ds-press flex h-[62px] w-[50px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-[14px] transition-colors duration-200",
        isSelected && isAllowed && "ds-selected-glow bg-accent text-accent-foreground",
        isSelected && !isAllowed && "border border-dashed border-danger/50 bg-danger/10 text-danger",
        !isSelected && isAllowed && "border border-white/[0.14] bg-app-elevated text-fg",
        !isSelected && !isAllowed && "cursor-not-allowed border border-dashed border-white/[0.12] bg-transparent text-fg-3 opacity-70",
      )}
    >
      <span
        className={clsx(
          "text-[12px] font-semibold uppercase leading-none tracking-[0.04em]",
          isToday && !isSelected && isAllowed ? "text-accent" : "opacity-80",
        )}
      >
        {dayName}
      </span>
      <span className="font-display text-xl font-semibold leading-none">{date.getDate()}</span>
    </button>
  );
}
