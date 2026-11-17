/**
 * WarpBuilder для подписчиков Boosty (17.11.2026, решение владельца): участник группы подписчиков получает доступ
 * сразу при вступлении — без кода и без нажатий. Бот WarpHub (администратор группы) получает события Telegram
 * (вступил / вышел / удалён) длинным опросом getUpdates — только если у бота нет webhook другого сервиса.
 * Пропущенные события и тех, кто вступил раньше, покрывает проверка getChatMember при входе в WarpBuilder.
 * Доступ через группу действует, пока человек в группе; доступ по коду и администраторам — как раньше.
 * Чистые функции — tests/roster-group.test.ts.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { telegramGroupMembersTable, telegramGroupsTable } from '../../db/schema';
import { notifyKind } from '../notifications/hub';
import { telegramFetch } from '../notifications/service';

import { classifyUpdate, isMemberStatus, type Chat, type ChatMemberLike, type TelegramUpdate } from './group-rules';

export type { TelegramUpdate };

// ---------- состояние ----------

let boostyChatCache: { id: number | null; at: number } | null = null;

/** Выбранная группа Boosty (кеш 1 мин); null — не выбрана. */
export async function boostyChatId(): Promise<number | null> {
  if (boostyChatCache && Date.now() - boostyChatCache.at < 60_000) return boostyChatCache.id;
  const [row] = await db.select({ id: telegramGroupsTable.chatId }).from(telegramGroupsTable).where(eq(telegramGroupsTable.purpose, 'boosty'));
  boostyChatCache = { id: row?.id ?? null, at: Date.now() };
  return boostyChatCache.id;
}

async function rememberGroup(chat: Chat, botStatus?: string) {
  await db
    .insert(telegramGroupsTable)
    .values({ chatId: chat.id, title: chat.title ?? '', type: chat.type, ...(botStatus ? { botStatus } : {}) })
    .onConflictDoUpdate({
      target: telegramGroupsTable.chatId,
      set: { title: chat.title ?? '', type: chat.type, updatedAt: new Date(), ...(botStatus ? { botStatus } : {}) },
    });
}

async function setMember(chatId: number, telegramId: number, isMember: boolean) {
  await db
    .insert(telegramGroupMembersTable)
    .values({ chatId, telegramId, isMember })
    .onConflictDoUpdate({ target: [telegramGroupMembersTable.chatId, telegramGroupMembersTable.telegramId], set: { isMember, updatedAt: new Date() } });
}

/** Сообщение о доступе (шаблоны warpbuilder_granted / warpbuilder_revoked); кто ни разу не писал боту — не получит. */
async function tellAccess(telegramId: number, granted: boolean, hasOtherAccess: (telegramId: number) => Promise<boolean>) {
  if (await hasOtherAccess(telegramId)) return;
  if (granted) await notifyKind('warpbuilder_granted', telegramId, {}, { buttons: [{ text: 'Открыть WarpBuilder', path: '/roster' }] });
  else await notifyKind('warpbuilder_revoked', telegramId, {});
}

export async function handleUpdate(u: TelegramUpdate, hasOtherAccess: (telegramId: number) => Promise<boolean>) {
  const c = classifyUpdate(u);
  if (!c) return;
  if (c.kind === 'bot') {
    await rememberGroup(c.chat, c.status);
    return;
  }
  await rememberGroup(c.chat);
  if (c.kind !== 'member') return;
  if (c.chat.id !== (await boostyChatId())) return;
  liveCache.delete(c.telegramId);
  await setMember(c.chat.id, c.telegramId, c.isMember);
  if (c.isMember !== c.wasMember) await tellAccess(c.telegramId, c.isMember, hasOtherAccess);
}

// ---------- проверка при входе в WarpBuilder ----------

const liveCache = new Map<number, { member: boolean; at: number }>();
const LIVE_TTL = 5 * 60_000;

/**
 * Участник группы Boosty? Сначала — сохранённое по событиям; нет записи или «не участник» — спросить Telegram
 * (getChatMember, кеш 5 мин), чтобы открыть доступ тем, кто вступил до подключения или чьё событие пропущено.
 */
