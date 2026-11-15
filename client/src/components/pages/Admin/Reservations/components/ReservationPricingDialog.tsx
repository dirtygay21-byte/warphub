import {
  addAdminReservationDiscount,
  addAdminReservationPayment,
  applyAdminReservationReward,
  applyAdminTrainingGame,
  BILLING_MODE_LABELS,
  getAdminReservationPricing,
  PAYMENT_METHOD_LABELS,
  removeAdminReservationDiscount,
  type PaymentMethod,
  type ReservationPricing,
} from "@/apiUtils/pricing";
import { useDialogExit } from "@/components/ui/ds/useDialogExit";
import { formatClub } from "@/utils/clubTime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Gift, GraduationCap, LoaderCircle, Plus, ReceiptRussianRuble, Trash2, WalletCards, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminReservationRow } from "../types";

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

const STATUS_LABELS: Record<ReservationPricing["status"], string> = {
  free: "Бесплатно",
  unpaid: "Не оплачено",
  partial: "Частично",
  paid: "Оплачено",
};

const STATUS_STYLES: Record<ReservationPricing["status"], string> = {
  free: "bg-blue-400/15 text-blue-200",
  unpaid: "bg-red-400/15 text-red-200",
  partial: "bg-yellow-400/15 text-yellow-200",
  paid: "bg-green-400/15 text-green-200",
};

const DISCOUNT_KIND_LABELS = {
  training: "Обучающие игры",
  membership: "Членство",
  reward: "Мини‑игра",
  manual: "Ручная скидка",
} as const;

const PRICE_VARIANT_LABELS = {
  standard: "Стандартный тариф",
  own_materials: "Со своими красками",
  club_materials: "С красками клуба",
} as const;

const WH_SERVICE_SLUGS = new Set(["wh_game", "wh_group_training", "wh_solo_training"]);

const fieldBase =
  "min-h-11 rounded-xl border border-white/10 bg-field px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-accent/60";
const fieldClass = `mt-1.5 w-full ${fieldBase}`;

/** Число из поля: запятая как разделитель (клавиатура Telegram), пробелы убираются. */
const parseAmount = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."));

type PricingAction =
  | { type: "discount" }
  | { type: "reward" }
  | { type: "training" }
  | { type: "payment" }
  | { type: "remove"; discountId: string };

