/**
 * Мой счёт (21.11.2026, решение владельца): за что и сколько платит игрок — по ценам клуба, с долей стола;
 * скидки на выбор: обучающая игра −50% (первые 3), код из мини-игр, «я член клуба» −10% (подтверждает администратор).
 * Суммы показываются только здесь — после записи.
 */
import { applyMyReward, applyMyTraining, getMyBill, requestMyMembership, type PlayerBill } from "@/apiUtils/pricing";
import { useDialogExit } from "@/components/ui/ds/useDialogExit";
import { DsButton } from "@/components/ui/ds";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { BadgePercent, Gamepad2, GraduationCap, LoaderCircle, ReceiptText, UsersRound, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";

const rub = (n: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ₽`;

const STATUS: Record<string, { label: string; cls: string }> = {
  free: { label: "Бесплатно", cls: "bg-accent/15 text-accent" },
  unpaid: { label: "Оплата в клубе", cls: "bg-white/10 text-fg-2" },
  partial: { label: "Оплачено частично", cls: "bg-warn/15 text-warn" },
  paid: { label: "Оплачено", cls: "bg-accent/15 text-accent" },
};

type Action = { type: "training" } | { type: "reward"; code: string } | { type: "membership" };

export function BillSheet({ reservationId, title, onClose }: { reservationId: string; title: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const key = ["my-bill", reservationId];
  const bill = useQuery({ queryKey: key, queryFn: () => getMyBill(reservationId) });
  const [code, setCode] = useState("");
  const act = useMutation({
    meta: { success: "Счёт обновлён" },
    mutationFn: (a: Action) =>
      a.type === "training" ? applyMyTraining(reservationId) : a.type === "reward" ? applyMyReward(reservationId, a.code) : requestMyMembership(reservationId),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      queryClient.invalidateQueries({ queryKey: ["minigames", "rewards"] });
      setCode("");
    },
  });
  const leaving = useDialogExit();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const data = bill.data;
  // окно — в body: карточка записи (анимация, overflow-hidden) иначе обрезает его и прячет выход (21.11.2026)
  return createPortal(
    <div className={`ds-fade fixed inset-0 z-50 flex items-end justify-center bg-overlay/70 px-3 pb-3 pt-10${leaving ? " ds-leaving" : ""}`} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-title"
        className="ds-sheet flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-[22px] border border-white/10 bg-app-elevated text-fg shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-white/10 px-5 pb-3 pt-4">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <ReceiptText className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="bill-title" className="font-display text-[22px] font-bold uppercase leading-tight">Мой счёт</h2>
            <p className="truncate text-sm text-fg-2">{title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть счёт" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-2 hover:text-fg">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {bill.isLoading && <div className="flex justify-center py-12"><LoaderCircle className="size-7 animate-spin text-accent" /></div>}
          {bill.isError && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">Не получилось загрузить счёт. Попробуйте ещё раз.</p>}
          {data?.cancelled && <p className="rounded-xl bg-white/5 p-3 text-sm text-fg-2">Запись отменена — платить ничего не нужно.</p>}
          {data && !data.cancelled && <BillBody bill={data} />}

          {data && !data.cancelled && data.offers.canApply && (
            <section aria-label="Скидки" className="space-y-2">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-fg-3">Скидки на выбор</h3>

              {data.offers.training.eligible && !data.offers.training.applied && (
                <Offer
                  icon={<GraduationCap className="size-5" />}
                  title="Обучающая игра −50%"
                  text={data.offers.training.remaining > 0 ? `На первые ${data.offers.training.limit} игры в клубе. Осталось: ${data.offers.training.remaining}.` : "Все три обучающие игры уже использованы."}
                  action={data.offers.training.remaining > 0 ? { label: "Применить", onClick: () => act.mutate({ type: "training" }) } : null}
                  busy={act.isPending}
                />
              )}

              {!data.offers.membership.applied && (
                <Offer
                  icon={<UsersRound className="size-5" />}
                  title={`Член клуба −${data.offers.membership.percent}%`}
                  text={data.offers.membership.requested ? "Отметили — администратор проверит и поставит скидку." : "Если вы член клуба, отметьте — администратор проверит и поставит скидку."}
                  action={data.offers.membership.requested ? null : { label: "Я член клуба", onClick: () => act.mutate({ type: "membership" }) }}
                  busy={act.isPending}
                />
              )}

              <div className="rounded-2xl border border-white/10 bg-white/3 p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-accent"><Gamepad2 className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Есть скидка из мини-игр?</p>
                    {data.offers.rewards.length ? (
                      <ul className="mt-2 space-y-2">
                        {data.offers.rewards.map((r) => (
                          <li key={r.code} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 text-sm text-fg-2">
                              {r.label}
                              <span className="ml-1 text-fg-3">· {r.percent !== null ? `−${r.percent}%` : `−${rub(r.amount ?? 0)}`}</span>
                            </span>
                            <DsButton variant="secondary" onClick={() => act.mutate({ type: "reward", code: r.code })} disabled={act.isPending}>
                              Применить
                            </DsButton>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-fg-2">
                        Пока нет.{" "}
                        <button type="button" onClick={() => navigate("/games")} className="font-semibold text-accent underline">
                          Сыграйте в мини-игры
                        </button>{" "}
                        — там можно выиграть скидку.
                      </p>
                    )}
                    <form
                      className="mt-2 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (code.trim()) act.mutate({ type: "reward", code: code.trim() });
                      }}
                    >
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Или введите код"
                        aria-label="Код скидки"
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-field px-3 text-sm outline-none focus:border-accent/60"
                      />
                      <DsButton variant="secondary" type="submit" disabled={!code.trim() || act.isPending}>
                        OK
                      </DsButton>
                    </form>
                  </div>
                </div>
              </div>
            </section>
          )}
          <p className="text-xs leading-5 text-fg-3">Цены — по прайсу клуба. Оплата — в клубе, администратору.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BillBody({ bill }: { bill: Extract<PlayerBill, { cancelled: false }> }) {
  const st = STATUS[bill.status] ?? STATUS.unpaid!;
  return (
    <>
      <div className="rounded-2xl bg-accent p-4 text-[#111110]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] opacity-70">К оплате</span>
          <span className={clsx("rounded-lg bg-[#111110] px-2 py-0.5 text-xs font-bold", bill.status === "paid" || bill.status === "free" ? "text-accent" : "text-fg")}>{st.label}</span>
        </div>
        <p className="mt-1 font-display text-[40px] font-bold leading-none tabular-nums">{rub(bill.remainingAmount)}</p>
        {bill.paidAmount > 0 && <p className="mt-1 text-sm font-semibold">Всего {rub(bill.totalAmount)} · оплачено {rub(bill.paidAmount)}</p>}
      </div>

      <section aria-label="За что">
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-fg-3">За что</h3>
        <ul className="divide-y divide-white/5 rounded-2xl border border-white/10">
          {bill.lines.map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold">{l.title}</p>
                {l.note && (
                  <p className="mt-0.5 text-xs text-fg-2">
                    {l.share < 1 ? `${l.note}: ${rub(l.amount)} из ${rub(l.unitPrice)}` : `${l.note} × ${rub(l.unitPrice)}`}
                  </p>
                )}
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{rub(l.amount)}</span>
            </li>
          ))}
          {bill.army && (
            <li className="flex items-start justify-between gap-3 px-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold">Армия клуба</p>
                <p className="mt-0.5 text-xs text-fg-2">{bill.army.points} очков</p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{rub(bill.army.amount)}</span>
            </li>
          )}
          {bill.discounts.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 px-3 py-3 text-accent">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-semibold"><BadgePercent className="size-4" />{d.title}</p>
                {d.note && <p className="mt-0.5 text-xs text-fg-2">{d.note}</p>}
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{d.percent !== null ? `−${d.percent}%` : `−${rub(d.amount ?? 0)}`}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 px-3 py-3">
            <span className="font-bold">Итого</span>
            <span className="font-bold tabular-nums">{rub(bill.totalAmount)}</span>
          </li>
        </ul>
        {bill.overpaidAmount > 0 && (
          <p className="mt-2 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">Вы заплатили на {rub(bill.overpaidAmount)} больше — к столу присоединился игрок. Администратор вернёт разницу.</p>
        )}
      </section>
    </>
  );
}

function Offer({ icon, title, text, action, busy }: { icon: ReactNode; title: string; text: string; action: { label: string; onClick: () => void } | null; busy: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/3 p-3">
      <span className="mt-0.5 text-accent">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-fg-2">{text}</p>
      </div>
      {action && (
        <DsButton variant="secondary" onClick={action.onClick} disabled={busy} className="shrink-0">
          {action.label}
        </DsButton>
      )}
    </div>
  );
}
