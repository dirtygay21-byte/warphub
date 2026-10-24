/**
 * D&D: игра без точного времени (дни недели + время суток) — сквозная проверка: настоящий сервер + PostgreSQL
 * (CI job «Backend e2e»). Админ создаёт игру «пятница или суббота, вечер», игрок видит её и записывается,
 * без дней и без времени игра не создаётся, переход на точное время очищает дни.
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
const T: Record<string, string> = {};
let gameId = 0;

beforeAll(async () => {
  if (!E2E) return;
  for (const [name, id] of Object.entries({ admin: 777, player: 4201 })) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name }) });
    if (r.status !== 200) console.error(`::error::login ${name} → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);
    expect(r.status).toBe(200);
    T[name] = r.json.token;
  }
});

describe('D&D: примерное время', () => {
  test('без дней или без времени суток — 400', async () => {
    const base = { title: 'E2E', gameType: 'One-shot', capacity: 4 };
    expect((await api('POST', '/admin/dnd/games', T.admin, { ...base, daysOfWeek: [5], timesOfDay: [] })).status).toBe(400);
    expect((await api('POST', '/admin/dnd/games', T.admin, base)).status).toBe(400);
  });
  test('админ создаёт игру «пятница или суббота, вечер»; игрок видит и записывается', async () => {
    const r = await api('POST', '/admin/dnd/games', T.admin, { title: 'E2E подземелье', gameType: 'One-shot', capacity: 4, daysOfWeek: [6, 5], timesOfDay: ['evening'] });
    if (r.status !== 200) console.error(`::error::create → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);
    expect(r.status).toBe(200);
    expect(r.json.startsAt).toBeNull();
    expect(r.json.daysOfWeek).toEqual([5, 6]);
    expect(r.json.scheduleLabel).toBe('пятница или суббота, вечер');
    expect(r.json.isBookable).toBe(true);
    gameId = r.json.id;
    const list = await api('GET', '/dnd/games', T.player);
    expect(list.json.some((g: { id: number }) => g.id === gameId)).toBe(true);
    const b = await api('POST', `/dnd/games/${gameId}/bookings`, T.player, { quantity: 1, timeIsConvenient: true, experienceLevel: 'beginner' });
    if (b.status !== 200) console.error(`::error::book → ${b.status}: ${JSON.stringify(b.json).slice(0, 600)}`);
    expect(b.status).toBe(200);
    const my = await api('GET', '/dnd/my', T.player);
    expect(my.json.bookings[0].game.scheduleLabel).toBe('пятница или суббота, вечер');
  });
  test('переход на точное время очищает дни; обратно — нужны дни и время', async () => {
    const at = new Date(Date.now() + 7 * 86400_000).toISOString();
    const r = await api('PATCH', `/admin/dnd/games/${gameId}`, T.admin, { startsAt: at });
    expect(r.status).toBe(200);
    expect(r.json.daysOfWeek).toEqual([]);
    expect(r.json.startsAt).not.toBeNull();
    expect((await api('PATCH', `/admin/dnd/games/${gameId}`, T.admin, { startsAt: null })).status).toBe(400);
    const back = await api('PATCH', `/admin/dnd/games/${gameId}`, T.admin, { startsAt: null, daysOfWeek: [7], timesOfDay: ['morning', 'afternoon'] });
    expect(back.status).toBe(200);
    expect(back.json.scheduleLabel).toBe('воскресенье, утро или день');
  });
});
