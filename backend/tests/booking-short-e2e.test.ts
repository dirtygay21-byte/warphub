/**
 * Запись короче полной длительности (B1) — сквозная проверка: настоящий сервер + PostgreSQL (CI job «Backend e2e»).
 * Своя услуга «wh_game» на 4 ч и свой стол; запись в 15:00 ограничивает новую игру в 12:00 до 15:00 (3 ч);
 * в 13:30 свободно меньше 2 ч — отказ; в 12:00 следующая запись не пересекается.
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
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
}

// ближайшая суббота не раньше чем через 2 дня; время клуба UTC+5
const day = (() => {
  const d = new Date(Date.now() + 2 * 86400_000);
  while (new Date(d.getTime() + 5 * 3600_000).getUTCDay() !== 6) d.setTime(d.getTime() + 86400_000);
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
})();
const local = (hh: string) => new Date(`${day}T${hh}:00+05:00`).toISOString();

const T: Record<string, string> = {};
let serviceId = 0;
let tableId = 0;
const player = { army: 'Orks', points: 1000, experienceLevel: 'player' };
const book = (who: string, hh: string) => api('POST', '/reservations', T[who], { serviceId, tableId, startsAt: local(hh), partySize: 1, seatClubArmyOptions: [false], details: player });

beforeAll(async () => {
  if (!E2E) return;
  const disc = sql(`insert into disciplines (slug, title) values ('wh', 'E2E WH') returning id`);
  serviceId = Number(sql(`insert into services (discipline_id, slug, title, duration, seats_per_table) values (${disc}, 'wh_game', 'E2E игра', 240, 2) returning id`));
  tableId = Number(sql(`insert into tables (name) values ('E2E стол') returning id`));
  for (const [name, id] of Object.entries({ early: 4001, late: 4002, other: 4003 })) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name }) });
    if (r.status !== 200) console.error(`::error::login ${name} → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);
    T[name] = r.json.token;
  }
});

describe('limited-time bookings (B1)', () => {
  test('availability tells the minimum (2 h)', async () => {
    const r = await api('GET', `/services/${serviceId}/availability?date=${day}`, T.early);
    expect(r.status).toBe(200);
    expect(r.json.service.minDuration).toBe(120);
  });

  test('a game at 15:00 makes a new game at 12:00 end at 15:00 (3 h instead of 4)', async () => {
    const first = await book('early', '15:00');
    if (first.status !== 200) console.error(`::error::booking 15:00 → ${first.status}: ${JSON.stringify(first.json).slice(0, 600)}`);
    expect(first.status).toBe(200);
    const short = await book('late', '12:00');
    if (short.status !== 200) console.error(`::error::booking 12:00 → ${short.status}: ${JSON.stringify(short.json).slice(0, 600)}`);
    expect(short.status).toBe(200);
    expect(new Date(short.json.startsAt).toISOString()).toBe(local('12:00'));
    expect(new Date(short.json.endsAt).toISOString()).toBe(local('15:00'));
    expect(new Date(first.json.endsAt).toISOString()).toBe(local('19:00'));
  });

  test('joining the shortened game keeps its end; less than 2 h free is refused', async () => {
    const join = await book('other', '12:00');
    expect(join.status).toBe(200);
    expect(join.json.joinedSession).toBe(true);
    expect(new Date(join.json.endsAt).toISOString()).toBe(local('15:00'));
    const tooShort = await book('other', '13:30');
    expect(tooShort.status).toBeGreaterThanOrEqual(400);
  });
});
