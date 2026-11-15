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
import { useTelegramBack } from "@/hooks/useTelegramBack";
import { haptic } from "@/utils/haptic";
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
  // «Назад» Telegram — туда же, куда стрелка в шапке (U1)
  useTelegramBack(() => navigate(back));
  return (
    <div className="sticky top-0 z-20 flex h-[60px] items-center gap-3 bg-app/95 px-4 backdrop-blur">
      <button
        type="button"
        onClick={() => {
          haptic.tap();
          navigate(back);
        }}
        className="ds-press flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] bg-app-elevated text-fg"
        aria-label="Назад"
      >
        <ChevronLeft className="size-5" />
      </button>
      <p className="font-display min-w-0 flex-1 truncate text-xl font-semibold uppercase leading-none text-fg">
        {title}
      </p>
      {right}
    </div>
  );
}


/**
 * Кнопки действия, закреплённые сверху под заголовком игры: видны при любой прокрутке,
 * чтобы не листать вниз ради «Играть» / «Атаковать».
 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-[60px] z-10 -mx-4 mb-3 border-b border-white/10 bg-app/95 px-4 py-2.5 backdrop-blur">
      {children}
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
              "flex items-center justify-between rounded-lg border px-3 py-2 text-[13px]",
              reached
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-white/10 bg-white/3 text-fg-2",
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

/** Уровни наград одной строкой, листается пальцем (C4: в списке игр уровни не занимают 3–4 строки). */
export function TierStrip({ game }: { game: MinigameInfo }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
      {game.tiers.map((tier, index) => (
        <span
          key={tier.minScore}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[13px] text-fg-2"
        >
          {tierRangeLabel(game, index)}
          <span className="font-semibold text-fg">{tier.label}</span>
        </span>
      ))}
    </div>
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
          <p className="text-xs text-fg-3">{reward.gameTitle}</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{reward.label}</p>
        </div>
        <span
          className={clsx(
            "shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold",
            reward.status === "active" && "bg-accent text-accent-foreground",
            reward.status === "used" && "bg-white/15 text-fg-2",
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
          inactive ? "border-white/20 text-fg-3 line-through" : "border-accent/60 text-accent",
        )}
      >
        {reward.code}
        {copied ? <Check className="size-4" /> : <Copy className="size-4 opacity-70" />}
      </button>

      <p className="mt-2 text-xs text-fg-3">
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
  actionsOnTop = false,
}: {
  game: MinigameInfo | undefined;
  result: FinishResult;
  title: string;
  children?: ReactNode;
  onAgain: () => void;
  /** кнопки «Ещё раз» / «К играм» закреплены сверху, а не внизу экрана */
  actionsOnTop?: boolean;
}) {
  const navigate = useNavigate();
  const nextTier = game?.tiers.find((tier) => tier.minScore > result.score);
  const showReward =
    result.reward &&
    (result.rewardOutcome === "new" ||
      result.rewardOutcome === "upgraded" ||
      result.rewardOutcome === "kept");

  const actions = (
    <div className="grid grid-cols-2 gap-3">
      <PixelButton onClick={onAgain}>
        <RotateCcw className="size-4" /> Ещё раз
      </PixelButton>
      <PixelButton variant="dark" onClick={() => navigate("/games")}>
        К играм
      </PixelButton>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-10">
      {actionsOnTop && <StickyActions>{actions}</StickyActions>}
      <div className="rounded-2xl border border-white/10 bg-app-elevated p-5 text-center">
        <p className={`text-sm uppercase tracking-widest text-fg-3 ${oswald}`}>{title}</p>
        <p className={`mt-1 text-6xl font-semibold text-accent ${oswald}`}>
          {result.score}
          <span className="ml-2 text-base text-fg-2">
            {game?.key === "dice" ? pluralWins(result.score) : game?.scoreUnit}
          </span>
        </p>
        {result.bestScore !== null && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-fg-2">
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
          <p className="rounded-xl border border-white/10 bg-white/3 px-3 py-2.5 text-sm text-fg-2">
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
                : "text-fg-2",
            )}
          >
            {OUTCOME_TEXT[result.rewardOutcome]}
          </p>
        )}

        {showReward && result.reward && <RewardCodeCard reward={result.reward} />}
      </div>

      {!actionsOnTop && <div className="mt-6">{actions}</div>}
      <button
        type="button"
        onClick={() => navigate("/games/rewards")}
        className="mt-4 w-full text-center text-sm text-fg-2 underline underline-offset-4"
      >
        Мои награды
      </button>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-4 rounded-[14px] border border-danger/50 bg-danger/10 p-4 text-sm text-fg">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold text-accent underline">
          Попробовать ещё раз
        </button>
      )}
    </div>
  );
}
