import {
  finishMinigame,
  startMinigame,
  type FinishResult,
  type SwarmCreature,
} from "@/apiUtils/minigames";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorNote, GameTopBar, PixelButton, ResultPanel, TierList } from "./common";
import { drawEggScene, EH, eggTier, EW, TIER_GLOW, type EggCreatureVisual } from "./eggScene";
import { errorText, oswald, stageFrame, useGameInfo } from "./helpers";
import { creatureFrame } from "./pixel/factions";
import { PixelSprite } from "./pixel/PixelSprite";

const RARITY_COLORS: Record<string, string> = {
  Ничего: "#8c7f68",
  Обычное: "#ebe2c8",
  Необычное: "#ff6fb3",
  Редкое: "#ff3d9a",
  Эпическое: "#ffc4e1",
  Легендарное: "#ecfe46",
};

const INCUBATOR_ART: Record<string, string[]> = {
  larva: ["backpack-gaunt"],
  skitter: ["gaunt-soldier"],
  spiker: ["gaunt-commander"],
  horned_guard: ["scythe-tyranid", "orange-carnifex", "siege-carnifex"],
  void_stalker: ["white-demon", "whip-demon", "horned-demon"],
  brood_queen: ["brood-mother", "psychic-carnifex", "cannon-beast", "spider-tyranid", "flying-gargoyle"],
};

