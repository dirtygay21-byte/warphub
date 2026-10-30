import { getSkeletonColors } from "@/theme/colors";
import {
  CalendarDays,
  Clock3,
  Table2,
  UsersRound,
} from "lucide-react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

function SkeletonDetailRow({
  icon,
  label,
  valueWidth,
}: {
  icon: React.ReactNode;
  label: string;
  valueWidth: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-accent">{icon}</span>
      <span className="text-sm text-fg-3">{label}</span>
      <span className="ml-auto">
        <Skeleton width={valueWidth} height={20} />
      </span>
    </div>
  );
}

export default function ReservationCardSkeleton() {
  const { baseColor, highlightColor } = getSkeletonColors();

  return (
    <SkeletonTheme baseColor={baseColor} highlightColor={highlightColor}>
      <article className="overflow-hidden rounded-2xl border border-accent/30 bg-app-elevated shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton width={160} height={20} />
              <div className="mt-2">
                <Skeleton width={96} height={16} />
              </div>
            </div>

            <Skeleton width={88} height={28} borderRadius={9999} />
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm">
          <SkeletonDetailRow
            icon={<CalendarDays className="size-4" />}
            label="Дата"
            valueWidth={88}
          />
          <SkeletonDetailRow
            icon={<Clock3 className="size-4" />}
            label="Время"
            valueWidth={104}
          />
          <SkeletonDetailRow
            icon={<UsersRound className="size-4" />}
            label="Гостей"
            valueWidth={24}
          />
          <SkeletonDetailRow
            icon={<Table2 className="size-4" />}
            label="Стол"
            valueWidth={40}
          />
        </div>

        <div className="border-t border-white/10 px-4 py-4">
          <Skeleton height={44} borderRadius={12} />
        </div>
      </article>
    </SkeletonTheme>
  );
}
