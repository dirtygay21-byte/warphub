/**
 * Уведомления через Telegram-бота (тот же токен, что и для входа).
 *
 * Отправка никогда не ломает основной запрос: ошибки только пишутся в лог.
 * Отключить все уведомления (например, на тестовом сервере):
 *   TELEGRAM_NOTIFICATIONS=off
 */
import { getAdminTelegramIds } from '../../config/admin';
import { env } from '../../config/env';
import { describeSendResult, escapeHtml, formatClubDateTime, formatUserName, type SendResult } from '../../lib/telegram/format';

export { escapeHtml, formatClubDateTime, formatUserName };

/**
 * Маршрут к Telegram Bot API (14.11.2026). С серверов в России api.telegram.org часто недоступен (провайдеры режут
 * соединение — диагностика показывала «The operation timed out»). Обход — через свой сервер за границей:
 *   TELEGRAM_API_BASE=https://tg.example.com   — обратный прокси, пересылающий запросы на api.telegram.org;
 *   TELEGRAM_PROXY=http://user:pass@1.2.3.4:3128 — HTTP(S)-прокси за границей (Bun fetch, опция proxy).
 * Обе переменные — в .env backend, после изменения — перезапуск. Без них — прямое соединение, как раньше.
 */
export function telegramRoute() {
  const base = (process.env.TELEGRAM_API_BASE ?? '').trim().replace(/\/+$/, '') || 'https://api.telegram.org';
  const proxy = (process.env.TELEGRAM_PROXY ?? '').trim() || undefined;
  return { base, proxy };
}

/** Описание маршрута для админки — без логина, пароля и токена. */
export function describeRoute() {
  const { base, proxy } = telegramRoute();
  const safe = (u: string) => {
    try {
      const url = new URL(u);
      return `${url.protocol}//${url.host}`;
    } catch {
      return 'неверный адрес';
    }
  };
  return { base: safe(base), proxy: proxy ? safe(proxy) : null };
}

/** Запрос к Bot API по выбранному маршруту. */
function telegramFetch(method: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { base, proxy } = telegramRoute();
  const { timeoutMs = 10_000, ...rest } = init;
  return fetch(`${base}/bot${env.telegramBotToken}/${method}`, {
    ...rest,
    signal: AbortSignal.timeout(timeoutMs),
    ...(proxy ? { proxy } : {}),
  } as RequestInit);
}

function notificationsEnabled(): boolean {
  return (process.env.TELEGRAM_NOTIFICATIONS ?? 'on').toLowerCase() !== 'off';
}

/**
 * Журнал последних отправок (14.11.2026) — в памяти сервера, сбрасывается при перезапуске. Без текста сообщений:
 * когда, кому (Telegram ID), что за сообщение, результат. Нужен, чтобы видеть в админке, доходят ли уведомления.
 */
export type SendLogEntry = { at: string; chatId: string; kind: string; ok: boolean; reason?: string; status?: number; description?: string; ms: number };
const SEND_LOG_LIMIT = 60;
const sendLog: SendLogEntry[] = [];

export function recentSends(): SendLogEntry[] {
  return [...sendLog].reverse();
}

/** Кнопка под сообщением: path — открыть Mini App на этой странице, url — внешняя ссылка. */
export type MessageButton = { text: string; path?: string; url?: string };
export type MessageExtra = { imageUrl?: string | null; buttons?: MessageButton[] | null; broadcastId?: number | null };

/**
 * Картинка вместо текста (14.11.2026): подключается из notifications/hub.ts (настройка в базе), чтобы этот модуль
 * не зависел от базы. null — отправить обычный текст.
 */
type CardImageProvider = (kind: string, text: string) => Promise<{ png: Uint8Array; caption: string } | null>;
let cardImages: CardImageProvider | null = null;
export function setCardImageProvider(fn: CardImageProvider | null) {
  cardImages = fn;
}

/**
 * Наблюдатель отправок (14.11.2026): журнал в базе, отметка «не может получать» (403) и сигнал о восстановлении
 * связи — подключается из notifications/hub.ts, чтобы этот модуль не зависел от базы (юнит-тесты без PostgreSQL).
 */
type SendObserver = (entry: { chatId: string; kind: string; result: SendResult; broadcastId?: number | null }) => void;
let observer: SendObserver | null = null;
export function setSendObserver(fn: SendObserver | null) {
  observer = fn;
}

