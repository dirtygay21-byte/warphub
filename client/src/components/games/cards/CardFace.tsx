import type { CardDef, CardRarity } from "@/apiUtils/minigames";
import { s3Url } from "@/utils/s3utils";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import { oswald } from "../helpers";
import { drawGameImage, gameImage } from "../pixel/assets";
import { RARITY_STYLE } from "./rarity";

// ---------------------------------------------------------------------------
// Иллюстрация в исходном разрешении с контрастным нейтральным фоном
// ---------------------------------------------------------------------------

/** Канвас втрое плотнее спрайта (96×88 → 288×264): пиксели рисунка те же, а контур, тень и фон — тоньше. */
const K = 3;
const ART_W = 96 * K;
const ART_H = 88 * K;

function imageLuminance(image: HTMLImageElement) {
  const sample = document.createElement("canvas");
  sample.width = 32;
  sample.height = 32;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 255;
  ctx.drawImage(image, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;
  let total = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 40) continue;
    total += ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
    count += 1;
  }
  return count ? total / count : 255;
}

/** Силуэт спрайта одним цветом — для контура вокруг фигуры. */
function silhouette(image: HTMLImageElement, color: string) {
  const c = document.createElement("canvas");
  c.width = image.naturalWidth;
  c.height = image.naturalHeight;
  const x = c.getContext("2d");
  if (!x) return null;
  x.imageSmoothingEnabled = false;
  x.drawImage(image, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Иллюстрация карты (13.11.2026): рисунок владельца без изменений, читаемость — за счёт подачи.
 * Фон — мягкий свет цвета редкости (светлый для тёмных спрайтов), под фигурой — тень, вокруг — контрастный контур.
 */
export function CardArt({ card, className, locked }: { card: CardDef; className?: string; locked?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const src = `/games/aos/${card.id}.png`;
    const image = gameImage(src);
    const tone = RARITY_STYLE[card.rarity].color;
    const render = () => {
      if (!image.complete || image.naturalWidth === 0) return;
      const darkSprite = imageLuminance(image) < 105;
      ctx.clearRect(0, 0, ART_W, ART_H);
      ctx.fillStyle = darkSprite ? "#b9b2a2" : "#12140e";
      ctx.fillRect(0, 0, ART_W, ART_H);
      // свет за фигурой
      const glow = ctx.createRadialGradient(ART_W / 2, ART_H * 0.52, 8, ART_W / 2, ART_H * 0.52, ART_W * 0.62);
      glow.addColorStop(0, darkSprite ? "rgba(255,255,255,0.75)" : `${tone}55`);
      glow.addColorStop(0.55, darkSprite ? "rgba(255,255,255,0.18)" : `${tone}18`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, ART_W, ART_H);
      // затемнение по краям
      const edge = ctx.createRadialGradient(ART_W / 2, ART_H / 2, ART_H * 0.45, ART_W / 2, ART_H / 2, ART_W * 0.78);
      edge.addColorStop(0, "rgba(0,0,0,0)");
      edge.addColorStop(1, darkSprite ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.55)");
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, ART_W, ART_H);
      // на светлом фоне редкость видна и в самой иллюстрации — цветная кайма по краям
      if (darkSprite) {
        const rim = ctx.createRadialGradient(ART_W / 2, ART_H / 2, ART_H * 0.42, ART_W / 2, ART_H / 2, ART_W * 0.74);
        rim.addColorStop(0, `${tone}00`);
        rim.addColorStop(1, `${tone}8c`);
        ctx.fillStyle = rim;
        ctx.fillRect(0, 0, ART_W, ART_H);
      }

      const scale = Math.min((ART_W - 6 * K) / image.naturalWidth, (ART_H - 8 * K) / image.naturalHeight);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const x = Math.round((ART_W - width) / 2);
      const y = ART_H - 3 * K - height;
      // тень на земле
      ctx.fillStyle = darkSprite ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.ellipse(ART_W / 2, ART_H - 4 * K, width * 0.36, 3 * K, 0, 0, Math.PI * 2);
      ctx.fill();
      // контур: силуэт, сдвинутый на 2 px канваса в восемь сторон
      if (!locked) {
        const outline = silhouette(image, darkSprite ? "#fbf7ea" : "#050604");
        if (outline) {
          ctx.imageSmoothingEnabled = false;
          for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]] as const) ctx.drawImage(outline, x + dx, y + dy, width, height);
        }
      }
      drawGameImage(ctx, src, x, y, { width, height, tint: locked ? "#050505" : undefined });
    };
    render();
    image.addEventListener("load", render);
    return () => image.removeEventListener("load", render);
  }, [card, locked]);
  return (
    <canvas
      ref={ref}
      width={ART_W}
      height={ART_H}
      className={clsx("block w-full", className)}
      style={{ imageRendering: "pixelated", aspectRatio: `${ART_W} / ${ART_H}` }}
    />
  );
}

const STATS: Array<[keyof CardDef, string, string]> = [
  ["wounds", "Раны", ""],
  ["move", "Движ.", "″"],
  ["attack", "Атаки", ""],
  ["defence", "Защита", "+"],
  ["strength", "Сила", ""],
  ["damage", "Урон", ""],
];

