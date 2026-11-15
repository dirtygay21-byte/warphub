import ContentImage from "@/components/ui/ContentImage";
import type { ImageCrop } from "@/types";
import { formatClub } from "@/utils/clubTime";
import { haptic } from "@/utils/haptic";
import clsx from "clsx";

type NewsCardProps = {
  title: string;
  coverUrl: string;
  coverCrop: ImageCrop | null;
  text?: string;
  publishedAt?: string;
  /** первая новость — крупно, остальные — строкой с картинкой слева (15.11.2026) */
  featured?: boolean;
  onClick: () => void;
};

/** Начало текста без разметки — подпись под заголовком. */
const excerpt = (text = "") =>
  text
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`[\]]|\(https?:[^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Карточка новости (перестройка 15.11.2026): заголовок под картинкой, а не поверх неё — картинки новостей
 * часто уже содержат надпись, и наложение читалось плохо. Дата и начало текста — сразу видно, о чём новость.
 */
export default function NewsCard({ title, coverUrl, coverCrop, text, publishedAt, featured, onClick }: NewsCardProps) {
  const date = publishedAt ? formatClub(publishedAt, { day: "numeric", month: "long" }) : null;
  const lead = excerpt(text);
  const cover = coverUrl ? (
    <ContentImage src={coverUrl} alt="" crop={coverCrop} className="absolute inset-0 size-full" />
  ) : (
    <div className="absolute inset-0 bg-app-surface" />
  );

  return (
    <button
      type="button"
      onClick={() => (haptic.tap(), onClick())}
      className={clsx(
        "ds-press w-full overflow-hidden rounded-[18px] border border-white/10 bg-app-elevated text-left",
        featured ? "block" : "flex items-center gap-3 p-2.5",
      )}
    >
      {featured ? (
        <>
          <span className="relative block aspect-[2/1] w-full">{cover}</span>
          <span className="block p-4">
            {date && <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">{date}</span>}
            <span className="mt-1 block text-[18px] font-bold leading-tight text-fg">{title}</span>
            {lead && <span className="mt-1.5 line-clamp-2 text-[14px] leading-snug text-fg-2">{lead}</span>}
          </span>
        </>
      ) : (
        <>
          <span className="relative aspect-[4/3] w-[96px] shrink-0 overflow-hidden rounded-[12px]">{cover}</span>
          <span className="min-w-0 flex-1 py-0.5">
            {date && <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">{date}</span>}
            <span className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-tight text-fg">{title}</span>
            {lead && <span className="mt-1 line-clamp-1 text-[13px] text-fg-2">{lead}</span>}
          </span>
        </>
      )}
    </button>
  );
}