function visualFor(creature: SwarmCreature, taps: number): EggCreatureVisual {
  const art = INCUBATOR_ART[creature.id];
  if (art?.length) return { kind: "image", src: `/games/incubator/${art[taps % art.length]}.png` };
  return { kind: "sprite", sprite: creatureFrame(creature.id) };
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Phase = "intro" | "countdown" | "playing" | "sending" | "hatch" | "result" | "error";

export default function EggGame() {
  const game = useGameInfo("egg");
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tapsRef = useRef(0);
  const wobbleRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const hatchRef = useRef<{ start: number; creature: EggCreatureVisual | null } | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [creatures, setCreatures] = useState<SwarmCreature[]>([]);
  const creaturesRef = useRef<SwarmCreature[]>([]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [taps, setTaps] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(30);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState("");

  // анимация улья, яйца и вылупления
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      wobbleRef.current = Math.max(0, wobbleRef.current - dt * 3);
      for (const p of particlesRef.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 140 * dt;
        p.life -= dt;
      }
      particlesRef.current = particlesRef.current.filter((p) => p.life > 0);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        const hatch = hatchRef.current;
        const since = hatch ? t - hatch.start : 0;
        drawEggScene(ctx, {
          t,
          taps: tapsRef.current,
          wobble: hatch && since < 0.45 ? 1 : wobbleRef.current,
          hatched: !!hatch && since >= 0.45,
          creature: hatch?.creature ?? null,
          rise: hatch ? Math.min(1, Math.max(0, (since - 0.5) / 0.7)) : 0,
          flash: hatch && since >= 0.45 && since < 0.7 ? 0.6 - (since - 0.45) * 2.4 : 0,
        });
        for (const p of particlesRef.current) {
          ctx.globalAlpha = Math.min(1, p.life * 2);
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const creatureFor = useCallback(
    (n: number, list: SwarmCreature[]) => [...list].reverse().find((c) => n >= c.minTaps),
    [],
  );

  const finish = useCallback(async () => {
    setPhase("sending");
    try {
      const res = await finishMinigame(sessionRef.current!, tapsRef.current);
      setResult(res);
      const c = creatureFor(tapsRef.current, creaturesRef.current);
      hatchRef.current = { start: performance.now() / 1000, creature: c ? visualFor(c, tapsRef.current) : null };
      // осколки скорлупы и слизь
      setTimeout(() => {
        const glow = TIER_GLOW[eggTier(tapsRef.current)]!;
        for (let i = 0; i < 60; i++) {
          particlesRef.current.push({
            x: EW / 2 + (Math.random() - 0.5) * 20,
            y: 50,
            vx: (Math.random() - 0.5) * 110,
            vy: -30 - Math.random() * 90,
            life: 0.8 + Math.random() * 0.8,
            color: i % 3 === 0 ? glow : i % 3 === 1 ? "#7a2a48" : "#34545d",
          });
        }
      }, 450);
      setPhase("hatch");
      queryClient.invalidateQueries({ queryKey: ["minigames"] });
    } catch (e) {
      setError(errorText(e));
      setPhase("error");
    }
  }, [queryClient, creatureFor]);

  useEffect(() => {
    creaturesRef.current = creatures;
  }, [creatures]);

  // обратный отсчёт → начало попытки на сервере → таймер
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown > 0) {
      const id = setTimeout(() => setCountdown((c) => c - 1), 700);
      return () => clearTimeout(id);
    }
    let cancelled = false;
    (async () => {
      try {
        const session = await startMinigame("egg");
        if (cancelled) return;
        sessionRef.current = session.sessionId;
        setCreatures(session.params.creatures ?? []);
        setTimeLeft(session.params.durationSec ?? 30);
        setPhase("playing");
      } catch (e) {
        setError(errorText(e));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== "playing") return;
    const endsAt = Date.now() + timeLeft * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) {
        clearInterval(id);
        void finish();
      }
    }, 200);
    return () => clearInterval(id);
    // таймер запускается один раз при начале игры
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, finish]);

  useEffect(() => {
    if (phase !== "hatch") return;
    const id = setTimeout(() => setPhase("result"), 2400);
    return () => clearTimeout(id);
  }, [phase]);

  const tap = (e: React.PointerEvent) => {
    e.preventDefault();
    if (phase !== "playing") return;
    tapsRef.current += 1;
    setTaps(tapsRef.current);
    wobbleRef.current = Math.min(1, wobbleRef.current + 0.35);
    const glow = TIER_GLOW[eggTier(tapsRef.current)]!;
    for (let i = 0; i < 3; i++) {
      particlesRef.current.push({
        x: EW / 2 + (Math.random() - 0.5) * 30,
        y: 45 + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 70,
        vy: -30 - Math.random() * 50,
        life: 0.5,
        color: glow,
      });
    }
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
  };

  const begin = () => {
    tapsRef.current = 0;
    setTaps(0);
    setResult(null);
    setError("");
    particlesRef.current = [];
    hatchRef.current = null;
    setCountdown(3);
    setPhase("countdown");
  };

  const creature = creatureFor(taps, creatures);
  const visual = creature ? visualFor(creature, taps) : null;
  const tier = eggTier(taps);

  return (
    <div className="pb-10 text-white">
      <GameTopBar title={game?.title ?? "Рой: инкубатор"} />

      {phase !== "result" && (
        <div className="px-4">
          <div className="mb-2 flex items-end justify-between">
            <span className={`text-4xl font-semibold leading-none text-accent ${oswald}`}>{taps}</span>
            <span className={`text-lg text-fg-2 ${oswald}`}>
              {phase === "playing" ? `${timeLeft} с` : "нажатий"}
            </span>
          </div>
          <div
            className={`${stageFrame} mx-auto aspect-square max-w-sm touch-none select-none`}
            onPointerDown={tap}
          >
            <canvas
              ref={canvasRef}
              width={EW}
              height={EH}
              className="block size-full"
              style={{ imageRendering: "pixelated" }}
            />
            {phase === "playing" && tier > 0 && (
              <span
                className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-[12px] uppercase tracking-wider"
                style={{ color: TIER_GLOW[tier] }}
              >
                {creature?.rarity}
              </span>
            )}
            {phase === "countdown" && (
              <div className={`absolute inset-0 flex items-center justify-center bg-black/40 text-7xl font-semibold text-accent [text-shadow:0_0_24px_rgb(236_254_70/0.6)] ${oswald}`}>
                {countdown > 0 ? countdown : <LoaderCircle className="size-10 animate-spin" />}
              </div>
            )}
            {phase === "sending" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-sm">
                <LoaderCircle className="mr-2 size-4 animate-spin" /> Скорлупа трескается…
              </div>
            )}
            {(phase === "intro" || phase === "error") && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                <PixelButton onClick={begin}>Начать</PixelButton>
              </div>
            )}
          </div>
          {phase === "playing" && (
            <p className="mt-3 text-center text-xs text-fg-3">
              Стучите по яйцу как можно быстрее — можно несколькими пальцами
            </p>
          )}
          {phase === "error" && (
            <div className="-mx-4 mt-4">
              <ErrorNote message={error} />
            </div>
          )}
          {(phase === "intro" || phase === "error") && game && (
            <div className="mt-5">
              <p className="text-sm text-fg-2">{game.description}</p>
              <p className={`mb-2 mt-5 text-sm uppercase tracking-widest text-fg-3 ${oswald}`}>Награды</p>
              <TierList game={game} />
            </div>
          )}
        </div>
      )}

      {phase === "result" && result && (
        <ResultPanel game={game} result={result} title="Результат" onAgain={begin}>
          {creature && (
            <div className="mt-4 flex flex-col items-center">
              <div
                className="rounded-2xl border border-white/10 p-3"
                style={{ background: `radial-gradient(circle at 50% 55%, ${RARITY_COLORS[creature.rarity] ?? "#ffffff"}33, #0b0709 70%)` }}
              >
                {visual?.kind === "image" ? (
                  <img
                    src={visual.src}
                    alt={creature.name}
                    className="size-44 object-contain [image-rendering:pixelated]"
                    style={{ filter: "drop-shadow(3px 0 0 #f4ecd8) drop-shadow(-3px 0 0 #f4ecd8) drop-shadow(0 3px 0 #f4ecd8) drop-shadow(0 -3px 0 #f4ecd8) drop-shadow(0 6px 10px rgba(0,0,0,0.7))" }}
                  />
                ) : (
                  <PixelSprite sprite={visual!.sprite} scale={4} title={creature.name} />
                )}
              </div>
              <p className={`mt-2 text-lg uppercase ${oswald}`}>{creature.name}</p>
              <p className="text-xs uppercase tracking-wider" style={{ color: RARITY_COLORS[creature.rarity] ?? "#fff" }}>
                {creature.rarity}
              </p>
            </div>
          )}
        </ResultPanel>
      )}
    </div>
  );
}
