/**
 * Игра D&D закрывает весь клуб (31.10.2026) — сквозная проверка: настоящий сервер + PostgreSQL (CI «Backend tests and e2e»).
 * Игра 13:00–17:00 закрывает клуб до 18:00 (+1 ч): столы Warhammer и покраска недоступны; D&D поверх записей — отказ.
 * День — суббота через 2+ недели, чтобы закрытие клуба не задело дни других сквозных тестов.
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
const show = (what: string, r: { status: number; json: unknown }) =>
  console.error(`::error::${what} → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);

// суббота не раньше чем через 15 дней; время клуба UTC+5
const day = (() => {
  const d = new Date(Date.now() + 15 * 86400_000);
  while (new Date(d.getTime() + 5 * 3600_000).getUTCDay() !== 6) d.setTime(d.getTime() + 86400_000);
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
})();
const local = (hh: string) => new Date(`${day}T${hh}:00+05:00`).toISOString();

const T: Record<string, string> = {};
let game = 0;
let painting = 0;
let tableId = 0;
let gameId = 0;
const player = { game: '40k', army: 'Orks', points: 1000, experienceLevel: 'player' };
const bookTable = (hh: string) =>
  api('POST', '/reservations', T.player, { serviceId: game, tableId, startsAt: local(hh), partySize: 1, seatClubArmyOptions: [false], details: player });
const bookPainting = (hh: string) =>
  api('POST', '/reservations', T.player, { serviceId: painting, startsAt: local(hh), partySize: 1, buyArmyOptions: [false], details: { faction: 'Orks', model: 'Boyz', paintSource: 'own', needsHelp: false } });
const dndGame = (from: string, to: string) =>
  api('POST', '/admin/dnd/games', T.admin, { title: `E2E D&D ${from}`, gameType: 'One-shot', capacity: 4, startsAt: local(from), endsAt: local(to), status: 'open' });

beforeAll(async () => {
  if (!E2E) return;
  const disc = sql(`select id from disciplines where slug = 'wh' limit 1`) || sql(`insert into disciplines (slug, title) values ('wh', 'E2E WH') returning id`);
  game = Number(sql(`select id from services where slug = 'wh_game' limit 1`) || sql(`insert into services (discipline_id, slug, title, duration, seats_per_table) values (${disc}, 'wh_game', 'E2E игра', 240, 2) returning id`));
  painting = Number(sql(`select id from services where slug = 'wh_painting' limit 1`) || sql(`insert into services (discipline_id, slug, title, duration, pool_capacity) values (${disc}, 'wh_painting', 'E2E покраска', 120, 6) returning id`));
  tableId = Number(sql(`insert into tables (name) values ('E2E остров D&D') returning id`));
  for (const [name, id] of Object.entries({ admin: 777, player: 4501 })) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name }) });
    if (r.status !== 200) show(`login ${name}`, r);
    T[name] = r.json.token;
  }
});

describe('игра D&D закрывает клуб', () => {
  test('игра 13:00–17:00 создаётся и закрывает клуб до 18:00', async () => {
    const r = await dndGame('13:00', '17:00');
    if (r.status !== 200) show('dnd game', r);
    expect(r.status).toBe(200);
    gameId = r.json.id;
    const availability = await api('GET', `/services/${game}/availability?date=${day}`, T.player);
    expect(availability.status).toBe(200);
    expect(availability.json.closures).toHaveLength(1);
    expect(availability.json.closures[0].endsAt.slice(11, 16)).toBe('18:00');
  });

  test('столы Warhammer: в закрытие нельзя, ровно после часа — можно', async () => {
    expect((await bookTable('14:00')).status).toBeGreaterThanOrEqual(400);
    expect((await bookTable('17:30')).status).toBeGreaterThanOrEqual(400);
    const after = await bookTable('18:00');
    if (after.status !== 200) show('book 18:00', after);
    expect(after.status).toBe(200);
  });

  test('покраска тоже закрыта', async () => {
    const r = await bookPainting('14:00');
    expect(r.status).toBeGreaterThanOrEqual(400);
    const after = await bookPainting('18:00');
    if (after.status !== 200) show('painting 18:00', after);
    expect(after.status).toBe(200);
    const availability = await api('GET', `/services/${painting}/availability?date=${day}`, T.player);
    const segments: { startsAt: string; endsAt: string; freeSeats: number }[] = availability.json.slots[0].segments;
    const during = segments.filter((s) => s.startsAt.slice(11, 16) < '18:00' && s.endsAt.slice(11, 16) > '13:00');
    expect(during.every((s) => s.freeSeats === 0)).toBe(true);
  });

  test('D&D поверх записи игрока — отказ со списком', async () => {
    const r = await dndGame('20:00', '22:00');
    expect(r.status).toBe(409);
    expect(String(r.json.error)).toContain('player');
  });

  test('бронь стола этой же игры — можно, чужая бронь D&D в это время — нельзя', async () => {
    const own = await api('POST', '/admin/table-holds', T.admin, { tableId, startsAt: local('13:00'), endsAt: local('17:00'), purpose: 'dnd', title: 'E2E D&D стол', dndGameId: gameId });
    if (own.status !== 200) show('own hold', own);
    expect(own.status).toBe(200);
    const other = await api('POST', '/admin/table-holds', T.admin, { tableId, startsAt: local('14:00'), endsAt: local('16:00'), purpose: 'tournament', title: 'E2E турнир' });
    expect(other.status).toBe(409);
  });
});
