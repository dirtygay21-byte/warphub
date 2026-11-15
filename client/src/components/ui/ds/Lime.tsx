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

/**
 * Червяки на цветном блоке (15.11.2026, по замечанию «червяка не видно»): поле 360×200, прижатое к правому верхнему углу
 * и растянутое на весь блок (slice) — первый червяк спускается вдоль правого края, второй (count=2, высокие блоки)
 * пересекает нижний правый угол. Текст блока держит отступ справа.
 */
export function WormField({ count = 1 }: { count?: 1 | 2 }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 360 200" preserveAspectRatio="xMaxYMin slice" className="pointer-events-none absolute inset-0 size-full">
      <Worm x={286} y={0} angle={62} period={150} amp={13} width={12} seconds={10} />
      {count === 2 && <Worm x={360} y={118} angle={152} period={110} amp={10} width={9} seconds={8} />}
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
    <section className={clsx("relative isolate overflow-hidden rounded-[20px] p-4 text-[#111110]", TONE_BG[tone], className)}>
      <WormField count={size === "lg" ? 2 : 1} />
      <div className="relative flex flex-col gap-1 pr-16">
        {kicker && <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#111110]/70">{kicker}</span>}
        <h2 className={clsx("font-display font-semibold uppercase leading-[1.05]", size === "lg" ? "text-[24px]" : "text-[20px]")}>{title}</h2>
      </div>
      {children && <div className="relative mt-2.5 flex flex-col gap-2.5 text-[14px] leading-snug [&>p]:pr-14">{children}</div>}
    </section>
  );
}

/** Чёрная плашка на цветном блоке (стол, время, соперник). */
export function LimeChip({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex min-h-7 items-center whitespace-nowrap rounded-[9px] bg-[#111110] px-2.5 text-[12.5px] font-semibold",
        accent ? "text-accent" : "text-fg",
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
        <Worm x={55} y={12} angle={40} period={90} amp={9} width={10} seconds={8} />
      </g>
    </svg>
  );
}
