import { getStatusLabel, getStatusStyle } from "@/utils/reservationDisplay";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { STATUS_ACTION_OPTIONS } from "../constants";
import type { AdminReservationRow, StatusAction } from "../types";
import { getAvailableStatusActions } from "../utils";

export function StatusBadgeCell({
  reservation,
  onActionSelect,
}: {
  reservation: AdminReservationRow;
  onActionSelect: (action: StatusAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const actions = getAvailableStatusActions(reservation.status);
  const status = reservation.status;

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (actions.length === 0) {
    return (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          getStatusStyle(status)
        )}
      >
        {getStatusLabel(status)}
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          "inline-flex min-h-9 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors hover:brightness-110",
          getStatusStyle(status)
        )}
      >
        {getStatusLabel(status)}
        <ChevronDown
          className={clsx("size-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-white/10 bg-app-elevated py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
          {actions.map((action) => {
            const option = STATUS_ACTION_OPTIONS[action];

            return (
              <button
                key={action}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onActionSelect(action);
                }}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-white/85 transition-colors hover:bg-white/5"
              >
                <span
                  className={clsx(
                    "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                    option.style
                  )}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
