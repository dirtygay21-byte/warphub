import { getMyPoints, getMyRewards, type MinigameKey } from "@/apiUtils/minigames";
import { RARITY_STYLE } from "./cards/rarity";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Gift, Sparkles, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ErrorNote, GameTopBar, RewardCodeCard, TierStrip } from "./common";
import { DsButton, LimeHero, Skeleton } from "@/components/ui/ds";
import { errorText, useMinigames, oswald } from "./helpers";
import { PixelSprite } from "./pixel/PixelSprite";
import { eggSprite } from "./eggScene";

const PREVIEW: Record<MinigameKey, { src: string | null; tag: string }> = {
  runner: { src: "/games/ork-runner.png", tag: "Орки · Warhammer 40,000" },
  dice: { src: "/games/fighters/iron_captain.png", tag: "Империум · Ксеносы · Хаос" },
  egg: { src: null, tag: "Тираниды · Warhammer 40,000" },
  cards: { src: "/games/aos/wild_ignarr.png", tag: "Age of Sigmar · 261 карта" },
};

/** Цвет фракции в карточке игры */
const ACCENTS: Record<MinigameKey, string> = {
  runner: "from-[#506b31]/30",
  dice: "from-[#ecfe46]/15",
  egg: "from-[#a3186a]/30",
  cards: "from-[#f5c542]/20",
};

export default function GamesHub() {
  const navigate = useNavigate();
  const games = useMinigames();
  const rewards = useQuery({ queryKey: ["minigames", "rewards"], queryFn: getMyRewards });
  const activeRewards = rewards.data?.filter((r) => r.status === "active") ?? [];
  const points = useQuery({ queryKey: ["minigames", "points"], queryFn: getMyPoints });

  return (
    <div className="pb-10 text-fg">
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
        {/* лаймовый концепт (15.11.2026): описание наград — лаймовым блоком с червяками */}
        <LimeHero kicker="Награды" title="Играйте — получайте скидки" size="sm">
          <p className="text-[14px] leading-snug">
            Лучший результат недели даёт награду, а за каждые 25 000 накопленных очков карт — одноразовый промокод 25%.
          </p>
        </LimeHero>

        <button
          type="button"
          onClick={() => navigate("/games/rewards")}
          className="ds-press mt-4 flex min-h-16 w-full items-center gap-3 rounded-[18px] border border-accent/50 bg-accent/10 px-4 py-3 text-left"
        >
          <Gift className="size-6 shrink-0 text-accent" />
          <div className="flex-1">
            <p className={`text-base uppercase tracking-wide text-accent ${oswald}`}>
              Мои награды
            </p>
            <p className="text-[13px] text-fg-2">
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
          <div className="mt-5 space-y-4" aria-busy="true" aria-label="Загружаем игры">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[150px] rounded-[18px]" />
            ))}
          </div>
        )}
        {games.isError && (
          <div className="mt-6 -mx-4">
            <ErrorNote message={errorText(games.error)} onRetry={() => games.refetch()} />
          </div>
        )}

        <div className="ds-stagger mt-5 space-y-4">
          {games.data?.map((game) => (
            <section
              key={game.key}
              className={`ds-enter overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-br ${ACCENTS[game.key]} to-transparent bg-app-elevated`}
            >
              <button
                type="button"
                onClick={() => navigate(`/games/${game.key}`)}
                className="ds-press flex w-full items-center gap-4 p-4 text-left"
              >
                <div className="flex size-20 shrink-0 items-center justify-center">
                  {game.key === "egg" ? (
                    <PixelSprite sprite={eggSprite(3, 1)} scale={1.5} title={game.title} />
                  ) : (
                    <img src={PREVIEW[game.key].src!} alt={game.title} className="size-full object-contain [image-rendering:pixelated]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] uppercase tracking-wider text-fg-3">{PREVIEW[game.key].tag}</p>
                  <h2 className={`text-xl font-medium uppercase leading-tight ${oswald}`}>
                    {game.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-fg-2">{game.description}</p>
                  {game.bestScore !== null && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-fg-2">
                      <Trophy className="size-3.5 text-accent" /> Рекорд: {game.bestScore}{" "}
                      {game.key === "dice" ? "" : game.scoreUnit}
                    </p>
                  )}
                </div>
              </button>

              <div className="px-4 pb-4">
                {game.key === "cards" && game.cards ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {game.cards.rarities.map((r) => (
                      <div key={r.rarity} className="rounded-lg border border-white/10 bg-white/3 py-1.5 text-center">
                        <span className="mx-auto mb-1 block size-2 rotate-45" style={{ background: RARITY_STYLE[r.rarity].gem }} />
                        <p className="text-[12px] font-semibold text-white">{r.points}</p>
                        <p className="text-[12px] text-fg-3">{r.label}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <TierStrip game={game} />
                )}
                {game.weekReward && (
                  <p className="mt-2 text-[13px] text-accent">
                    Награда этой недели: {game.weekReward.label}
                    {game.weekReward.status === "used" ? " (использована)" : ""}
                  </p>
                )}
                <DsButton variant="primary" onClick={() => navigate(`/games/${game.key}`)} className="mt-3 w-full">
                  {game.key === "cards" ? "Открыть пакет" : "Играть"}
                </DsButton>
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
            <p className="text-xs uppercase tracking-widest text-fg-3">Очки на счёте</p>
            <p className={`text-4xl text-accent ${oswald}`}>{points.data.balance.toLocaleString("ru-RU")}</p>
            <p className="mt-1 text-xs text-fg-3">
              Очки начисляются за карты «Легенд Warp Hub». За каждые 25 000 накопленных очков выдаётся одноразовый промокод 25% на счёт записи.
            </p>
            {points.data.history.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-fg-2">
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
        <p className="mb-4 text-sm text-fg-2">
          Покажите код администратору в клубе — он отметит награду как использованную.
          Код также приходит сообщением от бота.
        </p>
        {rewards.isLoading && (
          <div className="space-y-3" aria-busy="true" aria-label="Загружаем награды">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[92px] rounded-2xl" />
            ))}
          </div>
        )}
        {rewards.isError && (
          <ErrorNote message={errorText(rewards.error)} onRetry={() => rewards.refetch()} />
        )}
        {rewards.data && sorted.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-fg-3">
            Наград пока нет. Сыграйте в мини-игру — награда появится здесь.
          </p>
        )}
        <div className="ds-stagger space-y-3">
          {sorted.map((reward) => (
            <RewardCodeCard key={reward.id} reward={reward} />
          ))}
        </div>
      </div>
    </div>
  );
}
