import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { addToHomeScreen, checkHomeScreen } from "@/utils/telegramApp";
import { haptic } from "@/utils/haptic";

const KEY = "warphub:home-screen-hint-dismissed";

const dismissed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Подсказка «на главный экран» (15.11.2026): после второй записи, один раз, только если Telegram умеет
 * добавлять значок и он ещё не добавлен. «Не сейчас» скрывает подсказку на этом устройстве.
 */
export default function HomeScreenHint({ bookings }: { bookings: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (bookings < 2 || dismissed()) return;
    checkHomeScreen((status) => setShow(status === "missed" || status === "unknown"));
  }, [bookings]);

  if (!show) return null;

  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* без хранилища — просто скрываем до перезапуска */
    }
  };

  return (
    <section className="ds-enter flex items-center gap-3 rounded-[18px] border border-white/10 bg-app-elevated p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Smartphone className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-tight">WarpHub на главный экран</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-2">Открывайте запись одним нажатием</span>
      </span>
      <button
        type="button"
        onClick={() => (haptic.tap(), addToHomeScreen(), close())}
        className="ds-press min-h-10 shrink-0 rounded-xl bg-accent px-3 text-[13px] font-semibold text-accent-foreground"
      >
        Добавить
      </button>
      <button type="button" onClick={close} aria-label="Не сейчас" className="ds-hit flex size-8 shrink-0 items-center justify-center text-fg-3">
        <X className="size-4" />
      </button>
    </section>
  );
}
