import {
  OUTCOME_TEXT,
  REWARD_STATUS_LABELS,
  type FinishResult,
  type MinigameInfo,
  type Reward,
} from "@/apiUtils/minigames";
import { formatClub } from "@/utils/clubTime";
import clsx from "clsx";
import { Check, ChevronLeft, Copy, Gift, RotateCcw, Trophy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { oswald, pixelButton, pluralWins, tierRangeLabel } from "./helpers";


export function GameTopBar({
  title,
  back = "/games",
  right,
}: {
  title: string;
  back?: string;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 flex h-[56px] items-center gap-2 bg-app-bg/95 px-2 backdrop-blur">
      <button
        type="button"
        onClick={() => navigate(back)}
        className="flex size-10 items-center justify-center rounded-xl text-accent active:bg-white/10"
        aria-label="Назад"
      >
        <ChevronLeft className="size-6" />
      </button>
      <p className={`flex-1 truncate text-lg font-medium uppercase tracking-wide text-white ${oswald}`}>
        {title}
      </p>
      {right}
    </div>
  );
}


export function PixelButton({
  children,
  onClick,
  variant = "accent",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "accent" | "dark" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        pixelButton,
        variant === "accent" && "register-btn-glow bg-accent text-accent-foreground",
        variant === "dark" && "border border-white/10 bg-white/5 text-white active:bg-white/10",
        variant === "danger" && "bg-[#8e2430] text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TierList({
  game,
  highlightScore,
}: {
  game: MinigameInfo;
  highlightScore?: number;
}) {
  return (
    <ul className="space-y-1.5">
      {game.tiers.map((tier, index) => {
        const next = game.tiers[index + 1];
        const reached =
          highlightScore !== undefined &&
          highlightScore >= tier.minScore &&
          (!next || highlightScore < next.minScore);
        return (
          <li
            key={tier.minScore}
            className={clsx(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-xs",
              reached
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-white/10 bg-white/3 text-white/75",
            )}
          >
            <span>
              {tierRangeLabel(game, index)}
            </span>
            <span className="font-semibold text-white">{tier.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function RewardCodeCard({ reward }: { reward: Reward }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reward.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер обмена недоступен — код и так виден */
    }
  };
  const inactive = reward.status !== "active";

  return (
    <div
      className={clsx(
        "rounded-2xl border p-4",
        inactive ? "border-white/10 bg-app-elevated" : "border-accent/50 bg-accent/10 shadow-[0_0_24px_rgb(var(--color-accent)/0.12)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white/50">{reward.gameTitle}</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{reward.label}</p>
        </div>
        <span
          className={clsx(
            "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold",
            reward.status === "active" && "bg-accent text-accent-foreground",
            reward.status === "used" && "bg-white/15 text-white/70",
            reward.status === "expired" && "bg-[#b13e53]/30 text-[#ff9db0]",
          )}
        >
          {REWARD_STATUS_LABELS[reward.status]}
        </span>
      </div>

      <button
        type="button"
        onClick={copy}
        className={clsx(
          "mt-3 flex w-full items-center justify-between rounded-xl border border-dashed px-3 py-2.5 font-mono text-xl font-bold tracking-[0.2em]",
          inactive ? "border-white/20 text-white/40 line-through" : "border-accent/60 text-accent",
        )}
      >
        {reward.code}
        {copied ? <Check className="size-4" /> : <Copy className="size-4 opacity-70" />}
      </button>

      <p className="mt-2 text-xs text-white/55">
        {reward.status === "used" && reward.usedAt
          ? `Использована ${formatClub(reward.usedAt, { day: "numeric", month: "long" })}`
          : reward.status === "expired"
            ? "Срок действия истёк"
            : `Действует до ${formatClub(reward.expiresAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} · покажите код администратору`}
      </p>
    </div>
  );
}

export function ResultPanel({
  game,
  result,
  title,
  children,
  onAgain,
}: {
  game: MinigameInfo | undefined;
  result: FinishResult;
  title: string;
  children?: ReactNode;
  onAgain: () => void;
}) {
  const navigate = useNavigate();
  const nextTier = game?.tiers.find((tier) => tier.minScore > result.score);
  const showReward =
    result.reward &&
    (result.rewardOutcome === "new" ||
      result.rewardOutcome === "upgraded" ||
      result.rewardOutcome === "kept");

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-10">
      <div className="rounded-2xl border border-white/10 bg-app-elevated p-5 text-center">
        <p className={`text-sm uppercase tracking-widest text-white/50 ${oswald}`}>{title}</p>
        <p className={`mt-1 text-6xl font-semibold text-accent ${oswald}`}>
          {result.score}
          <span className="ml-2 text-base text-white/60">
            {game?.key === "dice" ? pluralWins(result.score) : game?.scoreUnit}
          </span>
        </p>
        {result.bestScore !== null && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/60">
            <Trophy className="size-3.5 text-accent" /> Лучший результат: {result.bestScore}
          </p>
        )}
        {children}
      </div>

      <div className="mt-4 space-y-3">
        {result.earnedLabel ? (
          <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm text-white">
            <Gift className="size-4 shrink-0 text-accent" />
            Результат тянет на: <b className="text-accent">{result.earnedLabel}</b>
          </div>
        ) : (
          <p className="rounded-xl border border-white/10 bg-white/3 px-3 py-2.5 text-sm text-white/70">
            {nextTier
              ? `Без награды. До «${nextTier.label}» нужно ${nextTier.minScore}${game?.key === "dice" ? ` ${pluralWins(nextTier.minScore)}` : ` ${game?.scoreUnit ?? ""}`}.`
              : "Без награды в этот раз."}
          </p>
        )}

        {OUTCOME_TEXT[result.rewardOutcome] && (
          <p
            className={clsx(
              "text-center text-sm font-semibold",
              result.rewardOutcome === "new" || result.rewardOutcome === "upgraded"
                ? "text-accent"
                : "text-white/70",
            )}
          >
            {OUTCOME_TEXT[result.rewardOutcome]}
          </p>
        )}

        {showReward && result.reward && <RewardCodeCard reward={result.reward} />}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <PixelButton onClick={onAgain}>
          <RotateCcw className="size-4" /> Ещё раз
        </PixelButton>
        <PixelButton variant="dark" onClick={() => navigate("/games")}>
          К играм
        </PixelButton>
      </div>
      <button
        type="button"
        onClick={() => navigate("/games/rewards")}
        className="mt-4 w-full text-center text-sm text-white/60 underline underline-offset-4"
      >
        Мои награды
      </button>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-4 rounded-xl border border-[#bf3a47]/60 bg-[#8e2430]/20 p-4 text-sm text-white">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold text-accent underline">
          Попробовать ещё раз
        </button>
      )}
    </div>
  );
}
