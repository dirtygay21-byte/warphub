/**
 * Фото юнита (13.11.2026): миниатюра в шапке карточки (рядом с названием и очками) и блок в раскрытой карточке —
 * добавить (камера или галерея), открыть во весь экран, заменить, убрать. Хранение — ../../photos.ts (на устройстве).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { removeUnitPhoto, saveUnitPhoto, unitPhotoUrl, useUnitThumb } from '../../photos';
import { haptic, pushOverlay } from '../../telegram';
import { Button, Icon } from '../kit';
import { cx } from '../util';

/** Миниатюра в шапке карточки; фото нет — ничего (шапка остаётся компактной). */
export function UnitThumb({ photoKey, className }: { photoKey: string; className?: string }) {
  const thumb = useUnitThumb(photoKey);
  if (!thumb) return null;
  return <img src={thumb} alt="" className={cx('size-11 shrink-0 rounded-lg border border-white/15 object-cover', className)} draggable={false} />;
}

/** Блок фото в раскрытой карточке. readOnly — только просмотр. */
export function UnitPhotoBlock({ photoKey, name, readOnly = false }: { photoKey: string; name: string; readOnly?: boolean }) {
  const thumb = useUnitThumb(photoKey);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState(false);
  if (readOnly && !thumb) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const err = await saveUnitPhoto(photoKey, file);
    setBusy(false);
    setError(err);
    if (!err) haptic.ok();
  };

  return (
    <div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => (void pick(e.target.files?.[0]), (e.target.value = ''))} />
      {thumb ? (
        <div className="flex items-center gap-3">
          <button type="button" aria-label={`Фото: ${name} — открыть`} onClick={() => (haptic.tap(), setView(true))} className="shrink-0 overflow-hidden rounded-xl border border-white/15 active:opacity-80">
            <img src={thumb} alt="" className="size-20 object-cover" draggable={false} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Фото миниатюры</p>
            <p className="mt-0.5 text-[12px] leading-snug text-fg-3">Хранится на этом устройстве, видно во всех ваших ростерах с этим юнитом.</p>
            {!readOnly && (
              <div className="mt-1.5 flex gap-1.5">
                <Button variant="outline" className="h-8 min-h-0 px-2.5 text-xs" disabled={busy} onClick={() => input.current?.click()}>
                  {busy ? 'Сохраняем…' : 'Заменить'}
                </Button>
                <Button variant="ghost" className="h-8 min-h-0 px-2.5 text-xs" disabled={busy} onClick={() => (haptic.tap(), void removeUnitPhoto(photoKey))}>
                  <Icon name="trash" className="size-3.5" /> Убрать
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="camera" /> {busy ? 'Сохраняем…' : 'Добавить фото миниатюры'}
        </Button>
      )}
      {error && <p className="mt-1.5 text-[12.5px] text-danger">{error}</p>}
      {view && <PhotoViewer photoKey={photoKey} name={name} onClose={() => setView(false)} />}
    </div>
  );
}

function PhotoViewer({ photoKey, name, onClose }: { photoKey: string; name: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void unitPhotoUrl(photoKey).then((u) => {
      if (!alive) return void (u && URL.revokeObjectURL(u));
      made = u;
      setUrl(u);
      setMissing(!u);
    });
    const pop = pushOverlay(onClose);
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
      pop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- открытие одного фото
  }, [photoKey]);
  return createPortal(
    <div role="dialog" aria-label={`Фото: ${name}`} className="fixed inset-0 z-[80] flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+12px)]">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</p>
        <button type="button" aria-label="Закрыть" onClick={onClose} className="grid size-10 place-items-center rounded-xl bg-white/10 active:bg-white/20">
          <Icon name="close" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {url ? <img src={url} alt={name} className="max-h-full max-w-full rounded-xl object-contain" /> : <p className="text-sm text-fg-3">{missing ? 'Фото не найдено на устройстве.' : 'Загружаем…'}</p>}
      </div>
    </div>,
    document.body,
  );
}
