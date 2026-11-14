/**
 * Админка уведомлений (14.11.2026): каталог автоматических уведомлений со своими текстами и выключателями,
 * общие настройки (тихие часы, лимит) и право менять — только у владельца.
 */
import { db } from '../../db';
import { notificationTemplatesTable } from '../../db/schema';
import { NOTIFICATION_KINDS } from './catalog';
import { getNotificationConfig, invalidateNotificationCache } from './hub';
import { isNotificationOwner } from './broadcasts';

export async function notificationCatalog(user: { telegramId: number }) {
  const rows = await db.select().from(notificationTemplatesTable);
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return {
    canEdit: isNotificationOwner(user),
    config: await getNotificationConfig(),
    kinds: NOTIFICATION_KINDS.map((k) => {
      const saved = byKind.get(k.id);
      return { ...k, enabled: saved ? saved.enabled : true, text: saved?.text ?? null, updatedAt: saved?.updatedAt?.toISOString() ?? null };
    }),
  };
}

export async function saveTemplate(kind: string, input: { enabled?: boolean; text?: string | null }) {
  const set: { enabled?: boolean; text?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (input.enabled !== undefined) set.enabled = input.enabled;
  if (input.text !== undefined) set.text = input.text?.trim() ? input.text : null;
  const [row] = await db
    .insert(notificationTemplatesTable)
    .values({ kind, enabled: input.enabled ?? true, text: set.text ?? null })
    .onConflictDoUpdate({ target: notificationTemplatesTable.kind, set })
    .returning();
  invalidateNotificationCache();
  return { kind: row!.kind, enabled: row!.enabled, text: row!.text };
}
