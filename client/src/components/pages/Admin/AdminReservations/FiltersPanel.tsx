import { LIMIT_OPTIONS, STATUS_OPTIONS } from "./constants";
import FilterSelect from "./FilterSelect";
import type { Filters } from "./types";
import { getServiceOptions } from "./utils";

export default function FiltersPanel({
  filters,
  hasFilters,
  limit,
  onFilterChange,
  onLimitChange,
  onReset,
}: {
  filters: Filters;
  hasFilters: boolean;
  limit: number;
  onFilterChange: (key: keyof Filters, value: string) => void;
  onLimitChange: (limit: number) => void;
  onReset: () => void;
}) {
  const today = getTodayDateInputValue();

  return (
    <section className="rounded-2xl border border-white/10 bg-app-elevated p-3">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <div className="flex flex-col gap-1">
          <FilterInput
            label="Дата"
            type="date"
            value={filters.date}
            onChange={(value) => onFilterChange("date", value)}
          />
          <button
            type="button"
            onClick={() => onFilterChange("date", today)}
            className="self-start rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-fg-2 transition-colors hover:text-white"
          >
            Сегодня
          </button>
        </div>
        <FilterSelect
          label="Статус"
          value={filters.status}
          onChange={(value) => onFilterChange("status", value)}
          options={STATUS_OPTIONS}
        />
        <FilterSelect
          label="Услуга"
          value={filters.serviceId}
          onChange={(value) => onFilterChange("serviceId", value)}
          options={getServiceOptions()}
        />
        <FilterInput
          label="Номер стола"
          type="number"
          value={filters.tableId}
          onChange={(value) => onFilterChange("tableId", value)}
          placeholder="например, 2"
        />
        <FilterInput
          label="@Telegram ID"
          type="number"
          value={filters.telegramId}
          onChange={(value) => onFilterChange("telegramId", value)}
          placeholder="telegramId"
        />
        <FilterInput
          label="Начало от"
          type="datetime-local"
          value={filters.startsAt}
          onChange={(value) => onFilterChange("startsAt", value)}
        />
        <FilterInput
          label="Начало до"
          type="datetime-local"
          value={filters.endsAt}
          onChange={(value) => onFilterChange("endsAt", value)}
        />
        <FilterSelect
          label="На странице"
          value={limit}
          onChange={(value) => onLimitChange(Number(value))}
          options={LIMIT_OPTIONS.map((option) => ({
            value: String(option),
            label: String(option),
          }))}
        />
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-fg-2 transition-colors hover:text-white"
        >
          Сбросить
        </button>
      )}
    </section>
  );
}

const getTodayDateInputValue = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

function FilterInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-fg-3">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-white/10 bg-overlay/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-fg-3 [color-scheme:dark] focus:border-accent/60"
      />
    </label>
  );
}

