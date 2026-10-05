import { ChevronDown } from "lucide-react";

export default function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  value: string | number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-white/50">
      {label}
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-xl border border-white/10 bg-overlay/30 py-2.5 pl-3 pr-11 text-sm text-white outline-none [color-scheme:dark] focus:border-accent/60"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-white/40" />
      </span>
    </label>
  );
}
