/* eslint-disable react-hooks/set-state-in-effect */
import {
  createAdminNews,
  deleteAdminNews,
  getAdminNewsById,
  updateAdminNews,
  uploadAdminFile,
} from "@/apiUtils/admin";
import { formatReservationDateTime } from "@/utils/reservationDisplay";
import ContentImage from "@/components/ui/ContentImage";
import ImageCropEditor from "@/components/ui/ImageCropEditor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  CalendarDays,
  ImageIcon,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyNewsDraft,
  draftToPayload,
  draftsEqual,
  formatNewsDate,
  newsToDraft,
  type NewsDraft,
} from "../newsUtils";

type NewsDetailsModalProps = {
  mode: "create" | "edit";
  newsId?: number;
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

export default function NewsDetailsModal({
  mode,
  newsId,
  onClose,
}: NewsDetailsModalProps) {
  const isCreate = mode === "create";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emptyDraft = useMemo(() => createEmptyNewsDraft(), []);

  const [isEditing, setIsEditing] = useState(isCreate);
  const [draft, setDraft] = useState<NewsDraft | null>(
    isCreate ? emptyDraft : null
  );
  const [baselineDraft, setBaselineDraft] = useState<NewsDraft | null>(
    isCreate ? emptyDraft : null
  );
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isCropEditorOpen, setIsCropEditorOpen] = useState(false);

  const newsQuery = useQuery({
    queryKey: ["admin-news-item", newsId],
    queryFn: () => getAdminNewsById(newsId!),
    enabled: !isCreate && newsId != null,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (newsId == null) throw new Error("ID новости не указан");

      return deleteAdminNews(newsId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-news"] });
      queryClient.removeQueries({ queryKey: ["admin-news-item", newsId] });
      onClose();
    },
    onError: (error) => {
      setSaveError(
        error instanceof Error ? error.message : "Не удалось удалить новость"
      );
      setIsDeleteConfirmOpen(false);
    },
  });

  useEffect(() => {
    if (isCreate || !newsQuery.data) return;

    const nextDraft = newsToDraft(newsQuery.data);
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
    setPendingImageFile(null);
    setImagePreviewUrl(null);
    setIsEditing(false);
    setSaveError(null);
  }, [newsQuery.data, isCreate]);

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
      if (!draft) throw new Error("Данные новости не загружены");

      if (!draft.title.trim()) {
        throw new Error("Укажите заголовок новости");
      }

      if (!draft.text.trim()) {
        throw new Error("Укажите текст новости");
      }

      let coverUrl = draft.coverUrl;

      if (pendingImageFile) {
        const upload = await uploadAdminFile(pendingImageFile, "news");
        coverUrl = upload.url;
      }

      const payload = draftToPayload(draft, coverUrl);

      if (isCreate) {
        return createAdminNews(payload);
      }

      if (newsId == null) {
        throw new Error("ID новости не указан");
      }

      return updateAdminNews(newsId, payload);
    },
    onSuccess: (savedNews) => {
      queryClient.invalidateQueries({ queryKey: ["admin-news"] });

      if (isCreate) {
        onClose();
        return;
      }

      if (newsId != null) {
        queryClient.setQueryData(["admin-news-item", newsId], savedNews);
      }

      const nextDraft = newsToDraft(savedNews);
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
    if (isCreate) {
      if (saveMutation.isPending) return;
      saveMutation.mutate();
      return;
    }

    if (!hasChanges || saveMutation.isPending) return;

    saveMutation.mutate();
  };

  const handleImageSelect = (file: File | null) => {
    if (!file || !isEditing) return;

    setPendingImageFile(file);
    setDraft((current) => (current ? { ...current, coverCrop: null } : current));
    setIsCropEditorOpen(true);
    setSaveError(null);
  };

  const updateDraft = (patch: Partial<NewsDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setSaveError(null);
  };

  const coverPreview = imagePreviewUrl ?? draft?.coverUrl ?? "";
  const canShowForm = draft && (isCreate || newsQuery.data);
  const canPublish =
    isCreate && Boolean(draft?.title.trim()) && Boolean(draft?.text.trim());

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
              ? "Создание новости"
              : isEditing
              ? "Редактирование новости"
              : "Информация о новости"}
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
          {!isCreate && newsQuery.isLoading && (
            <div className="flex min-h-48 items-center justify-center py-10">
              <LoaderCircle className="size-8 animate-spin text-accent" />
            </div>
          )}

          {!isCreate && newsQuery.isError && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
              <p className="text-sm text-fg-2">
                Не удалось загрузить новость. Попробуйте ещё раз.
              </p>
              <button
                type="button"
                onClick={() => newsQuery.refetch()}
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
                {coverPreview ? (
                  <ContentImage
                    src={coverPreview}
                    alt={draft.title || "Обложка новости"}
                    crop={draft.coverCrop}
                    className="aspect-video w-full"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-white/5 text-sm text-fg-3">
                    Без обложки
                  </div>
                )}

                {isEditing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-overlay/45 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="inline-flex items-center gap-2">
                      <ImageIcon className="size-4" />
                      {coverPreview
                        ? "Изменить изображение"
                        : "Добавить изображение"}
                    </span>
                  </div>
                )}
              </button>

              {isEditing && coverPreview && (
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
                    placeholder="Заголовок"
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
                    value={draft.text}
                    onChange={(event) =>
                      updateDraft({ text: event.target.value })
                    }
                    rows={6}
                    className={clsx(
                      inputClassName,
                      "resize-none leading-relaxed"
                    )}
                    placeholder="Текст новости"
                  />
                ) : (
                  <p className="whitespace-pre-wrap px-1 text-sm leading-relaxed text-fg-2">
                    {draft.text || "Без текста"}
                  </p>
                )}
              </div>

              {!isCreate && newsQuery.data && (
                <div className="space-y-3 rounded-xl border border-white/10 bg-white/3 p-4 text-sm text-fg-2">
                  <p className="flex items-start gap-2">
                    <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span>
                      Опубликовано: {formatNewsDate(newsQuery.data.publishedAt)}
                    </span>
                  </p>
                </div>
              )}

              {!isCreate && newsQuery.data?.createdAt && (
                <div className="space-y-1 text-xs text-fg-3">
                  <p>
                    Создана:{" "}
                    {formatReservationDateTime(newsQuery.data.createdAt)}
                  </p>
                  {newsQuery.data.updatedAt && (
                    <p>
                      Обновлена:{" "}
                      {formatReservationDateTime(newsQuery.data.updatedAt)}
                    </p>
                  )}
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

            {isCreate ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saveMutation.isPending}
                  className="w-full rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!canPublish || saveMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
                >
                  {saveMutation.isPending ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      Публикуем...
                    </>
                  ) : (
                    "Опубликовать"
                  )}
                </button>
              </div>
            ) : !isEditing ? (
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
                      Сохраняем...
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

      {isCropEditorOpen && coverPreview && (
        <ImageCropEditor
          key={coverPreview}
          imageSrc={coverPreview}
          initialCrop={draft?.coverCrop}
          title="Отображение обложки"
          onCancel={() => setIsCropEditorOpen(false)}
          onApply={(coverCrop) => {
            updateDraft({ coverCrop });
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
              <h2 className="text-lg font-semibold">Удалить новость?</h2>
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
