import { formatReservationDateTime } from "@/utils/reservationDisplay";
import { Clock } from "lucide-react";
import { EXTEND_HOUR_OPTIONS } from "../constants";
import { addHoursToEndsAt } from "../utils";

type ExtendReservationDialogProps = {
  userLabel: string;
  serviceTitle: string;
  dateLabel: string;
  timeLabel: string;
  currentEndsAt: string;
  hours: number;
  onHoursChange: (hours: number) => void;
  isPending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ExtendReservationDialog({
  userLabel,
  serviceTitle,
  dateLabel,
  timeLabel,
  currentEndsAt,
  hours,
  onHoursChange,
  isPending,
  errorMessage,
  onClose,
  onConfirm,
}: ExtendReservationDialogProps) {
  const newEndsAt = addHoursToEndsAt(currentEndsAt, hours);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/70 px-4 pb-8 pt-6 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-app-elevated"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-blue-400/15 text-blue-300">
            <Clock className="size-6" />
          </div>
          <h2 className="text-lg font-semibold">Продлить запись</h2>
          <p className="mt-2 text-sm text-fg-2">{userLabel}</p>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="space-y-2">
            <p className="font-medium text-white/90">{serviceTitle}</p>
            <p className="text-fg-2">
              {dateLabel} · {timeLabel}
            </p>
          </div>

          <label className="block space-y-1.5">
            <span className="text-fg-3">На сколько часов</span>
            <select
              value={hours}
              onChange={(event) => onHoursChange(Number(event.target.value))}
              className="w-full rounded-xl border border-white/10 bg-app-elevated px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-accent/40"
            >
              {EXTEND_HOUR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} ч
                </option>
              ))}
            </select>
          </label>

          <p className="text-fg-2">
            Новое окончание:{" "}
            <span className="font-medium text-white/90">
              {formatReservationDateTime(newEndsAt)}
            </span>
          </p>
        </div>

        {errorMessage && (
          <div className="mx-5 mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-400/15 px-4 py-3 text-sm font-semibold text-blue-200 disabled:opacity-60"
          >
            {isPending ? "Продлеваем…" : "Продлить"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="w-full rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
