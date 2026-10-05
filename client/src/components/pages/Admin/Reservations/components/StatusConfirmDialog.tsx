import clsx from "clsx";

export function StatusConfirmDialog({
  action,
  userLabel,
  serviceTitle,
  dateLabel,
  timeLabel,
  isPending,
  errorMessage,
  onClose,
  onConfirm,
}: {
  action: "confirm" | "reject";
  userLabel: string;
  serviceTitle: string;
  dateLabel: string;
  timeLabel: string;
  isPending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isConfirm = action === "confirm";

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
          <h2 className="text-lg font-semibold">
            {isConfirm ? "Подтвердить запись?" : "Отклонить запись?"}
          </h2>
          <p className="mt-2 text-sm text-white/60">{userLabel}</p>
        </div>

        <div className="space-y-2 px-5 py-4 text-sm">
          <p className="font-medium text-white/90">{serviceTitle}</p>
          <p className="text-white/60">
            {dateLabel} · {timeLabel}
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
            className={clsx(
              "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-60",
              isConfirm
                ? "bg-green-400/15 text-green-200"
                : "bg-red-400/15 text-red-200"
            )}
          >
            {isPending
              ? isConfirm
                ? "Подтверждаем..."
                : "Отклоняем..."
              : isConfirm
              ? "Да, подтвердить"
              : "Да, отклонить"}
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
