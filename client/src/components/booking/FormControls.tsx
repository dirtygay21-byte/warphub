import clsx from "clsx";
import type { ReactNode } from "react";
import { haptic } from "@/utils/haptic";

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-accent">
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
      {hint && <p className="mt-1.5 text-[13px] text-fg-3">{hint}</p>}
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
            onClick={() => {
              haptic.select();
              onChange(option.value);
            }}
            className={clsx(
              "ds-press min-h-12 rounded-xl border px-3 py-2 text-left text-[15px] font-semibold transition-colors duration-200 disabled:opacity-50",
              selected
                ? "border-accent bg-accent text-accent-foreground"
                : "border-white/[0.14] bg-app-elevated text-fg",
            )}
          >
            <span className="block leading-tight">{option.label}</span>
            {option.hint && (
              <span
                className={clsx(
                  "mt-0.5 block text-[12px] font-medium leading-tight",
                  selected ? "text-accent-foreground/70" : "text-fg-3",
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
            onClick={() => {
              haptic.select();
              onChange(
                selected
                  ? values.filter((value) => value !== option.value)
                  : [...values, option.value],
              );
            }}
            className={clsx(
              "ds-press min-h-12 rounded-xl border px-4 py-2 text-[15px] font-semibold transition-colors duration-200",
              selected
                ? "border-accent bg-accent text-accent-foreground"
                : "border-white/[0.14] bg-app-elevated text-fg",
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
  "min-h-12 w-full rounded-xl border border-white/[0.14] bg-field px-3.5 py-3 text-base text-fg outline-none placeholder:text-fg-3 focus:border-accent";

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
          onClick={() => {
            haptic.select();
            onChange(n);
          }}
          className={clsx(
            "ds-press ds-hit size-11 rounded-xl border text-base font-semibold tabular-nums transition-colors duration-200",
            value === n
              ? "border-accent bg-accent text-accent-foreground"
              : "border-white/[0.14] bg-app-elevated text-fg",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
