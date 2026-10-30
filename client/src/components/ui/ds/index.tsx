/**
 * Дизайн-система WarpHub (D2, 30.10.2026) — общие элементы клуба, по концепту «WarpHub Redesign Concept»:
 * тёмный фон, лаймовый акцент, текст fg / fg-2 / fg-3 (не бледнее), касание от 44 px, одно главное действие на экран,
 * короткие анимации (ds-press, ds-enter, ds-sheet, ds-shimmer — отключаются при «уменьшить движение»).
 * Только отображение: данные и логика остаются в разделах.
 */
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { haptic } from "@/utils/haptic";

/** Заголовок раздела внутри экрана: мелкие заглавные, цвет подписей. */
export function SectionLabel({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-2.5 flex items-center justify-between gap-2", className)}>
      <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-fg-3">{children}</h2>
      {right}
    </div>
  );
}

/** Крупный заголовок экрана (Oswald). */
export function ScreenTitle({ children, kicker, className }: { children: ReactNode; kicker?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      {kicker && <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">{kicker}</span>}
      <h1 className="font-display text-[28px] font-semibold uppercase leading-none text-fg">{children}</h1>
    </div>
  );
}

type Tone = "plain" | "accent" | "accent-outline";

const TONE: Record<Tone, string> = {
  plain: "border border-white/10 bg-app-elevated",
  accent: "border border-accent/35 bg-accent/[0.08]",
  "accent-outline": "border-[1.5px] border-accent/70 bg-accent/[0.08]",
};

/**
 * Строка-переход: иконка в плашке, название, подпись, стрелка. Для разделов профиля, услуг, ссылок.
 * iconTone: "solid" — лаймовая плашка (главный раздел), "soft" — прозрачная лаймовая, "neutral" — серая.
 */
export function NavRow({
  icon,
  title,
  subtitle,
  onClick,
  tone = "plain",
  iconTone = "soft",
  bareIcon,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  onClick: () => void;
  tone?: Tone;
  iconTone?: "solid" | "soft" | "neutral";
  /** иконка без плашки (как у «Мини-игр») */
  bareIcon?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => (haptic.tap(), onClick())}
      className={clsx("ds-press flex min-h-[64px] w-full items-center gap-3.5 rounded-[18px] px-4 py-3 text-left text-fg", TONE[tone], className)}
    >
      {icon &&
        (bareIcon ? (
          <span className="shrink-0 text-accent">{icon}</span>
        ) : (
          <span
            className={clsx(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              iconTone === "solid" && "bg-accent text-accent-foreground",
              iconTone === "soft" && "bg-accent/15 text-accent",
              iconTone === "neutral" && "bg-white/[0.08] text-fg",
            )}
          >
            {icon}
          </span>
        ))}
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-bold leading-tight">{title}</span>
        {subtitle && <span className="mt-0.5 block text-sm leading-snug text-fg-2">{subtitle}</span>}
      </span>
      <ChevronRight className={clsx("size-5 shrink-0", tone === "plain" ? "text-fg-3" : "text-accent")} />
    </button>
  );
}

/** Группа строк в одной карточке с разделителями (список «Информация» профиля и т. п.). */
export function GroupCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("divide-y divide-white/[0.06] overflow-hidden rounded-[18px] border border-white/10 bg-app-elevated", className)}>{children}</div>;
}

/** Метка-статус: короткий текст, никогда не переносится. */
export function Badge({ children, tone = "muted", className }: { children: ReactNode; tone?: "muted" | "accent" | "warn" | "danger"; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-lg px-2 text-xs font-semibold",
        tone === "muted" && "bg-white/[0.08] text-fg-2",
        tone === "accent" && "bg-accent/15 text-accent",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "danger" && "bg-danger/15 text-danger",
        className,
      )}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

/** Кнопка: primary — одна на экран (лаймовая), secondary — обводка, danger — отмена/удаление. Высота от 44 px. */
export function DsButton({
  variant = "secondary",
  size = "md",
  className,
  onClick,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      {...rest}
      onClick={(e) => {
        haptic.tap();
        onClick?.(e);
      }}
      className={clsx(
        "ds-press inline-flex items-center justify-center gap-2 rounded-[14px] font-semibold disabled:opacity-50",
        size === "lg" ? "h-[54px] px-5 text-[17px]" : "h-11 px-4 text-[15px]",
        variant === "primary" && "bg-accent text-accent-foreground",
        variant === "secondary" && "border border-white/[0.16] bg-app-elevated text-fg",
        variant === "danger" && "border border-danger/40 bg-transparent text-danger",
        variant === "ghost" && "bg-transparent text-fg-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Переключатель из 2–3 вариантов (вкладки внутри экрана). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx("grid gap-1 rounded-[14px] bg-app-elevated p-1", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => (haptic.select(), onChange(o.value))}
          className={clsx(
            "ds-press h-10 rounded-[10px] text-[15px] font-semibold",
            o.value === value ? "bg-accent text-accent-foreground" : "bg-transparent text-fg-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Заготовка загрузки с бегущим бликом. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx("ds-shimmer rounded-lg", className)} />;
}

/** Переключатель вкл/выкл с подписью — строка целиком нажимается. */
export function ToggleRow({ title, subtitle, checked, onChange }: { title: ReactNode; subtitle?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => (haptic.select(), onChange(!checked))}
      className="ds-press flex w-full items-center gap-3 rounded-[14px] border border-white/10 bg-app-elevated px-4 py-3.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-fg">{title}</span>
        {subtitle && <span className="mt-0.5 block text-sm text-fg-2">{subtitle}</span>}
      </span>
      <span className={clsx("flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200", checked ? "justify-end bg-accent" : "justify-start bg-white/[0.14]")}>
        <span className={clsx("size-6 rounded-full", checked ? "bg-accent-foreground" : "bg-fg")} />
      </span>
    </button>
  );
}

/** Горизонтальная лента с прилипанием (дни, время): листается пальцем, учитывает отступы страницы. */
export function SnapRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1.5", className)}>{children}</div>
  );
}

/** Полоса шагов: «Шаг 2 из 3». */
export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-label={`Шаг ${step} из ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="h-1 overflow-hidden rounded bg-white/[0.12]">
          <div className={clsx("h-full rounded bg-accent transition-[width] duration-300 ease-out-soft", i < step ? "w-full" : "w-0")} />
        </div>
      ))}
    </div>
  );
}
