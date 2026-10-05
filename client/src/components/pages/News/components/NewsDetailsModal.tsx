import { getNewsById } from "@/apiUtils/news";
import { formatNewsPublishedAt } from "@/components/pages/News/utils";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, LoaderCircle, RefreshCw, X } from "lucide-react";

type NewsDetailsModalProps = {
  newsId: number;
  onClose: () => void;
};

export default function NewsDetailsModal({
  newsId,
  onClose,
}: NewsDetailsModalProps) {
  const newsQuery = useQuery({
    queryKey: ["news", newsId],
    queryFn: () => getNewsById(newsId),
  });

  const handleClose = () => {
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/70 px-4 pb-8 pt-6 sm:items-center"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-3rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-app-elevated text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold">Новость</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Закрыть"
            className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-white/80 transition-colors active:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {newsQuery.isLoading && (
            <div className="flex min-h-48 items-center justify-center py-10">
              <LoaderCircle className="size-8 animate-spin text-accent" />
            </div>
          )}

          {newsQuery.isError && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
              <p className="text-sm text-white/70">
                Не удалось загрузить новость. Попробуйте ещё раз.
              </p>
              <button
                type="button"
                onClick={() => newsQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
              >
                <RefreshCw className="size-4" />
                Повторить
              </button>
            </div>
          )}

          {newsQuery.data && (
            <div className="space-y-4 p-5">
              {newsQuery.data.coverUrl ? (
                <img
                  src={newsQuery.data.coverUrl}
                  alt={newsQuery.data.title}
                  className="aspect-video w-full rounded-xl object-cover"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-white/5 text-sm text-white/40">
                  Без обложки
                </div>
              )}

              <div>
                <h3 className="text-xl font-bold uppercase leading-tight tracking-wide">
                  {newsQuery.data.title}
                </h3>
                <p className="mt-3 flex items-center gap-2 text-sm text-white/60">
                  <CalendarDays className="size-4 shrink-0 text-accent" />
                  <span>
                    Опубликовано{" "}
                    {formatNewsPublishedAt(newsQuery.data.publishedAt)}
                  </span>
                </p>
              </div>

              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                {newsQuery.data.text}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
