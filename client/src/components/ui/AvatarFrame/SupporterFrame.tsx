import type { ReactNode } from "react";
import { SUPPORTER_DEFS, SUPPORTER_MARKUP, SUPPORTER_VIEWBOX } from "./supporters.generated";

export type SupporterTitle = "flame" | "crown" | "banner";

const AVATAR_R = 52;

/**
 * Видимая ширина рамки по горизонтали (единицы макета, центр аватара — 0): для размещения рядом с текстом.
 * Свечение за пределами почти прозрачное, поэтому место резервируется по видимой части, а не по всему svg.
 */
const VISIBLE_X: Record<SupporterTitle, [number, number]> = { flame: [-90, 90], crown: [-78, 78], banner: [-90, 175] };

const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/** SMIL-анимации (развевающееся знамя) CSS-правило не останавливает — при «уменьшить движение» убираем их. */
const still = (markup: string) => (reducedMotion() ? markup.replace(/<animate(Transform)?\b[^>]*\/>/g, "") : markup);

/**
 * Рамка «Поддержка клуба» (макет «Поддержка клуба», 30.10.2026): Пламя варпа, Корона клуба, Знамя.
 * Слой back рисуется под фото (знамя, буря), слой front — поверх края. Разметка — статичный SVG из макета.
 */
export default function SupporterFrame({
  title,
  size,
  children,
  label,
  inline = false,
}: {
  title: SupporterTitle;
  /** рядом с текстом (шапка профиля): резервировать место под рамку и по бокам, а не центрировать */
  inline?: boolean;
  /** диаметр аватара, px */
  size: number;
  children: ReactNode;
  label?: string;
}) {
  const [vx, vy, vw, vh] = SUPPORTER_VIEWBOX[title];
  const unit = size / (AVATAR_R * 2);
  const w = vw * unit;
  const h = vh * unit;
  // положение svg относительно аватара (центр аватара — точка 0,0 макета)
  const left = size / 2 + vx * unit;
  const top = size / 2 + vy * unit;
  const markup = SUPPORTER_MARKUP[title];
  const viewBox = `${vx} ${vy} ${vw} ${vh}`;
  const box = { width: w, height: h, left, top };
  return (
    <div
      className={inline ? "relative shrink-0" : "relative mx-auto"}
      style={{
        width: size,
        height: size,
        marginTop: -top,
        marginBottom: h + top - size,
        marginLeft: inline ? Math.round((-VISIBLE_X[title][0] - AVATAR_R) * unit) : "auto",
        marginRight: inline ? Math.round((VISIBLE_X[title][1] - AVATAR_R) * unit) : "auto",
      }}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <svg aria-hidden="true" className="pointer-events-none absolute" style={box} viewBox={viewBox}>
        <defs dangerouslySetInnerHTML={{ __html: SUPPORTER_DEFS }} />
        <g dangerouslySetInnerHTML={{ __html: still(markup.back) }} />
      </svg>
      <div className="relative size-full overflow-hidden rounded-full">{children}</div>
      <svg aria-hidden="true" className="pointer-events-none absolute" style={box} viewBox={viewBox}>
        <defs dangerouslySetInnerHTML={{ __html: SUPPORTER_DEFS }} />
        <g dangerouslySetInnerHTML={{ __html: still(markup.front) }} />
      </svg>
    </div>
  );
}
