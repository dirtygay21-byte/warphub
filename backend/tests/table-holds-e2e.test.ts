/**
 * Бронь стола администратором (30.10.2026) — сквозная проверка: настоящий сервер + PostgreSQL (CI job «Backend e2e»).
 * Бронь закрывает стол для записи; игра до брони укорачивается к её началу; поверх записей и брони — отказ;
 * после снятия брони стол свободен.
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

// ближайшая пятница не раньше чем через 2 дня; время клуба UTC+5
const day = (() => {
  const d = new Date(Date.now() + 2 * 86400_000);
  while (new Date(d.getTime() + 5 * 3600_000).getUTCDay() !== 5) d.setTime(d.getTime() + 86400_000);
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
})();
const local = (hh: string) => new Date(`${day}T${hh}:00+05:00`).toISOString();

const T: Record<string, string> = {};
let serviceId = 0;
let tableId = 0;
const player = { game: '40k', army: 'Orks', points: 1000, experienceLevel: 'player' };
const book = (hh: string) =>
  api('POST', '/reservations', T.player, { serviceId, tableId, startsAt: local(hh), partySize: 1, seatClubArmyOptions: [false], details: player });
const hold = (from: string, to: string, extra: Record<string, unknown> = {}) =>
  api('POST', '/admin/table-holds', T.admin, { tableId, startsAt: local(from), endsAt: local(to), purpose: 'tournament', title: 'E2E турнир', ...extra });

beforeAll(async () => {
  if (!E2E) return;
  const existing = sql(`select id from services where slug = 'wh_game' limit 1`);
  if (existing) serviceId = Number(existing);
  else {
    const disc = sql(`select id from disciplines where slug = 'wh' limit 1`) || sql(`insert into disciplines (slug, title) values ('wh', 'E2E WH') returning id`);
    serviceId = Number(sql(`insert into services (discipline_id, slug, title, duration, seats_per_table) values (${disc}, 'wh_game', 'E2E игра', 240, 2) returning id`));
  }
  tableId = Number(sql(`insert into tables (name) values ('E2E стол брони') returning id`));
  for (const [name, id] of Object.entries({ admin: 777, player: 4401 })) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name }) });
    if (r.status !== 200) console.error(`::error::login ${name} → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);
    T[name] = r.json.token;
  }
});

describe('бронь стола администратором', () => {
  let holdId = 0;

  test('только администратор; ввод проверяется', async () => {
    expect((await api('POST', '/admin/table-holds', T.player, { tableId, startsAt: local('18:00'), endsAt: local('22:00'), purpose: 'tournament', title: 'x' })).status).toBe(403);
    expect((await hold('18:00', '17:00')).status).toBe(400);
    expect((await hold('18:00', '22:00', { purpose: 'party' })).status).toBe(400);
  });

  test('бронь 18:00–22:00 закрывает стол для записи', async () => {
    const r = await hold('18:00', '22:00', { description: 'финал' });
    if (r.status !== 200) console.error(`::error::hold → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);
    expect(r.status).toBe(200);
    holdId = r.json.id;
    expect(r.json.purpose).toBe('tournament');

    expect((await book('19:00')).status).toBeGreaterThanOrEqual(400);
    // игра в 14:00 на 4 ч заканчивается ровно к брони
    const before = await book('14:00');
    if (before.status !== 200) console.error(`::error::book 14:00 → ${before.status}: ${JSON.stringify(before.json).slice(0, 600)}`);
    expect(before.status).toBe(200);
    expect(new Date(before.json.endsAt).toISOString()).toBe(local('18:00'));

    const list = await api('GET', '/admin/table-holds', T.admin);
    expect(list.json.some((h: { id: number }) => h.id === holdId)).toBe(true);
    const dayView = await api('GET', `/admin/warhammer/day?date=${day}`, T.admin);
    expect(dayView.json.holds.some((h: { id: number }) => h.id === holdId)).toBe(true);
  });

  test('нельзя поверх записей игрока или другой брони', async () => {
    const overBooking = await hold('15:00', '17:00');
    expect(overBooking.status).toBe(409);
    expect(overBooking.json.code).toBe('BOOKINGS_CONFLICT');
    const overHold = await hold('21:00', '23:00');
    expect(overHold.status).toBe(409);
    expect(overHold.json.code).toBe('HOLD_CONFLICT');
  });

  test('после снятия брони стол снова свободен', async () => {
    expect((await api('DELETE', `/admin/table-holds/${holdId}`, T.admin)).status).toBe(200);
    expect((await api('DELETE', `/admin/table-holds/${holdId}`, T.admin)).status).toBe(404);
    const after = await book('19:00');
    if (after.status !== 200) console.error(`::error::book 19:00 → ${after.status}: ${JSON.stringify(after.json).slice(0, 600)}`);
    expect(after.status).toBe(200);
  });
});
