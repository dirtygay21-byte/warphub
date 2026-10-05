import { getSkeletonColors } from "@/theme/colors";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

type DetailRowProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  isLoading: boolean;
};

export function DetailRow({ icon, label, value, isLoading }: DetailRowProps) {
  return (
    <SkeletonTheme baseColor={getSkeletonColors().baseColor} highlightColor={getSkeletonColors().highlightColor}>
      <div className="flex items-center gap-3">
        <span className="text-accent">{icon}</span>
        <span className="text-white/50">{label}</span>
        <span className="ml-auto font-medium text-white/90">
          {isLoading ? <Skeleton width={40} height={20} /> : value}
        </span>
      </div>
    </SkeletonTheme>
  );
}
