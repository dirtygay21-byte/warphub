import { Send } from "lucide-react";

/**
 * Раздел только для входа через Telegram (U6, 30.10.2026): вне Telegram войти нечем — вместо бесконечной загрузки
 * объясняем, где открыть приложение.
 */
export default function TelegramOnly({ what }: { what: string }) {
  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-col items-center justify-center gap-4 px-6 text-center text-white">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Send className="size-7" />
      </span>
      <div className="space-y-1.5">
        <p className="text-lg font-semibold">Откройте WarpHub в Telegram</p>
        <p className="text-sm text-white/65">{what} доступны после входа через Telegram — откройте бота и нажмите «Открыть».</p>
      </div>
      <a
        href="https://t.me/WarpHubBot"
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
      >
        Открыть @WarpHubBot
      </a>
    </div>
  );
}
