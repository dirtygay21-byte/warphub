import { getMyPoints, getMyRewards, type MinigameKey } from "@/apiUtils/minigames";
import { RARITY_STYLE } from "./cards/rarity";
import { cardArt } from "./pixel/fantasy";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Gift, LoaderCircle, Sparkles, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ErrorNote, GameTopBar, RewardCodeCard, TierList } from "./common";
import { errorText, useMinigames, oswald } from "./helpers";
import { PixelSprite } from "./pixel/PixelSprite";
import { eggSprite } from "./eggScene";
import { fighterFrame, runnerFrame } from "./pixel/factions";
import type { Sprite } from "./pixel/pixel";

const ICONS: Record<MinigameKey, Sprite> = {
  runner: runnerFrame(0),
  dice: fighterFrame("iron_captain"),
  egg: eggSprite(3, 1),
  cards: cardArt("wild_ignarr"),
};

/** Цвет фракции в карточке игры */
const ACCENTS: Record<MinigameKey, string> = {
  runner: "from-[#506b31]/30",
  dice: "from-[#ecfe46]/15",
  egg: "from-[#a3186a]/30",
  cards: "from-[#f5c542]/20",
};

const FACTION_TAG: Record<MinigameKey, string> = {
  runner: "Ржавая Орда",
  dice: "Орден против Орды и Роя",
  egg: "Рой",
  cards: "Коллекционные карты · фэнтези",
};

export default function GamesHub() {
  const navigate = useNavigate();
  const games = useMinigames();
  const rewards = useQuery({ queryKey: ["minigames", "rewards"], queryFn: getMyRewards });
  const activeRewards = rewards.data?.filter((r) => r.status === "active") ?? [];
  const points = useQuery({ queryKey: ["minigames", "points"], queryFn: getMyPoints });

  return (
    <div className="pb-10 text-white">
      <GameTopBar
        title="Мини-игры"
        back="/profile"
        right={
          points.data ? (
            <span className="mr-2 inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-sm font-semibold text-accent">
              <Sparkles className="size-3.5" /> {points.data.balance.toLocaleString("ru-RU")}
            </span>
          ) : undefined
        }
      />

      <div className="px-4">
        <p className="text-sm text-white/60">
          Играйте и получайте скидки в клубе. За каждую игру — одна награда в неделю:
          засчитывается лучший результат недели.
        </p>

        <button
          type="button"
          onClick={() => navigate("/games/rewards")}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-accent/50 bg-accent/10 px-4 py-3 text-left shadow-[0_0_24px_rgb(236_254_70/0.1)]"
        >
          <Gift className="size-6 shrink-0 text-accent" />
          <div className="flex-1">
            <p className={`text-base uppercase tracking-wide text-accent ${oswald}`}>
              Мои награды
            </p>
            <p className="text-xs text-white/60">
              {rewards.isLoading
                ? "Загружаем…"
                : activeRewards.length
                  ? `Активных: ${activeRewards.length} — покажите код администратору`
                  : "Пока нет активных наград"}
            </p>
          </div>
          <ChevronRight className="size-5 text-accent" />
        </button>

        {games.isLoading && (
          <div className="flex justify-center py-16">
            <LoaderCircle className="size-8 animate-spin text-accent" />
          </div>
        )}
        {games.isError && (
          <div className="mt-6 -mx-4">
            <ErrorNote message={errorText(games.error)} onRetry={() => games.refetch()} />
          </div>
        )}

        <div className="mt-5 space-y-4">
          {games.data?.map((game) => (
            <section
              key={game.key}
              className={`overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${ACCENTS[game.key]} to-transparent bg-app-elevated`}
            >
              <button
                type="button"
                onClick={() => navigate(`/games/${game.key}`)}
                className="flex w-full items-center gap-4 p-4 text-left"
              >
                <div className="flex size-24 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black">
                  <PixelSprite sprite={ICONS[game.key]} scale={game.key === "egg" ? 1.5 : 2.5} title={game.title} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-white/40">{FACTION_TAG[game.key]}</p>
                  <h2 className={`text-xl font-medium uppercase leading-tight ${oswald}`}>
                    {game.title}
                  </h2>
                  <p className="mt-1 line-clamp-3 text-xs text-white/60">{game.description}</p>
                  {game.bestScore !== null && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-white/70">
                      <Trophy className="size-3.5 text-accent" /> Рекорд: {game.bestScore}{" "}
                      {game.key === "dice" ? "" : game.scoreUnit}
                    </p>
                  )}
                </div>
              </button>

              <div className="px-4 pb-4">
                {game.key === "cards" && game.cards ? (
                  <div className="grid grid-cols-5 gap-1.5">
                    {game.cards.rarities.map((r) => (
                      <div key={r.rarity} className="rounded-lg border border-white/10 bg-white/3 py-1.5 text-center">
                        <span className="mx-auto mb-1 block size-2 rotate-45" style={{ background: RARITY_STYLE[r.rarity].gem }} />
                        <p className="text-[11px] font-semibold text-white">{r.points}</p>
                        <p className="text-[8px] uppercase text-white/40">{r.label}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <TierList game={game} />
                )}
                {game.weekReward && (
                  <p className="mt-2 text-xs text-accent">
                    Награда этой недели: {game.weekReward.label}
                    {game.weekReward.status === "used" ? " (использована)" : ""}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/games/${game.key}`)}
                  className="mt-3 w-full rounded-xl bg-accent py-3 text-base font-semibold text-accent-foreground transition-transform active:scale-95"
                >
                  {game.key === "cards" ? "Открыть пакет" : "Играть"}
                </button>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MyRewards() {
  const rewards = useQuery({ queryKey: ["minigames", "rewards"], queryFn: getMyRewards });
  const points = useQuery({ queryKey: ["minigames", "points"], queryFn: getMyPoints });
  const order = { active: 0, used: 1, expired: 2 } as const;
  const sorted = [...(rewards.data ?? [])].sort(
    (a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="pb-10 text-white">
      <GameTopBar title="Мои награды" />
      <div className="px-4">
        {points.data && (
          <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 p-4">
            <p className="text-xs uppercase tracking-widest text-white/50">Очки на счёте</p>
            <p className={`text-4xl text-accent ${oswald}`}>{points.data.balance.toLocaleString("ru-RU")}</p>
            <p className="mt-1 text-xs text-white/55">
              Очки дают карты «Легенд Warp Hub». Администратор может списать их в счёт скидок и призов.
            </p>
            {points.data.history.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-white/60">
                {points.data.history.slice(0, 5).map((h) => (
                  <li key={h.id} className="flex justify-between gap-2">
                    <span className="truncate">{h.note ?? (h.delta > 0 ? "Начисление" : "Списание")}</span>
                    <span className={h.delta > 0 ? "text-accent" : "text-[#ff8a80]"}>
                      {h.delta > 0 ? "+" : ""}
                      {h.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mb-4 text-sm text-white/60">
          Покажите код администратору в клубе — он отметит награду как использованную.
          Код также приходит сообщением от бота.
        </p>
        {rewards.isLoading && (
          <div className="flex justify-center py-16">
            <LoaderCircle className="size-8 animate-spin text-accent" />
          </div>
        )}
        {rewards.isError && (
          <ErrorNote message={errorText(rewards.error)} onRetry={() => rewards.refetch()} />
        )}
        {rewards.data && sorted.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/50">
            Наград пока нет. Сыграйте в мини-игру — награда появится здесь.
          </p>
        )}
        <div className="space-y-3">
          {sorted.map((reward) => (
            <RewardCodeCard key={reward.id} reward={reward} />
          ))}
        </div>
      </div>
    </div>
  );
}
