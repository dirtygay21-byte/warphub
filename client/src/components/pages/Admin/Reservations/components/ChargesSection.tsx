/**
 * Позиции счёта (20.11.2026, решение владельца): какая услуга и аренда стола посчитаны системой и сколько стоят;
 * администратор может заменить услугу из списка (с поиском), поменять долю и вернуть автоматический расчёт.
 */
import {
  getChargeCatalog,
  resetAdminReservationCharges,
  setAdminReservationCharges,
  type ChargeCatalogItem,
  type ReservationPricing,
} from "@/apiUtils/pricing";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });

const SHARES: Array<{ value: number; label: string }> = [
  { value: 1, label: "Целиком" },
  { value: 0.5, label: "Половина (½)" },
  { value: 1 / 3, label: "Треть (⅓)" },
  { value: 0.25, label: "Четверть (¼)" },
  { value: 2, label: "×2" },
  { value: 3, label: "×3" },
];
const shareLabel = (share: number) => {
  const known = SHARES.find((s) => Math.abs(s.value - share) < 0.001);
  if (known) return share === 1 ? "" : known.value < 1 ? known.label.replace(/^.*\((.)\)$/, "$1") : known.label;
  return `×${Math.round(share * 100) / 100}`;
};
const closestShare = (share: number) => SHARES.reduce((best, s) => (Math.abs(s.value - share) < Math.abs(best - share) ? s.value : best), 1);

type Row = { key: number; catalogId: string; share: number };

const field = "min-h-11 rounded-xl border border-white/10 bg-field px-3 py-2 text-sm text-white outline-none focus:border-accent/60";

export function ChargesSection({
  reservationId,
  pricing,
  onUpdated,
}: {
  reservationId: string;
  pricing: ReservationPricing;
  onUpdated: (data: ReservationPricing) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const catalog = useQuery({ queryKey: ["admin-charge-catalog"], queryFn: getChargeCatalog, enabled: editing, staleTime: 60_000 });
  const charges = pricing.charges ?? [];

  const save = useMutation({
    meta: { success: "Позиции счёта сохранены" },
    mutationFn: () => setAdminReservationCharges(reservationId, rows.map(({ catalogId, share }) => ({ catalogId, share }))),
    onSuccess: (data) => {
      onUpdated(data);
      setEditing(false);
    },
  });
  const reset = useMutation({
    meta: { success: "Позиции посчитаны автоматически" },
    mutationFn: () => resetAdminReservationCharges(reservationId),
    onSuccess: onUpdated,
  });

  const items = catalog.data ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const startEdit = () => {
    // текущие позиции → строки редактора; позиция без пары в списке подставляется по услуге
    setRows(
      charges.map((c, i) => ({
        key: i,
        catalogId: c.kind === "table" ? "table" : `svc:${c.serviceId}${c.title.endsWith("свои краски") ? ":own" : c.title.endsWith("краски клуба") ? ":club" : ""}`,
        share: closestShare(c.share),
      })),
    );
    setFilter("");
    setEditing(true);
  };

  const visible = (row: Row) => {
    const q = filter.trim().toLowerCase();
    return items.filter((i) => i.id === row.catalogId || !q || i.title.toLowerCase().includes(q));
  };
  const amountOf = (row: Row) => (byId.get(row.catalogId)?.unitPrice ?? 0) * row.share;
  const total = rows.reduce((sum, r) => sum + amountOf(r), 0);
  const invalid = rows.length === 0 || rows.some((r) => !byId.has(r.catalogId));

  return (
    <section className="overflow-hidden rounded-xl border border-white/10" aria-label="Позиции счёта">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/3 px-4 py-3">
        <h3 className="text-sm font-semibold">
          Что в счёте{pricing.chargesEdited && <span className="ml-2 rounded-md bg-yellow-400/15 px-2 py-0.5 text-xs font-semibold text-yellow-200">изменено вручную</span>}
        </h3>
        {!editing && (
          <div className="flex gap-2">
            {(pricing.chargesEdited || charges.length === 0) && (
              <button
                type="button"
                onClick={() => reset.mutate()}
                disabled={reset.isPending}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-semibold text-fg-2 hover:text-white disabled:opacity-50"
              >
                <RotateCcw className="size-4" />
                {charges.length === 0 ? "Разбить на позиции" : "Как считает система"}
              </button>
            )}
            {charges.length > 0 && (
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white hover:border-accent/50"
              >
                <Pencil className="size-4" />
                Изменить
              </button>
            )}
          </div>
        )}
      </div>

      {!editing && charges.length === 0 && (
        <p className="px-4 py-3 text-xs leading-5 text-fg-2">
          Старый счёт — по тарифу услуги ({money.format(pricing.baseAmount)}). «Разбить на позиции» посчитает его по новому правилу: услуга + аренда стола.
        </p>
      )}
      {!editing && charges.length > 0 && (
        <ul className="divide-y divide-white/5">
          {charges.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-white">{c.title}</p>
                <p className="mt-0.5 text-xs text-fg-3">
                  {money.format(c.unitPrice)}
                  {shareLabel(c.share) && ` · ${shareLabel(c.share)}`}
                  {!c.auto && " · вручную"}
                </p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{money.format(c.amount)}</p>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="space-y-3 px-4 py-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-field px-3">
            <Search className="size-4 shrink-0 text-fg-3" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Найти услугу"
              aria-label="Найти услугу"
              className="min-h-11 w-full bg-transparent text-sm text-white outline-none"
            />
          </label>
          {catalog.isLoading && <p className="text-xs text-fg-3">Загружаем услуги…</p>}
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl bg-white/3 p-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
              <select
                aria-label="Услуга"
                value={row.catalogId}
                onChange={(e) => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, catalogId: e.target.value } : r)))}
                className={`${field} col-span-2 w-full sm:col-span-1`}
              >
                {!byId.has(row.catalogId) && <option value={row.catalogId}>Выберите услугу</option>}
                {visible(row).map((i: ChargeCatalogItem) => (
                  <option key={i.id} value={i.id}>
                    {i.title} — {money.format(i.unitPrice)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Доля"
                value={row.share}
                onChange={(e) => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, share: Number(e.target.value) } : r)))}
                className={field}
              >
                {SHARES.map((s) => (
                  <option key={s.label} value={s.value}>{s.label}</option>
                ))}
              </select>
              <div className="flex items-center justify-end gap-2">
                <span className="text-sm font-semibold tabular-nums">{money.format(amountOf(row))}</span>
                <button
                  type="button"
                  aria-label="Убрать позицию"
                  onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                  className="flex size-11 items-center justify-center rounded-xl text-fg-3 hover:text-red-300"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { key: Date.now(), catalogId: items[0]?.id ?? "table", share: 1 }])}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-white/15 px-3 text-xs font-semibold text-fg-2 hover:text-white"
          >
            <Plus className="size-4" />
            Добавить позицию
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <p className="text-sm text-fg-2">
              Итого по позициям: <b className="text-white">{money.format(total)}</b>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold text-fg-2">
                Отмена
              </button>
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={invalid || save.isPending}
                className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-40"
              >
                Сохранить
              </button>
            </div>
          </div>
          <p className="text-xs leading-5 text-fg-3">Цена — текущая цена услуги из «Цен». Скидки и оплаты считаются от новой суммы.</p>
        </div>
      )}
    </section>
  );
}
