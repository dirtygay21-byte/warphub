import BoostySubscriptionInfo from "@/components/booking/BoostySubscriptionInfo";
import type { BoostyKind } from "@/components/booking/boosty";

export default function ServiceDetailsHeader({
  activity,
  discipline,
  description,
  boostyKind,
}: {
  activity?: string;
  discipline?: string;
  description?: string;
  boostyKind?: BoostyKind | null;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[19px] font-bold leading-tight">
          {activity ?? "Услуга"}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {discipline && (
            <span className="whitespace-nowrap rounded-lg bg-white/[0.08] px-2 py-1 text-[12px] font-semibold text-fg-2">
              {discipline}
            </span>
          )}
          {boostyKind && <BoostySubscriptionInfo kind={boostyKind} />}
        </div>
      </div>
      <p className="mt-2 text-sm leading-snug text-fg-2">
        {description ?? "Описание услуги появится позднее."}
      </p>
    </div>
  );
}
