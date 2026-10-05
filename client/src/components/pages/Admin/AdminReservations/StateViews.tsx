import { LoaderCircle, RefreshCw } from "lucide-react";

export function LoadingView() {
  return (
    <div className="flex min-h-[calc(100dvh-140px)] items-center justify-center px-6 text-white/60">
      <LoaderCircle className="size-8 animate-spin text-accent" />
    </div>
  );
}

export function ErrorView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-col items-center justify-center gap-4 px-6 text-center text-white">
      <p className="text-sm text-white/70">
        Не удалось загрузить брони. Проверьте подключение к API.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
      >
        <RefreshCw className="size-4" />
        Повторить
      </button>
    </div>
  );
}
