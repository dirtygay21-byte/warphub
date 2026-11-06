import { getAdminWarhammerDay } from "@/apiUtils/adminWarhammer";
import { createTableHold, HOLD_PURPOSE_LABELS, type HoldPurpose } from "@/apiUtils/tableHolds";
import { ChoiceChips, Field, inputClassName } from "@/components/booking/FormControls";
import { DsButton } from "@/components/ui/ds";
import { clubDateKeyOf, clubIso, dateKeyOf, formatClubTime, formatClubTimeRange, getClubToday } from "@/utils/clubTime";
import { haptic } from "@/utils/haptic";
import { useAuthStore } from "@/stores/useAuthStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDialogExit } from "@/components/ui/ds/useDialogExit";

const MINUTE = 60_000;
/** смена клуба: 12:00 — 10:00 следующего дня (как на сервере, config/booking.ts) */
const SHIFT_MINUTES = 22 * 60;
const STEP = 30;

const PURPOSES: HoldPurpose[] = ["dnd", "tournament", "private_game", "club_event", "other"];

export type TableHoldPrefill = {
  dateKey?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  purpose?: HoldPurpose;
  title?: string;
  description?: string | null;
  reservedBy?: string | null;
  dndGameId?: number | null;
};

/** Минуты от начала смены для момента (null — вне смены этой даты). */
const offsetOf = (dateKey: string, iso: string | null | undefined) => {
  if (!iso) return null;
  const minutes = Math.round((new Date(iso).getTime() - new Date(clubIso(dateKey, 12)).getTime()) / MINUTE);
  return minutes >= 0 && minutes <= SHIFT_MINUTES && minutes % STEP === 0 ? minutes : null;
};

/**
 * Бронь стола администратором (30.10.2026): стол, дата, время с–по (в пределах смены), цель, название, описание.
 * Сервер откажет, если за столом в это время есть записи, ивент или другая бронь, — сообщение показывается здесь.
 * Цель «Игра D&D» закрывает весь клуб до конца + 1 ч (31.10.2026); сервер проверяет весь клуб.
 */
