import { getSkeletonColors } from "@/theme/colors";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

export default function NewsCardSkeleton() {
  const { baseColor, highlightColor } = getSkeletonColors();

  return (
    <SkeletonTheme baseColor={baseColor} highlightColor={highlightColor}>
      <div className="relative aspect-[5/2] w-full overflow-hidden rounded-2xl border border-white/10">
        <div className="absolute inset-0">
          <Skeleton height="100%" width="100%" />
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

        <div className="absolute bottom-4 left-4 right-28">
          <Skeleton width="75%" height={22} />
          <div className="mt-2">
            <Skeleton width="55%" height={18} />
          </div>
        </div>

        <div className="absolute bottom-4 right-4">
          <Skeleton width={96} height={28} borderRadius={9999} />
        </div>
      </div>
    </SkeletonTheme>
  );
}
