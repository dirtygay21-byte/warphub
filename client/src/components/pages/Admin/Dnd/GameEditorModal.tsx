import { uploadAdminFile } from "@/apiUtils/admin";
import {
  createAdminDndGame,
  DND_GAME_STATUS_LABELS,
  DND_WEEKDAY_OPTIONS,
  updateAdminDndGame,
  type AdminDndGame,
  type DndGamePayload,
  type DndGameStatus,
} from "@/apiUtils/dnd";
import {
  ChoiceChips,
  Field,
  inputClassName,
  MultiChoiceChips,
} from "@/components/booking/FormControls";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { formatClubTime, fromClubDatetimeLocal } from "@/utils/clubTime";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import {
  emptyGameDraft,
  DND_CLOSURE_BUFFER_HOURS,
  DND_HOURS,
  GAME_TYPE_PRESETS,
  gameToDraft,
  type GameDraft,
} from "./gameDraft";

const validateDraft = (draft: GameDraft): string | null => {
  if (!draft.title.trim()) return "Введите название";
  if (!draft.gameType.trim()) return "Укажите тип игры";
  if (draft.timeMode === "flexible") {
    if (!draft.daysOfWeek.length) return "Выберите хотя бы один день недели";
    if (!draft.timesOfDay.length) return "Выберите время суток";
  } else if (!draft.startsAt) return "Укажите дату и время начала";
  else if (!draft.hours) return "Выберите длительность игры";
  const capacity = Number(draft.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    return "Мест — целое число от 1 до 100";
  }
  return null;
};

/** Конец игры (ISO): начало + выбранные часы */
const dndEnd = (draft: GameDraft) =>
  draft.startsAt && draft.hours
    ? new Date(new Date(fromClubDatetimeLocal(draft.startsAt)).getTime() + Number(draft.hours) * 3_600_000).toISOString()
    : null;

const draftToPayload = (draft: GameDraft): DndGamePayload => ({
  title: draft.title.trim(),
  description: draft.description.trim() || null,
  gameType: draft.gameType.trim(),
  ...(draft.timeMode === "exact"
    ? {
        startsAt: fromClubDatetimeLocal(draft.startsAt),
        endsAt: dndEnd(draft)!,
        daysOfWeek: [],
        timesOfDay: [],
      }
    : {
        startsAt: null,
        endsAt: null,
        daysOfWeek: draft.daysOfWeek.map(Number).sort((a, b) => a - b),
        timesOfDay: draft.timesOfDay,
      }),
  capacity: Number(draft.capacity),
  imageUrl: draft.imageUrl || null,
  status: draft.status,
});

const STATUS_OPTIONS = (Object.keys(DND_GAME_STATUS_LABELS) as DndGameStatus[]).map(
  (value) => ({ value, label: DND_GAME_STATUS_LABELS[value] }),
);

