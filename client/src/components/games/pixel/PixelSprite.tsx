import { useEffect, useRef } from "react";
import { drawSprite, type Sprite } from "./pixel";

/** Спрайт как чёткая пиксельная картинка */
export function PixelSprite({
  sprite,
  scale = 4,
  flip = false,
  className,
  title,
}: {
  sprite: Sprite;
  scale?: number;
  flip?: boolean;
  className?: string;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSprite(ctx, sprite, 0, 0, { scale: Math.ceil(scale), flip });
  }, [sprite, scale, flip]);

  return (
    <canvas
      ref={ref}
      width={sprite.w * Math.ceil(scale)}
      height={sprite.h * Math.ceil(scale)}
      className={className}
      style={{ imageRendering: "pixelated", width: sprite.w * scale, height: sprite.h * scale }}
      role="img"
      aria-label={title}
    />
  );
}
