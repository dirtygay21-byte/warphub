import { useEffect, useRef } from "react";
import { fighterFaction, fighterFrame, type Faction } from "./pixel/factions";
import { drawPuddle, seeded } from "./pixel/pixel";
import { drawGameImage } from "./pixel/assets";

/** Виртуальный размер арены (пиксели рисунка) */
const W = 132;
const H = 66;
const GROUND = 58;
const PLAYER_X = 10;
const ENEMY_X = 86;
const HIT_Y = GROUND - 22;

export type ArenaEvent =
  | { id: number; type: "attack"; side: "player" | "enemy" }
  | { id: number; type: "hurt"; side: "player" | "enemy"; damage: number }
  | { id: number; type: "die"; side: "player" | "enemy" }
  | { id: number; type: "miss"; side: "player" | "enemy" };

type Actor = {
  id: string;
  lungeT: number;
  hurtT: number;
  dieT: number;
  enterT: number;
  dead: boolean;
};

type Floater = { x: number; y: number; text: string; color: string; life: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const newActor = (id: string, enter = false): Actor => ({
  id, lungeT: 0, hurtT: 0, dieT: 0, enterT: enter ? 1 : 0, dead: false,
});

const EFFECT: Record<string, { color: string; core: string }> = {
  imperium: { color: "#ecfe46", core: "#fbffc4" },
  xenos: { color: "#ff8a1f", core: "#ffd27a" },
  chaos: { color: "#ff3d9a", core: "#ffc4e1" },
};

const FIRE_RANGED = new Set(["storm_huntress", "gear_sage", "ember_witch", "ash_cultist"]);
const FACTION_IMAGE: Record<Faction, string> = {
  imperium: "/games/space-marine.png",
  xenos: "/games/ork-horde.png",
  chaos: "/games/tyranid-warrior.png",
};
const FIGHTER_IMAGE: Record<string, string> = {
  iron_captain: "/games/fighters/iron_captain.png",
  storm_huntress: "/games/fighters/storm_huntress.png",
  scrap_brute: "/games/fighters/scrap_brute.png",
  gear_sage: "/games/fighters/gear_sage.png",
  ember_witch: "/games/fighters/ember_witch.png",
  gate_warden: "/games/fighters/gate_warden.png",
  hive_reaper: "/games/fighters/hive_reaper.png",
  fallen_knight: "/games/fighters/fallen_knight.png",
  war_drone: "/games/fighters/war_drone.png",
  fang_chief: "/games/fighters/fang_chief.png",
  ash_cultist: "/games/fighters/ash_cultist.png",
  plague_hulk: "/games/fighters/plague_hulk.png",
};

export function BattleArena({
  playerId,
  enemyId,
  event,
}: {
  playerId: string;
  enemyId: string;
  event: ArenaEvent | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = useRef<Actor>(newActor(playerId));
  const enemy = useRef<Actor>(newActor(enemyId));
  const floaters = useRef<Floater[]>([]);
  const particles = useRef<Particle[]>([]);
  const shots = useRef<Array<{ from: "player" | "enemy"; t: number; ranged: boolean; color: string; core: string }>>([]);

  // новый противник выходит на арену
  useEffect(() => {
    if (enemy.current.id !== enemyId) enemy.current = newActor(enemyId, true);
  }, [enemyId]);
  useEffect(() => {
    if (player.current.id !== playerId) player.current = newActor(playerId);
  }, [playerId]);

  useEffect(() => {
    if (!event) return;
    const actor = event.side === "player" ? player.current : enemy.current;
    const x = event.side === "player" ? PLAYER_X + 18 : ENEMY_X + 18;
    switch (event.type) {
      case "attack": {
        actor.lungeT = 1;
        const id = actor.id;
        const fx = EFFECT[fighterFaction(id)]!;
        shots.current.push({ from: event.side, t: 1, ranged: FIRE_RANGED.has(id), color: fx.color, core: fx.core });
        break;
      }
      case "hurt":
        actor.hurtT = 1;
        floaters.current.push({ x, y: GROUND - 34, text: `−${event.damage}`, color: "#ff3b2a", life: 1.2 });
        for (let i = 0; i < 10; i++) {
          particles.current.push({
            x, y: GROUND - 22, vx: (Math.random() - 0.5) * 70, vy: -Math.random() * 60, life: 0.6,
            color: fighterFaction(actor.id) === "chaos" ? "#ff3d9a" : fighterFaction(actor.id) === "xenos" ? "#506b31" : "#b4c1cb",
          });
        }
        break;
      case "miss":
        floaters.current.push({ x, y: GROUND - 34, text: "мимо", color: "#94a3ae", life: 1 });
        break;
      case "die": {
        actor.dieT = 0.0001;
        // распад в пепел
        const s = fighterFrame(actor.id, "idle");
        const ox = event.side === "player" ? PLAYER_X : ENEMY_X;
        const rng = seeded(event.id);
        for (let i = 0; i < s.px.length; i += 3) {
          const c = s.px[i];
          if (!c || rng() < 0.4) continue;
          const sx = i % s.w;
          const sy = Math.floor(i / s.w);
          particles.current.push({
            x: ox + (event.side === "enemy" ? s.w - 1 - sx : sx), y: GROUND - s.h + 1 + sy,
            vx: (rng() - 0.5) * 20, vy: -10 - rng() * 30, life: 0.8 + rng() * 0.8, color: c,
          });
        }
        break;
      }
    }
  }, [event]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const rift = seeded(5);
    const riftPts = Array.from({ length: 16 }, (_, i) => [24 + i * 6, 10 + Math.round((rift() - 0.5) * 7)] as const);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(loop);
        return;
      }
      ctx.imageSmoothingEnabled = false;

      // фон: тёмное небо, разлом варпа, руины
      const sky = ["#070706", "#0a0908", "#0e0c0a", "#13100c", "#1a140e", "#22180f"];
      sky.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, i * 12, W, 12);
      });
      ctx.globalAlpha = 0.45 + Math.sin(t * 2.5) * 0.15;
      for (const [width, color] of [[5, "rgba(236,254,70,0.12)"], [1, "#b9cc28"]] as const) {
        ctx.fillStyle = color;
        for (let i = 0; i + 1 < riftPts.length; i++) {
          const [x0, y0] = riftPts[i]!;
          const [x1, y1] = riftPts[i + 1]!;
          for (let s = 0; s <= 6; s++) {
            const y = Math.round(y0 + ((y1 - y0) * s) / 6);
            ctx.fillRect(x0 + s, y - Math.floor(width / 2), 1, width);
          }
          void x1;
        }
      }
      ctx.globalAlpha = 1;
      // силуэты шпилей
      ctx.fillStyle = "#151310";
      for (const [x, w, h] of [[2, 13, 28], [24, 8, 18], [46, 18, 23], [76, 11, 31], [100, 19, 21], [122, 10, 25]] as const) {
        ctx.fillRect(x, GROUND - h, w, h);
        for (let i = 0; i < w / 2; i++) ctx.fillRect(x + i, GROUND - h - i, w - i * 2, 1);
        ctx.fillRect(x + Math.floor(w / 2), GROUND - h - Math.floor(w / 2) - 8, 1, 8);
        ctx.fillStyle = Math.sin(t * 4 + x) > 0.5 ? "#d14a0c" : "#5a1a06";
        ctx.fillRect(x + 3, GROUND - h + 6, 2, 3);
        ctx.fillStyle = "#151310";
      }
      // земля
      ctx.fillStyle = "#16140f";
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = "#2c271f";
      ctx.fillRect(0, GROUND, W, 1);
      drawPuddle(ctx, 54, GROUND + 3, 22, t);
      ctx.fillStyle = "#0b0a08";
      ctx.fillRect(8, GROUND + 3, 10, 1);
      ctx.fillRect(104, GROUND + 5, 12, 1);

      const drawActor = (a: Actor, baseX: number, flip: boolean) => {
        if (a.dieT > 0) {
          a.dieT += dt;
          return;
        }
        a.lungeT = Math.max(0, a.lungeT - dt * 2.2);
        a.hurtT = Math.max(0, a.hurtT - dt * 3);
        a.enterT = Math.max(0, a.enterT - dt * 1.6);
        let offset = 0;
        if (a.lungeT > 0) {
          offset = Math.sin(a.lungeT * Math.PI) * 10;
        }
        if (a.hurtT > 0) {
          offset = -Math.sin(a.hurtT * Math.PI) * 4 + (Math.floor(t * 40) % 2 ? 1 : -1);
        }
        offset += a.enterT * 70;
        const x = flip ? baseX - offset : baseX + offset;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#000";
        ctx.fillRect(Math.round(x + 8), GROUND, 20, 1);
        ctx.globalAlpha = 1;
        drawGameImage(ctx, FIGHTER_IMAGE[a.id] ?? FACTION_IMAGE[fighterFaction(a.id)], x, GROUND - 48, {
          flip,
          tint: a.hurtT > 0.82 ? "#ffffff" : undefined,
        });
      };
      drawActor(player.current, PLAYER_X, false);
      drawActor(enemy.current, ENEMY_X, true);

      // эффекты ударов
      for (const sh of shots.current) {
        sh.t -= dt * 2.5;
        if (sh.t <= 0) continue;
        const fromX = sh.from === "player" ? PLAYER_X + 32 : ENEMY_X + 4;
        const toX = sh.from === "player" ? ENEMY_X + 14 : PLAYER_X + 22;
        const k = 1 - sh.t;
        if (sh.ranged) {
          const x = fromX + (toX - fromX) * Math.min(1, k * 1.6);
          ctx.fillStyle = sh.color;
          ctx.fillRect(Math.round(x) - 3, HIT_Y, 6, 2);
          ctx.fillStyle = sh.core;
          ctx.fillRect(Math.round(x) - 1, HIT_Y, 3, 1);
        } else if (k > 0.25) {
          // дуга удара у цели
          const cx = toX + 6;
          ctx.globalAlpha = sh.t;
          ctx.fillStyle = sh.color;
          for (let i = 0; i < 12; i++) {
            const ang = -1.2 + (i / 12) * 2.2;
            ctx.fillRect(Math.round(cx + Math.cos(ang) * 12 * (sh.from === "player" ? 1 : -1) - 6), Math.round(HIT_Y + Math.sin(ang) * 12), 2, 2);
          }
          ctx.globalAlpha = 1;
        }
      }
      shots.current = shots.current.filter((s) => s.t > 0);

      for (const p of particles.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 30 * dt;
        p.life -= dt;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      particles.current = particles.current.filter((p) => p.life > 0);

      ctx.font = "bold 8px Oswald, sans-serif";
      ctx.textAlign = "center";
      for (const f of floaters.current) {
        f.life -= dt;
        f.y -= dt * 14;
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
        ctx.fillStyle = "#000";
        ctx.fillText(f.text, Math.round(f.x) + 1, Math.round(f.y) + 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, Math.round(f.x), Math.round(f.y));
      }
      ctx.globalAlpha = 1;
      floaters.current = floaters.current.filter((f) => f.life > 0);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="block w-full"
      style={{ imageRendering: "pixelated", aspectRatio: `${W} / ${H}` }}
    />
  );
}
