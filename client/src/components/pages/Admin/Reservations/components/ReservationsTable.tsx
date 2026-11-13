import { STATUS_LABELS, formatReservationDateTime } from "@/utils/reservationDisplay";
import {
  type ColumnDef,
  type Row,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import clsx from "clsx";
import { Swords, WalletCards } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { AdminReservationRow, StatusAction } from "../types";
import { CopyUserId } from "./CopyUserId";
import { StatusBadgeCell } from "./StatusBadgeCell";

type ReservationsTableProps = {
  data: AdminReservationRow[];
  onStatusActionSelect: (
    reservation: AdminReservationRow,
    action: StatusAction
  ) => void;
  onPricingSelect: (reservation: AdminReservationRow) => void;
};

export function ReservationsTable({
  data,
  onStatusActionSelect,
  onPricingSelect,
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
              <p className="mt-1 text-xs text-fg-3">
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
        id: "pricing",
        header: "Счёт",
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onPricingSelect(row.original)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
          >
            <WalletCards className="size-4" />
            Счёт
          </button>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Создана",
        cell: ({ getValue }) => formatReservationDateTime(getValue<string>()),
      },
    ],
    [onPricingSelect, onStatusActionSelect]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const renderRow = (row: Row<AdminReservationRow>, inGame: boolean) => (
    <tr
      key={row.id}
      className={clsx(
        "border-b border-white/10 transition-colors hover:bg-white/3",
        inGame && "bg-accent/[0.03]"
      )}
    >
      {row.getVisibleCells().map((cell, index) => (
        <td
          key={cell.id}
          className={clsx(
            "whitespace-nowrap px-4 py-3 text-sm text-white/80",
            inGame && index === 0 && "border-l-[3px] border-accent/70"
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );

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
                          <span className="text-[12px] text-fg-3">
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
            {groupByGame(table.getRowModel().rows).map((block) =>
              block.game ? (
                <Fragment key={block.game.key}>
                  <tr className="border-b border-accent/20 bg-accent/[0.06]">
                    <td colSpan={columns.length} className="px-0 py-0">
                      <TableGameHeader row={block.rows[0]!.original} />
                    </td>
                  </tr>
                  {block.rows.map((row) => renderRow(row, true))}
                </Fragment>
              ) : (
                renderRow(block.rows[0]!, false)
              )
            )}

            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-16 text-center text-sm text-fg-3"
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

type Block = { game: AdminReservationRow["game"] | null; rows: Row<AdminReservationRow>[] };

/**
 * Записи одной игры за столом — одним блоком (13.11.2026): место блока — по первой записи игры в текущей сортировке,
 * остальные записи этой игры на странице идут сразу за ней. Записи без игры — по одной, как раньше.
 */
function groupByGame(rows: Row<AdminReservationRow>[]): Block[] {
  const blocks: Block[] = [];
  const byKey = new Map<string, Block>();
  for (const row of rows) {
    const game = row.original.game;
    if (!game || game.players.length < 2) {
      blocks.push({ game: null, rows: [row] });
      continue;
    }
    const block = byKey.get(game.key);
    if (block) block.rows.push(row);
    else {
      const created = { game, rows: [row] };
      byKey.set(game.key, created);
      blocks.push(created);
    }
  }
  return blocks;
}

function TableGameHeader({ row }: { row: AdminReservationRow }) {
  const game = row.game!;
  const full = game.occupied >= game.seats;
  return (
    <div className="sticky left-0 w-[min(100vw-2rem,48rem)] whitespace-normal px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
          <Swords className="size-4" />
          Игра за столом
        </span>
        <span className="text-white/90">
          {row.serviceTitle} · {row.tableLabel} · {formatReservationDateTime(row.startsAt)}, {row.timeRange}
        </span>
        <span
          className={clsx(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            full ? "bg-accent/20 text-accent" : "bg-yellow-400/15 text-yellow-200"
          )}
        >
          {game.occupied}/{game.seats} · {full ? "стол собран" : "ждёт соперника"}
        </span>
      </div>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {row.gamePlayers.map((player) => (
          <li key={player.reservationId} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[13px]">
            <p className="font-medium text-white/90">
              {player.name}
              <span className="ml-2 text-xs font-normal text-fg-3">
                {STATUS_LABELS[player.status] ?? player.status}
                {!player.onPage && " · запись на другой странице"}
              </span>
            </p>
            <p className="mt-0.5 text-fg-2">{player.detailsLabel || "—"}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
