import type { NewsItem } from "@/types";
import { CalendarDays } from "lucide-react";
import { formatNewsDate } from "../newsUtils";

type NewsCardProps = {
  news: NewsItem;
  onClick: () => void;
};

export default function NewsCard({ news, onClick }: NewsCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full overflow-hidden rounded-2xl border border-white/10 bg-app-elevated text-left transition-colors hover:cursor-pointer hover:border-accent/40 active:bg-white/5"
    >
      {news.coverUrl ? (
        <img
          src={news.coverUrl}
          alt={news.title}
          className="aspect-[16/7] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[16/7] w-full items-center justify-center bg-white/5 text-sm text-fg-3">
          Без обложки
        </div>
      )}

      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{news.title}</h3>
          {news.text && (
            <p className="mt-1 line-clamp-2 text-sm text-fg-2">{news.text}</p>
          )}
        </div>

        <p className="flex items-start gap-2 text-sm text-fg-2">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>{formatNewsDate(news.publishedAt)}</span>
        </p>
      </div>
    </button>
  );
}
