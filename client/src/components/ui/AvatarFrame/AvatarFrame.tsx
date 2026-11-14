import type { ProgressCategory } from "@/apiUtils/progress";
import type { ReactNode } from "react";
import { FRAME_DEFS, FRAME_MARKUP } from "./frames.generated";

/** Насколько рамка выходит за аватар (в единицах viewBox; аватар — радиус 52) по рангам 0–3 */
const EXTENT = [62, 72, 92, 112];
const AVATAR_R = 52;
const BOX = 220;

/**
 * Рамка аватара по категории и рангу (макет «Рамки аватара», 30.10.2026). Разметка — статичный SVG из макета
 * (frames.generated.ts), без данных пользователя. Рамка рисуется поверх краёв аватара и не ловит касания;
 * место вокруг аватара резервируется по размеру рамки, чтобы она не наезжала на текст.
 */
export default function AvatarFrame({
  category,
  tier,
  size,
  children,
  label,
  inline = false,
}: {
  category: ProgressCategory;
  /** рядом с текстом (шапка профиля): место под рамку и по бокам, без центрирования */
  inline?: boolean;
  tier: number;
  /** диаметр аватара, px */
  size: number;
  children: ReactNode;
  /** подпись для чтения с экрана: «Warhammer · Ветеран» */
  label?: string;
}) {
  const t = Math.max(0, Math.min(3, tier));
  const unit = size / (AVATAR_R * 2);
  const box = BOX * unit;
  const margin = Math.round((EXTENT[t]! - AVATAR_R) * unit);
  return (
    <div className={inline ? "relative shrink-0" : "relative mx-auto"} style={{ width: size, height: size, margin: inline ? `${margin}px` : `${margin}px auto` }} role={label ? "img" : undefined} aria-label={label}>
      <div className="size-full overflow-hidden rounded-full">{children}</div>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{ width: box, height: box, left: (size - box) / 2, top: (size - box) / 2 }}
        viewBox="-110 -110 220 220"
      >
        <defs dangerouslySetInnerHTML={{ __html: FRAME_DEFS }} />
        <g dangerouslySetInnerHTML={{ __html: FRAME_MARKUP[category][t] }} />
      </svg>
    </div>
  );
}
