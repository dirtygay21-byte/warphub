import {
  confirmAdminReservation,
  extendAdminReservation,
  getAdminReservations,
  getUserById,
  rejectAdminReservation,
} from "@/apiUtils/admin";
import {
  getDisciplines,
  getServiceById,
  getServices,
} from "@/apiUtils/disciplines";
import type { TelegramUser } from "@/types";
import {
  formatReservationDateTime,
  formatTimeRange,
  getUserDisplayName,
} from "@/utils/reservationDisplay";
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import clsx from "clsx";
import { Filter, LoaderCircle, RefreshCw, Shield } from "lucide-react";
import { useMemo, useState } from "react";
import { ExtendReservationDialog } from "./components/ExtendReservationDialog";
import { NotificationCheck } from "./components/NotificationCheck";
import { ReservationsFilters } from "./components/ReservationsFilters";
import { ReservationsPagination } from "./components/ReservationsPagination";
import { ReservationsTable } from "./components/ReservationsTable";
import { ReservationPricingDialog } from "./components/ReservationPricingDialog";
import { StatusConfirmDialog } from "./components/StatusConfirmDialog";
import {
  DEFAULT_PAGE_SIZE,
  EMPTY_FILTERS,
  EXTEND_HOUR_OPTIONS,
  RESERVATION_SORTS,
} from "./constants";
import type {
  AdminFiltersForm,
  AdminReservationRow,
  PendingStatusAction,
  StatusAction,
} from "./types";
import { addHoursToEndsAt, formToQuery, hasActiveFilters } from "./utils";
import { isPaintingDetails, summarizeDetails } from "@/apiUtils/booking";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { AnimatePresence } from "motion/react";

