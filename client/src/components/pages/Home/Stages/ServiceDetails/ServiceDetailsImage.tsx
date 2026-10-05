export default function ServiceDetailsImage({
  imageUrl,
  alt,
}: {
  imageUrl?: string;
  alt?: string;
}) {
  if (!imageUrl) return null;

  return (
    <div className="h-25 w-full bg-app-surface">
      <img
        src={imageUrl}
        alt={alt ?? "Услуга"}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