/** Лицевая сторона карты (полная — для просмотра, мини — для сетки) */
export function CardFace({
  card,
  points,
  size = "lg",
  isNew,
  count,
}: {
  card: CardDef;
  points?: number;
  size?: "lg" | "sm";
  isNew?: boolean;
  count?: number;
}) {
  const r = RARITY_STYLE[card.rarity];
  const legendary = card.rarity === "legendary";
  return (
    <div
      className={clsx("relative overflow-hidden", size === "lg" ? "rounded-2xl p-[4px]" : "h-full rounded-xl p-[3px]")}
      style={{ background: r.frame, boxShadow: r.glow }}
    >
      <div className={clsx("relative overflow-hidden bg-[#121211]", size === "lg" ? "rounded-[13px]" : "h-full rounded-[9px]")}>
        {/* шапка */}
        <div className={clsx("flex items-start justify-between gap-1", size === "lg" ? "px-3 pb-1.5 pt-2" : "px-1.5 pb-1 pt-1")}>
          <p
            className={clsx(
              "min-w-0 uppercase leading-tight text-white",
              oswald,
              size === "lg" ? "text-lg" : "line-clamp-2 h-[2.5em] text-[12px]",
            )}
          >
            {card.name}
          </p>
          {points !== undefined && size === "lg" && (
            <span className="shrink-0 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-semibold" style={{ color: r.color }}>
              +{points}
            </span>
          )}
        </div>

        <div className={clsx("relative", size === "lg" ? "mx-2" : "mx-1")}>
          <div className="overflow-hidden rounded-md" style={{ boxShadow: `inset 0 0 0 1px ${r.color}55` }}>
            <CardArt card={card} />
          </div>
          {isNew && (
            <span className="absolute left-1 top-1 rounded bg-accent px-1 text-[12px] font-bold text-accent-foreground">
              Новая
            </span>
          )}
          {size === "sm" && points !== undefined && (
            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[12px] font-semibold" style={{ color: r.color }}>+{points}</span>
          )}
          {count !== undefined && count > 1 && (
            <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[12px] font-semibold text-white">×{count}</span>
          )}
        </div>

        <div className={clsx("flex items-center justify-between", size === "lg" ? "px-3 pt-1.5" : "px-1.5 py-1")}>
          <span className={clsx("flex min-w-0 items-center gap-1", r.text, size === "lg" ? "text-[12px] uppercase tracking-wide" : "truncate text-[12px]")}>
            <span className="inline-block size-1.5 rotate-45" style={{ background: r.gem }} />
            {card.rarityLabel}
          </span>
          {size === "lg" ? (
            <span className="text-[12px] uppercase tracking-wide text-fg-3">{card.factionLabel}</span>
          ) : null}
        </div>

        {size === "lg" && (
          <>
            <div className="mx-2 mt-2 grid grid-cols-6 gap-1">
              {STATS.map(([key, label, suffix]) => (
                <div key={key} className="rounded-md bg-white/5 py-1 text-center">
                  <p className={`text-base leading-none text-white ${oswald}`}>
                    {card[key] as number}
                    {suffix}
                  </p>
                  <p className="mt-0.5 text-[12px] text-fg-3">{label}</p>
                </div>
              ))}
            </div>
            <div className="mx-2 mb-2.5 mt-2 rounded-md border border-white/10 bg-black/30 px-2 py-1.5">
              <p className="text-[13px] font-semibold" style={{ color: r.color }}>
                {card.ability.name}
              </p>
              <p className="text-[13px] leading-snug text-fg-2">{card.ability.text}</p>
            </div>
          </>
        )}
      </div>

      {legendary && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent"
          style={{ animation: "legend-shine 2.8s ease-in-out infinite" }}
        />
      )}
    </div>
  );
}

/** Рубашка карты с логотипом WarpHub; редкие карты слегка светятся заранее */
export function CardBack({ rarity, hint = true }: { rarity?: CardRarity; hint?: boolean }) {
  const showHint = hint && rarity && rarity !== "common" && rarity !== "uncommon";
  const color = rarity ? RARITY_STYLE[rarity].color : "#ecfe46";
  return (
    <div
      className="relative flex size-full items-center justify-center overflow-hidden rounded-xl border-2 border-accent/50 bg-[#0d0d0c]"
      style={showHint ? ({ "--hint": color, animation: "card-hint 1.4s ease-in-out infinite" } as React.CSSProperties) : undefined}
    >
      <div
        className="absolute inset-1.5 rounded-lg border border-accent/20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(236,254,70,0.06) 0 2px, transparent 2px 9px), repeating-linear-gradient(-45deg, rgba(236,254,70,0.06) 0 2px, transparent 2px 9px)",
        }}
      />
      <img src={s3Url("logo.png")} alt="" className="relative w-1/2 opacity-90 [image-rendering:pixelated]" />
      <span className={`absolute bottom-2 text-[12px] uppercase tracking-[0.15em] text-accent/80 ${oswald}`}>Легенды</span>
    </div>
  );
}