export default function TableHoldSheet({ prefill, onClose }: { prefill?: TableHoldPrefill; onClose: () => void }) {
  const queryClient = useQueryClient();
  const initialDate = prefill?.dateKey ?? (prefill?.startsAt ? clubDateKeyOf(prefill.startsAt) : dateKeyOf(getClubToday()));
  const [dateKey, setDateKey] = useState(initialDate);
  const [from, setFrom] = useState<number>(() => offsetOf(initialDate, prefill?.startsAt) ?? 6 * 60);
  const [to, setTo] = useState<number>(() => offsetOf(initialDate, prefill?.endsAt) ?? 10 * 60);
  const [tableId, setTableId] = useState<number | null>(null);
  const [purpose, setPurpose] = useState<HoldPurpose>(prefill?.purpose ?? "tournament");
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [description, setDescription] = useState(prefill?.description ?? "");
  // «Кто бронирует»: по умолчанию — администратор, который создаёт бронь; можно вписать мастера или организатора
  const user = useAuthStore((state) => state.user);
  const [reservedBy, setReservedBy] = useState(
    prefill?.reservedBy ?? ([user?.firstName, user?.lastName].filter(Boolean).join(" ") || (user?.username ? `@${user.username}` : "")),
  );
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dayQuery = useQuery({ queryKey: ["admin-warhammer-day", dateKey], queryFn: () => getAdminWarhammerDay(dateKey) });
  const tables = dayQuery.data?.tables ?? [];

  const iso = (minutes: number) => new Date(new Date(clubIso(dateKey, 12)).getTime() + minutes * MINUTE).toISOString();
  const times = useMemo(() => Array.from({ length: SHIFT_MINUTES / STEP + 1 }, (_, i) => i * STEP), []);

  // что уже стоит за выбранным столом в этот день — подсказка, чтобы не попасть на записи
  const busy = useMemo(() => {
    if (!dayQuery.data || tableId === null) return [];
    return [
      ...dayQuery.data.sessions.filter((s) => s.tableId === tableId).map((s) => ({ key: `s${s.startsAt}`, label: `Записи игроков ${formatClubTimeRange(s.startsAt, s.endsAt)}` })),
      ...dayQuery.data.holds.filter((h) => h.tableId === tableId).map((h) => ({ key: `h${h.id}`, label: `Бронь «${h.title}» ${formatClubTimeRange(h.startsAt, h.endsAt)}` })),
    ];
  }, [dayQuery.data, tableId]);

  const error =
    tableId === null ? "Выберите стол" : to <= from ? "Конец должен быть позже начала" : !title.trim() ? "Укажите название" : null;

  const mutation = useMutation({
    meta: { success: "Бронь стола сохранена" },
    mutationFn: () =>
      createTableHold({
        tableId: tableId!,
        startsAt: iso(from),
        endsAt: iso(to),
        purpose,
        title: title.trim(),
        description: description.trim() || null,
        reservedBy: reservedBy.trim() || null,
        dndGameId: prefill?.dndGameId ?? null,
      }),
    onSuccess: () => {
      haptic.ok();
      queryClient.invalidateQueries({ queryKey: ["admin-warhammer-day"] });
      queryClient.invalidateQueries({ queryKey: ["table-holds"] });
      queryClient.invalidateQueries({ queryKey: ["service-availability"] });
      onClose();
    },
    onError: () => haptic.error(),
  });

  const leaving = useDialogExit();

  return (
    <div className={`fixed inset-0 z-[70]${leaving ? " ds-leaving" : ""}`}>
      <div className="ds-fade absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Забронировать стол"
        className="ds-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-[22px] border-t border-white/10 bg-app-elevated px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5 text-fg"
      >
        <div className="h-1 w-10 shrink-0 self-center rounded bg-white/20" />
        <div className="mt-2 flex items-center justify-between gap-3">
          <h2 className="font-display text-[22px] font-semibold uppercase leading-none">Забронировать стол</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="ds-press flex size-11 items-center justify-center rounded-xl border border-white/[0.14] text-fg">
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-fg-2">Стол будет закрыт для записи игроков на выбранное время.</p>

        <div className="mt-5 space-y-5">
          <Field label="Дата">
            <input
              type="date"
              value={dateKey}
              onChange={(event) => {
                if (!event.target.value) return;
                setDateKey(event.target.value);
                setTableId(null);
              }}
              className={clsx(inputClassName, "[color-scheme:dark]")}
            />
          </Field>

          <Field label="Стол">
            {dayQuery.isLoading ? (
              <LoaderCircle className="size-5 animate-spin text-accent" />
            ) : tables.length === 0 ? (
              <p className="text-sm text-fg-2">Нет активных столов.</p>
            ) : (
              <ChoiceChips options={tables.map((t) => ({ value: t.id, label: t.name }))} value={tableId} onChange={setTableId} />
            )}
            {busy.length > 0 && (
              <ul className="mt-2 space-y-1 text-[13px] text-warn">
                {busy.map((b) => (
                  <li key={b.key}>Занято: {b.label}</li>
                ))}
              </ul>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="С">
              <select value={from} onChange={(event) => setFrom(Number(event.target.value))} className={inputClassName} aria-label="Начало брони">
                {times.slice(0, -1).map((m) => (
                  <option key={m} value={m}>
                    {formatClubTime(iso(m))}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="До">
              <select value={to} onChange={(event) => setTo(Number(event.target.value))} className={inputClassName} aria-label="Конец брони">
                {times.slice(1).map((m) => (
                  <option key={m} value={m} disabled={m <= from}>
                    {formatClubTime(iso(m))}
                    {m >= 12 * 60 ? " (след. день)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Цель">
            <ChoiceChips columns={2} options={PURPOSES.map((p) => ({ value: p, label: HOLD_PURPOSE_LABELS[p] }))} value={purpose} onChange={setPurpose} />
          </Field>

          {purpose === "dnd" && to > from && (
            <p className="rounded-[14px] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-fg">
              Игра D&D закрывает весь клуб: оба острова, покраску и посещение. Игра {formatClubTime(iso(from))}–{formatClubTime(iso(to))} · клуб
              закрыт до <b>{formatClubTime(new Date(new Date(iso(to)).getTime() + 60 * MINUTE))}</b> (+1 ч).
            </p>
          )}

          <Field label="Название">
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Например: Турнир Kill Team, финал" className={inputClassName} />
          </Field>

          <Field label="Кто бронирует" hint="Мастер D&D, организатор турнира или вы сами.">
            <input value={reservedBy} onChange={(event) => setReservedBy(event.target.value)} maxLength={100} placeholder="Имя" className={inputClassName} />
          </Field>

          <Field label="Описание" hint="Необязательно. Видно только администраторам.">
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} className={clsx(inputClassName, "resize-none")} />
          </Field>

          {showErrors && error && (
            <p role="alert" className="rounded-[14px] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          {mutation.isError && (
            <p role="alert" className="rounded-[14px] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {mutation.error.message}
            </p>
          )}

          <DsButton
            variant="primary"
            size="lg"
            className="w-full"
            disabled={mutation.isPending}
            onClick={() => {
              setShowErrors(true);
              if (!error) mutation.mutate();
            }}
          >
            {mutation.isPending ? "Бронируем…" : `Забронировать ${formatClubTime(iso(from))}–${formatClubTime(iso(to))}`}
          </DsButton>
        </div>
      </div>
    </div>
  );
}
