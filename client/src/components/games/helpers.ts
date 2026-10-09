import { getMinigames, type MinigameInfo, type MinigameKey } from "@/apiUtils/minigames";
import { useQuery } from "@tanstack/react-query";

export const useMinigames = () =>
  useQuery({ queryKey: ["minigames"], queryFn: getMinigames });

export const useGameInfo = (key: MinigameKey): MinigameInfo | undefined =>
  useMinigames().data?.find((game) => game.key === key);

export const pluralWins = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "победа";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "победы";
  return "побед";
};

export function tierRangeLabel(game: MinigameInfo, index: number) {
  const tier = game.tiers[index]!;
  const next = game.tiers[index + 1];
  if (game.key === "dice") {
    return next && next.minScore - 1 > tier.minScore
      ? `${tier.minScore}–${next.minScore - 1} ${pluralWins(next.minScore - 1)}`
      : next
        ? `${tier.minScore} ${pluralWins(tier.minScore)}`
        : `${tier.minScore}+ ${pluralWins(tier.minScore)}`;
  }
  return next
    ? `${tier.minScore}–${next.minScore - 1} ${game.scoreUnit}`
    : `${tier.minScore}+ ${game.scoreUnit}`;
}

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Что-то пошло не так";

/** Заголовки как в остальном приложении */
export const oswald = "[font-family:var(--font-oswald)]";

export const pixelButton =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-semibold transition-transform active:scale-95 disabled:opacity-50";

/** Рамка игрового экрана: тёмный «экран» с лаймовым свечением WarpHub */
export const stageFrame =
  "relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_0_0_1px_rgb(var(--color-accent)/0.08),0_12px_40px_rgba(0,0,0,0.5)]";
