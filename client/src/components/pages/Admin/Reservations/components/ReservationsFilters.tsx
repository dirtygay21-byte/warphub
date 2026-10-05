import { STATUS_FILTER_OPTIONS } from "../constants";
import type { AdminFiltersForm } from "../types";

type ReservationsFiltersProps = {
  values: AdminFiltersForm;
  services: { id: number; title: string }[];
  onChange: (patch: Partial<AdminFiltersForm>) => void;
  onApply: () => void;
  onReset: () => void;
  hasActiveFilters: boolean;
};

export function ReservationsFilters({
  values,
  services,
  onChange,
  onApply,
  onReset,
  hasActiveFilters,
}: ReservationsFiltersProps) {
  const inputClassName =
    "w-full rounded-xl border border-white/10 bg-app-elevated px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-accent/40";

  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-app-elevated p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="text-white/50">Дата</span>
          <input
            type="date"
            value={values.date}
            onChange={(event) => onChange({ date: event.target.value })}
            className={inputClassName}
          />
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-white/50">Услуга</span>
          <select
            value={values.serviceId}
            onChange={(event) => onChange({ serviceId: event.target.value })}
            className={inputClassName}
          >
            <option value="">Все услуги</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-white/50">Стол (ID)</span>
          <input
            type="number"
            min={1}
            value={values.tableId}
            onChange={(event) => onChange({ tableId: event.target.value })}
            placeholder="Например, 3"
            className={inputClassName}
          />
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-white/50">Статус</span>
          <select
            value={values.status}
            onChange={(event) => onChange({ status: event.target.value })}
            className={inputClassName}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm sm:col-span-2 lg:col-span-1">
          <span className="text-white/50">ID пользователя</span>
          <input
            type="text"
            value={values.userId}
            onChange={(event) => onChange({ userId: event.target.value })}
            placeholder="UUID пользователя"
            className={inputClassName}
          />
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-white/50">Начало от</span>
          <input
            type="datetime-local"
            value={values.startsAt}
            onChange={(event) => onChange({ startsAt: event.target.value })}
            className={inputClassName}
          />
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-white/50">Окончание до</span>
          <input
            type="datetime-local"
            value={values.endsAt}
            onChange={(event) => onChange({ endsAt: event.target.value })}
            className={inputClassName}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onApply}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
        >
          Применить
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl border border-white/10 bg-white/3 px-4 py-2.5 text-sm font-semibold text-white transition-colors active:bg-white/10"
          >
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}
