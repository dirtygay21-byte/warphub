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

const ART_W = 96;
const ART_H = 88;

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

export function CardArt({ card, className, locked }: { card: CardDef; className?: string; locked?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const src = `/games/aos/${card.id}.png`;
    const image = gameImage(src);
    const render = () => {
      if (!image.complete || image.naturalWidth === 0) return;
      const darkSprite = imageLuminance(image) < 105;
      ctx.clearRect(0, 0, ART_W, ART_H);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = darkSprite ? "#c9c2b2" : "#171a12";
      ctx.fillRect(0, 0, ART_W, ART_H);
      ctx.fillStyle = darkSprite ? "rgba(0,0,0,0.055)" : "rgba(236,254,70,0.055)";
      for (let y = 0; y < ART_H; y += 8) ctx.fillRect(0, y, ART_W, 1);
      const scale = Math.min((ART_W - 4) / image.naturalWidth, (ART_H - 6) / image.naturalHeight);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      drawGameImage(ctx, src, Math.round((ART_W - width) / 2), ART_H - 2 - height, {
        width,
        height,
        tint: locked ? "#050505" : undefined,
      });
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
