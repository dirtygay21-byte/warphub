import ContentImage from "@/components/ui/ContentImage";
import type { ImageCrop } from "@/types";

type NewsCardProps = {
  title: string;
  coverUrl: string;
  coverCrop: ImageCrop | null;

  onClick: () => void;
};

export default function NewsCard({
  title,
  coverUrl,
  coverCrop,

  onClick,
}: NewsCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-[5/2] w-full overflow-hidden rounded-2xl border border-white/10 text-left transition-[transform,border-color] hover:cursor-pointer hover:border-accent/40 active:scale-[0.99]"
    >
      {coverUrl ? (
        <ContentImage
          src={coverUrl}
          alt={title}
          crop={coverCrop}
          className="absolute inset-0 size-full"
        />
      ) : (
        <div className="absolute inset-0 bg-app-surface" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      <h2 className="absolute bottom-4 left-4  text-lg font-bold uppercase leading-tight tracking-wide text-white">
        {title}
      </h2>
    </button>
  );
}
