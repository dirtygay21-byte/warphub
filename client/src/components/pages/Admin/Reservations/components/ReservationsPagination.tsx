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

  // одна строка и на телефоне (C2): раньше полоса в две строки закрывала последние записи
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] bg-app/95 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-fg-2">
          <span className="hidden sm:inline">На странице</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Записей на странице"
            className="h-11 rounded-xl border border-white/[0.14] bg-app-elevated px-2.5 text-fg outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
            className="ds-press flex size-11 items-center justify-center rounded-xl border border-white/[0.14] bg-app-elevated text-fg disabled:opacity-40"
            aria-label="Предыдущая страница"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="min-w-[88px] whitespace-nowrap text-center text-sm tabular-nums text-fg-2">
            {totalPages != null ? `${page + 1} из ${totalPages}` : `Стр. ${page + 1}`}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNextPage || itemsCount === 0}
            className="ds-press flex size-11 items-center justify-center rounded-xl border border-white/[0.14] bg-app-elevated text-fg disabled:opacity-40"
            aria-label="Следующая страница"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