function remember(chatId: number | string, kind: string, result: SendResult, ms: number, broadcastId?: number | null) {
  sendLog.push({
    at: new Date().toISOString(),
    chatId: String(chatId),
    kind,
    ok: result.ok,
    ...(result.ok ? {} : { reason: result.reason, status: result.status, description: result.description?.slice(0, 200) }),
    ms,
  });
  if (sendLog.length > SEND_LOG_LIMIT) sendLog.splice(0, sendLog.length - SEND_LOG_LIMIT);
  try {
    observer?.({ chatId: String(chatId), kind, result, broadcastId });
  } catch (error) {
    console.warn('[notify] observer failed', (error as Error).message);
  }
}

/** Адрес Mini App для кнопок «открыть приложение» (MINI_APP_URL в .env, по умолчанию https://warphub.ru). */
export function miniAppUrl(path = '/') {
  const base = (process.env.MINI_APP_URL ?? 'https://warphub.ru').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function replyMarkup(buttons: MessageButton[] | null | undefined) {
  const rows = (buttons ?? [])
    .filter((b) => b.text.trim() && (b.path || b.url))
    .slice(0, 3)
    .map((b) => [b.url ? { text: b.text.trim(), url: b.url } : { text: b.text.trim(), web_app: { url: miniAppUrl(b.path!) } }]);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

/** Подпись к картинке в Telegram — до 1024 символов; длиннее — картинка отдельно, текст следом. */
const CAPTION_LIMIT = 1024;

/** Отправить сообщение и вернуть подробный результат (для проверки уведомлений из админки). */
export async function sendTelegramMessageDetailed(
  chatId: number | string,
  text: string,
  kind = 'message',
  extra: MessageExtra = {},
): Promise<SendResult> {
  const started = Date.now();
  let result: SendResult | null = null;
  if (cardImages && !extra.imageUrl && notificationsEnabled()) {
    const card = await cardImages(kind, text).catch(() => null);
    if (card) {
      result = await sendCard(chatId, card, extra);
      // Telegram не принял картинку (не сеть и не блокировка) — отправим текстом
      if (!result.ok && result.reason === 'telegram' && result.status !== 403 && result.status !== 401) result = null;
    }
  }
  result ??= await sendRaw(chatId, text, extra);
  remember(chatId, kind, result, Date.now() - started, extra.broadcastId);
  return result;
}

async function readFailure(response: Response, chatId: number | string): Promise<SendResult> {
  // 403 — пользователь не нажимал «Старт» у бота или заблокировал его; 401 — неверный токен
  const body = await response.text().catch(() => '');
  let description: string | undefined;
  try {
    description = (JSON.parse(body) as { description?: string }).description;
  } catch {
    description = body.slice(0, 200) || undefined;
  }
  console.warn(`[notify] Telegram ${response.status} for chat ${chatId}: ${body.slice(0, 200)}`);
  return { ok: false, reason: 'telegram', status: response.status, description };
}

async function sendCard(chatId: number | string, card: { png: Uint8Array; caption: string }, extra: MessageExtra): Promise<SendResult> {
  if (!notificationsEnabled()) return { ok: false, reason: 'disabled' };
  const markup = replyMarkup(extra.buttons);
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', new Blob([card.png], { type: 'image/png' }), 'warphub.png');
    form.append('caption', card.caption);
    form.append('parse_mode', 'HTML');
    if (markup) form.append('reply_markup', JSON.stringify(markup));
    const photo = await telegramFetch('sendPhoto', { method: 'POST', body: form, timeoutMs: 30_000 });
    if (!photo.ok) return await readFailure(photo, chatId);
    return { ok: true };
  } catch (error) {
    console.warn(`[notify] card failed for chat ${chatId}:`, (error as Error).message);
    return { ok: false, reason: 'network', description: (error as Error).message };
  }
}

async function sendRaw(chatId: number | string, text: string, extra: MessageExtra = {}): Promise<SendResult> {
  if (!notificationsEnabled()) return { ok: false, reason: 'disabled' };
  const markup = replyMarkup(extra.buttons);

  try {
    if (extra.imageUrl) {
      // картинку сервер скачивает сам (из своего хранилища) и отправляет файлом — Telegram может не достать до сервера в России
      const image = await fetch(extra.imageUrl, { signal: AbortSignal.timeout(15_000) });
      if (!image.ok) return { ok: false, reason: 'telegram', status: 0, description: `картинка не загрузилась: ${image.status}` };
      const blob = await image.blob();
      const withCaption = text.length <= CAPTION_LIMIT;
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('photo', blob, 'image' + (blob.type.includes('png') ? '.png' : '.jpg'));
      if (withCaption) {
        form.append('caption', text);
        form.append('parse_mode', 'HTML');
        if (markup) form.append('reply_markup', JSON.stringify(markup));
      }
      const photo = await telegramFetch('sendPhoto', { method: 'POST', body: form, timeoutMs: 30_000 });
      if (!photo.ok) return await readFailure(photo, chatId);
      if (withCaption) return { ok: true };
    }

    const response = await telegramFetch('sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(markup ? { reply_markup: markup } : {}),
      }),
    });

    if (!response.ok) return await readFailure(response, chatId);
    return { ok: true };
  } catch (error) {
    console.warn(`[notify] failed for chat ${chatId}:`, (error as Error).message);
    return { ok: false, reason: 'network', description: (error as Error).message };
  }
}

