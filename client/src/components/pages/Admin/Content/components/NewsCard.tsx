import type { NewsItem } from "@/types";
import ContentImage from "@/components/ui/ContentImage";
import { ChevronRight } from "lucide-react";
import { formatNewsDate } from "../newsUtils";

type NewsCardProps = {
  news: NewsItem;
  onClick: () => void;
};

/** Новость в админке строкой (перестройка 15.11.2026): обложка миниатюрой, дата, заголовок, начало текста. */
export default function NewsCard({ news, onClick }: NewsCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ds-press flex w-full items-center gap-3 rounded-[18px] border border-white/10 bg-app-elevated p-2.5 text-left"
    >
      {news.coverUrl ? (
        <ContentImage src={news.coverUrl} alt="" crop={news.coverCrop} className="aspect-[4/3] w-[88px] shrink-0 overflow-hidden rounded-[12px]" />
      ) : (
        <span className="flex aspect-[4/3] w-[88px] shrink-0 items-center justify-center rounded-[12px] bg-white/5 text-center text-[11px] text-fg-3">Без обложки</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">{formatNewsDate(news.publishedAt)}</span>
        <span className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-tight text-fg">{news.title}</span>
        {news.text && <span className="mt-1 line-clamp-1 text-[13px] text-fg-2">{news.text}</span>}
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-3" />
    </button>
  );
}
