import type { CardDef, CardRarity } from "@/apiUtils/minigames";
import { s3Url } from "@/utils/s3utils";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import { oswald } from "../helpers";
import { gameImage } from "../pixel/assets";
import { RARITY_STYLE } from "./rarity";

// ---------------------------------------------------------------------------
// Иллюстрация в исходном разрешении с контрастным нейтральным фоном
// ---------------------------------------------------------------------------

/** Канвас втрое плотнее спрайта (96×88 → 288×264): пиксели рисунка те же, а контур, тень и фон — тоньше. */
const K = 3;
const ART_W = 96 * K;
const ART_H = 88 * K;

type PreparedArt = { canvas: HTMLCanvasElement; outline: HTMLCanvasElement; locked: HTMLCanvasElement; dark: boolean };
const prepared = new Map<string, PreparedArt>();

function onlyShape(source: HTMLCanvasElement, color: string) {
  const c = document.createElement("canvas");
  c.width = source.width;
  c.height = source.height;
  const x = c.getContext("2d");
  if (x) {
    x.drawImage(source, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

/**
 * Подготовка рисунка (14.11.2026), один раз на спрайт: обрезка пустых полей (фигура крупнее), у тёмных спрайтов —
 * подъём теней (чёрный контур рисунка не трогается), силуэты для контура и закрытой карты. Пиксели рисунка не
 * перерисовываются — меняются только поля и яркость тёмных тонов.
 */
function prepareArt(src: string, image: HTMLImageElement): PreparedArt | null {
  const hit = prepared.get(src);
  if (hit) return hit;
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  const fx = full.getContext("2d", { willReadFrequently: true });
  if (!fx) return null;
  fx.drawImage(image, 0, 0);
  const img = fx.getImageData(0, 0, w, h);
  const d = img.data;
  let minX = w, minY = h, maxX = -1, maxY = -1, lum = 0, n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if ((d[i + 3] ?? 0) < 40) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const l = ((d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0)) / 3;
      if (l > 24) {
        lum += l;
        n++;
      }
    }
  if (maxX < 0) return null;
  const avg = n ? lum / n : 255;
  const dark = avg < 95;
  if (dark) {
    // тёмные тона светлее (гамма 0.72), почти чёрный контур (<24) — как был
    const lift = (v: number) => Math.round(255 * Math.pow(v / 255, 0.72));
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i + 3] ?? 0) < 40) continue;
      const l = ((d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0)) / 3;
      if (l <= 24) continue;
      d[i] = lift(d[i] ?? 0);
      d[i + 1] = lift(d[i + 1] ?? 0);
      d[i + 2] = lift(d[i + 2] ?? 0);
    }
    fx.putImageData(img, 0, 0);
  }
  const canvas = document.createElement("canvas");
  canvas.width = maxX - minX + 1;
  canvas.height = maxY - minY + 1;
  canvas.getContext("2d")?.drawImage(full, minX, minY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  const art = { canvas, outline: onlyShape(canvas, dark ? "#fbf7ea" : "#e9e3cf"), locked: onlyShape(canvas, "#050505"), dark };
  prepared.set(src, art);
  return art;
}

/**
 * Иллюстрация карты: рисунок владельца, обрезанный по фигуре и увеличенный кратно пикселю (чёткие края);
 * свет цвета редкости за фигурой, тень на земле, светлый контур в 1 пиксель рисунка.
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
      const art = prepareArt(src, image);
      if (!art) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, ART_W, ART_H);
      ctx.fillStyle = art.dark ? "#3a3d33" : "#12140e";
      ctx.fillRect(0, 0, ART_W, ART_H);
      const glow = ctx.createRadialGradient(ART_W / 2, ART_H * 0.52, 8, ART_W / 2, ART_H * 0.52, ART_W * 0.62);
      glow.addColorStop(0, art.dark ? "rgba(255,250,235,0.55)" : `${tone}55`);
      glow.addColorStop(0.55, art.dark ? `${tone}30` : `${tone}18`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, ART_W, ART_H);
      const edge = ctx.createRadialGradient(ART_W / 2, ART_H / 2, ART_H * 0.45, ART_W / 2, ART_H / 2, ART_W * 0.78);
      edge.addColorStop(0, "rgba(0,0,0,0)");
      edge.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, ART_W, ART_H);

      // крупно и кратно: пиксель спрайта (1/3 логического) → целое число пикселей холста
      const bw = art.canvas.width;
      const bh = art.canvas.height;
      const scale = Math.max(1, Math.min(Math.floor((ART_W - 8 * K) / bw), Math.floor((ART_H - 10 * K) / bh)));
      const width = bw * scale;
      const height = bh * scale;
      const x = Math.round((ART_W - width) / 2);
      const y = ART_H - 4 * K - height;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.ellipse(ART_W / 2, ART_H - 4 * K, width * 0.4, 3 * K, 0, 0, Math.PI * 2);
      ctx.fill();
      if (locked) {
        ctx.drawImage(art.locked, x, y, width, height);
        return;
      }
      const o = Math.max(2, scale);
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]] as const) ctx.drawImage(art.outline, x + dx, y + dy, width, height);
      ctx.drawImage(art.canvas, x, y, width, height);
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