export default function AdminReservations() {
  // Пагинация
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(0);

  // Изменения статусов
  const [pendingStatusAction, setPendingStatusAction] =
    useState<PendingStatusAction | null>(null);
  const [pricingReservation, setPricingReservation] =
    useState<AdminReservationRow | null>(null);
  const [extendHours, setExtendHours] = useState<number>(
    EXTEND_HOUR_OPTIONS[0]
  );

  // Фильтры
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] =
    useState<AdminFiltersForm>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<AdminFiltersForm>(EMPTY_FILTERS);

  // API
  const queryClient = useQueryClient();
  const bookingOptions = useBookingOptions();
  // Категории и порядок (14.11.2026): по умолчанию — только ожидающие подтверждения
  const [categories, setCategories] = useState<string[]>(["pending"]);
  const [sortIndex, setSortIndex] = useState(0);
  const queryParams = useMemo(() => {
    const sort = RESERVATION_SORTS[sortIndex] ?? RESERVATION_SORTS[0]!;
    return {
      ...formToQuery(appliedFilters, pageSize, page * pageSize),
      ...(categories.length ? { categories: categories.join(",") } : {}),
      sortBy: sort.key,
      sortOrder: sort.desc ? ("desc" as const) : ("asc" as const),
    };
  }, [appliedFilters, categories, page, pageSize, sortIndex]);

  const reservationsQuery = useQuery({
    queryKey: ["admin-reservations", queryParams],
    queryFn: () => getAdminReservations(queryParams),
    placeholderData: keepPreviousData,
  });

  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: () => getServices(),
  });

  // Данные
  const reservations = useMemo(
    () => reservationsQuery.data?.items ?? [],
    [reservationsQuery.data?.items]
  );

  const totalCount = reservationsQuery.data?.total ?? null;
  const hasNextPage =
    totalCount != null
      ? (page + 1) * pageSize < totalCount
      : reservations.length === pageSize;
  const rangeStart = reservations.length > 0 ? page * pageSize + 1 : 0;
  const rangeEnd = page * pageSize + reservations.length;

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setPage(0);
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(0);
  };

  const missingUserIds = useMemo(
    () => [
      ...new Set(
        reservations
          .filter((reservation) => !reservation.user && reservation.userId)
          .map((reservation) => reservation.userId)
      ),
    ],
    [reservations]
  );

  const missingServiceIds = useMemo(
    () => [
      ...new Set(
        reservations
          .filter((reservation) => !reservation.service)
          .map((reservation) => reservation.serviceId)
      ),
    ],
    [reservations]
  );

  const userQueries = useQueries({
    queries: missingUserIds.map((id) => ({
      queryKey: ["user", id],
      queryFn: () => getUserById(id),
    })),
  });

  const serviceQueries = useQueries({
    queries: missingServiceIds.map((id) => ({
      queryKey: ["service", id],
      queryFn: () => getServiceById(id),
    })),
  });

  const disciplinesQuery = useQuery({
    queryKey: ["disciplines"],
    queryFn: getDisciplines,
  });

  const usersById = useMemo(() => {
    const map = new Map<string, TelegramUser>();

    reservations.forEach((reservation) => {
      if (reservation.user) {
        map.set(reservation.userId, reservation.user);
      }
    });

    userQueries.forEach((query, index) => {
      if (query.data) {
        map.set(missingUserIds[index], query.data);
      }
    });

    return map;
  }, [missingUserIds, reservations, userQueries]);

  const servicesById = useMemo(() => {
    const map = new Map(
      reservations
        .filter((reservation) => reservation.service)
        .map((reservation) => [reservation.serviceId, reservation.service!])
    );

    serviceQueries.forEach((query, index) => {
      if (query.data) {
        map.set(missingServiceIds[index], query.data);
      }
    });

    return map;
  }, [missingServiceIds, reservations, serviceQueries]);

  const disciplinesById = useMemo(
    () =>
      new Map(
        (disciplinesQuery.data ?? []).map((discipline) => [
          discipline.id,
          discipline.title,
        ])
      ),
    [disciplinesQuery.data]
  );

  const onPage = useMemo(() => new Set(reservations.map((reservation) => reservation.id)), [reservations]);

  const rows = useMemo<AdminReservationRow[]>(
    () =>
      reservations.map((reservation) => {
        const user = usersById.get(reservation.userId);
        const service = servicesById.get(reservation.serviceId);

        return {
          ...reservation,
          userLabel: getUserDisplayName(user),
          serviceTitle: service?.title ?? `Услуга #${reservation.serviceId}`,
          disciplineTitle: service
            ? disciplinesById.get(service.disciplineId)
            : undefined,
          tableLabel:
            reservation.table?.name ??
            reservation.tableName ??
            (reservation.tableId ? `#${reservation.tableId}` : "—"),
          timeRange: formatTimeRange(reservation.startsAt, reservation.endsAt),
          clubArmyCount: reservation.seatClubArmyOptions.filter(Boolean).length,
          detailsLabel: summarizeDetails(reservation.details, bookingOptions),
          needsHelp:
            isPaintingDetails(reservation.details) &&
            reservation.details.needsHelp,
          gamePlayers: (reservation.game?.players ?? []).map((player) => ({
            reservationId: player.reservationId,
            name: getUserDisplayName({
              firstName: player.firstName,
              lastName: player.lastName ?? undefined,
              username: player.username ?? undefined,
            }),
            status: player.status,
            detailsLabel: summarizeDetails(player.details, bookingOptions),
            onPage: onPage.has(player.reservationId),
          })),
        };
      }),
    [bookingOptions, disciplinesById, onPage, reservations, servicesById, usersById]
  );

  const statusMutation = useMutation({
    meta: { success: "Статус записи обновлён" },
    mutationFn: async ({
      action,
      id,
      endsAt,
    }: {
      action: StatusAction;
      id: string;
      endsAt?: string;
    }) => {
      switch (action) {
        case "confirm":
          return confirmAdminReservation(id);
        case "reject":
          return rejectAdminReservation(id);
        case "extend":
          return extendAdminReservation(id, endsAt!);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      setPendingStatusAction(null);
    },
  });

  const handleStatusActionSelect = (
    reservation: AdminReservationRow,
    action: StatusAction
  ) => {
    setExtendHours(EXTEND_HOUR_OPTIONS[0]);
    setPendingStatusAction({ reservation, action });
    statusMutation.reset();
  };

  const closePendingAction = () => {
    if (!statusMutation.isPending) {
      setPendingStatusAction(null);
      statusMutation.reset();
    }
  };

  if (reservationsQuery.isLoading) {
    return (
      <div className="flex min-h-[calc(100dvh-140px)] items-center justify-center px-6 text-fg-2">
        <LoaderCircle className="size-8 animate-spin text-accent" />
      </div>
    );
  }

  if (reservationsQuery.isError) {
    return (
      <div className="flex min-h-[calc(100dvh-140px)] flex-col items-center justify-center gap-4 px-6 text-center text-white">
        <Shield className="size-10 text-accent" />
        <p className="text-sm text-fg-2">
          Не удалось загрузить записи. Попробуйте ещё раз.
        </p>
        <button
          type="button"
          onClick={() => reservationsQuery.refetch()}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
        >
          <RefreshCw className="size-4" />
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 pb-28 text-white sm:px-6">
      <NotificationCheck />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Все записи</h1>
          <p className="mt-1 text-sm text-fg-3">
            {reservations.length > 0
              ? totalCount != null
                ? `Показано ${rangeStart}–${rangeEnd} из ${totalCount}`
                : `Показано ${rangeStart}–${rangeEnd}`
              : "Записей не найдено"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            className={clsx(
              "flex size-10 items-center justify-center rounded-xl border transition-colors active:bg-white/10",
              filtersOpen || hasActiveFilters(appliedFilters)
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-white/10 bg-white/3 text-white/80"
            )}
            aria-label="Фильтры"
          >
            <Filter className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => reservationsQuery.refetch()}
            disabled={reservationsQuery.isFetching}
            aria-label="Обновить список"
            className="flex ds-hit size-10 items-center justify-center rounded-xl border border-white/10 bg-white/3 transition-colors active:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw
              className={`size-4 ${
                reservationsQuery.isFetching ? "animate-spin" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {filtersOpen && (
        <ReservationsFilters
          values={draftFilters}
          services={servicesQuery.data ?? []}
          onChange={(patch) =>
            setDraftFilters((current) => ({ ...current, ...patch }))
          }
          onApply={applyFilters}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters(appliedFilters)}
        />
      )}

      <div
        className={clsx(
          "relative",
          reservationsQuery.isFetching && !reservationsQuery.isLoading
            ? "opacity-70"
            : ""
        )}
      >
        {reservationsQuery.isFetching && !reservationsQuery.isLoading && (
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-4">
            <LoaderCircle className="size-6 animate-spin text-accent" />
          </div>
        )}

        <ReservationsTable
          data={categories.length ? rows : []}
          sortIndex={sortIndex}
          onSortChange={(index) => {
            setSortIndex(index);
            setPage(0);
          }}
          categories={categories}
          onCategoriesChange={(next) => {
            setCategories(next);
            setPage(0);
          }}
          onStatusActionSelect={handleStatusActionSelect}
          onPricingSelect={setPricingReservation}
        />
      </div>

      <ReservationsPagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        itemsCount={reservations.length}
        hasNextPage={hasNextPage}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
      />

      <AnimatePresence>
        {pendingStatusAction?.action === "extend" && (
          <ExtendReservationDialog
            userLabel={pendingStatusAction.reservation.userLabel}
            serviceTitle={pendingStatusAction.reservation.serviceTitle}
            timeLabel={pendingStatusAction.reservation.timeRange}
            dateLabel={formatReservationDateTime(
              pendingStatusAction.reservation.startsAt
            )}
            currentEndsAt={pendingStatusAction.reservation.endsAt}
            hours={extendHours}
            onHoursChange={setExtendHours}
            isPending={statusMutation.isPending}
            errorMessage={
              statusMutation.isError ? statusMutation.error.message : null
            }
            onClose={closePendingAction}
            onConfirm={() =>
              statusMutation.mutate({
                action: "extend",
                id: pendingStatusAction.reservation.id,
                endsAt: addHoursToEndsAt(
                  pendingStatusAction.reservation.endsAt,
                  extendHours
                ),
              })
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingStatusAction &&
          (pendingStatusAction.action === "confirm" ||
            pendingStatusAction.action === "reject") && (
            <StatusConfirmDialog
              action={pendingStatusAction.action}
              userLabel={pendingStatusAction.reservation.userLabel}
              serviceTitle={pendingStatusAction.reservation.serviceTitle}
              timeLabel={pendingStatusAction.reservation.timeRange}
              dateLabel={formatReservationDateTime(
                pendingStatusAction.reservation.startsAt
              )}
              isPending={statusMutation.isPending}
              errorMessage={
                statusMutation.isError ? statusMutation.error.message : null
              }
              onClose={closePendingAction}
              onConfirm={() =>
                statusMutation.mutate({
                  action: pendingStatusAction.action,
                  id: pendingStatusAction.reservation.id,
                })
              }
            />
          )}
      </AnimatePresence>

      <AnimatePresence>
        {pricingReservation && (
          <ReservationPricingDialog
            reservation={pricingReservation}
            onClose={() => setPricingReservation(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