export async function sendTelegramMessage(chatId: number | string, text: string, kind = 'message'): Promise<boolean> {
  return (await sendTelegramMessageDetailed(chatId, text, kind)).ok;
}

/** Отправить сообщение всем администраторам (не ждёт результата) */
export function notifyAdmins(text: string): void {
  for (const adminId of getAdminTelegramIds()) {
    void sendTelegramMessage(adminId, text, 'admin');
  }
}

/** Отправить сообщение пользователю (не ждёт результата) */
export function notifyUser(telegramId: number | null | undefined, text: string) {
  if (!telegramId) return;
  void sendTelegramMessage(telegramId, text, 'user');
}

/**
 * Проверка уведомлений из админки: тестовое сообщение администратору, который нажал кнопку,
 * и понятный ответ, что произошло (доставлено / нужно нажать «Старт» / неверный токен / выключено / нет связи).
 */
export async function testNotification(admin: { telegramId: number; firstName: string }) {
  const result = await sendTelegramMessageDetailed(
    admin.telegramId,
    `🔔 <b>Проверка уведомлений WarpHub</b>\nЕсли вы видите это сообщение, бот может писать вам. Уведомления о записях приходят всем администраторам.`,
    'test-admin',
  );
  return { ...describeSendResult(result), recipients: getAdminTelegramIds().length };
}

const lastUserTest = new Map<number, number>();
const USER_TEST_GAP_MS = 30_000;

/**
 * Проверка уведомлений из профиля (13.11.2026): тестовое сообщение самому пользователю и понятный ответ.
 * Не чаще раза в 30 секунд на пользователя.
 */
export async function testUserNotification(user: { telegramId: number }, now = Date.now()) {
  const last = lastUserTest.get(user.telegramId) ?? 0;
  if (now - last < USER_TEST_GAP_MS) return { ok: false, message: 'Проверка уже отправлена — повторить можно через полминуты.' };
  lastUserTest.set(user.telegramId, now);
  const result = await sendTelegramMessageDetailed(
    user.telegramId,
    `🔔 <b>Уведомления WarpHub работают</b>\nСюда придут подтверждения записей, сообщения о сопернике и об отмене.`,
    'test-user',
  );
  const d = describeSendResult(result);
  // пользователю — без подробностей о сервере и токене
  if (d.ok) return { ok: true, message: d.message };
  if (!result.ok && result.reason === 'telegram' && result.status === 403) return { ok: false, needsStart: true, message: 'Бот пока не может писать вам. Нажмите «Разрешить уведомления» или откройте чат с ботом и нажмите «Старт».' };
  return { ok: false, message: 'Сейчас не получилось отправить сообщение — попробуйте позже.' };
}

/**
 * Диагностика уведомлений для админки (14.11.2026): включены ли, отвечает ли Telegram (getMe — какой бот,
 * сколько миллисекунд), кто получает уведомления администраторов и чем закончились последние отправки.
 * Ничего не отправляет. Токен не показывается.
 */
export async function notificationDiagnostics() {
  const enabled = notificationsEnabled();
  let bot: { ok: boolean; username?: string; ms: number; error?: string };
  const started = Date.now();
  try {
    const response = await telegramFetch('getMe');
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string }; description?: string };
    bot = body.ok
      ? { ok: true, username: body.result?.username, ms: Date.now() - started }
      : { ok: false, ms: Date.now() - started, error: `Telegram ${response.status}: ${body.description ?? 'нет ответа'}` };
  } catch (error) {
    bot = { ok: false, ms: Date.now() - started, error: `нет связи с ${describeRoute().base}${describeRoute().proxy ? ` через прокси ${describeRoute().proxy}` : ''}: ${(error as Error).message}` };
  }
  const log = recentSends();
  const admins = getAdminTelegramIds().map((id) => {
    const last = log.find((e) => e.chatId === id);
    return { telegramId: id, last: last ?? null };
  });
  return { enabled, bot, route: describeRoute(), admins, recent: log.slice(0, 30), since: SERVER_STARTED };
}

const SERVER_STARTED = new Date().toISOString();
