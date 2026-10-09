import {
  diceAction,
  startMinigame,
  type AttackResult,
  type BattleView,
  type DiceExchange,
  type Fighter,
  type FinishResult,
  type MinigameInfo,
} from "@/apiUtils/minigames";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { FastForward, Flag, LoaderCircle, Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BattleArena, type ArenaEvent } from "./BattleArena";
import { ErrorNote, GameTopBar, PixelButton, ResultPanel, StickyActions, TierList } from "./common";
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

function Die({ value, state }: { value: number; state: "ok" | "fail" | "rolling" }) {
  return (
    <div
      className={clsx(
        "grid size-7 grid-cols-3 grid-rows-3 gap-[2px] rounded-md p-[4px] transition-colors",
        state === "ok" && "bg-accent shadow-[0_0_10px_rgb(236_254_70/0.55)]",
        state === "fail" && "border border-white/10 bg-white/5",
        state === "rolling" && "animate-[dice-tumble_0.35s_linear_infinite] bg-[#ebe2c8]",
      )}
      aria-label={`Кубик ${value}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={clsx(
            "rounded-[1px]",
            PIPS[value]?.includes(i) && (state === "fail" ? "bg-white/35" : "bg-[#111110]"),
          )}
        />
      ))}
    </div>
  );
}

const ok = (roll: number, target: number) => roll !== 1 && (roll === 6 || roll >= target);
const saved = (roll: number, target: number) => roll !== 1 && roll >= target;

// ---------------------------------------------------------------------------
// Разбор атаки по шагам: Попадание → Ранение → Спасбросок → Урон
// ---------------------------------------------------------------------------

function AttackSteps({
  title,
  attack,
  shown,
  attackerName,
  defenderName,
  faction,
}: {
  title: string;
  attack: AttackResult;
  shown: number;
  attackerName: string;
  defenderName: string;
  faction: Faction;
}) {
  const rows = [
    {
      label: `Попадание ${attack.hitTarget}+`,
      rolls: attack.hitRolls,
      good: (r: number) => ok(r, attack.hitTarget),
      summary: `${attack.hits} из ${attack.hitRolls.length}`,
    },
    {
      label: `Ранение ${attack.woundTarget}+`,
      rolls: attack.woundRolls,
      good: (r: number) => ok(r, attack.woundTarget),
      summary: `${attack.wounds} из ${attack.woundRolls.length}`,
    },
    {
      label:
        attack.saveTarget === null
          ? `Спасбросок: нет — броня пробита`
          : `Спасбросок ${attack.saveTarget}+ · ${defenderName}`,
      rolls: attack.saveRolls,
      good: (r: number) => attack.saveTarget === null || !saved(r, attack.saveTarget),
      summary: `не спасено ${attack.unsaved}`,
    },
  ];

  return (
    <div className={clsx("rounded-2xl border bg-app-elevated p-3", FACTION_BORDER[faction])}>
      <p className={`mb-2 text-sm uppercase tracking-wide text-white/70 ${oswald}`}>
        {title} · <span className="text-white">{attackerName}</span>
      </p>
      <div className="space-y-2">
        {rows.map((row, index) =>
          index < shown ? (
            <div key={row.label}>
              <div className="flex items-center justify-between text-[11px] text-white/55">
                <span>{row.label}</span>
                <span>{row.summary}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.rolls.length === 0 ? (
                  <span className="text-[11px] text-white/30">—</span>
                ) : (
                  row.rolls.map((roll, i) => (
                    <Die key={i} value={roll} state={row.good(roll) ? "ok" : "fail"} />
                  ))
                )}
              </div>
            </div>
          ) : index === shown ? (
            <div key={row.label} className="flex gap-1">
              {Array.from({ length: Math.max(1, Math.min(row.rolls.length, 6)) }, (_, i) => (
                <Die key={i} value={((i * 5 + shown) % 6) + 1} state="rolling" />
              ))}
            </div>
          ) : null,
        )}
        {shown >= 4 && (
          <p
            className={clsx(
              `pt-1 text-lg font-semibold ${oswald}`,
              attack.damage > 0 ? "text-[#ff5a4a]" : "text-white/40",
            )}
          >
            {attack.damage > 0 ? `Урон −${attack.damage}` : "Без урона"}
          </p>
        )}
      </div>
    </div>
  );
}

const FACTION_BORDER: Record<Faction, string> = {
  order: "border-accent/25",
  horde: "border-[#c97a3a]/30",
  swarm: "border-[#ff3d9a]/30",
};
const FACTION_TEXT: Record<Faction, string> = {
  order: "text-accent",
  horde: "text-[#e0954f]",
  swarm: "text-[#ff6fb3]",
};
const FACTION_PIP: Record<Faction, string> = {
  order: "bg-accent",
  horde: "bg-[#e0954f]",
  swarm: "bg-[#ff3d9a]",
};

function FighterPanel({ fighter, wounds, align }: { fighter: Fighter; wounds: number; align: "left" | "right" }) {
  const faction = fighterFaction(fighter.sprite);
  return (
    <div className={clsx("min-w-0 flex-1", align === "right" && "text-right")}>
      <p className={`truncate text-base font-medium uppercase leading-tight ${oswald}`}>{fighter.name}</p>
      <p className={clsx("text-[10px] uppercase tracking-wider", FACTION_TEXT[faction])}>{FACTION_LABELS[faction]}</p>
      <div className={clsx("mt-1.5 flex flex-wrap gap-[3px]", align === "right" && "justify-end")}>
        {Array.from({ length: Math.max(fighter.wounds, wounds) }, (_, i) => (
          <span key={i} className={clsx("h-2 w-3 rounded-[2px]", i < wounds ? FACTION_PIP[faction] : "bg-white/10")} />
        ))}
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-white/45">
        А{fighter.attacks} · П{fighter.skill}+ · С{fighter.strength} · Ст{fighter.toughness} · ПБ{fighter.ap} · У{fighter.damage} · Сп{fighter.save}+
      </p>
    </div>
  );
}

function rewardForWins(game: MinigameInfo | undefined, wins: number) {
  if (!game) return null;
  return [...game.tiers].reverse().find((t) => wins >= t.minScore) ?? null;
}

// ---------------------------------------------------------------------------

type Phase = "intro" | "starting" | "battle" | "animating" | "sending" | "result" | "error";

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

  const totalSteps = exchange ? 4 + (exchange.enemyAttack ? 4 : 0) : 0;

  // пошаговое раскрытие бросков + анимации на арене
  useEffect(() => {
    if (phase !== "animating" || !exchange) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const pa = exchange.playerAttack;
    const ea = exchange.enemyAttack;

    later(() => {
      if (step === 0) emit("pa", { type: "attack", side: "player" });
      if (step === 4) emit("ph", pa.damage > 0 ? { type: "hurt", side: "enemy", damage: pa.damage } : { type: "miss", side: "enemy" });
      if (ea && step === 5) emit("ea", { type: "attack", side: "enemy" });

      if (step < totalSteps) {
        later(() => setStep((s) => s + 1), 430);
        return;
      }
      if (ea) emit("eh", ea.damage > 0 ? { type: "hurt", side: "player", damage: ea.damage } : { type: "miss", side: "player" });
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
      setSessionId(session.sessionId);
      setBattle(session.battle);
      setPhase("battle");
    } catch (e) {
      setError(errorText(e));
      setPhase("error");
    }
  };

  const act = async (action: "roll" | "stop") => {
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
            <p className="mt-3 text-xs text-white/60">
              {battle.player.name} · раундов: {battle.round}
              {battle.clutchWins > 0 ? ` · побед на последнем издыхании: ${battle.clutchWins}` : ""}
            </p>
          )}
        </ResultPanel>
      </div>
    );
  }

  const inBattle = battle && (phase === "battle" || phase === "animating" || phase === "sending");
  const playerAttack = exchange?.playerAttack;
  const enemyAttack = exchange?.enemyAttack;

  return (
    <div className="min-h-full pb-10 text-white" onClick={skipAnimation}>
      <GameTopBar title={game?.title ?? "Кости войны"} />

      {!inBattle && (
        <div className="px-4">
          <StickyActions>
            <PixelButton className="w-full" onClick={start} disabled={phase === "starting"}>
              {phase === "starting" ? <LoaderCircle className="size-5 animate-spin" /> : <Swords className="size-5" />}
              В бой
            </PixelButton>
          </StickyActions>
          <div className={stageFrame}>
            <BattleArena playerId="iron_captain" enemyId="hive_reaper" event={null} />
          </div>
          {phase === "error" && (
            <div className="-mx-4 mt-4">
              <ErrorNote message={error} />
            </div>
          )}
          {game && (
            <div className="mt-5">
              <p className="text-sm text-white/70">{game.description}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-white/55">
                <li>Попадание: каждая атака — кубик, нужен навык бойца или больше.</li>
                <li>Ранение: сила против стойкости определяет нужное значение.</li>
                <li>Спасбросок: враг защищается бронёй; пробитие её ухудшает.</li>
                <li>Урон: каждое неспасённое ранение снимает раны.</li>
              </ol>
              <p className="mt-2 text-xs text-white/55">
                Единица — всегда промах, шестёрка — всегда успех. Все броски делает сервер.
              </p>
              <p className={`mb-2 mt-5 text-sm uppercase tracking-widest text-white/50 ${oswald}`}>Награды</p>
              <TierList game={game} />
            </div>
          )}
        </div>
      )}

      {inBattle && battle && (
        <div className="px-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-white/50">Раунд {battle.round + 1}</span>
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
                <PixelButton className="w-full" onClick={() => act("roll")} disabled={phase === "sending"}>
                  {phase === "sending" ? <LoaderCircle className="size-5 animate-spin" /> : <Swords className="size-5" />}
                  {battle.wins > 0 && exchange?.opponentDefeated ? "Сражаться дальше" : "Атаковать"}
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
                    className="w-full text-center text-xs text-white/45 underline underline-offset-4"
                  >
                    Отступить (без награды)
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="mt-2 text-center text-xs text-white/45">
            {next ? `До «${next.label}»: ${next.minScore} ${pluralWins(next.minScore)}. ` : "Максимальная награда! "}
            При поражении награда за эту попытку сгорает.
          </p>

          {exchange && playerAttack && (
            <div className="mt-4 space-y-2">
              <AttackSteps
                title="Ваш ход"
                attack={playerAttack}
                shown={phase === "animating" ? Math.min(step, 4) : 4}
                attackerName={battle.player.name}
                defenderName="враг"
                faction={fighterFaction(battle.player.sprite)}
              />
              {enemyAttack && (phase !== "animating" || step > 4) && (
                <AttackSteps
                  title="Ответ врага"
                  attack={enemyAttack}
                  shown={phase === "animating" ? Math.min(step - 4, 4) : 4}
                  attackerName={exchange.opponentDefeated ? "враг" : battle.opponent.name}
                  defenderName={battle.player.name}
                  faction={fighterFaction(enemyAttack.attacker)}
                />
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
