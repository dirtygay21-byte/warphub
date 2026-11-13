/**
 * Фото юнитов WarpBuilder (13.11.2026): игрок прикрепляет фото своей миниатюры к инфолисту — оно показывается у этого юнита
 * во всех его ростерах. Хранится на устройстве (IndexedDB): миниатюра 128 px и изображение до 1280 px (JPEG); на сервер
 * не отправляется. Ключ — «игра:идентификатор инфолиста» («40k:000000123»). Хранилище недоступно (частный режим,
 * нет места) — фото просто нет, ростеры работают как раньше.
 */
import { useSyncExternalStore } from 'react';

const DB = 'warphub-unit-photos';
const STORE = 'photos';
const THUMB = 128;
const FULL = 1280;

type Row = { thumb: string; full: Blob; updatedAt: number };

const thumbs = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;
let loaded: Promise<void> | null = null;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('indexedDB'));
    } catch (e) {
      reject(e);
    }
  });
}
function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => (db.close(), resolve(req.result));
        t.onerror = t.onabort = () => (db.close(), reject(t.error ?? new Error('indexedDB')));
      }),
  );
}

/** Миниатюры всех фото — один раз за запуск (в память: несколько килобайт на фото). */
function load(): Promise<void> {
  loaded ??= open()
    .then(
      (db) =>
        new Promise<void>((resolve) => {
          const t = db.transaction(STORE, 'readonly');
          const cur = t.objectStore(STORE).openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c) return;
            const v = c.value as Partial<Row>;
            if (typeof v.thumb === 'string') thumbs.set(String(c.key), v.thumb);
            c.continue();
          };
          t.oncomplete = t.onerror = t.onabort = () => (db.close(), resolve());
        }),
    )
    .catch(() => undefined)
    .then(emit);
  return loaded;
}

export const photoKey = (game: '40k' | 'aos' | 'kt' | 'warcry', id: string) => `${game}:${id}`;

/** Миниатюра фото юнита (data URL) или null; компонент обновляется при добавлении и удалении. */
export function useUnitThumb(key: string | null): string | null {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      void load();
      return () => listeners.delete(l);
    },
    () => version,
  );
  return key ? (thumbs.get(key) ?? null) : null;
}

async function bitmap(file: Blob): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      // imageOrientation: фото с телефона — с учётом поворота из EXIF
      const b = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { w: b.width, h: b.height, draw: (ctx, w, h) => ctx.drawImage(b, 0, 0, w, h), close: () => b.close() };
    } catch {
      /* формат не поддержан createImageBitmap — пробуем <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image'));
      i.src = url;
    });
    return { w: img.naturalWidth, h: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function render(src: Awaited<ReturnType<typeof bitmap>>, max: number, square: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  if (square) {
    // миниатюра — квадрат по центру кадра
    const side = Math.min(src.w, src.h);
    c.width = c.height = Math.min(max, side);
    const k = c.width / side;
    ctx.translate(-((src.w - side) / 2) * k, -((src.h - side) / 2) * k);
    src.draw(ctx, src.w * k, src.h * k);
  } else {
    const k = Math.min(1, max / Math.max(src.w, src.h));
    c.width = Math.round(src.w * k);
    c.height = Math.round(src.h * k);
    src.draw(ctx, c.width, c.height);
  }
  return c;
}

/** Сохранить фото юнита из файла (камера или галерея). Возвращает текст ошибки или null. */
export async function saveUnitPhoto(key: string, file: Blob): Promise<string | null> {
  let src: Awaited<ReturnType<typeof bitmap>>;
  try {
    src = await bitmap(file);
  } catch {
    return 'Не удалось прочитать изображение — выберите фото в формате JPEG или PNG.';
  }
  try {
    if (!src.w || !src.h) return 'Пустое изображение.';
    const thumb = render(src, THUMB, true).toDataURL('image/jpeg', 0.82);
    const full = await new Promise<Blob | null>((resolve) => render(src, FULL, false).toBlob(resolve, 'image/jpeg', 0.85));
    if (!full) return 'Не удалось сжать изображение.';
    await tx('readwrite', (s) => s.put({ thumb, full, updatedAt: Date.now() } satisfies Row, key));
    thumbs.set(key, thumb);
    emit();
    return null;
  } catch {
    return 'Не удалось сохранить фото на устройстве (нет места или хранилище недоступно).';
  } finally {
    src.close();
  }
}

export async function removeUnitPhoto(key: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(key));
  } catch {
    /* хранилище недоступно — убираем хотя бы из памяти */
  }
  thumbs.delete(key);
  emit();
}

/** Адрес полного изображения (object URL — вызвавший освобождает через URL.revokeObjectURL) или null. */
export async function unitPhotoUrl(key: string): Promise<string | null> {
  try {
    const row = (await tx('readonly', (s) => s.get(key))) as Row | undefined;
    return row?.full ? URL.createObjectURL(row.full) : null;
  } catch {
    return null;
  }
}
