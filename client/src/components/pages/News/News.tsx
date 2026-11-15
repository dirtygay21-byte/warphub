import { getNews } from "@/apiUtils/news";
import NewsCard from "@/components/pages/News/components/NewsCard";
import NewsDetailsModal from "@/components/pages/News/components/NewsDetailsModal";
import { getNewsCountLabel } from "@/components/pages/News/utils";
import NewsCardSkeleton from "@/components/skeletons/NewsCardSkeleton";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Newspaper, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AnimatePresence } from "motion/react";

const NEWS_SKELETON_COUNT = 5;

export default function News() {
  const [selectedNewsId, setSelectedNewsId] = useState<number | null>(null);

  const newsQuery = useQuery({
    queryKey: ["news"],
    queryFn: getNews,
  });

  const newsItems = newsQuery.data ?? [];

  if (newsQuery.isLoading) {
    return (
      <div className="px-6 pb-3 pt-6 text-white lg:pt-8">
        <div className="mb-4">
          <h1 className="font-display text-[28px] font-semibold uppercase leading-none">Новости</h1>
          <p className="mt-1 text-sm text-fg-3">Загружаем новости…</p>
        </div>

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
          {Array.from({ length: NEWS_SKELETON_COUNT }, (_, index) => (
            <NewsCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (newsQuery.isError) {
    return (
      <div className="flex min-h-[calc(100dvh-140px)] flex-col items-center justify-center gap-4 px-6 text-center text-white">
        <p className="text-sm text-fg-2">
          Не удалось загрузить новости. Попробуйте ещё раз.
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
    );
  }

  return (
    <div className="px-6 pb-3 pt-6 text-white lg:pt-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold uppercase leading-none">Новости</h1>
          <p className="mt-1 text-sm text-fg-3">
            {newsItems.length > 0
              ? `${newsItems.length} ${getNewsCountLabel(newsItems.length)}`
              : "Пока нет новостей"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => newsQuery.refetch()}
          disabled={newsQuery.isFetching}
          aria-label="Обновить список новостей"
          className="flex ds-hit size-10 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-white transition-colors active:bg-white/10 disabled:opacity-60"
        >
          <RefreshCw
            className={clsx("size-4", newsQuery.isFetching && "animate-spin")}
          />
        </button>
      </div>

      {newsItems.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-app-elevated px-6 py-10 text-center">
          <Newspaper className="mx-auto size-10 text-accent" />
          <p className="mt-4 text-base font-medium">Новостей пока нет</p>
          <p className="mt-2 text-sm text-fg-3">
            Загляните позже — здесь появятся анонсы клуба.
          </p>
        </div>
      ) : (
        <div
          className={clsx(
            "ds-stagger flex flex-col gap-4 lg:grid lg:grid-cols-2",
            newsQuery.isFetching && "opacity-70"
          )}
        >
          {newsItems.map((news) => (
            <NewsCard
              key={news.id}
              title={news.title}
              coverUrl={news.coverUrl}
              coverCrop={news.coverCrop}
              onClick={() => setSelectedNewsId(news.id)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedNewsId !== null && (
          <NewsDetailsModal
            newsId={selectedNewsId}
            onClose={() => setSelectedNewsId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
