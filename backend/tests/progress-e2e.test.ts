/**
 * Прогресс игрока (30.10.2026) — сквозная проверка: настоящий сервер + PostgreSQL (CI job «Backend e2e»).
 * Засчитываются только подтверждённые и уже прошедшие записи; отменённые, ожидающие, текущие и будущие — нет;
 * D&D без точного времени — только после закрытия игры.
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

let serviceId = 0;
let painting = 0;
let token = '';
const PLAYER = 4501;

beforeAll(async () => {
  if (!E2E) return;
  const existing = sql(`select id from services where slug = 'wh_game' limit 1`);
  const disc = sql(`select id from disciplines where slug = 'wh' limit 1`) || sql(`insert into disciplines (slug, title) values ('wh', 'E2E WH') returning id`);
  serviceId = existing ? Number(existing) : Number(sql(`insert into services (discipline_id, slug, title, duration, seats_per_table) values (${disc}, 'wh_game', 'E2E игра', 240, 2) returning id`));
  painting = Number(sql(`select id from services where slug = 'wh_painting' limit 1`) || sql(`insert into services (discipline_id, slug, title, duration, pool_capacity) values (${disc}, 'wh_painting', 'E2E покраска', 120, 6) returning id`));
  const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id: PLAYER, first_name: 'progress' }) });
  if (r.status !== 200) console.error(`::error::login → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);
  token = r.json.token;
  const uid = sql(`select id from users where telegram_id = ${PLAYER}`);
  const add = (svc: number, status: string, fromH: number, toH: number) =>
    sql(`insert into reservations (user_id, service_id, status, starts_at, ends_at) values ('${uid}', ${svc}, '${status}', now() + interval '${fromH} hours', now() + interval '${toH} hours')`);
  add(serviceId, 'confirmed', -30, -26); // засчитана
  add(serviceId, 'confirmed', -50, -46); // засчитана
  add(serviceId, 'confirmed', -1, 3); // идёт сейчас — ещё нет
  add(serviceId, 'confirmed', 20, 24); // будущая — нет
  add(serviceId, 'cancelled', -80, -76); // отменена — нет
  add(serviceId, 'pending', -90, -86); // не подтверждена — нет
  add(painting, 'confirmed', -10, -8); // покраска — засчитана
  const past = sql(`insert into dnd_games (title, game_type, capacity, starts_at, ends_at, status) values ('E2E прогресс', 'One-shot', 4, now() - interval '30 hours', now() - interval '26 hours', 'open') returning id`);
  const open = sql(`insert into dnd_games (title, game_type, capacity, days_of_week, times_of_day, status) values ('E2E без времени', 'Campaign', 4, '{6}', '{evening}', 'open') returning id`);
  sql(`insert into dnd_game_bookings (game_id, user_id, quantity, time_is_convenient) values (${past}, '${uid}', 1, true), (${open}, '${uid}', 1, true)`);
});

describe('прогресс игрока: счётчик игр', () => {
  test('только подтверждённые и прошедшие; по категориям', async () => {
    const r = await api('GET', '/me/progress', token);
    if (r.status !== 200) console.error(`::error::progress → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);
    expect(r.status).toBe(200);
    const by = Object.fromEntries(r.json.categories.map((c: { category: string; games: number }) => [c.category, c.games]));
    expect(by).toEqual({ warhammer: 2, dnd: 1, painting: 1, visits: 0 });
    expect(r.json.total).toBe(4);
    expect(r.json.categories[0].rank).toBe('beginner');
    expect(r.json.categories[0].nextAt).toBe(5);
  });
  test('без входа — 401', async () => {
    expect((await api('GET', '/me/progress')).status).toBe(401);
  });
});
