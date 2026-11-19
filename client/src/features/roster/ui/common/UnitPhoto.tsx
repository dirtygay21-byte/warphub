/**
 * Фото юнита (13.11.2026): миниатюра в шапке карточки (рядом с названием и очками) и блок в раскрытой карточке —
 * добавить (камера или галерея), открыть во весь экран, заменить, убрать. Хранение — ../../photos.ts (на устройстве).
 * 16.11.2026: фото видно без раскрытия карточки — крупная миниатюра в строке юнита открывает просмотр, лента «Фото армии»
 * в редакторе и ряд фото на карточке ростера; просмотр листается по всем фото ростера.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { removeUnitPhoto, saveUnitPhoto, unitPhotoUrl, useThumbLookup, useUnitThumb } from '../../photos';
import { photoItems, rosterCardPhotos, type PhotoItem } from '../../photoList';
import { haptic, pushOverlay } from '../../telegram';
import { Button, Icon } from '../kit';
import { cx } from '../util';
import { useT } from './i18n';

/** Блок фото в раскрытой карточке. readOnly — только просмотр. */
export function UnitPhotoBlock({ photoKey, name, readOnly = false }: { photoKey: string; name: string; readOnly?: boolean }) {
  const t = useT();
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
          <button type="button" aria-label={t(`Фото: ${name} — открыть`, `Photo: ${name} — open`)} onClick={() => (haptic.tap(), setView(true))} className="shrink-0 overflow-hidden rounded-xl border border-white/15 active:opacity-80">
            <img src={thumb} alt="" className="size-20 object-cover" draggable={false} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{t('Фото миниатюры', 'Miniature photo')}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-fg-3">{t('Хранится на этом устройстве, видно во всех ваших ростерах с этим юнитом.', 'Stored on this device, shown in all your rosters with this unit.')}</p>
            {!readOnly && (
              <div className="mt-1.5 flex gap-1.5">
                <Button variant="outline" className="h-8 min-h-0 px-2.5 text-xs" disabled={busy} onClick={() => input.current?.click()}>
                  {busy ? t('Сохраняем…', 'Saving…') : t('Заменить', 'Replace')}
                </Button>
                <Button variant="ghost" className="h-8 min-h-0 px-2.5 text-xs" disabled={busy} onClick={() => (haptic.tap(), void removeUnitPhoto(photoKey))}>
                  <Icon name="trash" className="size-3.5" /> {t('Убрать', 'Remove')}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="camera" /> {busy ? t('Сохраняем…', 'Saving…') : t('Добавить фото миниатюры', 'Add a miniature photo')}
        </Button>
      )}
      {error && <p className="mt-1.5 text-[12.5px] text-danger">{error}</p>}
      {view && <PhotoViewer items={[{ key: photoKey, name }]} start={0} onClose={() => setView(false)} />}
    </div>
  );
}

type PhotosCtx = { shown: PhotoItem[]; open: (key: string) => void };
const Ctx = createContext<PhotosCtx | null>(null);

/**
 * Фото ростера для ленты и строк юнитов: items — все юниты ростера (по порядку), onOpenCard — открыть карточку юнита из
 * просмотра; readOnly — без замены фото.
 */
