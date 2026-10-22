import type { CardDef, CardRarity } from "@/apiUtils/minigames";
import { s3Url } from "@/utils/s3utils";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import { oswald } from "../helpers";
import { drawSprite } from "../pixel/pixel";
import { ART_H, ART_W, cardArt } from "../pixel/fantasy";
import { RARITY_STYLE } from "./rarity";

// ---------------------------------------------------------------------------
// Фон иллюстрации по фракции (пиксельный, 44×40)
// ---------------------------------------------------------------------------

function bands(ctx: CanvasRenderingContext2D, colors: string[], to: number) {
  const h = Math.ceil(to / colors.length);
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * h, ART_W, h);
  });
}

const BACKDROPS: Record<string, (ctx: CanvasRenderingContext2D) => void> = {
  dawn: (ctx) => {
    bands(ctx, ["#2a1430", "#4a1c34", "#7a2a2a", "#b2481f", "#e0822a", "#f0b44a"], 34);
    ctx.fillStyle = "#ffe48a";
    for (let y = -6; y <= 6; y++) {
      const half = Math.round(Math.sqrt(36 - y * y));
      ctx.fillRect(22 - half, 26 + y, half * 2, 1);
    }
    ctx.globalAlpha = 0.25;
    for (const [x0, x1] of [[2, 10], [14, 18], [26, 30], [34, 42]]) ctx.fillRect(x0, 0, x1 - x0, 34);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#3a2618";
    ctx.fillRect(0, 34, ART_W, 6);
  },
  clans: (ctx) => {
    bands(ctx, ["#101012", "#16161a", "#1e1e23", "#26262c"], 34);
    ctx.fillStyle = "#2f2f36";
    for (let i = 0; i < 22; i++) ctx.fillRect(i, 34 - i, 1, i);
    for (let i = 0; i < 16; i++) ctx.fillRect(43 - i, 34 - i * 1.2, 1, i * 1.2);
    ctx.fillStyle = "#ff8a1f";
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, 30, ART_W, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#3a3a42";
    ctx.fillRect(0, 34, ART_W, 6);
    ctx.fillStyle = "#ffcf4a";
    for (const [x, y] of [[6, 12], [37, 9], [30, 18]]) ctx.fillRect(x, y, 1, 1);
  },
  grove: (ctx) => {
    bands(ctx, ["#07130b", "#0b1d10", "#102716", "#16321b"], 34);
    ctx.fillStyle = "#0a1a0d";
    for (const x of [3, 12, 33, 40]) ctx.fillRect(x, 0, 3, 34);
    ctx.fillStyle = "#c4ff8a";
    for (const [x, y] of [[8, 9], [30, 6], [38, 20], [17, 15], [5, 25]]) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = "#1d2a14";
    ctx.fillRect(0, 34, ART_W, 6);
  },
  restless: (ctx) => {
    bands(ctx, ["#0b0f1a", "#111727", "#161d30", "#1c2333"], 34);
    ctx.fillStyle = "#d8d4c4";
    for (let y = -4; y <= 4; y++) {
      const half = Math.round(Math.sqrt(16 - y * y));
      ctx.fillRect(35 - half, 8 + y, half * 2, 1);
    }
    ctx.fillStyle = "#0b0f1a";
    ctx.fillRect(36, 5, 3, 3);
    ctx.fillStyle = "#262c3d";
    for (const [x, h] of [[3, 7], [9, 5], [36, 6]]) {
      ctx.fillRect(x, 34 - h, 4, h);
      ctx.fillRect(x + 1, 33 - h, 2, 1);
    }
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#7af0dc";
    ctx.fillRect(0, 31, ART_W, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#151820";
    ctx.fillRect(0, 34, ART_W, 6);
  },
  bog: (ctx) => {
    bands(ctx, ["#10140c", "#161c10", "#1d2414", "#26301a"], 34);
    ctx.fillStyle = "#33401f";
    for (const x of [2, 5, 38, 41]) ctx.fillRect(x, 22 + (x % 3), 1, 12);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#a7c96a";
    ctx.fillRect(0, 26, ART_W, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#1d2414";
    ctx.fillRect(0, 34, ART_W, 6);
    ctx.fillStyle = "#33401f";
    ctx.fillRect(4, 36, 10, 1);
    ctx.fillRect(28, 37, 12, 1);
  },
  ash: (ctx) => {
    bands(ctx, ["#120706", "#1f0b08", "#3a120a", "#5c1d0c"], 34);
    ctx.fillStyle = "#ff8a1f";
    for (const [x, y] of [[5, 20], [12, 8], [33, 14], [39, 26], [24, 4]]) ctx.fillRect(x, y, 1, 1);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, ART_W, 10);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#1b1414";
    ctx.fillRect(0, 34, ART_W, 6);
  },
  wild: (ctx) => {
    bands(ctx, ["#0d0b1a", "#15112a", "#1d1733", "#241d3a"], 34);
    // молния варпа — лайм WarpHub
    ctx.fillStyle = "#ecfe46";
    const bolt = [[38, 0], [36, 4], [39, 6], [35, 12], [37, 13], [33, 19]];
    for (let i = 0; i + 1 < bolt.length; i++) {
      const [x0, y0] = bolt[i]!;
      const [x1, y1] = bolt[i + 1]!;
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= steps; s++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps), 1, 1);
    }
    ctx.fillStyle = "#1a1820";
    ctx.fillRect(0, 34, ART_W, 6);
  },
};

export function CardArt({ card, className, locked }: { card: CardDef; className?: string; locked?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    (BACKDROPS[card.faction] ?? BACKDROPS.wild!)(ctx);
    drawSprite(ctx, cardArt(card.id), 0, 0, locked ? { tint: "#050505" } : { glowAlpha: 0.3 });
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
              size === "lg" ? "text-lg" : "line-clamp-2 h-[2.5em] text-[10px]",
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
            <span className="absolute left-1 top-1 rounded bg-accent px-1 text-[9px] font-bold uppercase text-accent-foreground">
              Новая
            </span>
          )}
          {count !== undefined && count > 1 && (
            <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">×{count}</span>
          )}
        </div>

        <div className={clsx("flex items-center justify-between", size === "lg" ? "px-3 pt-1.5" : "px-1.5 py-1")}>
          <span className={clsx("flex items-center gap-1 uppercase tracking-wide", r.text, size === "lg" ? "text-[11px]" : "text-[8px]")}>
            <span className="inline-block size-1.5 rotate-45" style={{ background: r.gem }} />
            {card.rarityLabel}
          </span>
          {size === "lg" ? (
            <span className="text-[10px] uppercase tracking-wide text-white/45">{card.factionLabel}</span>
          ) : (
            points !== undefined && <span className="text-[9px] font-semibold" style={{ color: r.color }}>+{points}</span>
          )}
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
                  <p className="mt-0.5 text-[8px] uppercase text-white/45">{label}</p>
                </div>
              ))}
            </div>
            <div className="mx-2 mb-2.5 mt-2 rounded-md border border-white/10 bg-black/30 px-2 py-1.5">
              <p className="text-[11px] font-semibold" style={{ color: r.color }}>
                {card.ability.name}
              </p>
              <p className="text-[11px] leading-snug text-white/70">{card.ability.text}</p>
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
      <span className={`absolute bottom-2 text-[9px] uppercase tracking-[0.2em] text-accent/70 ${oswald}`}>Легенды</span>
    </div>
  );
}
