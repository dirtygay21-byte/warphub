export default function ServiceDetailsHeader({
  activity,
  discipline,
  description,
}: {
  activity?: string;
  discipline?: string;
  description?: string;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold leading-tight">
          {activity ?? "Услуга"}
        </h2>
        {discipline && (
          <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
            {discipline}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-5 text-fg-2">
        {description ?? "Описание услуги появится позднее."}
      </p>
    </div>
  );
}
