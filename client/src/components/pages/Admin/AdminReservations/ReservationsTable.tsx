import clsx from "clsx";
import { CalendarDays, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { Reservation } from "@/types";
import type { SortConfig, SortKey } from "./types";
import {
  formatDateTime,
  formatTime,
  getServiceName,
  getStatusLabel,
  getStatusStyles,
  truncateMiddle,
} from "./utils";

export default function ReservationsTable({
  isFetching,
  onSortChange,
  reservations,
  sort,
}: {
  isFetching: boolean;
  onSortChange: (key: SortKey) => void;
  reservations: Reservation[];
  sort: SortConfig;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-white/10">
          <TableHead sortKey="id" sort={sort} onSortChange={onSortChange}>
            ID
          </TableHead>
          <TableHead sortKey="startsAt" sort={sort} onSortChange={onSortChange}>
            Дата и время
          </TableHead>
          <TableHead sortKey="telegramId" sort={sort} onSortChange={onSortChange}>
            Telegram ID
          </TableHead>
          <TableHead sortKey="serviceId" sort={sort} onSortChange={onSortChange}>
            Услуга
          </TableHead>
          <TableHead sortKey="tableId" sort={sort} onSortChange={onSortChange}>
            Стол
          </TableHead>
          <TableHead sortKey="status" sort={sort} onSortChange={onSortChange}>
            Статус
          </TableHead>
          <TableHead sortKey="partySize" sort={sort} onSortChange={onSortChange}>
            Гостей
          </TableHead>
          <TableHead sortKey="createdAt" sort={sort} onSortChange={onSortChange}>
            Создана
          </TableHead>
        </tr>
      </thead>
      <tbody>
        {isFetching && reservations.length === 0 ? (
          <EmptyRow text="Загружаем записи..." />
        ) : reservations.length === 0 ? (
          <tr>
            <td
              colSpan={8}
              className="px-3 py-12 text-center text-sm text-white/40"
            >
              <CalendarDays className="mx-auto mb-2 size-6 text-white/20" />
              Записи не найдены
            </td>
          </tr>
        ) : (
          reservations.map((reservation) => (
            <ReservationRow key={reservation.id} reservation={reservation} />
          ))
        )}
      </tbody>
    </table>
  );
}

function ReservationRow({ reservation }: { reservation: Reservation }) {
  const armyCount = reservation.seatClubArmyOptions.filter(Boolean).length;

  return (
    <tr className="border-b border-white/5 transition-colors last:border-b-0 hover:bg-white/[0.02]">
      <td className="px-3 py-3">
        <CodeValue value={reservation.id} max={16} />
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-white/80">
        <div>{formatDateTime(reservation.startsAt)}</div>
        {reservation.endsAt && (
          <div className="text-xs text-white/40">
            до {formatTime(reservation.endsAt)}
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        {reservation.telegramId != null ? (
          <span className="font-mono text-xs text-white/60">
            {reservation.telegramId}
          </span>
        ) : (
          <CodeValue value={reservation.userId} max={22} />
        )}
      </td>
      <td className="max-w-[180px] truncate px-3 py-3 text-white/80">
        {getServiceName(reservation.serviceId)}
      </td>
      <td className="px-3 py-3 font-mono text-white/60">
        {reservation.tableId != null ? `Стол ${reservation.tableId}` : "—"}
      </td>
      <td className="px-3 py-3">
        <span
          className={clsx(
            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
            getStatusStyles(reservation.status)
          )}
        >
          {getStatusLabel(reservation.status)}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-white/70">
        {reservation.partySize}
        {armyCount > 0 && (
          <span className="ml-2 text-xs text-accent">
            армий: {armyCount}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-white/40">
        {formatDateTime(reservation.createdAt)}
      </td>
    </tr>
  );
}

function TableHead({
  children,
  onSortChange,
  sort,
  sortKey,
}: {
  children: React.ReactNode;
  onSortChange: (key: SortKey) => void;
  sort: SortConfig;
  sortKey: SortKey;
}) {
  const isActive = sort.key === sortKey;

  return (
    <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/50">
      <button
        type="button"
        onClick={() => onSortChange(sortKey)}
        className="inline-flex items-center gap-1 transition-colors hover:text-white"
      >
        {children}
        {isActive ? (
          sort.direction === "asc" ? (
            <ChevronUp className="size-3 text-accent" />
          ) : (
            <ChevronDown className="size-3 text-accent" />
          )
        ) : (
          <ChevronsUpDown className="size-3 opacity-35" />
        )}
      </button>
    </th>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <tr>
      <td colSpan={8} className="px-3 py-12 text-center text-sm text-white/40">
        {text}
      </td>
    </tr>
  );
}

function CodeValue({ max, value }: { max: number; value: string }) {
  return (
    <code className="font-mono text-xs text-white/45" title={value}>
      {truncateMiddle(value, max)}
    </code>
  );
}
