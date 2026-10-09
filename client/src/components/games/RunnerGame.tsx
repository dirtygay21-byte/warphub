import {
  finishMinigame,
  startMinigame,
  type FinishResult,
} from "@/apiUtils/minigames";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorNote, GameTopBar, PixelButton, ResultPanel, TierList } from "./common";
import { errorText, oswald, stageFrame, useGameInfo } from "./helpers";
import { drawScene, H, newWorld, step, W, type World } from "./runnerScene";

type Phase = "intro" | "starting" | "playing" | "sending" | "result" | "error";

export default function RunnerGame() {
  const game = useGameInfo("runner");
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(newWorld());
  const sessionRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [meters, setMeters] = useState(0);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState("");

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawScene(ctx, worldRef.current);
  }, []);

  useEffect(() => {
    draw();
  }, [draw, phase]);

  const finish = useCallback(
    async (score: number) => {
      setPhase("sending");
      try {
        const res = await finishMinigame(sessionRef.current!, score);
        setResult(res);
        setPhase("result");
        queryClient.invalidateQueries({ queryKey: ["minigames"] });
      } catch (e) {
        setError(errorText(e));
        setPhase("error");
      }
    },
    [queryClient],
  );

  // игровой цикл
  useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;
    let last = performance.now();
    let shownMeters = -1;
    const loop = (now: number) => {
      // dt ограничен: если вкладку свернули, игра просто «замирает»
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const world = worldRef.current;
      step(world, dt);
      draw();
      const m = Math.floor(world.meters);
      if (m !== shownMeters) {
        shownMeters = m;
        setMeters(m);
      }
      // после падения ещё секунду показываем анимацию
      if (world.dead && world.deadFor > 1.1) {
        void finish(Math.floor(world.meters));
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, draw, finish]);

  const jump = useCallback(() => {
    if (phase === "playing") worldRef.current.jumpBuffer = 0.12;
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  const start = async () => {
    setPhase("starting");
    setError("");
    try {
      const session = await startMinigame("runner");
      sessionRef.current = session.sessionId;
      worldRef.current = newWorld();
      setMeters(0);
      setResult(null);
      setPhase("playing");
    } catch (e) {
      setError(errorText(e));
      setPhase("error");
    }
  };

  const nextTier = game?.tiers.find((t) => t.minScore > meters);

  return (
    <div
      className="min-h-full pb-10 text-white"
      onPointerDown={() => {
        // во время забега прыжок — по нажатию в любом месте экрана
        if (phase === "playing") jump();
      }}
    >
      <GameTopBar title={game?.title ?? "Зелёный рывок"} />

      {phase !== "result" && (
        <div className="px-4">
          <div
            className={`${stageFrame} touch-none select-none`}
            onPointerDown={(e) => e.preventDefault()}
          >
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="block w-full"
              style={{ imageRendering: "pixelated", aspectRatio: `${W} / ${H}` }}
            />
            <div className={`pointer-events-none absolute left-3 top-2 text-2xl font-semibold text-accent [text-shadow:0_0_12px_rgb(236_254_70/0.5),2px_2px_0_#000] ${oswald}`}>
              {meters} м
            </div>
            {phase === "playing" && nextTier && (
              <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/50 px-2 py-0.5 text-[11px] text-white/80">
                {nextTier.label} · {nextTier.minScore} м
              </div>
            )}
            {(phase === "intro" || phase === "starting") && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <PixelButton onClick={start} disabled={phase === "starting"}>
                  {phase === "starting" ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Старт
                </PixelButton>
              </div>
            )}
            {phase === "sending" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm">
                <LoaderCircle className="mr-2 size-4 animate-spin" /> Считаем результат…
              </div>
            )}
          </div>

          {phase === "playing" && (
            <p className="mt-3 text-center text-xs text-white/50">
              Нажимайте в любом месте экрана, чтобы прыгать
            </p>
          )}

          {phase === "error" && (
            <div className="mt-4 -mx-4">
              <ErrorNote message={error} onRetry={start} />
            </div>
          )}

          {(phase === "intro" || phase === "error") && game && (
            <div className="mt-5">
              <p className="text-sm text-white/70">{game.description}</p>
              <p className={`mb-2 mt-5 text-sm uppercase tracking-widest text-white/50 ${oswald}`}>
                Награды
              </p>
              <TierList game={game} />
            </div>
          )}
        </div>
      )}

      {phase === "result" && result && (
        <ResultPanel game={game} result={result} title="Пробег" onAgain={start} />
      )}
    </div>
  );
}
