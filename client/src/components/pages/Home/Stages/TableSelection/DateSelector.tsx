import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, WheelEvent } from "react";
import {
  formatDate,
  getDateKey,
  getToday,
  isDateInSchedule,
} from "./utils";

type DateSelectorProps = {
  selectedDate: Date;
  scheduleWeekdays?: number[];
  onDateSelected: (date: Date) => void;
};

export default function DateSelector({
  selectedDate,
  scheduleWeekdays,
  onDateSelected,
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

  return (
    <div>
      <h2 className="text-2xl font-medium mb-2">Выберите дату</h2>
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={stopMouseDrag}
        onMouseUp={stopMouseDrag}
        onWheel={handleWheel}
        className={clsx(
          "no-scrollbar flex gap-2 overflow-x-auto pb-1 select-none",
          isMouseDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {dates.map((date) => (
          <DateSelectorItem
            key={date.toISOString()}
            selectedDate={selectedDate}
            date={date}
            scheduleWeekdays={scheduleWeekdays}
            onClick={() => onDateSelected(date)}
          />
        ))}
      </div>
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
      className={clsx(
        "min-w-17 rounded-xl border px-3 py-2 flex flex-col items-center justify-center shrink-0 transition-colors",
        isSelected && isAllowed && "border-accent bg-accent text-accent-foreground",
        isSelected &&
          !isAllowed &&
          "border-red-400/40 bg-red-400/10 text-red-200",
        !isSelected &&
          isAllowed &&
          "border-white/10 bg-app-surface text-white active:bg-white/10",
        !isSelected &&
          !isAllowed &&
          "cursor-not-allowed border-white/5 bg-app-muted text-white/25",
      )}
    >
      <span className="text-sm font-semibold">
        {isToday ? "Сегодня" : formatDate(date)}
      </span>
      <span
        className={clsx(
          "text-xs",
          isSelected && isAllowed && "text-accent-foreground/70",
          isSelected && !isAllowed && "text-red-200/70",
          !isSelected && isAllowed && "text-white/50",
          !isSelected && !isAllowed && "text-white/25",
        )}
      >
        {dayName}
      </span>
    </button>
  );
}
