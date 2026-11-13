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
import { ChevronRight, Swords, WalletCards, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { useDialogExit } from "@/components/ui/ds/useDialogExit";
import { useEffect, useMemo, useState } from "react";
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

  const [openGame, setOpenGame] = useState<string | null>(null);
  const openRows = openGame ? data.filter((row) => row.game?.key === openGame) : [];

  const renderRow = (row: Row<AdminReservationRow>) => (
    <tr key={row.id} className="border-b border-white/10 transition-colors hover:bg-white/3">
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} className="whitespace-nowrap px-4 py-3 text-sm text-white/80">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );

  return (
    <>
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
                <tr key={block.game.key} className="border-b border-white/10 bg-accent/[0.05] transition-colors hover:bg-accent/[0.09]">
                  <td colSpan={columns.length} className="px-0 py-0">
                    <TableGameRow row={block.rows[0]!.original} onOpen={() => setOpenGame(block.game!.key)} />
                  </td>
                </tr>
              ) : (
                renderRow(block.rows[0]!)
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
    <AnimatePresence>
      {openGame && openRows.length > 0 && (
        <TableGameSheet
          rows={openRows}
          onClose={() => setOpenGame(null)}
          onStatusAction={(row, action) => {
            setOpenGame(null);
            onStatusActionSelect(row, action);
          }}
          onPricing={(row) => {
            setOpenGame(null);
            onPricingSelect(row);
          }}
        />
      )}
    </AnimatePresence>
    </>
  );
}
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

function gameTitle(row: AdminReservationRow) {
  return `${row.serviceTitle} · ${row.tableLabel} · ${formatReservationDateTime(row.startsAt)}, ${row.timeRange}`;
}

function SeatsBadge({ occupied, seats }: { occupied: number; seats: number }) {
  const full = occupied >= seats;
  return (
    <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", full ? "bg-accent/20 text-accent" : "bg-yellow-400/15 text-yellow-200")}>
      {occupied}/{seats} · {full ? "стол собран" : "ждёт соперника"}
    </span>
  );
}

/** Игра за столом в списке (14.11.2026): одна строка — кто, когда, сколько мест; нажатие открывает окно с подробностями. */
function TableGameRow({ row, onOpen }: { row: AdminReservationRow; onOpen: () => void }) {
  const game = row.game!;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="sticky left-0 flex w-[min(100vw-2rem,48rem)] items-center gap-3 px-4 py-3 text-left"
    >
      <Swords className="size-5 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-white/90">Игра за столом · {game.players.length} {game.players.length === 1 ? "игрок" : "игрока"}</span>
          <SeatsBadge occupied={game.occupied} seats={game.seats} />
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-fg-2">{gameTitle(row)}</span>
        <span className="mt-0.5 block truncate text-[13px] text-white/80">{row.gamePlayers.map((p) => p.name).join(" · ")}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-3" />
    </button>
  );
}

/** Окно игры за столом: все участники отдельными карточками — статус и действия, выбор, счёт. */
function TableGameSheet({
  rows,
  onClose,
  onStatusAction,
  onPricing,
}: {
  rows: AdminReservationRow[];
  onClose: () => void;
  onStatusAction: (row: AdminReservationRow, action: StatusAction) => void;
  onPricing: (row: AdminReservationRow) => void;
}) {
  const leaving = useDialogExit();
  const first = rows[0]!;
  const game = first.game!;
  const byId = new Map(rows.map((row) => [row.id, row]));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className={`fixed inset-0 z-[70]${leaving ? " ds-leaving" : ""}`}>
      <div className="ds-fade absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Игра за столом"
        className="ds-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-[22px] border-t border-white/10 bg-app-elevated px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5 text-fg"
      >
        <div className="h-1 w-10 shrink-0 self-center rounded bg-white/20" />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[22px] font-semibold uppercase leading-none">Игра за столом</h2>
            <p className="mt-1.5 text-sm text-fg-2">{gameTitle(first)}</p>
            <div className="mt-2">
              <SeatsBadge occupied={game.occupied} seats={game.seats} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="ds-press flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] text-fg">
            <X className="size-5" />
          </button>
        </div>
        <ul className="mt-4 flex flex-col gap-3">
          {first.gamePlayers.map((player, index) => {
            const row = byId.get(player.reservationId);
            return (
              <li key={player.reservationId} className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">Игрок {index + 1}</p>
                    <p className="mt-0.5 text-base font-semibold text-white/90">{player.name}</p>
                    {row && <CopyUserId userId={row.userId} />}
                  </div>
                  {row ? (
                    <StatusBadgeCell reservation={row} onActionSelect={(action) => onStatusAction(row, action)} />
                  ) : (
                    <span className="text-xs text-fg-3">{STATUS_LABELS[player.status] ?? player.status}</span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                  <dt className="text-fg-3">Выбор</dt>
                  <dd className={clsx("text-white/85", row?.needsHelp && "text-yellow-200")}>{player.detailsLabel || "—"}</dd>
                  {row && (
                    <>
                      <dt className="text-fg-3">Армия клуба</dt>
                      <dd className="text-white/85">{row.clubArmyCount > 0 ? row.clubArmyCount : "—"}</dd>
                      <dt className="text-fg-3">Создана</dt>
                      <dd className="text-white/85">{formatReservationDateTime(row.createdAt)}</dd>
                    </>
                  )}
                </dl>
                {row ? (
                  <button
                    type="button"
                    onClick={() => onPricing(row)}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
                  >
                    <WalletCards className="size-4" />
                    Счёт
                  </button>
                ) : (
                  <p className="mt-3 text-xs text-fg-3">Запись на другой странице списка — действия там.</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body
  );
}
