import clsx from "clsx";
import type { ReactNode } from "react";

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint && <p className="mt-1.5 text-xs text-white/45">{hint}</p>}
    </div>
  );
}

const GRID_COLUMNS = {
  2: "grid grid-cols-2",
  3: "grid grid-cols-3",
  4: "grid grid-cols-4",
} as const;

type ChipOption<T extends string | number> = {
  value: T;
  label: string;
  hint?: string;
};

/** Выбор одного варианта кнопками */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  columns,
}: {
  options: ChipOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  disabled?: boolean;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className={clsx("gap-2", columns ? GRID_COLUMNS[columns] : "flex flex-wrap")}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={clsx(
              "min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors disabled:opacity-50",
              selected
                ? "border-accent bg-accent text-accent-foreground"
                : "border-white/10 bg-white/5 text-white active:bg-white/10",
            )}
          >
            <span className="block leading-tight">{option.label}</span>
            {option.hint && (
              <span
                className={clsx(
                  "mt-0.5 block text-[11px] font-medium leading-tight",
                  selected ? "text-accent-foreground/70" : "text-white/45",
                )}
              >
                {option.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Выбор нескольких вариантов кнопками */
export function MultiChoiceChips({
  options,
  values,
  onChange,
}: {
  options: ChipOption<string>[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              onChange(
                selected
                  ? values.filter((value) => value !== option.value)
                  : [...values, option.value],
              )
            }
            className={clsx(
              "min-h-10 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
              selected
                ? "border-accent bg-accent text-accent-foreground"
                : "border-white/10 bg-white/5 text-white active:bg-white/10",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function YesNoChips({
  value,
  onChange,
  yesLabel = "Да",
  noLabel = "Нет",
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <ChoiceChips<string>
      columns={2}
      options={[
        { value: "yes", label: yesLabel },
        { value: "no", label: noLabel },
      ]}
      value={value === null ? null : value ? "yes" : "no"}
      onChange={(next) => onChange(next === "yes")}
    />
  );
}

export const inputClassName =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent";

export function NumberChips({
  max,
  min = 1,
  value,
  onChange,
}: {
  max: number;
  min?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const count = Math.max(0, max - min + 1);
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, index) => index + min).map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={clsx(
            "size-10 rounded-lg border text-sm font-semibold transition-colors",
            value === n
              ? "border-accent bg-accent text-accent-foreground"
              : "border-white/10 bg-white/5 text-white active:bg-white/10",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
