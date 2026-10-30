export default function ServiceDetailsImage({
  imageUrl,
  alt,
}: {
  imageUrl?: string;
  alt?: string;
}) {
  if (!imageUrl) return null;

  return (
    <div className="h-28 w-full bg-app-surface lg:h-64">
      <img
        src={imageUrl}
        alt={alt ?? "Услуга"}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
