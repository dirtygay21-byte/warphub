import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyUserId({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-1 flex items-center gap-1.5 text-xs text-fg-3">
      <span>{userId.slice(0, 8)}…</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Скопировать UUID пользователя"
        className="-m-2 rounded-lg p-3 text-fg-3 transition-colors hover:bg-white/10 hover:text-white/80"
      >
        {copied ? (
          <Check className="size-3.5 text-accent" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}
