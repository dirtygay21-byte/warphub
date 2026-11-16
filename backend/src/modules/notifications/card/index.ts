/**
 * Картинки уведомлений (14.11.2026): для типов из каталога вместо текста — карточка-изображение (крупно главное), под ней — весь текст
 * подписью. Выключается в админке («Настройки») или NOTIFICATION_IMAGES=off.
 * Ошибка отрисовки никогда не мешает отправке — уйдёт обычный текст.
 */
import { KIND_BY_ID } from '../catalog';
import { cardCaption, parseNotificationCard } from './parse';
import { renderCardGif, renderCardMp4, renderCardPng } from './render';

/** Готовая картинка: фото (PNG) или анимация (MP4, запасной вариант — GIF) → Telegram sendAnimation. */
export type CardFile = { data: Uint8Array; animated: boolean; format: 'png' | 'gif' | 'mp4'; caption: string };

const cache = new Map<string, Promise<Uint8Array>>();

/** Тип уведомления для картинки: тип каталога или проверка «Тест себе» (`test:<тип>`). */
export function cardKindOf(kind: string) {
  const id = kind.startsWith('test:') ? kind.slice(5) : kind;
  return KIND_BY_ID.get(id) ?? null;
}

/**
 * Надзаголовок для сообщений вне каталога (16.11.2026, владелец: «картинка — на каждое уведомление»): награды мини-игр,
 * очки и промокоды, D&D, пересадка за другой стол, доступ к админке, рассылки и т. п. отправляются старыми помощниками
 * (notifyUser / notifyAdmins) с типами user / admin / message — у них тоже картинка; заголовок берётся из первой строки.
 */
const FALLBACK_TITLE: Record<string, string> = { admin: 'Администраторам', user: 'WarpHub', message: 'WarpHub', test: 'Проверка' };
export function cardTitleOf(kind: string): { id: string; title: string } {
  const def = cardKindOf(kind);
  if (def) return { id: def.id, title: def.title };
  const base = kind.startsWith('broadcast') ? 'broadcast' : kind;
  return { id: base, title: FALLBACK_TITLE[base] ?? 'WarpHub' };
}

function cached(key: string, render: () => Promise<Uint8Array>) {
  let job = cache.get(key);
  if (!job) {
    job = render();
    cache.set(key, job);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
    job.catch(() => cache.delete(key));
  }
  return job;
}

/**
 * Картинка уведомления. animated — анимированная (15.11.2026, «Анимация» в настройках); не получилась анимация —
 * отправится обычная картинка, не получилась и она — текст.
 */
export async function notificationImage(kind: string, text: string, animated = false): Promise<CardFile | null> {
  if (process.env.NOTIFICATION_IMAGES === 'off') return null;
  const def = cardTitleOf(kind);
  const caption = cardCaption(text);
  const card = () => parseNotificationCard(text, def.title);
  if (animated && process.env.NOTIFICATION_ANIMATION !== 'off') {
    // MP4 — чёткий (GIF Telegram пережимает и размывает); не вышел MP4 — GIF
    try {
      return { data: await cached(`mp4\n${def.id}\n${text}`, () => renderCardMp4(card())), animated: true, format: 'mp4', caption };
    } catch (error) {
      console.warn(`[notify] card mp4 failed for ${kind}:`, (error as Error).message);
    }
    try {
      return { data: await cached(`gif\n${def.id}\n${text}`, () => renderCardGif(card())), animated: true, format: 'gif', caption };
    } catch (error) {
      console.warn(`[notify] card animation failed for ${kind}:`, (error as Error).message);
    }
  }
  try {
    return { data: await cached(`png\n${def.id}\n${text}`, () => renderCardPng(card())), animated: false, format: 'png', caption };
  } catch (error) {
    console.warn(`[notify] card image failed for ${kind}:`, (error as Error).message);
    return null;
  }
}
