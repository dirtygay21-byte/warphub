import { formatReservationDateTime } from "@/utils/reservationDisplay";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import clsx from "clsx";
import { useMemo, useState } from "react";
import type { AdminReservationRow, StatusAction } from "../types";
import { CopyUserId } from "./CopyUserId";
import { StatusBadgeCell } from "./StatusBadgeCell";

type ReservationsTableProps = {
  data: AdminReservationRow[];
  onStatusActionSelect: (
    reservation: AdminReservationRow,
    action: StatusAction
  ) => void;
};

export function ReservationsTable({
  data,
  onStatusActionSelect,
}: ReservationsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);

  const columns = useMemo<ColumnDef<AdminReservationRow>[]>(
    () => [
      {
        accessorKey: "userLabel",
        header: "Пользователь",
        cell: ({ row }) => (
          <div className="min-w-[160px]">
            <p className="font-medium text-white/90">
              {row.original.userLabel}
            </p>
            <CopyUserId userId={row.original.userId} />
          </div>
        ),
      },
      {
        accessorKey: "serviceTitle",
        header: "Услуга",
        cell: ({ row }) => (
          <div className="min-w-[140px]">
            <p className="font-medium text-white/90">
              {row.original.serviceTitle}
            </p>
            {row.original.disciplineTitle && (
              <p className="mt-1 text-xs text-white/45">
                {row.original.disciplineTitle}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Статус",
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadgeCell
            reservation={row.original}
            onActionSelect={(action) =>
              onStatusActionSelect(row.original, action)
            }
          />
        ),
      },
      {
        accessorKey: "timeRange",
        header: "Интервал",
      },
      {
        accessorKey: "startsAt",
        header: "Начало",
        cell: ({ getValue }) => formatReservationDateTime(getValue<string>()),
      },
      {
        accessorKey: "partySize",
        header: "Гостей",
      },
      {
        accessorKey: "tableLabel",
        header: "Стол",
      },
      {
        accessorKey: "detailsLabel",
        header: "Данные",
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={clsx(
              "block max-w-[280px] truncate",
              row.original.needsHelp && "text-yellow-200",
            )}
            title={row.original.detailsLabel}
          >
            {row.original.detailsLabel}
          </span>
        ),
      },
      {
        accessorKey: "clubArmyCount",
        header: "Армия",
        cell: ({ getValue }) => {
          const count = getValue<number>();
          return count > 0 ? count : "—";
        },
      },
      {
        accessorKey: "createdAt",
        header: "Создана",
        cell: ({ getValue }) => formatReservationDateTime(getValue<string>()),
      },
    ],
    [onStatusActionSelect]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-app-elevated shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="border-b border-white/10 bg-white/3">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={clsx(
                        "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-accent",
                        header.column.getCanSort() &&
                          "cursor-pointer select-none hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() && (
                          <span className="text-[10px] text-white/35">
                            {sorted === "asc"
                              ? "▲"
                              : sorted === "desc"
                              ? "▼"
                              : "↕"}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-white/10 transition-colors hover:bg-white/3"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="whitespace-nowrap px-4 py-3 text-sm text-white/80"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}

            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-16 text-center text-sm text-white/45"
                >
                  Нет записей
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
