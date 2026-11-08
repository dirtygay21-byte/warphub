import {
  diceAction,
  startMinigame,
  type BattleView,
  type DiceActionResolution,
  type DiceExchange,
  type DicePools,
  type Fighter,
  type FinishResult,
  type MinigameInfo,
} from "@/apiUtils/minigames";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { FastForward, Flag, LoaderCircle, Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BattleArena, type ArenaEvent } from "./BattleArena";
import { ErrorNote, GameTopBar, PixelButton, ResultPanel, TierList } from "./common";
import { errorText, oswald, pluralWins, stageFrame, useGameInfo } from "./helpers";
import { FACTION_LABELS, fighterFaction, type Faction } from "./pixel/factions";

// ---------------------------------------------------------------------------
// Кубик
// ---------------------------------------------------------------------------

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, state }: { value: number; state: "ok" | "fail" | "rolling" | "crit" | "used" | "blocked" }) {
  return (
    <div
      className={clsx(
        "grid size-8 grid-cols-3 grid-rows-3 gap-[2px] rounded-md p-[4px] transition-colors",
        state === "ok" && "bg-accent shadow-[0_0_10px_rgb(236_254_70/0.55)]",
        state === "crit" && "bg-[#ff8a1f] shadow-[0_0_12px_rgb(255_138_31/0.55)]",
        state === "fail" && "border border-white/10 bg-white/5",
        state === "used" && "border border-white/10 bg-white/5 opacity-35",
        state === "blocked" && "border border-sky-300 bg-sky-400/30 shadow-[0_0_12px_rgb(56_189_248/0.45)]",
        state === "rolling" && "animate-[dice-tumble_0.35s_linear_infinite] bg-[#ebe2c8]",
      )}
      aria-label={`Кубик ${value}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={clsx(
            "rounded-[1px]",
            PIPS[value]?.includes(i) && ((state === "fail" || state === "used") ? "bg-white/35" : "bg-[#111110]"),
          )}
        />
      ))}
    </div>
  );
}

const ok = (roll: number, target: number) => roll !== 1 && (roll === 6 || roll >= target);

// ---------------------------------------------------------------------------
// Видимые пулы кубов обеих сторон
// ---------------------------------------------------------------------------

function actionCaption(action: DiceActionResolution) {
  if (action.action === "defend") {
    if (action.blockedByRoll === null) return `Защита ${action.roll ?? "—"} · без блока`;
    return `Защита ${action.roll} · ${action.roll === 6 ? "2 обычных блока или 1 критический" : "1 обычный блок"}`;
  }
  const kind = action.action === "ult" ? "Ульта" : action.critical ? "Критическая атака" : action.action === "risk" ? "Риск-атака" : "Атака";
  const result = action.blocked ? `блок защитой ${action.blockedByRoll}` : `урон −${action.damage}`;
  return `${kind} ${action.roll ?? "—"} · ${result}${action.guaranteed ? " · гарантированно" : ""}${action.selfDamage ? ` · себе −${action.selfDamage}` : ""}`;
}

function PoolSide({
  pool,
  fighter,
  action,
}: {
  pool: DicePools["player"];
  fighter: Fighter;
  action: DiceActionResolution | null | undefined;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className={`truncate text-sm uppercase text-white ${oswald}`}>{fighter.name}</p>
        <span className="shrink-0 text-[11px] text-fg-3">А{fighter.skill}+ · З{fighter.save}+</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pool.length === 0 && <span className="text-xs text-fg-3">Новый пул…</span>}
        {pool.map((entry, index) => {
          const selected = action?.rollIndex === index;
          const state = selected
            ? action?.blocked
              ? "blocked"
              : action?.critical
                ? "crit"
                : "ok"
            : entry.used
              ? "used"
              : entry.value === 6
                ? "crit"
                : ok(entry.value, fighter.skill)
                  ? "ok"
                  : "fail";
          return <Die key={index} value={entry.value} state={state} />;
        })}
      </div>
      {action && <p className="mt-2 text-[12px] leading-snug text-fg-2">{actionCaption(action)}</p>}
    </div>
  );
}

function DicePoolPanel({
  pools,
  player,
  opponent,
  playerAction,
  enemyAction,
}: {
  pools: DicePools;
  player: Fighter;
  opponent: Fighter;
  playerAction?: DiceActionResolution | null;
  enemyAction?: DiceActionResolution | null;
}) {
  return (
    <div className="flex gap-2">
      <PoolSide pool={pools.player} fighter={player} action={playerAction} />
      <PoolSide pool={pools.enemy} fighter={opponent} action={enemyAction} />
    </div>
  );
}

const FACTION_TEXT: Record<Faction, string> = {
  imperium: "text-accent",
  xenos: "text-[#e0954f]",
  chaos: "text-[#ff6fb3]",
};
const FACTION_PIP: Record<Faction, string> = {
  imperium: "bg-accent",
  xenos: "bg-[#e0954f]",
  chaos: "bg-[#ff3d9a]",
};

function FighterPanel({ fighter, wounds, align }: { fighter: Fighter; wounds: number; align: "left" | "right" }) {
  const faction = fighterFaction(fighter.sprite);
  return (
    <div className={clsx("min-w-0 flex-1", align === "right" && "text-right")}>
      <p className={`truncate text-base font-medium uppercase leading-tight ${oswald}`}>{fighter.name}</p>
      <p className={clsx("text-[12px] uppercase tracking-wider", FACTION_TEXT[faction])}>{FACTION_LABELS[faction]}</p>
      <div className={clsx("mt-1.5 flex flex-wrap gap-[3px]", align === "right" && "justify-end")}>
        {Array.from({ length: Math.max(fighter.wounds, wounds) }, (_, i) => (
          <span key={i} className={clsx("h-2 w-3 rounded-[2px]", i < wounds ? FACTION_PIP[faction] : "bg-white/10")} />
        ))}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-fg-3">
        Кубы {fighter.attacks} · Урон {fighter.damage} · Крит {fighter.critDamage ?? fighter.damage + 1} · Навык {fighter.skill}+ · Защита {fighter.save}+
      </p>
    </div>
  );
}

function rewardForWins(game: MinigameInfo | undefined, wins: number) {
  if (!game) return null;
  return [...game.tiers].reverse().find((t) => wins >= t.minScore) ?? null;
}

// ---------------------------------------------------------------------------

type Phase = "intro" | "starting" | "initiative" | "battle" | "animating" | "sending" | "result" | "error";

export default function DiceGame() {
  const game = useGameInfo("dice");
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("intro");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleView | null>(null);
  const pendingRef = useRef<{ battle: BattleView; result: FinishResult | null } | null>(null);
  const [exchange, setExchange] = useState<DiceExchange | null>(null);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [arenaEvent, setArenaEvent] = useState<ArenaEvent | null>(null);
  const eventId = useRef(0);
  const emitted = useRef(new Set<string>());

  type ArenaEventInput = ArenaEvent extends infer E ? (E extends ArenaEvent ? Omit<E, "id"> : never) : never;
  const emit = (key: string, e: ArenaEventInput) => {
    if (emitted.current.has(key)) return;
    emitted.current.add(key);
    eventId.current += 1;
    setArenaEvent({ ...e, id: eventId.current } as ArenaEvent);
  };

  const actionSequence = exchange
    ? ([exchange.playerAction, exchange.enemyAction].filter(Boolean) as DiceActionResolution[])
    : [];
  const totalSteps = actionSequence.length * 2;

  // Выбранный куб и результат каждого действия подсвечиваются по очереди.
  useEffect(() => {
    if (phase !== "animating" || !exchange) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const action = actionSequence[Math.floor(step / 2)];

    later(() => {
      if (action && action.action !== "defend") {
        if (step % 2 === 0) emit(`${action.side}-attack-${step}`, { type: "attack", side: action.side });
        if (step % 2 === 1) {
          const side = action.side === "player" ? "enemy" : "player";
          emit(`${action.side}-result-${step}`, action.damage > 0 ? { type: "hurt", side, damage: action.damage } : { type: "miss", side });
        }
      }

      if (step < totalSteps) {
        later(() => setStep((s) => s + 1), 430);
        return;
      }
      const pending = pendingRef.current;
      if (!pending) return;
      let delay = 500;
      if (exchange.opponentDefeated) {
        later(() => emit("die-e", { type: "die", side: "enemy" }), 250);
        setBanner(exchange.clutch ? "Победа на последнем издыхании! Бонус к награде" : "Враг повержен!");
        delay = 1500;
      } else if (exchange.playerDefeated) {
        later(() => emit("die-p", { type: "die", side: "player" }), 250);
        setBanner("Ваш воин пал…");
        delay = 1800;
      }
      later(() => {
        setBattle(pending.battle);
        if (pending.result) {
          setResult(pending.result);
          setPhase("result");
        } else {
          setPhase("battle");
        }
      }, delay);
    }, 0);
    return () => timers.forEach((t) => clearTimeout(t));
    // emit стабилен по смыслу (использует refs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step, totalSteps, exchange]);

  const start = async () => {
    setPhase("starting");
    setError("");
    setResult(null);
    setExchange(null);
    setBanner(null);
    try {
      const session = await startMinigame("dice");
      if (!session.battle) throw new Error("Сервер не вернул состояние боя");
      setSessionId(session.sessionId);
      setBattle(session.battle);
      setPhase(session.battle.playerStarts === null ? "initiative" : "battle");
    } catch (e) {
      setError(errorText(e));
      setPhase("error");
    }
  };

  const chooseInitiative = async (guess: "even" | "odd") => {
    if (!sessionId) return;
    setPhase("sending");
    setError("");
    try {
      const res = await diceAction(sessionId, guess === "even" ? "initiative_even" : "initiative_odd");
      setBattle(res.battle);
      if (res.exchange?.enemyAction) {
        pendingRef.current = { battle: res.battle, result: res.result };
        emitted.current = new Set();
        setExchange(res.exchange);
        setStep(0);
        setPhase("animating");
      } else {
        setPhase("battle");
      }
    } catch (e) {
      setError(errorText(e));
      setPhase("error");
    }
  };

  const act = async (action: "attack" | "critical" | "defend" | "risk" | "ult" | "roll" | "stop") => {
    if (!sessionId) return;
    setPhase("sending");
    setBanner(null);
    try {
      const res = await diceAction(sessionId, action);
      if (res.result) queryClient.invalidateQueries({ queryKey: ["minigames"] });
      if (action === "stop" || !res.exchange) {
        setBattle(res.battle);
        setResult(res.result);
        setPhase("result");
        return;
      }
      pendingRef.current = { battle: res.battle, result: res.result };
      emitted.current = new Set();
      setExchange(res.exchange);
      setStep(0);
      setPhase("animating");
    } catch (e) {
      setError(errorText(e));
      setPhase("error");
    }
  };

  const skipAnimation = () => {
    if (phase === "animating" && step < totalSteps) setStep(totalSteps);
  };

  const current = rewardForWins(game, battle?.wins ?? 0);
  const next = game?.tiers.find((t) => t.minScore > (battle?.wins ?? 0));

  if (phase === "result" && result) {
    return (
      <div className="pb-10 text-white">
        <GameTopBar title={game?.title ?? "Кости войны"} />
        <ResultPanel
          game={game}
          result={result}
          title={battle?.lost ? (battle.wins > 0 ? "Поражение — награда сгорела" : "Поражение") : "Победы"}
          onAgain={start}
          actionsOnTop
        >
          {battle && (
            <p className="mt-3 text-xs text-fg-2">
              {battle.player.name} · раундов: {battle.round}
              {battle.clutchWins > 0 ? ` · побед на последнем издыхании: ${battle.clutchWins}` : ""}
            </p>
          )}
        </ResultPanel>
      </div>
    );
  }

  const inBattle = battle && (phase === "battle" || phase === "animating" || phase === "sending");
  const playerAction = exchange?.playerAction;
  const enemyAction = exchange?.enemyAction;
  const displayPools = phase === "animating" && exchange?.pools ? exchange.pools : battle?.pools;
  const canNormal = !!battle && (!battle.firstStrikeDone || !!battle.pools?.player.some((entry) => !entry.used && entry.value !== 6 && ok(entry.value, battle.player.skill)));
  const canCritical = !!battle?.pools?.player.some((entry) => !entry.used && entry.value === 6);
  const canDefend = !!battle?.pools?.player.some((entry) => !entry.used);

  return (
    <div className="min-h-full pb-10 text-white" onClick={skipAnimation}>
      <GameTopBar title={game?.title ?? "Кости войны"} />

      {phase === "initiative" && battle && (
        <div className="px-4">
          <div className="rounded-2xl border border-accent/30 bg-app-elevated p-5 text-center">
            <p className={`text-xl uppercase text-accent ${oswald}`}>Инициатива</p>
            <p className="mt-2 text-sm text-fg-2">Выберите чётность кубика D6. Если угадаете — первый удар ваш, иначе противник начнёт сам.</p>
            <div className="mt-4 flex justify-center">
              <Die value={battle.initiativeRoll ?? 6} state="rolling" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <PixelButton onClick={() => chooseInitiative("even")}>Чёт</PixelButton>
              <PixelButton variant="dark" onClick={() => chooseInitiative("odd")}>Нечет</PixelButton>
            </div>
            {battle.initiativeRoll !== null && (
              <p className="mt-3 text-sm text-fg-2">Кубик: {battle.initiativeRoll} · {battle.playerStarts ? "ваш первый удар" : "первый удар противника"}</p>
            )}
          </div>
        </div>
      )}

      {!inBattle && phase !== "initiative" && (
        <div className="px-4">
          <div className={stageFrame}>
            <BattleArena playerId="iron_captain" enemyId="hive_reaper" event={null} />
          </div>
          {/* «В бой» — сразу под картинкой, как кнопки в самом бою */}
          <PixelButton className="mt-4 w-full" onClick={start} disabled={phase === "starting"}>
            {phase === "starting" ? <LoaderCircle className="size-5 animate-spin" /> : <Swords className="size-5" />}
            В бой
          </PixelButton>
          {phase === "error" && (
            <div className="-mx-4 mt-4">
              <ErrorNote message={error} />
            </div>
          )}
          {game && (
            <div className="mt-5">
              <p className="text-sm text-fg-2">{game.description}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-fg-3">
                <li>Обычная атака расходует успех по навыку; критическая — шестёрку и наносит больше урона.</li>
                <li>Защита снимает один обычный успех. Защита на 6 снимает два обычных или один критический.</li>
                <li>Риск добавляет куб, но единица на нём ранит атакующего. Ульта доступна один раз за попытку.</li>
                <li>Оба пула всегда видимы, все броски и выбор кубов делает сервер.</li>
              </ol>
              <p className={`mb-2 mt-5 text-sm uppercase tracking-widest text-fg-3 ${oswald}`}>Награды</p>
              <TierList game={game} />
            </div>
          )}
        </div>
      )}

      {inBattle && battle && (
        <div className="px-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-fg-3">Раунд {battle.round + 1}{battle.initiativeRoll !== null ? ` · D6 ${battle.initiativeRoll}` : ""}</span>
            <span className={`text-lg font-semibold text-accent ${oswald}`}>
              {battle.wins} {pluralWins(battle.wins)}
            </span>
          </div>

          <div className={stageFrame}>
            <BattleArena playerId={battle.player.sprite} enemyId={battle.opponent.sprite} event={arenaEvent} />
            {banner && (
              <p className={`absolute inset-x-3 top-2 rounded-lg bg-black/70 px-3 py-1.5 text-center text-sm uppercase tracking-wide text-accent ${oswald}`}>
                {banner}
              </p>
            )}
          </div>

          <div className="mt-3 flex gap-4">
            <FighterPanel fighter={battle.player} wounds={battle.playerWounds} align="left" />
            <FighterPanel fighter={battle.opponent} wounds={battle.opponentWounds} align="right" />
          </div>

          {/* кнопки боя — всегда здесь, между бойцами и ходом: не нужно листать вниз */}
          <div className="mt-4">
            {phase === "animating" ? (
              <PixelButton variant="dark" className="w-full" onClick={skipAnimation}>
                <FastForward className="size-5" /> Пропустить анимацию
              </PixelButton>
            ) : (
              <div className="space-y-2">
                <PixelButton className="w-full" onClick={() => act("attack")} disabled={phase === "sending" || !canNormal}>
                  {phase === "sending" ? <LoaderCircle className="size-5 animate-spin" /> : <Swords className="size-5" />}
                  {battle.wins > 0 && exchange?.opponentDefeated ? "Сражаться дальше" : "Атака · обычная"}
                </PixelButton>
                <div className="grid grid-cols-2 gap-2">
                  <PixelButton variant="dark" onClick={() => act("critical")} disabled={phase === "sending" || !canCritical}>
                    Критическая
                  </PixelButton>
                  <PixelButton variant="dark" onClick={() => act("defend")} disabled={phase === "sending" || !canDefend}>
                    Защита
                  </PixelButton>
                </div>
                <PixelButton variant="dark" className="w-full" onClick={() => act("risk")} disabled={phase === "sending" || !canDefend}>
                  Риск +1 куб
                </PixelButton>
                <PixelButton variant="dark" className="w-full" onClick={() => act("ult")} disabled={phase === "sending" || battle.usedUlt}>
                  {battle.usedUlt ? "Ульта использована" : "Ульта · 1 раз за попытку"}
                </PixelButton>
                {battle.wins > 0 && current ? (
                  <PixelButton variant="dark" className="w-full" onClick={() => act("stop")} disabled={phase === "sending"}>
                    <Flag className="size-5" /> Забрать: {current.label}
                    {battle.clutchWins > 0 ? " + бонус" : ""}
                  </PixelButton>
                ) : (
                  <button
                    type="button"
                    onClick={() => act("stop")}
                    disabled={phase === "sending"}
                    className="w-full text-center text-xs text-fg-3 underline underline-offset-4"
                  >
                    Отступить (без награды)
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="mt-2 text-center text-xs text-fg-3">
            {next ? `До «${next.label}»: ${next.minScore} ${pluralWins(next.minScore)}. ` : "Максимальная награда! "}
            При поражении награда за эту попытку сгорает.
          </p>

          {displayPools && (
            <div className="mt-4">
              <DicePoolPanel
                pools={displayPools}
                player={battle.player}
                opponent={battle.opponent}
                playerAction={phase === "animating" ? playerAction : null}
                enemyAction={phase === "animating" ? enemyAction : null}
              />
            </div>
          )}

        </div>
      )}
    </div>
  );
}
