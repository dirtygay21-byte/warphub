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
        <h2 className="text-[19px] font-bold leading-tight">
          {activity ?? "Услуга"}
        </h2>
        {discipline && (
          <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/[0.08] px-2 py-1 text-[12px] font-semibold text-fg-2">
            {discipline}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-snug text-fg-2">
        {description ?? "Описание услуги появится позднее."}
      </p>
    </div>
  );
}
