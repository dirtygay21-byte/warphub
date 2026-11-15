/**
 * Картинки уведомлений (14.11.2026): для типов из каталога вместо текста — карточка-изображение (крупно главное), под ней — весь текст
 * подписью. Выключается в админке («Настройки») или NOTIFICATION_IMAGES=off.
 * Ошибка отрисовки никогда не мешает отправке — уйдёт обычный текст.
 */
import { KIND_BY_ID } from '../catalog';
import { cardCaption, parseNotificationCard } from './parse';
import { renderCardPng } from './render';

const cache = new Map<string, Promise<Uint8Array>>();

/** Тип уведомления для картинки: тип каталога или проверка «Тест себе» (`test:<тип>`); рассылки владельца — нет. */
export function cardKindOf(kind: string) {
  const id = kind.startsWith('test:') ? kind.slice(5) : kind;
  return KIND_BY_ID.get(id) ?? null;
}

export async function notificationImage(kind: string, text: string): Promise<{ png: Uint8Array; caption: string } | null> {
  if (process.env.NOTIFICATION_IMAGES === 'off') return null;
  const def = cardKindOf(kind);
  if (!def) return null;
  const key = `${def.id}\n${text}`;
  let job = cache.get(key);
  if (!job) {
    job = renderCardPng(parseNotificationCard(text, def.title));
    cache.set(key, job);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
    job.catch(() => cache.delete(key));
  }
  try {
    return { png: await job, caption: cardCaption(text) };
  } catch (error) {
    console.warn(`[notify] card image failed for ${kind}:`, (error as Error).message);
    return null;
  }
}
