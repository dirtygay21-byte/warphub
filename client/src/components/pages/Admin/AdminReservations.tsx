import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { getAdminReservations } from "@/apiUtils/admin";
import { useNavigationStore } from "@/stores/useNavigationStore";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { DEFAULT_LIMIT } from "./AdminReservations/constants";
import FiltersPanel from "./AdminReservations/FiltersPanel";
import Pagination from "./AdminReservations/Pagination";
import ReservationsTable from "./AdminReservations/ReservationsTable";
import { ErrorView, LoadingView } from "./AdminReservations/StateViews";
import type { Filters, SortConfig } from "./AdminReservations/types";
import {
  dateTimeOrUndefined,
  emptyToUndefined,
  getRecordsLabel,
  numberOrUndefined,
  sortReservations,
} from "./AdminReservations/utils";

export default function AdminReservations() {
  const { setActivePage } = useNavigationStore();
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [filters, setFilters] = useState<Filters>({
    date: "",
    serviceId: "",
    tableId: "",
    status: "",
    telegramId: "",
    startsAt: "",
    endsAt: "",
  });
  const [sort, setSort] = useState<SortConfig>({
    key: "startsAt",
    direction: "desc",
  });

  const queryParams = useMemo(
    () => ({
      limit,
      offset,
      date: emptyToUndefined(filters.date),
      status: emptyToUndefined(filters.status),
      serviceId: numberOrUndefined(filters.serviceId),
      tableId: numberOrUndefined(filters.tableId),
      telegramId: numberOrUndefined(filters.telegramId),
      startsAt: dateTimeOrUndefined(filters.startsAt),
      endsAt: dateTimeOrUndefined(filters.endsAt),
    }),
    [filters, limit, offset]
  );

  const query = useQuery({
    queryKey: ["admin-reservations", queryParams],
    queryFn: () => getAdminReservations(queryParams),
    refetchOnWindowFocus: false,
  });

  const reservations = query.data?.items ?? [];
  const sortedReservations = useMemo(
    () => sortReservations(reservations, sort),
    [reservations, sort]
  );
  const total = query.data?.total ?? reservations.length;
  const canGoBack = offset > 0;
  const canGoForward = offset + limit < total;
  const hasFilters = Object.values(filters).some(Boolean);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setOffset(0);
  };

  const resetFilters = () => {
    setFilters({
      date: "",
      serviceId: "",
      tableId: "",
      status: "",
      telegramId: "",
      startsAt: "",
      endsAt: "",
    });
    setOffset(0);
  };

  if (query.isLoading) {
    return <LoadingView />;
  }

  if (query.isError) {
    return <ErrorView onRetry={() => query.refetch()} />;
  }

  return (
    <div className="min-h-dvh bg-app-bg px-4 py-4 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActivePage("Home")}
              className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:text-white"
              aria-label="На главную"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">Записи</h1>
              <p className="text-sm text-white/50">
                {total} {getRecordsLabel(total)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition-colors active:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw
              className={clsx("size-4", query.isFetching && "animate-spin")}
            />
            Обновить
          </button>
        </header>

        <FiltersPanel
          filters={filters}
          hasFilters={hasFilters}
          limit={limit}
          onFilterChange={setFilter}
          onLimitChange={(nextLimit) => {
            setLimit(nextLimit);
            setOffset(0);
          }}
          onReset={resetFilters}
        />

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-app-elevated shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
          <ReservationsTable
            isFetching={query.isFetching}
            onSortChange={(key) =>
              setSort((current) => ({
                key,
                direction:
                  current.key === key && current.direction === "asc"
                    ? "desc"
                    : "asc",
              }))
            }
            reservations={sortedReservations}
            sort={sort}
          />
          <Pagination
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            limit={limit}
            offset={offset}
            onNext={() => setOffset(offset + limit)}
            onPrevious={() => setOffset(Math.max(0, offset - limit))}
            total={total}
          />
        </div>
      </div>
    </div>
  );
}
