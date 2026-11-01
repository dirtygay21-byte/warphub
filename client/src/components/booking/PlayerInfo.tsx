import { experienceLabelOf, gameLabelOf, killTeamWithFaction, type SessionPlayer } from "@/apiUtils/booking";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { haptic } from "@/utils/haptic";
import { Check, Copy, UserRound } from "lucide-react";
import { useState } from "react";

/** Ник Telegram с кнопкой «Скопировать» (31.10.2026): чтобы написать сопернику насчёт игры. */
export function CopyNick({ username }: { username: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!username) return <span className="text-[13px] text-fg-3">ник не указан</span>;
  const nick = `@${username}`;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate text-[14px] font-medium text-accent">{nick}</span>
      <button
        type="button"
        aria-label={`Скопировать ник ${nick}`}
        onClick={async (event) => {
          event.stopPropagation();
          try {
            await navigator.clipboard.writeText(nick);
            setCopied(true);
            haptic.ok();
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            /* буфер обмена недоступен */
          }
        }}
        className="ds-press ds-hit relative flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-3 active:bg-white/[0.06]"
      >
        {copied ? <Check className="ds-pop size-4 text-accent" /> : <Copy className="size-4" />}
      </button>
    </span>
  );
}

/**
 * Игрок за столом: имя, ник (копируется), игра, армия / команда / варбанда, очки, опыт.
 * Один блок для открытых игр при записи и для «Мои записи».
 */
export function PlayerInfo({ player, note }: { player: SessionPlayer; note?: string }) {
  const options = useBookingOptions();
  const game = player.game ?? (player.army ? "40k" : null);
  const armyLabel = game === "kt" ? "Команда" : game === "warcry" ? "Варбанда" : "Армия";
  const army = game === "kt" && player.army ? killTeamWithFaction(options, player.army) : player.army;
  const experience = player.experienceLabel ?? (player.experienceLevel ? experienceLabelOf(options, player.experienceLevel) : null);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <UserRound className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate text-sm font-semibold">{player.firstName}</span>
        {note && <span className="shrink-0 text-[12px] text-fg-3">{note}</span>}
        <span className="ml-auto min-w-0">
          <CopyNick username={player.username} />
        </span>
      </div>
      {player.army && (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-fg-3">Игра</dt>
          <dd className="text-fg">{player.gameLabel ?? gameLabelOf(options, game)}</dd>
          <dt className="text-fg-3">{armyLabel}</dt>
          <dd className="text-fg">{army}</dd>
          {player.points != null && (
            <>
              <dt className="text-fg-3">Очки</dt>
              <dd className="text-fg">{player.points}</dd>
            </>
          )}
          {experience && (
            <>
              <dt className="text-fg-3">Опыт</dt>
              <dd className="text-fg">{experience}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
