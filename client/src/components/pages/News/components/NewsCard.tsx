type NewsCardProps = {
  title: string;
  coverUrl: string;

  onClick: () => void;
};

export default function NewsCard({
  title,
  coverUrl,

  onClick,
}: NewsCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-[5/2] w-full overflow-hidden rounded-2xl border border-white/10 text-left transition-transform active:scale-[0.99]"
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={title}
          className="absolute inset-0 size-full object-cover"
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
