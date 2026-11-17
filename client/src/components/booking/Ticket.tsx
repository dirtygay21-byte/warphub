/**
 * Билет — основной элемент записи (17.11.2026, макет «WarpHub Booking Redesign», доска «Элементы, размеры, код»):
 * основа (картинка, подпись, текст) + линия отрыва (пунктир и два выреза цвета фона) + корешок справа (время, часы, люди).
 * Тон: normal — обычный, busy — занято (штриховка), final — итоговый лаймовый билет (шаг «Ты записан!»).
 * Цвета — по правилам «Цвета и роли» (docs/design-code.md §8): лайм — только итоговый билет, янтарь и красный — только метки.
 */
import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import { haptic } from "@/utils/haptic";

export type TicketTone = "normal" | "busy" | "final";

const HATCH: CSSProperties = { background: "repeating-linear-gradient(135deg, #1D1D1B 0 8px, #181817 8px 16px)" };

export function Ticket({
  children,
  stub,
  stubWidth = 104,
  tone = "normal",
  image,
  imageHeight = 104,
  onClick,
  disabled = false,
  ariaLabel,
  className,
  stubClassName,
  mainOverlay,
}: {
  children: ReactNode;
  stub: ReactNode;
  stubWidth?: number;
  tone?: TicketTone;
  /** картинка услуги сверху основной части */
  image?: string | null;
  imageHeight?: number;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** классы корешка (анимация отрыва на шаге «Ты записан!») */
  stubClassName?: string;
  /** слой поверх основной части (штамп) */
  mainOverlay?: ReactNode;
}) {
  const final = tone === "final";
  const busy = tone === "busy";
  const part = final ? "bg-accent text-[#111110]" : busy ? "text-fg-3" : "bg-app-elevated text-fg";
  const inner = (
    <>
      <span className={clsx("relative block min-w-0 flex-1 overflow-hidden rounded-l-[20px]", part)} style={busy ? HATCH : undefined}>
        {image && <img src={image} alt="" className="block w-full object-cover" style={{ height: imageHeight }} draggable={false} />}
        <span className="block px-4 py-3.5">{children}</span>
        {mainOverlay}
      </span>
      <span
        className={clsx(
          "flex shrink-0 flex-col items-center justify-center rounded-r-[20px] border-l-2 border-dashed px-1.5 py-3 text-center",
          final ? "border-[#111110]" : busy ? "border-white/10" : "border-white/15",
          part,
          stubClassName,
        )}
        style={{ width: stubWidth, ...(busy ? HATCH : null) }}
      >
        {stub}
      </span>
      {/* вырезы на линии отрыва — цвет фона экрана */}
      <span aria-hidden="true" className="pointer-events-none absolute -top-2 size-4 rounded-full bg-app-bg" style={{ right: stubWidth - 8 }} />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-2 size-4 rounded-full bg-app-bg" style={{ right: stubWidth - 8 }} />
    </>
  );
  if (!onClick) return <div className={clsx("relative flex w-full", className)}>{inner}</div>;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
      className={clsx("relative flex w-full text-left", disabled ? "cursor-not-allowed opacity-60" : "ds-press fx-press", className)}
    >
      {inner}
    </button>
  );
}

/** Подпись основной части: 11 px капсом (стол · тип, услуга). */
export function TicketKicker({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("block text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg-3", className)}>{children}</span>;
}

/** Метка на билете: обычная (поле), «с условием» (янтарь) или WarpHub-лайм. */
export function TicketTag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <span className={clsx("inline-flex items-center rounded-[9px] px-2 py-1 text-[12px] font-bold", tone === "warn" ? "bg-warn/15 text-warn" : "bg-field text-fg-2")}>
      {children}
    </span>
  );
}

/** Большое время в корешке + подпись. */
export function StubTime({ time, note }: { time: string; note?: ReactNode }) {
  return (
    <>
      <span className="block font-display text-[26px] font-bold leading-none tabular-nums">{time}</span>
      {note && <span className="mt-1 block text-[12px] opacity-70">{note}</span>}
    </>
  );
}
