/**
 * Столы по категориям (решение владельца 05.11.2026) — сквозная проверка: настоящий сервер + PostgreSQL (CI «Backend e2e»).
 *  - столы wh (Full-scale Wargaming): 40K и AoS; столы small (Tactical Games): Kill Team и Warcry — только свои игры;
 *  - занятый стол small блокирует покраску на это время; запись на стол small не принимается поверх покраски;
 *  - бронь администратора на стол small тоже не ставится поверх покраски.
 * Свой день (воскресенье через 30 дней), чтобы не пересекаться с другими тестами.
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

// воскресенье через 30 дней (время клуба UTC+5); у других тестов свои дни
const day = (() => {
  const d = new Date(Date.now() + 30 * 86400_000);
  while (new Date(d.getTime() + 5 * 3600_000).getUTCDay() !== 0) d.setTime(d.getTime() + 86400_000);
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
})();
const local = (hh: string) => new Date(`${day}T${hh}:00+05:00`).toISOString();

const T: Record<string, string> = {};
let wh40Service = 0;
let painting = 0;
let whTable = 0;
let smallTable = 0;

const bookGame = (who: string, tableId: number, hh: string, details: Record<string, unknown>) =>
  api('POST', '/reservations', T[who], { serviceId: wh40Service, tableId, startsAt: local(hh), partySize: 1, seatClubArmyOptions: [false], details });
const bookPainting = (who: string, hh: string) =>
  api('POST', '/reservations', T[who], {
    serviceId: painting,
    startsAt: local(hh),
    partySize: 1,
    buyArmyOptions: [false],
    details: { faction: 'Orks', model: 'Boyz', paintSource: 'own', needsHelp: false },
  });
const KT = { game: 'kt', army: 'Kasrkin', experienceLevel: 'beginner' };
const W40 = { game: '40k', army: 'Orks', points: 1000, experienceLevel: 'player' };

beforeAll(async () => {
  if (!E2E) return;
  const disc = sql(`select id from disciplines where slug = 'wh' limit 1`) || sql(`insert into disciplines (slug, title) values ('wh', 'E2E WH') returning id`);
  wh40Service = Number(sql(`select id from services where slug = 'wh_game' limit 1`) || sql(`insert into services (discipline_id, slug, title, duration, seats_per_table) values (${disc}, 'wh_game', 'E2E игра', 240, 2) returning id`));
  painting = Number(sql(`select id from services where slug = 'wh_painting' limit 1`) || sql(`insert into services (discipline_id, slug, title, duration, pool_capacity) values (${disc}, 'wh_painting', 'E2E покраска', 120, 6) returning id`));
  whTable = Number(sql(`insert into tables (name, category) values ('E2E стол 40K', 'wh') returning id`));
  smallTable = Number(sql(`insert into tables (name, category) values ('E2E стол Tactical', 'small') returning id`));
  for (const [name, id] of Object.entries({ admin: 777, p1: 4601, p2: 4602, p3: 4603 })) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name }) });
    if (r.status !== 200) console.error(`::error::login ${name} → ${r.status}`);
    T[name] = r.json.token;
  }
});

describe('категории столов: игры только на своих столах', () => {
  test('40K не ставится на стол Tactical Games; Kill Team — ставится', async () => {
    const wrong = await bookGame('p1', smallTable, '12:00', W40);
    expect(wrong.status).toBe(400);
    expect(String(wrong.json.error)).toContain('Tactical Games');
    const right = await bookGame('p1', smallTable, '12:00', KT);
    expect(right.status).toBe(200);
  });

  test('Kill Team не ставится на стол Full-scale Wargaming; 40K — ставится', async () => {
    const wrong = await bookGame('p2', whTable, '12:00', KT);
    expect(wrong.status).toBe(400);
    expect(String(wrong.json.error)).toContain('Full-scale Wargaming');
    const right = await bookGame('p2', whTable, '12:00', W40);
    expect(right.status).toBe(200);
  });

  test('смена игры у записи на другой категории не принимается', async () => {
    const mine = await bookGame('p3', whTable, '16:00', W40);
    expect(mine.status).toBe(200);
    const changed = await api('PATCH', `/reservations/${mine.json.id}/details`, T.p3, { details: KT });
    expect(changed.status).toBe(400);
  });
});

describe('Tactical Games блокирует покраску', () => {
  test('занятый стол Tactical 12:00–16:00 — покраска в 13:00 недоступна', async () => {
    const r = await bookPainting('p2', '13:00');
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  test('покраска вне занятого времени (18:00) — доступна', async () => {
    const r = await bookPainting('p2', '18:00');
    expect(r.status).toBe(200);
  });

  test('на стол Tactical нельзя поставить бронь поверх покраски 18:00–20:00', async () => {
    const r = await bookGame('p3', smallTable, '17:00', KT);
    expect(r.status).toBe(409);
    expect(String(r.json.error)).toContain('Painting');
  });

  test('бронь администратора на стол Tactical поверх покраски не ставится', async () => {
    const hold = await api('POST', '/admin/table-holds', T.admin, { tableId: smallTable, startsAt: local('19:00'), endsAt: local('21:00'), purpose: 'tournament', title: 'E2E турнир' });
    expect(hold.status).toBeGreaterThanOrEqual(400);
  });
});