export function ReservationPricingDialog({
  reservation,
  onClose,
}: {
  reservation: AdminReservationRow;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["admin-reservation-pricing", reservation.id];
  const query = useQuery({
    queryKey,
    queryFn: () => getAdminReservationPricing(reservation.id),
  });
  const [discountKind, setDiscountKind] = useState<"membership" | "manual">("membership");
  const [discountUnit, setDiscountUnit] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [discountNote, setDiscountNote] = useState("Членство в клубе");
  const [rewardCode, setRewardCode] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentNote, setPaymentNote] = useState("");

  const mutation = useMutation({
    meta: { success: "Счёт обновлён" },
    mutationFn: async (action: PricingAction) => {
      if (action.type === "discount") {
        const value = parseAmount(discountValue);
        return addAdminReservationDiscount(reservation.id, {
          kind: discountKind,
          note: discountNote.trim(),
          ...(discountUnit === "percent" ? { percent: value } : { amount: value }),
        });
      }
      if (action.type === "reward") return applyAdminReservationReward(reservation.id, rewardCode.trim());
      if (action.type === "training") return applyAdminTrainingGame(reservation.id);
      if (action.type === "payment") {
        return addAdminReservationPayment(reservation.id, {
          amount: paymentValue,
          method: paymentMethod,
          note: paymentNote.trim() || undefined,
        });
      }
      return removeAdminReservationDiscount(action.discountId);
    },
    onSuccess: (data, action) => {
      queryClient.setQueryData(queryKey, data);
      if (action.type === "reward") setRewardCode("");
      if (action.type === "payment") {
        setPaymentAmount("");
        setPaymentNote("");
      }
      if (action.type === "discount" && discountKind === "manual") setDiscountNote("");
      queryClient.invalidateQueries({ queryKey: ["admin-reservations"] });
    },
  });

  const leaving = useDialogExit();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const pendingRef = useRef(mutation.isPending);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { pendingRef.current = mutation.isPending; }, [mutation.isPending]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex='0']";
    dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) onCloseRef.current();
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  const pricing = query.data;
  const numericDiscount = parseAmount(discountValue);
  const discountInvalid =
    !discountNote.trim() ||
    !Number.isFinite(numericDiscount) ||
    numericDiscount < 0 ||
    (discountUnit === "percent" && numericDiscount > 100);
  // пустое поле — весь остаток (раньше кнопка была неактивной: остаток виден только как подсказка в поле)
  const paymentValue = paymentAmount.trim() === "" ? (pricing?.remainingAmount ?? 0) : parseAmount(paymentAmount);
  const paymentInvalid =
    !Number.isFinite(paymentValue) ||
    paymentValue <= 0 ||
    (pricing != null && paymentValue > pricing.remainingAmount + 0.0001);

  const submitDiscount = (event: FormEvent) => {
    event.preventDefault();
    if (!discountInvalid) mutation.mutate({ type: "discount" });
  };
  const submitReward = (event: FormEvent) => {
    event.preventDefault();
    if (rewardCode.trim()) mutation.mutate({ type: "reward" });
  };
  const submitPayment = (event: FormEvent) => {
    event.preventDefault();
    if (!paymentInvalid) mutation.mutate({ type: "payment" });
  };

  return (
    <div
      className={`ds-fade fixed inset-0 z-50 flex items-end justify-center bg-overlay/70 px-3 pb-4 pt-6 sm:items-center sm:px-4 sm:pb-8${leaving ? " ds-leaving" : ""}`}
      onClick={() => { if (!mutation.isPending) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-dialog-title"
        className="ds-sheet flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-app-elevated text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 id="pricing-dialog-title" className="text-xl font-semibold">Счёт и оплата</h2>
            <p className="mt-1 truncate text-sm text-fg-2">{reservation.userLabel} · {reservation.serviceTitle}</p>
            <p className="mt-0.5 text-xs text-fg-3">{reservation.timeRange} · гостей: {reservation.partySize}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            aria-label="Закрыть счёт"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-fg-2 transition-colors hover:text-white disabled:opacity-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {query.isLoading && (
            <div className="flex justify-center py-16"><LoaderCircle className="size-8 animate-spin text-accent" /></div>
          )}
          {query.isError && (
            <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
              {query.error.message}
              <button type="button" onClick={() => query.refetch()} className="mt-3 block min-h-11 font-semibold text-white underline">Повторить</button>
            </div>
          )}

          {pricing && (
            <>
              <section aria-label="Сумма счёта">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-fg-2">
                    {BILLING_MODE_LABELS[pricing.billingMode]}
                    {pricing.priceVariant !== "standard" ? ` · ${PRICE_VARIANT_LABELS[pricing.priceVariant]}` : ""}
                    {` · ${money.format(pricing.unitPrice)}`}
                  </p>
                  <span className={clsx("rounded-lg px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[pricing.status])}>
                    {STATUS_LABELS[pricing.status]}
                  </span>
                </div>
                {pricing.armyRentalPoints > 0 && (
                  <p className="mb-3 rounded-xl bg-accent/5 px-3 py-2 text-xs leading-5 text-fg-2">
                    Аренда армии клуба (Kill Team и Warcry — как 1000 очков): {pricing.armyRentalPoints} очков × {money.format(pricing.armyRentalPricePer1000)} / 1000 = {money.format(pricing.armyRentalAmount)}
                  </p>
                )}
                {pricing.billingMode === "per_table" && pricing.baseAmount < pricing.unitPrice && (
                  <p className="mb-3 rounded-xl bg-accent/5 px-3 py-2 text-xs leading-5 text-fg-2">
                    Стол делится между игроками: доля этой записи {money.format(pricing.baseAmount)} из {money.format(pricing.unitPrice)}.
                  </p>
                )}
                {(pricing.overpaidAmount ?? 0) > 0 && (
                  <p className="mb-3 rounded-xl bg-yellow-400/10 px-3 py-2 text-xs leading-5 text-yellow-200">
                    Переплата {money.format(pricing.overpaidAmount ?? 0)}: сумма счёта уменьшилась после оплаты (например, к столу присоединился второй игрок). Верните разницу игроку.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Услуга", value: pricing.baseAmount },
                    ...(pricing.armyRentalPoints > 0 ? [{ label: `Аренда · ${pricing.armyRentalPoints} оч.`, value: pricing.armyRentalAmount }] : []),
                    { label: "Итого", value: pricing.totalAmount },
                    { label: "Оплачено", value: pricing.paidAmount },
                    { label: "Остаток", value: pricing.remainingAmount, highlight: true },
                  ].map((item) => (
                    <div key={item.label} className={clsx("rounded-xl bg-field p-3", item.highlight && "bg-accent/10")}>
                      <p className="text-xs text-fg-3">{item.label}</p>
                      <p className={clsx("mt-1 text-lg font-semibold", item.highlight ? "text-accent" : "text-white")}>
                        {money.format(item.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {WH_SERVICE_SLUGS.has(pricing.serviceSlug) && (
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">Обучающие игры</h3>
                    <p className="mt-1 text-xs leading-5 text-fg-2">
                      Скидка 50% на выбранную запись. Осталось {pricing.trainingGamesRemaining} из 3 на игрока.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => mutation.mutate({ type: "training" })}
                    disabled={mutation.isPending || pricing.trainingGamesRemaining === 0 || pricing.discounts.some((discount) => discount.kind === "training")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
                  >
                    <GraduationCap className="size-4" />
                    {pricing.discounts.some((discount) => discount.kind === "training") ? "Скидка применена" : "Применить 50%"}
                  </button>
                </section>
              )}

              <section className="overflow-hidden rounded-xl border border-white/10" aria-label="Применённые скидки">
                <div className="border-b border-white/10 bg-white/3 px-4 py-3">
                  <h3 className="text-sm font-semibold">Скидки ({pricing.discounts.length})</h3>
                </div>
                {pricing.discounts.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-fg-3">Скидок пока нет.</p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {pricing.discounts.map((discount) => (
                      <div key={discount.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-white/90">
                            {discount.percent != null ? `−${discount.percent}%` : `−${money.format(discount.amount ?? 0)}`}
                            <span className="ml-2 text-xs font-normal text-fg-3">{DISCOUNT_KIND_LABELS[discount.kind]}</span>
                          </p>
                          <p className="mt-0.5 text-fg-2">{discount.note}</p>
                          <p className="mt-0.5 text-xs text-fg-3">
                            {formatClub(discount.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            {discount.kind === "reward" ? " · использованный код не восстанавливается" : ""}
                          </p>
                        </div>
                        {discount.kind !== "reward" && (
                          <button
                            type="button"
                            onClick={() => mutation.mutate({ type: "remove", discountId: discount.id })}
                            disabled={mutation.isPending}
                            aria-label={`Удалить скидку: ${discount.note}`}
                            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-red-400/10 hover:text-red-200 disabled:opacity-40"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <details className="group rounded-xl border border-white/10 bg-field">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-white/90 focus-visible:outline-2 focus-visible:outline-accent">
                  <Plus className="size-4 text-accent" /> Добавить скидку
                </summary>
                <form onSubmit={submitDiscount} className="space-y-3 border-t border-white/10 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-fg-2">
                      Тип
                      <select
                        value={discountKind}
                        onChange={(event) => {
                          const kind = event.target.value as "membership" | "manual";
                          setDiscountKind(kind);
                          setDiscountNote(kind === "membership" ? "Членство в клубе" : "");
                        }}
                        className={fieldClass}
                      >
                        <option value="membership">Членство в клубе</option>
                        <option value="manual">Ручная скидка</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium text-fg-2">
                      Размер
                      <span className="mt-1.5 flex gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={discountValue}
                          onChange={(event) => setDiscountValue(event.target.value)}
                          className={clsx(fieldBase, "min-w-0 flex-1")}
                          aria-label="Размер скидки"
                          required
                        />
                        <select
                          value={discountUnit}
                          onChange={(event) => setDiscountUnit(event.target.value as "percent" | "amount")}
                          className={clsx(fieldBase, "w-20 shrink-0")}
                          aria-label="Единица скидки"
                        >
                          <option value="percent">%</option>
                          <option value="amount">₽</option>
                        </select>
                      </span>
                    </label>
                  </div>
                  <label className="block text-xs font-medium text-fg-2">
                    Причина
                    <input
                      value={discountNote}
                      onChange={(event) => setDiscountNote(event.target.value)}
                      className={fieldClass}
                      placeholder="Например: членство в клубе"
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={discountInvalid || mutation.isPending}
                    className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
                  >
                    Применить после текущих скидок
                  </button>
                </form>
              </details>

              <details className="group rounded-xl border border-white/10 bg-field">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-white/90 focus-visible:outline-2 focus-visible:outline-accent">
                  <Gift className="size-4 text-accent" /> Код скидки за мини‑игру
                </summary>
                <form onSubmit={submitReward} className="space-y-3 border-t border-white/10 p-4">
                  <label className="block text-xs font-medium text-fg-2">
                    Код награды игрока
                    <input
                      value={rewardCode}
                      onChange={(event) => setRewardCode(event.target.value.toUpperCase())}
                      className={clsx(fieldClass, "font-mono tracking-widest")}
                      placeholder="WH-XXXXXX"
                      autoCapitalize="characters"
                      required
                    />
                  </label>
                  <p className="text-xs leading-5 text-fg-3">Код должен принадлежать автору записи, быть активным и давать скидку в процентах или рублях.</p>
                  <button
                    type="submit"
                    disabled={!rewardCode.trim() || mutation.isPending}
                    className="min-h-11 w-full rounded-xl border border-accent/50 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent disabled:opacity-40"
                  >
                    Проверить и применить код
                  </button>
                </form>
              </details>

              <section className="overflow-hidden rounded-xl border border-white/10" aria-label="История оплат">
                <div className="border-b border-white/10 bg-white/3 px-4 py-3">
                  <h3 className="text-sm font-semibold">Оплаты ({pricing.payments.length})</h3>
                </div>
                {pricing.payments.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-fg-3">Платежей пока нет.</p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {pricing.payments.map((payment) => (
                      <div key={payment.id} className="px-4 py-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-green-200">+{money.format(payment.amount)}</p>
                          <p className="text-xs text-fg-3">{PAYMENT_METHOD_LABELS[payment.method]}</p>
                        </div>
                        {payment.note && <p className="mt-0.5 text-fg-2">{payment.note}</p>}
                        <p className="mt-0.5 text-xs text-fg-3">
                          {formatClub(payment.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <details className="group rounded-xl border border-white/10 bg-field">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-white/90 focus-visible:outline-2 focus-visible:outline-accent">
                  <WalletCards className="size-4 text-accent" /> Зафиксировать оплату
                </summary>
                <form onSubmit={submitPayment} className="space-y-3 border-t border-white/10 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-fg-2">
                      Сумма, ₽
                      <input
                        type="text"
                        inputMode="decimal"
                        value={paymentAmount}
                        onChange={(event) => setPaymentAmount(event.target.value)}
                        className={fieldClass}
                        placeholder={`${pricing.remainingAmount} — весь остаток`}
                      />
                    </label>
                    <label className="text-xs font-medium text-fg-2">
                      Способ
                      <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className={fieldClass}>
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block text-xs font-medium text-fg-2">
                    Комментарий (необязательно)
                    <input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} className={fieldClass} />
                  </label>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(String(pricing.remainingAmount))}
                    disabled={pricing.remainingAmount <= 0 || mutation.isPending}
                    className="min-h-11 text-sm font-semibold text-accent underline disabled:opacity-40"
                  >
                    Указать весь остаток
                  </button>
                  <button
                    type="submit"
                    disabled={paymentInvalid || mutation.isPending || pricing.remainingAmount <= 0}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green-400/15 px-4 py-2.5 text-sm font-semibold text-green-200 disabled:opacity-40"
                  >
                    {mutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ReceiptRussianRuble className="size-4" />}
                    Добавить оплату{!paymentInvalid ? ` ${money.format(paymentValue)}` : ""}
                  </button>
                </form>
              </details>
            </>
          )}

          {mutation.isError && (
            <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">
              {mutation.error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
