import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "../constants";

type ReservationsPaginationProps = {
  page: number;
  pageSize: number;
  totalCount: number | null;
  itemsCount: number;
  hasNextPage: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function ReservationsPagination({
  page,
  pageSize,
  totalCount,
  itemsCount,
  hasNextPage,
  onPageChange,
  onPageSizeChange,
}: ReservationsPaginationProps) {
  const totalPages =
    totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-app-bg/95 px-4 py-3 backdrop-blur-sm sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-screen-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <span>На странице</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-lg border border-white/10 bg-app-elevated px-2 py-1.5 text-white outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-sm text-white/60">
            {totalPages != null
              ? `Страница ${page + 1} из ${totalPages}`
              : `Страница ${page + 1}`}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/3 text-white transition-colors active:bg-white/10 disabled:opacity-40"
              aria-label="Предыдущая страница"
            >
              <ChevronLeft className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNextPage || itemsCount === 0}
              className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/3 text-white transition-colors active:bg-white/10 disabled:opacity-40"
              aria-label="Следующая страница"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