export async function isBoostyMember(telegramId: number): Promise<boolean> {
  const chatId = await boostyChatId();
  if (!chatId) return false;
  const [row] = await db
    .select({ isMember: telegramGroupMembersTable.isMember })
    .from(telegramGroupMembersTable)
    .where(and(eq(telegramGroupMembersTable.chatId, chatId), eq(telegramGroupMembersTable.telegramId, telegramId)));
  if (row?.isMember) return true;
  const cached = liveCache.get(telegramId);
  if (cached && Date.now() - cached.at < LIVE_TTL) return cached.member;
  try {
    const res = await telegramFetch('getChatMember', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: telegramId }),
    });
    const json = (await res.json()) as { ok: boolean; result?: ChatMemberLike };
    const member = json.ok && isMemberStatus(json.result);
    liveCache.set(telegramId, { member, at: Date.now() });
    if (json.ok) await setMember(chatId, telegramId, member);
    return member;
  } catch (error) {
    console.warn('[boosty-group] getChatMember failed:', (error as Error).message);
    return false;
  }
}

// ---------- получение событий ----------

export type UpdatesState = { mode: 'off' | 'polling' | 'webhook-elsewhere' | 'error'; detail: string | null; lastUpdateAt: string | null };
const state: UpdatesState = { mode: 'off', detail: null, lastUpdateAt: null };
export const updatesState = () => ({ ...state });

let started = false;

/** Запуск опроса событий (TELEGRAM_UPDATES=off — не запускать). У бота есть webhook другого сервиса — не трогаем. */
export function startTelegramUpdates(hasOtherAccess: (telegramId: number) => Promise<boolean>) {
  if (started || (process.env.TELEGRAM_UPDATES ?? 'on').toLowerCase() === 'off') return;
  started = true;
  void (async () => {
    try {
      const info = (await (await telegramFetch('getWebhookInfo')).json()) as { ok: boolean; result?: { url?: string } };
      if (info.ok && info.result?.url) {
        let host = 'другой сервис';
        try {
          host = new URL(info.result.url).host;
        } catch {}
        Object.assign(state, { mode: 'webhook-elsewhere', detail: host });
        console.warn(`[boosty-group] bot has a webhook (${host}) — events are not polled; access is checked on entry only`);
        return;
      }
    } catch (error) {
      Object.assign(state, { mode: 'error', detail: (error as Error).message });
    }
    let offset = 0;
    state.mode = 'polling';
    for (;;) {
      try {
        const res = await telegramFetch('getUpdates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, timeout: 25, allowed_updates: ['chat_member', 'my_chat_member', 'message'] }),
          timeoutMs: 40_000,
        });
        const json = (await res.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string; error_code?: number };
        if (!json.ok) {
          Object.assign(state, { mode: json.error_code === 409 ? 'webhook-elsewhere' : 'error', detail: json.description ?? null });
          if (json.error_code === 409) {
            console.warn('[boosty-group] getUpdates conflict — another receiver uses the bot; stopped polling');
            return;
          }
          await new Promise((r) => setTimeout(r, 15_000));
          continue;
        }
        state.mode = 'polling';
        state.detail = null;
        for (const u of json.result ?? []) {
          offset = Math.max(offset, u.update_id + 1);
          state.lastUpdateAt = new Date().toISOString();
          await handleUpdate(u, hasOtherAccess).catch((error) => console.warn('[boosty-group] update failed:', (error as Error).message));
        }
      } catch (error) {
        Object.assign(state, { mode: 'error', detail: (error as Error).message });
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
  })();
}

// ---------- админка ----------

export async function listGroups() {
  const rows = await db.select().from(telegramGroupsTable);
  return {
    updates: updatesState(),
    groups: rows
      .filter((g) => g.botStatus !== 'left' && g.botStatus !== 'kicked')
      .map((g) => ({ chatId: g.chatId, title: g.title, botIsAdmin: g.botStatus === 'administrator' || g.botStatus === 'creator', selected: g.purpose === 'boosty' })),
  };
}

/** Выбрать группу Boosty (chatId = null — отключить). */
export async function selectBoostyGroup(chatId: number | null) {
  await db.update(telegramGroupsTable).set({ purpose: null }).where(eq(telegramGroupsTable.purpose, 'boosty'));
  if (chatId !== null) await db.update(telegramGroupsTable).set({ purpose: 'boosty' }).where(eq(telegramGroupsTable.chatId, chatId));
  boostyChatCache = null;
  liveCache.clear();
  return listGroups();
}
