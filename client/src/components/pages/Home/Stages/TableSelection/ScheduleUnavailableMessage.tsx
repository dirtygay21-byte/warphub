import { CalendarX2 } from "lucide-react";
import { formatScheduleWeekdays } from "./utils";

type ScheduleUnavailableMessageProps = {
  disciplineTitle?: string;
  scheduleWeekdays?: number[];
};

export default function ScheduleUnavailableMessage({
  disciplineTitle,
  scheduleWeekdays,
}: ScheduleUnavailableMessageProps) {
  const availableDays =
    scheduleWeekdays && scheduleWeekdays.length > 0
      ? formatScheduleWeekdays(scheduleWeekdays)
      : null;

  return (
    <div className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-5 text-sm text-red-100">
      <div className="flex items-start gap-3">
        <CalendarX2 className="mt-0.5 size-5 shrink-0 text-red-300" />
        <div className="space-y-2">
          <p className="font-medium text-red-50">
            {disciplineTitle
              ? `${disciplineTitle} недоступен в этот день`
              : "Услуга недоступна в этот день"}
          </p>
          {availableDays && (
            <p className="text-red-100/80">
              Бронирование возможно: {availableDays}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
