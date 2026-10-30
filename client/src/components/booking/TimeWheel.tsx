import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef } from "react";

const ITEM = 44; // высота строки, px
const VISIBLE = 5; // строк видно; выбранная — по центру

/**
 * Вертикальный барабан выбора времени (B2): список прокручивается вверх-вниз и останавливается на ближайшем
 * значении, выбранное — по центру крупно. Кнопки ▲▼ — на шаг. short(option) — время короче полной длительности
 * (B1): такие строки красные. Выбор сообщается через onChange; значение задаёт родитель (value).
 */
export function TimeWheel({
  options,
  value,
  onChange,
  format,
  hint,
  short,
}: {
  options: string[];
  value: string | null;
  onChange: (option: string) => void;
  format: (option: string) => string;
  /** вторая строка у значения: «до 15:00» */
  hint?: (option: string) => string | null;
  short?: (option: string) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const index = Math.max(0, value ? options.indexOf(value) : 0);

  // прокрутить к выбранному (при открытии и когда значение меняют кнопками)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = index * ITEM;
    if (Math.abs(el.scrollTop - top) > 2) el.scrollTo({ top, behavior: "smooth" });
  }, [index, options.length]);

  // после остановки прокрутки — выбрать строку по центру
  const onScroll = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
      const next = options[i];
      if (next && next !== value) onChange(next);
    }, 90);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const step = (d: number) => {
    const next = options[Math.min(options.length - 1, Math.max(0, index + d))];
    if (next && next !== value) onChange(next);
  };

  if (!options.length) return null;
  const pad = ((VISIBLE - 1) / 2) * ITEM;

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/20" style={{ height: VISIBLE * ITEM }}>
        {/* рамка выбранной строки */}
        <div
          className={clsx(
            "pointer-events-none absolute inset-x-2 rounded-lg border",
            value && short?.(value) ? "border-red-400/70 bg-red-400/10" : "border-accent/60 bg-accent/10",
          )}
          style={{ top: pad, height: ITEM }}
        />
        <div
          ref={ref}
          onScroll={onScroll}
          role="listbox"
          aria-label="Время начала"
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ paddingTop: pad, paddingBottom: pad }}
        >
          {options.map((option, i) => {
            const selected = i === index;
            const isShort = short?.(option) ?? false;
            const sub = hint?.(option);
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onChange(option)}
                className={clsx(
                  "flex w-full snap-center flex-col items-center justify-center leading-tight transition-all",
                  selected ? "text-xl font-semibold" : "text-base opacity-50",
                  isShort ? "text-red-300" : "text-white",
                )}
                style={{ height: ITEM }}
              >
                {format(option)}
                {selected && sub && <span className="text-[12px] font-medium opacity-90">{sub}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-label="Раньше"
          disabled={index <= 0}
          onClick={() => step(-1)}
          className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white active:bg-white/10 disabled:opacity-30"
        >
          <ChevronUp className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Позже"
          disabled={index >= options.length - 1}
          onClick={() => step(1)}
          className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white active:bg-white/10 disabled:opacity-30"
        >
          <ChevronDown className="size-5" />
        </button>
      </div>
    </div>
  );
}
