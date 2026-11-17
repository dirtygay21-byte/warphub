import { redeemRosterCode } from "@/apiUtils/roster";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { KeyRound, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDialogExit } from "@/components/ui/ds/useDialogExit";
import { BOOSTY_GENERAL_URL, openBoostySubscription } from "@/components/booking/boosty";

const LENGTH = 4;

/** Ввод 4-значного кода доступа к Roster Builder. */
export function AccessCodeDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const redeem = useMutation({
    mutationFn: redeemRosterCode,
    onSuccess: async () => {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      await queryClient.invalidateQueries({ queryKey: ["roster-access"] });
      onSuccess();
    },
    onError: () => {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
      setCode("");
      inputRef.current?.focus();
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (value: string) => {
    if (value.length === LENGTH && !redeem.isPending) redeem.mutate(value);
  };

  const leaving = useDialogExit();

  return (
    <div
      className={`ds-fade fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 px-4 pb-24 pt-6${leaving ? " ds-leaving" : ""}`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-code-title"
        className="ds-sheet w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-app-elevated px-5 pb-5 pt-6 text-center shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <KeyRound className="size-6" />
        </div>
        <h2 id="access-code-title" className="text-lg font-semibold">
          Код доступа
        </h2>
        <p className="mt-1 text-sm text-fg-2">
          Введите 4 цифры, которые вам передал администратор клуба.
        </p>
        {/* подписчики Boosty (17.11.2026): доступ открывается сам после вступления в группу подписчиков */}
        <p className="mt-2 text-xs text-fg-3">
          Подписчикам клуба на{" "}
          <button type="button" onClick={() => openBoostySubscription(BOOSTY_GENERAL_URL)} className="font-semibold text-fg-2 underline">
            Boosty
          </button>{" "}
          код не нужен: WarpBuilder откроется сам после вступления в группу подписчиков.
        </p>

        <label className="relative mx-auto mt-5 flex w-fit gap-2.5">
          {Array.from({ length: LENGTH }, (_, i) => (
            <span
              key={i}
              className={clsx(
                "flex h-14 w-12 items-center justify-center rounded-xl border text-2xl font-semibold tabular-nums transition-colors",
                redeem.isError
                  ? "border-red-400/50 bg-red-400/10"
                  : i === code.length
                    ? "border-accent bg-accent/10"
                    : "border-white/10 bg-white/5",
              )}
            >
              {code[i] ?? ""}
            </span>
          ))}
          <input
            ref={inputRef}
            value={code}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, "").slice(0, LENGTH);
              setCode(value);
              if (redeem.isError) redeem.reset();
              submit(value);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Код доступа"
            className="absolute inset-0 h-full w-full cursor-text opacity-0"
            maxLength={LENGTH}
            readOnly={redeem.isPending}
          />
        </label>

        <div className="mb-3 mt-4 min-h-10 text-sm">
          {redeem.isPending ? (
            <LoaderCircle className="mx-auto size-5 animate-spin text-accent" />
          ) : redeem.isError ? (
            <p className="text-red-300">{redeem.error.message}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm font-semibold text-white/80 transition-colors active:bg-white/10"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
