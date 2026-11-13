import { STATUS_LABELS, formatReservationDateTime, getStatusLabel, getStatusStyle } from "@/utils/reservationDisplay";
import { useDialogExit } from "@/components/ui/ds/useDialogExit";
import clsx from "clsx";
import { ArrowDownUp, CalendarClock, Check, ChevronRight, Swords, WalletCards, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RESERVATION_CATEGORIES, RESERVATION_SORTS } from "../constants";
import type { AdminReservationRow, StatusAction } from "../types";
import { CopyUserId } from "./CopyUserId";
import { StatusBadgeCell } from "./StatusBadgeCell";

type ReservationsTableProps = {
  data: AdminReservationRow[];
  sortIndex: number;
  onSortChange: (index: number) => void;
  categories: string[];
  onCategoriesChange: (next: string[]) => void;
  onStatusActionSelect: (reservation: AdminReservationRow, action: StatusAction) => void;
  onPricingSelect: (reservation: AdminReservationRow) => void;
};

/** Запись или игра за столом в списке: одна карточка. */
type Item = { key: string; game: boolean; rows: AdminReservationRow[] };

/**
 * «Все записи» (14.11.2026): компактный список вместо широкой таблицы — без прокрутки вбок.
 * Каждая запись — одна строка (кто, что, когда, статус); игра за столом — одна строка на всех игроков.
 * Нажатие открывает окно со всеми данными и действиями (статус, счёт).
 */
