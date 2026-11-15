/**
 * Лаймовый слой дизайна (концепт 15.11.2026, по мерчу WarpHub): дополняет дизайн-систему, не заменяет её.
 *  - LimeHero — один цветной блок на экран (лайм — главное действие или «всё хорошо», жёлтый — ждёт, красный — отмена,
 *    серый — прошло); чёрный текст, заголовок Oswald, «червяки» в углу.
 *  - LimeCorner — лаймовый уголок с червяком для уже существующих карточек (шапка профиля, ивент и т. п.).
 *  - Worm — волна, которая бесконечно уезжает вперёд (.lime-flow); стоит при «уменьшить движение» и выключенных эффектах.
 * Червяки — только на цветных блоках, всегда чёрные.
 */
import clsx from "clsx";
import { useId, type ReactNode } from "react";

export type LimeTone = "lime" | "warn" | "danger" | "neutral";

const TONE_BG: Record<LimeTone, string> = {
  lime: "bg-accent",
  warn: "bg-warn",
  danger: "bg-danger",
  neutral: "bg-[#B8B8B0]",
};

/** Путь волны: период `period`, размах `amp`, от −count до +count периодов (запас под сдвиг). */
function wavePath(period: number, amp: number, count: number) {
  const h = period / 2;
  const c = amp * 1.33;
  let d = `M${-count * period} 0`;
  for (let x = -count * period; x < count * period; x += period) {
    d += ` C${x + h * 0.35} ${-c} ${x + h * 0.65} ${-c} ${x + h} 0`;
    d += ` C${x + h * 1.35} ${c} ${x + h * 1.65} ${c} ${x + period} 0`;
  }
  return d;
}

/** Один червяк: волна в точке (x, y), повёрнутая на `angle`; ползёт вперёд на один период за `seconds`. */
export function Worm({
  x,
  y,
  angle,
  period = 160,
  amp = 17,
  width = 22,
  seconds = 6,
}: {
  x: number;
  y: number;
  angle: number;
  period?: number;
  amp?: number;
  width?: number;
  seconds?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <g className="lime-flow" style={{ ["--lime-shift" as string]: `${period}px`, animationDuration: `${seconds}s` }}>
        <path d={wavePath(period, amp, 6)} fill="none" stroke="#111110" strokeWidth={width} strokeLinecap="round" />
      </g>
    </g>
  );
}

/** Червяки в правом верхнем углу цветного блока. */
function CornerWorms({ size }: { size: "lg" | "sm" }) {
  const box = size === "lg" ? 170 : 120;
  return (
    <svg aria-hidden="true" width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="pointer-events-none absolute right-0 top-0">
      {size === "lg" ? (
        <>
          <Worm x={150} y={6} angle={48} period={170} amp={19} width={24} seconds={7} />
          <Worm x={176} y={92} angle={48} period={120} amp={13} width={16} seconds={5} />
        </>
      ) : (
        <Worm x={112} y={4} angle={52} period={130} amp={14} width={18} seconds={6} />
      )}
    </svg>
  );
}

/**
 * Главный цветной блок экрана. kicker — мелкая строка над заголовком, title — крупный Oswald, children — подписи и действие.
 */
export function LimeHero({
  tone = "lime",
  kicker,
  title,
  children,
  size = "lg",
  className,
}: {
  tone?: LimeTone;
  kicker?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  size?: "lg" | "sm";
  className?: string;
}) {
  return (
    <section className={clsx("relative isolate overflow-hidden rounded-[22px] text-[#111110]", TONE_BG[tone], size === "lg" ? "p-5" : "p-4", className)}>
      <CornerWorms size={size} />
      <div className="relative flex flex-col gap-1.5 pr-14">
        {kicker && <span className="font-display text-[13px] font-semibold uppercase tracking-[0.12em]">{kicker}</span>}
        <h2 className={clsx("font-display font-bold uppercase leading-[0.98]", size === "lg" ? "text-[32px]" : "text-[24px]")}>{title}</h2>
      </div>
      {children && <div className="relative mt-3 flex flex-col gap-3">{children}</div>}
    </section>
  );
}

/** Чёрная плашка на цветном блоке (стол, время, соперник). */
export function LimeChip({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex min-h-[30px] items-center whitespace-nowrap rounded-[10px] bg-[#111110] px-2.5 text-[13px] font-semibold",
        accent ? "font-display uppercase tracking-[0.04em] text-accent" : "text-fg",
      )}
    >
      {children}
    </span>
  );
}

/** Лаймовый уголок с червяком поверх существующей карточки (карточка — relative overflow-hidden). */
export function LimeCorner({ size = 84, className }: { size?: number; className?: string }) {
  const clip = `lime-corner-${useId().replace(/:/g, "")}`;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 100 100" className={clsx("pointer-events-none absolute right-0 top-0", className)}>
      <defs>
        <clipPath id={clip}>
          <path d="M100 0 V100 A100 100 0 0 1 0 0 Z" />
        </clipPath>
      </defs>
      <path d="M100 0 V100 A100 100 0 0 1 0 0 Z" fill="rgb(var(--color-accent))" />
      <g clipPath={`url(#${clip})`}>
        <Worm x={96} y={8} angle={45} period={90} amp={10} width={13} seconds={5} />
      </g>
    </svg>
  );
}
