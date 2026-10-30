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
        <span className="text-fg-3">{label}</span>
        <span className="ml-auto text-right font-medium text-fg">
          {isLoading ? <Skeleton width={40} height={20} /> : value}
        </span>
      </div>
    </SkeletonTheme>
  );
}
