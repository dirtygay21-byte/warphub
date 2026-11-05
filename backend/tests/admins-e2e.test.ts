/**
 * Администраторы по Telegram ID (N2) и проверка уведомлений (N1) — сквозная проверка: настоящий сервер + PostgreSQL.
 * Запускается в CI (job «Backend e2e: admins»: ADMIN_TELEGRAM_IDS=777, TELEGRAM_NOTIFICATIONS=off, порт 4100)
 * или вручную с WARPHUB_E2E=1 против тестового сервера. На боевом сервере не запускается.
 */
import { beforeAll, describe as baseDescribe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';

const E2E = process.env.WARPHUB_E2E === '1';
const describe = E2E ? baseDescribe : baseDescribe.skip;
const API = process.env.WARPHUB_E2E_API ?? 'http://127.0.0.1:4100';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '123456:TEST_TOKEN_FOR_LOCAL_RUN';

function initData(user: { id: number; first_name: string; username?: string }) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE' + user.id, user: JSON.stringify(user) });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}

const ID = { owner: 777, helper: 3101, newbie: 3102 };
const T: Record<string, string> = {};

beforeAll(async () => {
  if (!E2E) return;
  for (const [name, id] of Object.entries(ID)) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name[0]!.toUpperCase() + name.slice(1), username: name }) });
    if (r.status !== 200) console.error(`::error::login ${name} → ${r.status}: ${JSON.stringify(r.json).slice(0, 1500)}`);
    expect(r.status).toBe(200);
    T[name] = r.json.token;
  }
});

describe('admins by Telegram ID', () => {
  test('only admins see the list; built-in admins can manage', async () => {
    expect((await api('GET', '/admin/admins')).status).toBe(401);
    expect((await api('GET', '/admin/admins', T.helper)).status).toBe(403);
    const r = await api('GET', '/admin/admins', T.owner);
    expect(r.status).toBe(200);
    expect(r.json.canManage).toBe(true);
    expect(r.json.admins.find((a: any) => a.telegramId === ID.owner)).toMatchObject({ builtin: true, name: 'Owner', username: 'owner' });
  });

  test('add: invalid id, built-in id, then a new admin who gets access at once; duplicate refused', async () => {
    expect((await api('POST', '/admin/admins', T.owner, { telegramId: '12ab' })).status).toBe(400);
    expect((await api('POST', '/admin/admins', T.owner, { telegramId: String(ID.owner) })).status).toBe(400);
    const add = await api('POST', '/admin/admins', T.owner, { telegramId: String(ID.helper), note: '  Помощник  ' });
    expect(add.status).toBe(200);
    expect(add.json.admins.find((a: any) => a.telegramId === ID.helper)).toMatchObject({ builtin: false, note: 'Помощник', name: 'Helper', addedByTelegramId: ID.owner });
    expect((await api('POST', '/admin/admins', T.owner, { telegramId: ID.helper })).status).toBe(409);
    const asHelper = await api('GET', '/admin/admins', T.helper);
    expect(asHelper.status).toBe(200);
    expect(asHelper.json.canManage).toBe(false);
  });

  test('an added admin cannot add or remove admins and is not a Roster Builder owner', async () => {
    expect((await api('POST', '/admin/admins', T.helper, { telegramId: String(ID.newbie) })).status).toBe(403);
    expect((await api('DELETE', `/admin/admins/${ID.owner}`, T.helper)).status).toBe(403);
    const access = await api('GET', '/roster/access', T.helper);
    expect(access.json).toMatchObject({ hasAccess: true, isOwner: false });
  });

  test('remove: built-in refused, unknown 404, added admin loses access at once', async () => {
    expect((await api('DELETE', `/admin/admins/${ID.owner}`, T.owner)).status).toBe(400);
    expect((await api('DELETE', `/admin/admins/${ID.newbie}`, T.owner)).status).toBe(404);
    const del = await api('DELETE', `/admin/admins/${ID.helper}`, T.owner);
    expect(del.status).toBe(200);
    expect(del.json.admins.some((a: any) => a.telegramId === ID.helper)).toBe(false);
    expect((await api('GET', '/admin/admins', T.helper)).status).toBe(403);
  });
});

describe('partner showcase', () => {
  test('admin CRUD, public active filtering and metadata validation', async () => {
    expect((await api('GET', '/admin/partners')).status).toBe(401);
    const me = await api('GET', '/me', T.newbie);
    const forbidden = await api('GET', '/admin/partners', T.newbie);
    console.error(`::notice::partner fan /me → ${me.status}: ${JSON.stringify(me.json).slice(0, 600)}`);
    console.error(`::notice::partner fan /admin/partners → ${forbidden.status}: ${JSON.stringify(forbidden.json).slice(0, 600)}`);
    expect(me.status).toBe(200);
    expect(forbidden.status).toBe(403);
    const settings = await api('PUT', '/admin/partners/settings', T.owner, { partner1Title: 'First shop', partner2Title: 'Second shop', footerText: 'Miniatures on sale' });
    expect(settings.status).toBe(200);
    expect(settings.json).toMatchObject({ partner1Title: 'First shop', partner2Title: 'Second shop', footerText: 'Miniatures on sale' });
    const first = await api('POST', '/admin/partners/cards', T.owner, { lane: 1, title: 'First mini', text: 'Discount', url: 'https://example.com/first', imageUrl: 'https://example.com/first.png', sortOrder: 0 });
    expect(first.status).toBe(200);
    const second = await api('POST', '/admin/partners/cards', T.owner, { lane: 2, title: 'Second mini', url: 'https://example.com/second', sortOrder: 4 });
    expect(second.status).toBe(200);
    expect((await api('GET', '/partners')).json.cards.some((card: { id: number }) => card.id === first.json.id)).toBe(true);
    expect((await api('PATCH', `/admin/partners/cards/${first.json.id}`, T.owner, { isActive: false })).json.isActive).toBe(false);
    expect((await api('GET', '/partners')).json.cards.some((card: { id: number }) => card.id === first.json.id)).toBe(false);
    const adminCards = await api('GET', '/admin/partners', T.owner);
    expect(adminCards.json.cards.some((card: { id: number; isActive: boolean }) => card.id === first.json.id && !card.isActive)).toBe(true);
    expect((await api('PATCH', `/admin/partners/cards/${second.json.id}`, T.owner, { sortOrder: 9 })).json.sortOrder).toBe(9);
    expect((await api('POST', '/admin/partners/metadata', T.owner, { url: 'http://127.0.0.1:4100' })).status).toBe(400);
    expect((await api('DELETE', `/admin/partners/cards/${first.json.id}`, T.owner)).status).toBe(200);
    expect((await api('DELETE', `/admin/partners/cards/${second.json.id}`, T.owner)).status).toBe(200);
    expect((await api('DELETE', `/admin/partners/cards/${first.json.id}`, T.owner)).status).toBe(404);
  });
});

describe('notification check (N1)', () => {
  test('admins only; with notifications off the reason says so', async () => {
    expect((await api('POST', '/admin/notifications/test', T.newbie)).status).toBe(403);
    const r = await api('POST', '/admin/notifications/test', T.owner);
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(false);
    expect(r.json.message).toContain('TELEGRAM_NOTIFICATIONS=off');
    expect(r.json.recipients).toBeGreaterThan(0);
  });
});
