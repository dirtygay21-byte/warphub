import type { ImageCrop } from "@/types";
import { LoaderCircle, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area, type Point } from "react-easy-crop";

type ImageCropEditorProps = {
  imageSrc: string;
  initialCrop?: ImageCrop | null;
  title: string;
  onApply: (crop: ImageCrop) => void;
  onCancel: () => void;
};

const clampZoom = (value: number) => Math.min(5, Math.max(1, value));

export default function ImageCropEditor({
  imageSrc,
  initialCrop,
  title,
  onApply,
  onCancel,
}: ImageCropEditorProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [completedCrop, setCompletedCrop] = useState<ImageCrop | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleCropComplete = (percentages: Area) => {
    setCompletedCrop(percentages);
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  return createPortal(
    <div
      className="ds-fade fixed inset-0 z-[70] flex items-end justify-center bg-overlay/80 p-4 sm:items-center"
      onClick={(event) => {
        event.stopPropagation();
        onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ds-sheet flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-app-elevated text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Закрыть"
            className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-white/80 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/60 touch-none">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={16 / 9}
              minZoom={1}
              maxZoom={5}
              objectFit="cover"
              initialCroppedAreaPercentages={initialCrop ?? undefined}
              onCropChange={setCrop}
              onZoomChange={(value) => setZoom(clampZoom(value))}
              onCropComplete={handleCropComplete}
            />
          </div>

          <p className="mt-3 text-sm leading-relaxed text-fg-3">
            Перетаскивайте изображение и меняйте масштаб, чтобы выбрать видимую область.
          </p>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom((value) => clampZoom(value - 0.1))}
              disabled={zoom <= 1}
              aria-label="Уменьшить"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/3 transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <input
              type="range"
              min={1}
              max={5}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              aria-label="Масштаб изображения"
              className="h-11 min-w-0 flex-1 accent-accent"
            />
            <button
              type="button"
              onClick={() => setZoom((value) => clampZoom(value + 0.1))}
              disabled={zoom >= 5}
              aria-label="Увеличить"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/3 transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Сбросить настройки"
              title="Сбросить настройки"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/3 transition-colors hover:bg-white/10"
            >
              <RotateCcw className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-white/10 px-5 py-4 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!completedCrop}
            onClick={() => completedCrop && onApply(completedCrop)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-[0.99] disabled:opacity-40"
          >
            {!completedCrop && <LoaderCircle className="size-4 animate-spin" />}
            Применить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
