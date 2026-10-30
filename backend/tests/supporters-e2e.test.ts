/**
 * Поддержка клуба (30.10.2026) — сквозная проверка: настоящий сервер + PostgreSQL (CI job «Backend e2e»).
 * Звание назначает и снимает только администратор; игрок видит его в /me/progress.
 */
import { beforeAll, describe as baseDescribe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';

const E2E = process.env.WARPHUB_E2E === '1' && !!process.env.POSTGRES_URI;
const describe = E2E ? baseDescribe : baseDescribe.skip;
const API = process.env.WARPHUB_E2E_API ?? 'http://127.0.0.1:4100';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '123456:TEST_TOKEN_FOR_LOCAL_RUN';

function initData(user: { id: number; first_name: string }) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE' + user.id, user: JSON.stringify(user) });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  params.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()).update(check).digest('hex'));
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
function sql(query: string): string {
  const r = Bun.spawnSync(['psql', process.env.POSTGRES_URI!, '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  if (r.exitCode !== 0) {
    console.error(`::error::psql: ${r.stderr.toString().replace(/\s+/g, ' ').slice(0, 400)}`);
    throw new Error(r.stderr.toString());
  }
  return r.stdout.toString().trim();
}

const T: Record<string, string> = {};
let playerId = '';

beforeAll(async () => {
  if (!E2E) return;
  for (const [name, id] of Object.entries({ admin: 777, fan: 4601 })) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name, username: name === 'fan' ? 'e2e_fan' : undefined } as never) });
    if (r.status !== 200) console.error(`::error::login ${name} → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);
    T[name] = r.json.token;
  }
  playerId = sql(`select id from users where telegram_id = 4601`);
});

describe('поддержка клуба', () => {
  test('только администратор', async () => {
    expect((await api('PUT', `/admin/supporters/${playerId}`, T.fan, { title: 'crown' })).status).toBe(403);
    expect((await api('PUT', `/admin/supporters/${playerId}`, T.admin, { title: 'party' })).status).toBe(400);
  });
  test('назначить, найти, увидеть в профиле, сменить и снять', async () => {
    const set = await api('PUT', `/admin/supporters/${playerId}`, T.admin, { title: 'crown' });
    if (set.status !== 200) console.error(`::error::set → ${set.status}: ${JSON.stringify(set.json).slice(0, 600)}`);
    expect(set.status).toBe(200);
    expect(set.json.title).toBe('crown');
    expect((await api('GET', '/me/progress', T.fan)).json.supporter).toBe('crown');
    const found = await api('GET', '/admin/supporters/search?q=4601', T.admin);
    expect(found.json[0].title).toBe('crown');
    const list = await api('GET', '/admin/supporters', T.admin);
    expect(list.json.some((s: { user: { id: string }; grantedByTelegramId: number }) => s.user.id === playerId && s.grantedByTelegramId === 777)).toBe(true);
    expect((await api('PUT', `/admin/supporters/${playerId}`, T.admin, { title: 'banner' })).json.title).toBe('banner');
    expect((await api('PUT', `/admin/supporters/${playerId}`, T.admin, { title: null })).json.title).toBeNull();
    expect((await api('GET', '/me/progress', T.fan)).json.supporter).toBeNull();
  });
});