export function GameEditorModal({
  game,
  initialDraft,
  title,
  onClose,
  onSaved,
}: {
  game?: AdminDndGame;
  initialDraft?: GameDraft;
  title?: string;
  onClose: () => void;
  onSaved?: (game: AdminDndGame) => void;
}) {
  const queryClient = useQueryClient();
  const options = useBookingOptions();
  const [draft, setDraft] = useState<GameDraft>(
    () => initialDraft ?? (game ? gameToDraft(game) : emptyGameDraft()),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const set = (patch: Partial<GameDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const validationError = validateDraft(draft);

  const mutation = useMutation({
    mutationFn: () =>
      game
        ? updateAdminDndGame(game.id, draftToPayload(draft))
        : createAdminDndGame(draftToPayload(draft)),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["admin-dnd-games"] });
      queryClient.invalidateQueries({ queryKey: ["dnd-games"] });
      onSaved?.(saved);
      onClose();
    },
  });

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadAdminFile(file, "dnd-games");
      set({ imageUrl: result.url });
    } catch (error) {
      setUploadError((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/70 px-3 pb-4 pt-8 sm:items-center"
      onClick={() => !mutation.isPending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-app-elevated p-5 text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {title ?? (game ? "Редактировать игру" : "Новая игра D&D")}
          </h2>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-lg border border-white/10 active:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5">
          <Field label="Название">
            <input
              type="text"
              value={draft.title}
              maxLength={120}
              placeholder="Например: «Затерянный храм»"
              onChange={(event) => set({ title: event.target.value })}
              className={inputClassName}
            />
          </Field>

          <Field label="Тип игры">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {GAME_TYPE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => set({ gameType: preset })}
                    className={clsx(
                      "rounded-lg border px-3 py-2 text-sm font-semibold",
                      draft.gameType === preset
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-white/10 bg-white/5 text-white",
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={draft.gameType}
                maxLength={60}
                placeholder="Или свой вариант"
                onChange={(event) => set({ gameType: event.target.value })}
                className={inputClassName}
              />
            </div>
          </Field>

          <Field label="Описание">
            <textarea
              value={draft.description}
              rows={4}
              maxLength={4000}
              onChange={(event) => set({ description: event.target.value })}
              className={clsx(inputClassName, "resize-y")}
            />
          </Field>

          <Field
            label="Когда"
            hint={
              draft.timeMode === "flexible"
                ? "Дни и примерное время — точное время Мастер согласует с игроками"
                : undefined
            }
          >
            <ChoiceChips
              columns={2}
              options={[
                { value: "flexible", label: "Примерно" },
                { value: "exact", label: "Точное время" },
              ]}
              value={draft.timeMode}
              onChange={(timeMode) => set({ timeMode })}
            />
          </Field>

          {draft.timeMode === "flexible" ? (
            <>
              <Field label="Дни недели" hint="Можно выбрать несколько">
                <MultiChoiceChips
                  options={DND_WEEKDAY_OPTIONS}
                  values={draft.daysOfWeek}
                  onChange={(daysOfWeek) => set({ daysOfWeek })}
                />
              </Field>
              <Field label="Время суток" hint="Можно выбрать несколько">
                <MultiChoiceChips
                  options={options.dndTimePreferences}
                  values={draft.timesOfDay}
                  onChange={(timesOfDay) => set({ timesOfDay })}
                />
              </Field>
            </>
          ) : (
          <div className="space-y-4">
            <Field label="Начало (время клуба)">
              <input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(event) => set({ startsAt: event.target.value })}
                className={clsx(inputClassName, "[color-scheme:dark]")}
              />
            </Field>
            <Field label="Длительность игры" hint="Клуб закрыт на всё время игры и ещё на час после: записаться на столы, покраску и посещение нельзя.">
              <ChoiceChips
                columns={4}
                options={DND_HOURS.map((h) => ({ value: h, label: `${h} ч` }))}
                value={draft.hours}
                onChange={(hours) => set({ hours })}
              />
            </Field>
            {draft.startsAt && draft.hours && (
              <p className="rounded-[14px] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-fg">
                Игра {formatClubTime(fromClubDatetimeLocal(draft.startsAt))}–{formatClubTime(dndEnd(draft)!)} · клуб закрыт до{" "}
                <b>{formatClubTime(new Date(new Date(dndEnd(draft)!).getTime() + DND_CLOSURE_BUFFER_HOURS * 3_600_000))}</b> (+1 ч)
              </p>
            )}
          </div>
          )}

          <Field
            label="Мест всего"
            hint={game ? `Уже занято: ${game.occupied}` : undefined}
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={draft.capacity}
              onChange={(event) =>
                set({ capacity: event.target.value.replace(/\D/g, "").slice(0, 3) })
              }
              className={inputClassName}
            />
          </Field>

          <Field label="Картинка">
            <div className="space-y-2">
              {draft.imageUrl && (
                <div className="relative overflow-hidden rounded-xl border border-white/10">
                  <img src={draft.imageUrl} alt="" className="aspect-[16/7] w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => set({ imageUrl: "" })}
                    className="absolute right-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-xs"
                  >
                    Убрать
                  </button>
                </div>
              )}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm text-fg-2 active:bg-white/5">
                {uploading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                {uploading ? "Загружаем…" : "Загрузить изображение"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => handleImage(event.target.files?.[0])}
                />
              </label>
              {uploadError && <p className="text-xs text-red-300">{uploadError}</p>}
            </div>
          </Field>

          <Field
            label="Статус"
            hint="Черновик виден только администраторам. «Запись закрыта» — игра видна, но записаться нельзя."
          >
            <ChoiceChips
              columns={2}
              options={STATUS_OPTIONS}
              value={draft.status}
              onChange={(status) => set({ status })}
            />
          </Field>

          {showErrors && validationError && (
            <p className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {validationError}
            </p>
          )}
          {mutation.isError && (
            <p className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {mutation.error.message}
            </p>
          )}

          <button
            type="button"
            disabled={mutation.isPending || uploading}
            onClick={() => {
              setShowErrors(true);
              if (!validationError) mutation.mutate();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-4 text-base font-semibold text-accent-foreground active:scale-95 disabled:opacity-60"
          >
            {mutation.isPending && <LoaderCircle className="size-4 animate-spin" />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
