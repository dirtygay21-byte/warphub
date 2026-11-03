/* eslint-disable react-hooks/set-state-in-effect */
import {
  createAdminEvent,
  deleteAdminEvent,
  getAdminEmptyTables,
  getAdminEventById,
  updateAdminEvent,
  uploadAdminFile,
} from "@/apiUtils/admin";
import { formatReservationDateTime } from "@/utils/reservationDisplay";
import ContentImage from "@/components/ui/ContentImage";
import ImageCropEditor from "@/components/ui/ImageCropEditor";
import { getSeatsLabel } from "@/utils/plural";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  CalendarDays,
  ImageIcon,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Table2,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyEventDraft,
  draftToPayload,
  draftsEqual,
  eventToDraft,
  formatEventDateTime,
  fromDatetimeLocal,
  type EventDraft,
} from "../utils";

type EventDetailsModalProps = {
  mode: "create" | "edit";
  eventId?: number;
  onClose: () => void;
};

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-app-elevated px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-accent/40";

const editableFieldClassName = (isEditing: boolean) =>
  clsx(
    "rounded-xl transition-colors",
    isEditing &&
      "cursor-text border border-transparent hover:border-white/10 hover:bg-white/3 focus-within:border-accent/40 focus-within:bg-white/3"
  );

export default function EventDetailsModal({
  mode,
  eventId,
  onClose,
}: EventDetailsModalProps) {
  const isCreate = mode === "create";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emptyDraft = useMemo(() => createEmptyEventDraft(), []);

  const [isEditing, setIsEditing] = useState(isCreate);
  const [draft, setDraft] = useState<EventDraft | null>(
    isCreate ? emptyDraft : null
  );
  const [baselineDraft, setBaselineDraft] = useState<EventDraft | null>(
    isCreate ? emptyDraft : null
  );
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isCropEditorOpen, setIsCropEditorOpen] = useState(false);

  const eventQuery = useQuery({
    queryKey: ["admin-event", eventId],
    queryFn: () => getAdminEventById(eventId!),
    enabled: !isCreate && eventId != null,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (eventId == null) throw new Error("ID ивента не указан");

      return deleteAdminEvent(eventId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["nearest-event"] });
      queryClient.removeQueries({ queryKey: ["admin-event", eventId] });
      onClose();
    },
    onError: (error) => {
      setSaveError(
        error instanceof Error ? error.message : "Не удалось удалить ивент"
      );
      setIsDeleteConfirmOpen(false);
    },
  });

  useEffect(() => {
    if (isCreate || !eventQuery.data) return;

    const nextDraft = eventToDraft(eventQuery.data);
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
    setPendingImageFile(null);
    setImagePreviewUrl(null);
    setIsEditing(false);
    setSaveError(null);
  }, [eventQuery.data, isCreate]);

  useEffect(() => {
    if (!pendingImageFile) {
      setImagePreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(pendingImageFile);
    setImagePreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [pendingImageFile]);

  const hasChanges = useMemo(() => {
    if (!draft || !baselineDraft) return false;
    if (pendingImageFile) return true;

    return !draftsEqual(draft, baselineDraft);
  }, [draft, baselineDraft, pendingImageFile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Данные ивента не загружены");

      if (!draft.title.trim()) {
        throw new Error("Укажите название ивента");
      }

      if (!draft.startsAt || !draft.endsAt) {
        throw new Error("Укажите дату начала и окончания");
      }

      if (draft.seatsPerTable < 1) {
        throw new Error("Укажите вместимость стола");
      }

      let bannerUrl = draft.bannerUrl;

      if (pendingImageFile) {
        const upload = await uploadAdminFile(pendingImageFile, "events");
        bannerUrl = upload.url;
      }

      const payload = draftToPayload(draft, bannerUrl);

      if (isCreate) {
        return createAdminEvent(payload);
      }

      if (eventId == null) {
        throw new Error("ID ивента не указан");
      }

      return updateAdminEvent(eventId, payload);
    },
    onSuccess: (savedEvent) => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });

      if (isCreate) {
        onClose();
        return;
      }

      if (eventId != null) {
        queryClient.setQueryData(["admin-event", eventId], savedEvent);
      }

      const nextDraft = eventToDraft(savedEvent);
      setDraft(nextDraft);
      setBaselineDraft(nextDraft);
      setPendingImageFile(null);
      setImagePreviewUrl(null);
      setIsEditing(false);
      setSaveError(null);
    },
    onError: (error) => {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить изменения"
      );
    },
  });

  const handleClose = () => {
    if (saveMutation.isPending || deleteMutation.isPending) return;

    onClose();
  };

  const handleDeleteConfirm = () => {
    if (deleteMutation.isPending) return;

    setSaveError(null);
    deleteMutation.mutate();
  };

  const handleCancelEdit = () => {
    if (isCreate) {
      handleClose();
      return;
    }

    if (!baselineDraft) return;

    setDraft(baselineDraft);
    setPendingImageFile(null);
    setImagePreviewUrl(null);
    setIsEditing(false);
    setSaveError(null);
    saveMutation.reset();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleApply = () => {
    if (!hasChanges || saveMutation.isPending) return;

    saveMutation.mutate();
  };

  const handleImageSelect = (file: File | null) => {
    if (!file || !isEditing) return;

    setPendingImageFile(file);
    setDraft((current) => (current ? { ...current, bannerCrop: null } : current));
    setIsCropEditorOpen(true);
    setSaveError(null);
  };

  const updateDraft = (patch: Partial<EventDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setSaveError(null);
  };

  const toggleTableId = (tableId: number) => {
    setDraft((current) => {
      if (!current) return current;

      const isSelected = current.tableIds.includes(tableId);

      return {
        ...current,
        tableIds: isSelected
          ? current.tableIds.filter((id) => id !== tableId)
          : [...current.tableIds, tableId],
      };
    });
    setSaveError(null);
  };

  const hasTimeRange = Boolean(draft?.startsAt && draft?.endsAt);

  const emptyTablesQuery = useQuery({
    queryKey: [
      "admin-empty-tables",
      draft?.startsAt,
      draft?.endsAt,
      eventId,
    ],
    queryFn: () =>
      getAdminEmptyTables(
        fromDatetimeLocal(draft!.startsAt),
        fromDatetimeLocal(draft!.endsAt),
        isCreate ? undefined : eventId,
      ),
    enabled: isEditing && hasTimeRange,
  });

  const bannerPreview = imagePreviewUrl ?? draft?.bannerUrl ?? "";
  const tableIds = draft?.tableIds ?? [];
  const tablesLabel = tableIds.length > 0 ? tableIds.join(", ") : "—";
  const canShowForm = draft && (isCreate || eventQuery.data);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/70 px-4 pb-8 pt-6 sm:items-center"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[calc(100dvh-3rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-app-elevated"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold">
            {isCreate
              ? "Создание ивента"
              : isEditing
              ? "Редактирование ивента"
              : "Информация об ивенте"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={saveMutation.isPending || deleteMutation.isPending}
            aria-label="Закрыть"
            className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-white/80 transition-colors active:bg-white/10 disabled:opacity-60"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!isCreate && eventQuery.isLoading && (
            <div className="flex min-h-48 items-center justify-center py-10">
              <LoaderCircle className="size-8 animate-spin text-accent" />
            </div>
          )}

          {!isCreate && eventQuery.isError && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
              <p className="text-sm text-fg-2">
                Не удалось загрузить ивент. Попробуйте ещё раз.
              </p>
              <button
                type="button"
                onClick={() => eventQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
              >
                <RefreshCw className="size-4" />
                Повторить
              </button>
            </div>
          )}

          {canShowForm && (
            <div className="space-y-4 p-5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) =>
                  handleImageSelect(event.target.files?.[0] ?? null)
                }
              />

              <button
                type="button"
                disabled={!isEditing}
                onClick={() => fileInputRef.current?.click()}
                className={clsx(
                  "group relative block w-full overflow-hidden rounded-xl",
                  isEditing &&
                    "cursor-pointer ring-0 transition-colors hover:ring-2 hover:ring-accent/40"
                )}
              >
                {bannerPreview ? (
                  <ContentImage
                    src={bannerPreview}
                    alt={draft.title || "Баннер ивента"}
                    crop={draft.bannerCrop}
                    className="aspect-video w-full"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-white/5 text-sm text-fg-3">
                    Без баннера
                  </div>
                )}

                {isEditing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-overlay/45 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="inline-flex items-center gap-2">
                      <ImageIcon className="size-4" />
                      {bannerPreview
                        ? "Изменить изображение"
                        : "Добавить изображение"}
                    </span>
                  </div>
                )}
              </button>

              {isEditing && bannerPreview && (
                <button
                  type="button"
                  onClick={() => setIsCropEditorOpen(true)}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/3 px-4 py-2.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
                >
                  <ImageIcon className="size-4" />
                  Настроить отображение
                </button>
              )}

              <div className={editableFieldClassName(isEditing)}>
                {isEditing ? (
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(event) =>
                      updateDraft({ title: event.target.value })
                    }
                    className={clsx(inputClassName, "text-xl font-semibold")}
                    placeholder="Название ивента"
                  />
                ) : (
                  <h3 className="px-1 text-xl font-semibold text-white">
                    {draft.title}
                  </h3>
                )}
              </div>

              <div className={editableFieldClassName(isEditing)}>
                {isEditing ? (
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      updateDraft({ description: event.target.value })
                    }
                    rows={4}
                    className={clsx(
                      inputClassName,
                      "resize-none leading-relaxed"
                    )}
                    placeholder="Описание ивента"
                  />
                ) : (
                  <p className="px-1 text-sm leading-relaxed text-fg-2">
                    {draft.description || "Без описания"}
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-white/10 bg-white/3 p-4 text-sm text-fg-2">
                <div className={editableFieldClassName(isEditing)}>
                  <p className="mb-1.5 flex items-center gap-2 text-fg-3">
                    <CalendarDays className="size-4 shrink-0 text-accent" />
                    Начало
                  </p>
                  {isEditing ? (
                    <input
                      type="datetime-local"
                      value={draft.startsAt}
                      onChange={(event) =>
                        updateDraft({
                          startsAt: event.target.value,
                          tableIds: [],
                        })
                      }
                      className={inputClassName}
                    />
                  ) : (
                    <p className="px-1">
                      {formatEventDateTime(eventQuery.data!.startsAt)}
                    </p>
                  )}
                </div>

                <div className={editableFieldClassName(isEditing)}>
                  <p className="mb-1.5 flex items-center gap-2 text-fg-3">
                    <CalendarDays className="size-4 shrink-0 text-accent" />
                    Окончание
                  </p>
                  {isEditing ? (
                    <input
                      type="datetime-local"
                      value={draft.endsAt}
                      onChange={(event) =>
                        updateDraft({
                          endsAt: event.target.value,
                          tableIds: [],
                        })
                      }
                      className={inputClassName}
                    />
                  ) : (
                    <p className="px-1">
                      {formatEventDateTime(eventQuery.data!.endsAt)}
                    </p>
                  )}
                </div>

                <div className={editableFieldClassName(isEditing)}>
                  <p className="mb-1.5 flex items-center gap-2 text-fg-3">
                    <UsersRound className="size-4 shrink-0 text-accent" />
                    Вместимость стола
                  </p>
                  {isEditing ? (
                    <input
                      type="number"
                      min={1}
                      value={draft.seatsPerTable > 0 ? draft.seatsPerTable : ""}
                      onChange={(event) => {
                        const raw = event.target.value;

                        if (raw === "") {
                          updateDraft({ seatsPerTable: 0 });
                          return;
                        }

                        const parsed = Number(raw);

                        if (!Number.isNaN(parsed)) {
                          updateDraft({ seatsPerTable: parsed });
                        }
                      }}
                      className={inputClassName}
                    />
                  ) : (
                    <p className="px-1">
                      {draft.seatsPerTable} {getSeatsLabel(draft.seatsPerTable)}
                    </p>
                  )}
                </div>

                <div className={editableFieldClassName(isEditing)}>
                  <p className="mb-1.5 flex items-center gap-2 text-fg-3">
                    <Table2 className="size-4 shrink-0 text-accent" />
                    Столы
                  </p>
                  {isEditing ? (
                    <>
                      {!hasTimeRange ? (
                        <p className="px-1 text-sm text-fg-3">
                          Сначала выберите временной промежуток
                        </p>
                      ) : emptyTablesQuery.isLoading ? (
                        <div className="flex items-center gap-2 px-1 text-sm text-fg-3">
                          <LoaderCircle className="size-4 animate-spin text-accent" />
                          Загрузка столов...
                        </div>
                      ) : emptyTablesQuery.isError ? (
                        <p className="px-1 text-sm text-red-200">
                          Не удалось загрузить столы
                        </p>
                      ) : emptyTablesQuery.data?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {emptyTablesQuery.data.map((table) => {
                            const isSelected = tableIds.includes(table.id);

                            return (
                              <button
                                key={table.id}
                                type="button"
                                onClick={() => toggleTableId(table.id)}
                                className={clsx(
                                  "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                                  isSelected
                                    ? "border-accent bg-accent text-accent-foreground"
                                    : "border-white/10 bg-white/5 text-white hover:border-white/20"
                                )}
                              >
                                {table.name}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="px-1 text-sm text-fg-3">
                          Нет свободных столов
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="px-1">Столы: {tablesLabel}</p>
                  )}
                </div>
              </div>

              {!isCreate && eventQuery.data && (
                <div className="space-y-1 text-xs text-fg-3">
                  <p>
                    Создан:{" "}
                    {formatReservationDateTime(eventQuery.data.createdAt)}
                  </p>
                  <p>
                    Обновлён:{" "}
                    {formatReservationDateTime(eventQuery.data.updatedAt)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {canShowForm && (
          <div className="shrink-0 space-y-3 border-t border-white/10 px-5 py-4">
            {saveError && (
              <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {saveError}
              </div>
            )}

            {!isCreate && !isEditing ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={deleteMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95 disabled:opacity-60"
                >
                  <Pencil className="size-4" />
                  Редактировать
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaveError(null);
                    setIsDeleteConfirmOpen(true);
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200 transition-transform active:scale-95 disabled:opacity-60"
                >
                  <Trash2 className="size-4" />
                  Удалить
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saveMutation.isPending}
                  className="w-full rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Отменить
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!hasChanges || saveMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
                >
                  {saveMutation.isPending ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      {isCreate ? "Создаём…" : "Сохраняем…"}
                    </>
                  ) : (
                    "Применить"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isCropEditorOpen && bannerPreview && (
        <ImageCropEditor
          key={bannerPreview}
          imageSrc={bannerPreview}
          initialCrop={draft?.bannerCrop}
          title="Отображение баннера"
          onCancel={() => setIsCropEditorOpen(false)}
          onApply={(bannerCrop) => {
            updateDraft({ bannerCrop });
            setIsCropEditorOpen(false);
          }}
        />
      )}

      {isDeleteConfirmOpen && draft && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-overlay/70 px-4 pb-8 pt-6 sm:items-center"
          onClick={() => {
            if (!deleteMutation.isPending) {
              setIsDeleteConfirmOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-app-elevated"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-white/10 px-5 py-5">
              <h2 className="text-lg font-semibold">Удалить ивент?</h2>
              <p className="mt-2 text-sm text-fg-2">{draft.title}</p>
            </div>

            <p className="px-5 py-4 text-sm text-fg-2">
              Это действие нельзя отменить.
            </p>

            <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-400/15 px-4 py-3 text-sm font-semibold text-red-200 disabled:opacity-60"
              >
                {deleteMutation.isPending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Удаляем...
                  </>
                ) : (
                  "Да, удалить"
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={deleteMutation.isPending}
                className="w-full rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