export function ReservationsTable({
  data,
  sortIndex,
  onSortChange,
  categories,
  onCategoriesChange,
  onStatusActionSelect,
  onPricingSelect,
}: ReservationsTableProps) {
  const [open, setOpen] = useState<string | null>(null);

  const items = useMemo(() => {
    const sort = RESERVATION_SORTS[sortIndex] ?? RESERVATION_SORTS[0]!;
    const time = (row: AdminReservationRow) => new Date(row[sort.key] ?? 0).getTime();
    const sorted = [...data].sort((a, b) => (sort.desc ? time(b) - time(a) : time(a) - time(b)));
    const list: Item[] = [];
    const byGame = new Map<string, Item>();
    for (const row of sorted) {
      const game = row.game;
      if (game && game.players.length >= 2) {
        const existing = byGame.get(game.key);
        if (existing) existing.rows.push(row);
        else {
          const item = { key: `g:${game.key}`, game: true, rows: [row] };
          byGame.set(game.key, item);
          list.push(item);
        }
      } else list.push({ key: `r:${row.id}`, game: false, rows: [row] });
    }
    return list;
  }, [data, sortIndex]);

  const opened = open ? items.find((item) => item.key === open) : undefined;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-app-elevated">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Какие записи показать">
          {RESERVATION_CATEGORIES.map((category) => {
            const on = categories.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={on}
                onClick={() => onCategoriesChange(on ? categories.filter((c) => c !== category.id) : [...categories, category.id])}
                className={clsx(
                  "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                  on ? "border-accent/60 bg-accent/15 text-accent" : "border-white/[0.14] text-fg-2 hover:text-fg",
                )}
              >
                {on && <Check className="size-3.5" />}
                {category.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <ArrowDownUp className="size-4 shrink-0 text-fg-3" />
          <select
            value={sortIndex}
            onChange={(event) => onSortChange(Number(event.target.value))}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.14] bg-field px-3 text-sm text-fg"
            aria-label="Порядок записей"
          >
            {RESERVATION_SORTS.map((sort, index) => (
              <option key={sort.label} value={index}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-fg-3">{categories.length ? "Нет записей" : "Выберите, какие записи показать"}</p>
      ) : (
        <ul className="divide-y divide-white/10">
          {items.map((item) => (
            <li key={item.key}>
              {item.game ? (
                <GameRow row={item.rows[0]!} onOpen={() => setOpen(item.key)} />
              ) : (
                <BookingRow row={item.rows[0]!} onOpen={() => setOpen(item.key)} />
              )}
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {opened && (
          <DetailsSheet
            item={opened}
            onClose={() => setOpen(null)}
            onStatusAction={(row, action) => {
              setOpen(null);
              onStatusActionSelect(row, action);
            }}
            onPricing={(row) => {
              setOpen(null);
              onPricingSelect(row);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const when = (row: AdminReservationRow) => `${formatReservationDateTime(row.startsAt)}, ${row.timeRange}`;

function StatusPill({ status }: { status: string }) {
  return <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", getStatusStyle(status))}>{getStatusLabel(status)}</span>;
}

function SeatsBadge({ occupied, seats }: { occupied: number; seats: number }) {
  const full = occupied >= seats;
  return (
    <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", full ? "bg-accent/20 text-accent" : "bg-yellow-400/15 text-yellow-200")}>
      {occupied}/{seats} · {full ? "стол собран" : "ждёт соперника"}
    </span>
  );
}

const rowClass = "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]";

function BookingRow({ row, onOpen }: { row: AdminReservationRow; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={rowClass}>
      <CalendarClock className="size-5 shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-white/90">{row.userLabel}</span>
          <StatusPill status={row.status} />
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-white/80">
          {row.serviceTitle}
          {row.tableId ? ` · ${row.tableLabel}` : ""}
          {row.partySize > 1 ? ` · гостей: ${row.partySize}` : ""}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-fg-2">{when(row)}</span>
        {row.detailsLabel && (
          <span className={clsx("mt-0.5 block truncate text-[12px]", row.needsHelp ? "text-yellow-200" : "text-fg-3")}>{row.detailsLabel}</span>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-3" />
    </button>
  );
}

function GameRow({ row, onOpen }: { row: AdminReservationRow; onOpen: () => void }) {
  const game = row.game!;
  return (
    <button type="button" onClick={onOpen} className={clsx(rowClass, "bg-accent/[0.05]")}>
      <Swords className="size-5 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-white/90">
            Игра за столом · {game.players.length} {game.players.length === 1 ? "игрок" : "игрока"}
          </span>
          <SeatsBadge occupied={game.occupied} seats={game.seats} />
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-white/80">{row.gamePlayers.map((p) => p.name).join(" · ")}</span>
        <span className="mt-0.5 block truncate text-[13px] text-fg-2">
          {row.serviceTitle} · {row.tableLabel} · {when(row)}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-3" />
    </button>
  );
}

function Field({ label, children, warn }: { label: string; children: ReactNode; warn?: boolean }) {
  return (
    <>
      <dt className="text-fg-3">{label}</dt>
      <dd className={clsx("min-w-0 break-words", warn ? "text-yellow-200" : "text-white/85")}>{children}</dd>
    </>
  );
}

/** Карточка одной записи в окне: кто, статус с действиями, все данные, счёт. */
function BookingCard({
  row,
  title,
  showVisit,
  onStatusAction,
  onPricing,
}: {
  row: AdminReservationRow;
  title?: string;
  showVisit: boolean;
  onStatusAction: (row: AdminReservationRow, action: StatusAction) => void;
  onPricing: (row: AdminReservationRow) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">{title}</p>}
          <p className="mt-0.5 text-base font-semibold text-white/90">{row.userLabel}</p>
          <CopyUserId userId={row.userId} />
        </div>
        <StatusBadgeCell reservation={row} onActionSelect={(action) => onStatusAction(row, action)} />
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {showVisit && (
          <>
            <Field label="Услуга">
              {row.serviceTitle}
              {row.disciplineTitle ? ` · ${row.disciplineTitle}` : ""}
            </Field>
            <Field label="Когда">{when(row)}</Field>
            {row.tableId ? <Field label="Стол">{row.tableLabel}</Field> : null}
          </>
        )}
        <Field label="Гостей">{row.partySize}</Field>
        <Field label="Выбор" warn={row.needsHelp}>
          {row.detailsLabel || "—"}
        </Field>
        <Field label="Армия клуба">{row.clubArmyCount > 0 ? row.clubArmyCount : "—"}</Field>
        <Field label="Создана">{formatReservationDateTime(row.createdAt)}</Field>
      </dl>
      <button
        type="button"
        onClick={() => onPricing(row)}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
      >
        <WalletCards className="size-4" />
        Счёт
      </button>
    </div>
  );
}

function DetailsSheet({
  item,
  onClose,
  onStatusAction,
  onPricing,
}: {
  item: Item;
  onClose: () => void;
  onStatusAction: (row: AdminReservationRow, action: StatusAction) => void;
  onPricing: (row: AdminReservationRow) => void;
}) {
  const leaving = useDialogExit();
  const first = item.rows[0]!;
  const game = item.game ? first.game! : null;
  const byId = new Map(item.rows.map((row) => [row.id, row]));
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
        aria-label={game ? "Игра за столом" : "Запись"}
        className="ds-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-[22px] border-t border-white/10 bg-app-elevated px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5 text-fg"
      >
        <div className="h-1 w-10 shrink-0 self-center rounded bg-white/20" />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[22px] font-semibold uppercase leading-none">{game ? "Игра за столом" : "Запись"}</h2>
            {game && (
              <>
                <p className="mt-1.5 text-sm text-fg-2">
                  {first.serviceTitle} · {first.tableLabel} · {when(first)}
                </p>
                <div className="mt-2">
                  <SeatsBadge occupied={game.occupied} seats={game.seats} />
                </div>
              </>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="ds-press flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] text-fg">
            <X className="size-5" />
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-3">
          {game ? (
            first.gamePlayers.map((player, index) => {
              const row = byId.get(player.reservationId);
              return (
                <li key={player.reservationId}>
                  {row ? (
                    <BookingCard row={row} title={`Игрок ${index + 1}`} showVisit={false} onStatusAction={onStatusAction} onPricing={onPricing} />
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5 text-[13px]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">Игрок {index + 1}</p>
                      <p className="mt-0.5 text-base font-semibold text-white/90">{player.name}</p>
                      <p className="mt-1 text-fg-2">{player.detailsLabel || "—"}</p>
                      <p className="mt-2 text-xs text-fg-3">
                        {STATUS_LABELS[player.status] ?? player.status} · запись на другой странице списка — действия там.
                      </p>
                    </div>
                  )}
                </li>
              );
            })
          ) : (
            <li>
              <BookingCard row={first} showVisit onStatusAction={onStatusAction} onPricing={onPricing} />
            </li>
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
