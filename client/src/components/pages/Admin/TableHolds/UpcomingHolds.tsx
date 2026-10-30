import { listTableHolds, type HoldPurpose } from "@/apiUtils/tableHolds";
import { Segmented } from "@/components/ui/ds";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import HoldCard from "./HoldCard";

/**
 * Все ещё не закончившиеся брони столов. focus — цель, по которой можно оставить только «свои» (D&D);
 * переключатель «Все / только …» показывается, если focus задан.
 */
export default function UpcomingHolds({ focus, focusLabel }: { focus?: HoldPurpose; focusLabel?: string }) {
  const [onlyFocus, setOnlyFocus] = useState<"all" | "focus">("all");
  const query = useQuery({ queryKey: ["table-holds"], queryFn: listTableHolds });
  const holds = (query.data ?? []).filter((h) => !focus || onlyFocus === "all" || h.purpose === focus);

  return (
    <div className="space-y-3">
      {focus && (
        <Segmented
          value={onlyFocus}
          onChange={setOnlyFocus}
          options={[
            { value: "all", label: "Все брони" },
            { value: "focus", label: focusLabel ?? "Только мои" },
          ]}
        />
      )}
      {query.isLoading ? (
        <LoaderCircle className="mx-auto size-6 animate-spin text-accent" />
      ) : query.isError ? (
        <p className="text-sm text-danger">Не удалось загрузить брони: {query.error.message}</p>
      ) : holds.length === 0 ? (
        <p className="rounded-[16px] border border-white/10 bg-app-elevated px-4 py-5 text-sm text-fg-2">Ближайших броней нет.</p>
      ) : (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-3">
          {holds.map((hold) => (
            <HoldCard key={hold.id} hold={hold} showDate />
          ))}
        </div>
      )}
    </div>
  );
}
