import { LoaderCircle, XCircle } from "lucide-react";

type CancelConfirmDialogProps = {
  serviceTitle?: string;
  dateLabel: string;
  timeLabel: string;
  isPending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function CancelConfirmDialog({
  serviceTitle,
  dateLabel,
  timeLabel,
  isPending,
  errorMessage,
  onClose,
  onConfirm,
}: CancelConfirmDialogProps) {
  return (
    <div
      className="fixed w-full h-full top-0 left-1/2 -translate-x-1/2  z-50 flex items-center justify-center bg-overlay/70 px-4 pb-24 pt-6 sm:items-center sm:pb-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-app-elevated shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-5 flex justify-around">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-red-400/15 text-red-300">
            <XCircle className="size-6" />
          </div>
          <div>
            <h2 id="cancel-dialog-title" className="text-lg font-semibold">
              Отменить запись?
            </h2>
            <p className="text-sm text-white/60">
              Это действие нельзя будет отменить.
            </p>
          </div>
        </div>

        <div className="space-y-2 px-5 py-4 text-sm">
          {serviceTitle && (
            <p className="font-medium text-white/90">{serviceTitle}</p>
          )}
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-400/15 px-4 py-3 text-sm font-semibold text-red-200 transition-colors active:bg-red-400/25 disabled:opacity-60"
          >
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            {isPending ? "Отменяем..." : "Да, отменить"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="w-full rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm font-semibold text-white transition-colors active:bg-white/10 disabled:opacity-60"
          >
            Нет, оставить
          </button>
        </div>
      </div>
    </div>
  );
}