export function RosterPhotos({ items, onOpenCard, readOnly = false, children }: { items: PhotoItem[]; onOpenCard?: (item: PhotoItem) => void; readOnly?: boolean; children: ReactNode }) {
  const thumbOf = useThumbLookup();
  const shown = useMemo(() => photoItems(items, (k) => !!thumbOf(k)), [items, thumbOf]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const start = openKey ? shown.findIndex((i) => i.key === openKey) : -1;
  const value = useMemo(() => ({ shown, open: setOpenKey }), [shown]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {start >= 0 && (
        <PhotoViewer
          items={shown}
          start={start}
          readOnly={readOnly}
          onClose={() => setOpenKey(null)}
          onOpenCard={onOpenCard ? (it) => (setOpenKey(null), onOpenCard(it)) : undefined}
        />
      )}
    </Ctx.Provider>
  );
}

/**
 * Фото в строке юнита (вне кнопки раскрытия): есть фото — крупная миниатюра, нажатие открывает просмотр без раскрытия
 * карточки; фото нет, но в ростере фото есть — пустая рамка с камерой (открывает карточку, где фото добавляется);
 * в ростере фото нет совсем — ничего, строка как раньше.
 */
export function UnitThumbButton({ photoKey, name, onEmpty, className }: { photoKey: string; name: string; onEmpty?: () => void; className?: string }) {
  const t = useT();
  const thumb = useUnitThumb(photoKey);
  const ctx = useContext(Ctx);
  const [solo, setSolo] = useState(false);
  if (!thumb && !ctx?.shown.length) return null;
  return (
    <span className={cx('flex shrink-0 items-center', className)}>
      {thumb ? (
        <button
          type="button"
          aria-label={t(`Фото: ${name} — открыть`, `Photo: ${name} — open`)}
          onClick={() => (haptic.tap(), ctx && ctx.shown.some((i) => i.key === photoKey) ? ctx.open(photoKey) : setSolo(true))}
          className="relative size-16 rounded-[14px] active:opacity-80"
        >
          <img src={thumb} alt="" className="size-16 rounded-[14px] border border-white/15 object-cover" draggable={false} />
          <span aria-hidden className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-lg bg-accent text-accent-foreground shadow-[0_0_0_3px_var(--color-bg-elevated)]">
            <Icon name="expand" className="size-3.5" strokeWidth={2.4} />
          </span>
        </button>
      ) : (
        <button
          type="button"
          aria-label={t(`${name}: фото нет — открыть карточку`, `${name}: no photo — open the card`)}
          onClick={() => (haptic.tap(), onEmpty?.())}
          className="grid size-16 place-items-center rounded-[14px] border-[1.5px] border-dashed border-white/20 text-fg-3 active:bg-white/5"
        >
          <Icon name="camera" className="size-5" />
        </button>
      )}
      {solo && <PhotoViewer items={[{ key: photoKey, name }]} start={0} onClose={() => setSolo(false)} />}
    </span>
  );
}

/** Лента «Фото армии» в редакторе: все фото ростера; фото нет — ничего. */
export function PhotoStrip({ className }: { className?: string }) {
  const t = useT();
  const ctx = useContext(Ctx);
  const thumbOf = useThumbLookup();
  if (!ctx?.shown.length) return null;
  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="font-display text-[15px] font-semibold uppercase tracking-wider text-fg-2">
          {t('Фото армии', 'Army photos')}
          <span className="ml-2 font-sans text-xs font-semibold text-fg-3">{ctx.shown.length}</span>
        </h2>
        <span className="text-xs text-fg-3">{t('Нажмите, чтобы посмотреть', 'Tap to view')}</span>
      </div>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {ctx.shown.map((it) => (
          <button key={it.key} type="button" aria-label={t(`Фото: ${it.name}`, `Photo: ${it.name}`)} onClick={() => (haptic.tap(), ctx.open(it.key))} className="w-[88px] shrink-0 text-left active:opacity-80">
            <img src={thumbOf(it.key) ?? ''} alt="" className="size-[88px] rounded-2xl border border-white/12 object-cover" draggable={false} />
            <span className="mt-1.5 block truncate text-[12px] text-fg-2">{it.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Ряд фото на карточке ростера в списке: до 4 фото, остаток («+N») или сколько юнитов без фото. Нажатие — просмотр;
 * в просмотре «Открыть ростер».
 */
export function RosterCardPhotos({ items, onOpenRoster, className }: { items: PhotoItem[]; onOpenRoster: () => void; className?: string }) {
  const t = useT();
  const thumbOf = useThumbLookup();
  const { shown, more, without } = useMemo(() => rosterCardPhotos(items, (k) => !!thumbOf(k)), [items, thumbOf]);
  const all = useMemo(() => photoItems(items, (k) => !!thumbOf(k)), [items, thumbOf]);
  const [open, setOpen] = useState(-1);
  if (!shown.length) return null;
  const tail = more ? `+${more}` : without ? `+${without}` : null;
  return (
    <div className={cx('flex gap-1.5', className)}>
      {shown.map((it, i) => (
        <button key={it.key} type="button" aria-label={t(`Фото: ${it.name}`, `Photo: ${it.name}`)} onClick={() => (haptic.tap(), setOpen(i))} className="aspect-square min-w-0 flex-1 active:opacity-80">
          <img src={thumbOf(it.key) ?? ''} alt="" className="size-full rounded-xl border border-white/12 object-cover" draggable={false} />
        </button>
      ))}
      {Array.from({ length: Math.max(0, 5 - shown.length - (tail ? 1 : 0)) }, (_, i) => (
        <span key={'gap' + i} aria-hidden className="min-w-0 flex-1" />
      ))}
      {tail && (
        <span className="grid aspect-square min-w-0 flex-1 place-items-center rounded-xl bg-white/[0.05] text-center text-[12px] leading-tight text-fg-2">
          <span>
            <b className="block text-[15px] text-fg">{tail}</b>
            {more ? t('фото', 'photos') : t('без фото', 'no photo')}
          </span>
        </span>
      )}
      {open >= 0 && <PhotoViewer items={all} start={open} onClose={() => setOpen(-1)} onOpenCard={() => (setOpen(-1), onOpenRoster())} openLabel={t('Открыть ростер', 'Open roster')} />}
    </div>
  );
}

/**
 * Просмотр фото во весь экран: листание (свайп, стрелки), название и подпись юнита, «Открыть карточку», замена фото
 * (не в режиме только чтения). Кнопка «Назад» Telegram закрывает просмотр.
 */
function PhotoViewer({
  items,
  start,
  onClose,
  onOpenCard,
  openLabel,
  readOnly = true,
}: {
  items: PhotoItem[];
  start: number;
  onClose: () => void;
  onOpenCard?: (item: PhotoItem) => void;
  openLabel?: string;
  readOnly?: boolean;
}) {
  const t = useT();
  const [i, setI] = useState(Math.min(Math.max(0, start), items.length - 1));
  const cur = items[i] ?? items[0];
  const n = items.length;
  // миниатюра меняется после замены — полное фото загружается заново
  const thumb = useUnitThumb(cur?.key ?? null);
  // загруженное полное фото: для какого ключа и какой версии миниатюры (после замены — загрузить заново)
  const [loaded, setLoaded] = useState<{ key: string; v: string | null; url: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const touch = useRef<number | null>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => pushOverlay(() => close.current()), []);
  const key = cur?.key ?? null;
  useEffect(() => {
    if (!key) return;
    let alive = true;
    let made: string | null = null;
    void unitPhotoUrl(key).then((u) => {
      if (!alive) return void (u && URL.revokeObjectURL(u));
      made = u;
      setLoaded({ key, v: thumb, url: u });
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [key, thumb]);
  const ready = loaded && loaded.key === key && loaded.v === thumb ? loaded : null;
  const url = ready?.url ?? null;
  const missing = !!ready && !ready.url;
  if (!cur) return null;

  const go = (d: number) => {
    if (n < 2) return;
    haptic.select();
    setError(null);
    setI((x) => (x + d + n) % n);
  };
  const replace = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const err = await saveUnitPhoto(cur.key, file);
    setBusy(false);
    setError(err);
    if (!err) haptic.ok();
  };

  return createPortal(
    <div role="dialog" aria-label={t(`Фото: ${cur.name}`, `Photo: ${cur.name}`)} className="fixed inset-0 z-[80] flex flex-col bg-black/95">
      <div className="flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{cur.name}</p>
          {cur.sub && <p className="mt-0.5 truncate text-[13px] text-fg-2">{cur.sub}</p>}
        </div>
        {n > 1 && (
          <span className="text-[13px] tabular-nums text-fg-3">
            {i + 1} / {n}
          </span>
        )}
        <button type="button" aria-label={t('Закрыть', 'Close')} onClick={onClose} className="grid size-11 place-items-center rounded-xl bg-white/10 active:bg-white/20">
          <Icon name="close" />
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-3"
        onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const x0 = touch.current;
          touch.current = null;
          const x1 = e.changedTouches[0]?.clientX;
          if (x0 == null || x1 == null || Math.abs(x1 - x0) < 50) return;
          go(x1 < x0 ? 1 : -1);
        }}
      >
        {url ? (
          <img src={url} alt={cur.name} className="max-h-full max-w-full select-none rounded-xl object-contain" draggable={false} />
        ) : (
          <p className="text-sm text-fg-3">{missing ? t('Фото не найдено на устройстве.', 'Photo not found on this device.') : t('Загружаем…', 'Loading…')}</p>
        )}
        {n > 1 && (
          <>
            <button type="button" aria-label={t('Предыдущее фото', 'Previous photo')} onClick={() => go(-1)} className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 active:bg-black/80">
              <Icon name="back" />
            </button>
            <button type="button" aria-label={t('Следующее фото', 'Next photo')} onClick={() => go(1)} className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 active:bg-black/80">
              <Icon name="chevron" />
            </button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="flex justify-center gap-1.5 py-1.5" aria-hidden>
          {items.map((it, k) => (
            <span key={it.key} className={cx('h-1.5 rounded-full transition-all', k === i ? 'w-4 bg-accent' : 'w-1.5 bg-white/25')} />
          ))}
        </div>
      )}
      {error && <p className="px-4 pt-1 text-center text-[12.5px] text-danger">{error}</p>}
      {(onOpenCard || !readOnly) && (
        <div className="flex gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
          {onOpenCard && (
            <Button variant="primary" className="flex-1" onClick={() => (haptic.tap(), onOpenCard(cur))}>
              {openLabel ?? t('Открыть карточку юнита', 'Open unit card')}
            </Button>
          )}
          {!readOnly && (
            <>
              <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => (void replace(e.target.files?.[0]), (e.target.value = ''))} />
              <button
                type="button"
                aria-label={busy ? t('Сохраняем…', 'Saving…') : t('Заменить фото', 'Replace photo')}
                disabled={busy}
                onClick={() => input.current?.click()}
                className={cx('grid h-12 shrink-0 place-items-center rounded-2xl bg-white/10 active:bg-white/20 disabled:opacity-50', onOpenCard ? 'w-12' : 'flex-1')}
              >
                <Icon name="camera" />
              </button>
            </>
          )}
        </div>
      )}
      {!onOpenCard && readOnly && <div className="pb-[calc(env(safe-area-inset-bottom)+16px)]" />}
    </div>,
    document.body,
  );
}
