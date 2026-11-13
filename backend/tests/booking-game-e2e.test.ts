/**
 * Игра в записи на Warhammer (40K / AoS / Kill Team) — сквозная проверка: настоящий сервер + PostgreSQL (CI job «Backend e2e»).
 * Справочник отдаёт игры, фракции AoS и команды Kill Team; запись Kill Team — без очков; соперник присоединяется
 * только к той же игре, что у первого игрока; в списке сессий видна игра; ники видны только вошедшим;
 * в «Мои записи» — соперники за тем же столом (31.10.2026).
 */
import { beforeAll, describe as baseDescribe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';

const E2E = process.env.WARPHUB_E2E === '1' && !!process.env.POSTGRES_URI;
const describe = E2E ? baseDescribe : baseDescribe.skip;
const API = process.env.WARPHUB_E2E_API ?? 'http://127.0.0.1:4100';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '123456:TEST_TOKEN_FOR_LOCAL_RUN';

function initData(user: { id: number; first_name: string; username?: string }) {
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

// ближайшее воскресенье не раньше чем через 2 дня; время клуба UTC+5
const day = (() => {
  const d = new Date(Date.now() + 2 * 86400_000);
  while (new Date(d.getTime() + 5 * 3600_000).getUTCDay() !== 0) d.setTime(d.getTime() + 86400_000);
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
})();
const local = (hh: string) => new Date(`${day}T${hh}:00+05:00`).toISOString();

const T: Record<string, string> = {};
let serviceId = 0;
let tableId = 0;
const book = (who: string, details: Record<string, unknown>) =>
  api('POST', '/reservations', T[who], { serviceId, tableId, startsAt: local('12:00'), partySize: 1, seatClubArmyOptions: [false], details });

beforeAll(async () => {
  if (!E2E) return;
  const existing = sql(`select id from services where slug = 'wh_game' limit 1`);
  if (existing) serviceId = Number(existing);
  else {
    const disc = sql(`select id from disciplines where slug = 'wh' limit 1`) || sql(`insert into disciplines (slug, title) values ('wh', 'E2E WH') returning id`);
    serviceId = Number(sql(`insert into services (discipline_id, slug, title, duration, seats_per_table) values (${disc}, 'wh_game', 'E2E игра', 240, 2) returning id`));
  }
  tableId = Number(sql(`insert into tables (name, category) values ('E2E стол игры', 'small') returning id`));
  for (const [name, id] of Object.entries({ host: 4301, wrong: 4302, right: 4303, admin: 777 })) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name, ...(name === 'host' ? { username: 'host_nick' } : {}) }) });
    if (r.status !== 200) console.error(`::error::login ${name} → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);
    T[name] = r.json.token;
  }
});

describe('игра в записи на Warhammer', () => {
  test('справочник: игры, фракции AoS из данных, команды Kill Team', async () => {
    const r = await api('GET', '/booking-options');
    expect(r.status).toBe(200);
    expect(r.json.games.map((g: { value: string }) => g.value)).toEqual(['40k', 'aos', 'kt', 'warcry']);
    expect(r.json.killTeams).toContain('Pathfinders');
    expect(Array.isArray(r.json.aosFactions)).toBe(true);
  });

  test('Kill Team без очков; соперник с другой игрой — отказ, с той же — присоединяется', async () => {
    const host = await book('host', { game: 'kt', army: 'Pathfinders', experienceLevel: 'player' });
    if (host.status !== 200) console.error(`::error::host → ${host.status}: ${JSON.stringify(host.json).slice(0, 600)}`);
    expect(host.status).toBe(200);
    expect(host.json.details.points).toBeNull();
    const wrong = await book('wrong', { game: '40k', army: 'Orks', points: 1000, experienceLevel: 'player' });
    expect(wrong.status).toBe(400);
    // стол категории Tactical Games: 40K здесь не принимается (решение 05.11.2026)
    expect(String(wrong.json.error)).toContain('Тактические игры');
    const right = await book('right', { game: 'kt', army: 'Kasrkin', experienceLevel: 'beginner' });
    if (right.status !== 200) console.error(`::error::join → ${right.status}: ${JSON.stringify(right.json).slice(0, 600)}`);
    expect(right.status).toBe(200);
    expect(right.json.joinedSession).toBe(true);
  });

  test('админка «Все записи»: у каждой записи — её игра целиком (оба игрока, места, выбор) (13.11.2026)', async () => {
    const r = await api('GET', `/admin/reservations?tableId=${tableId}&limit=50&offset=0`, T.admin);
    if (r.status !== 200) console.error(`::error::admin list → ${r.status}: ${JSON.stringify(r.json).slice(0, 600)}`);
    expect(r.status).toBe(200);
    const items = (r.json as Array<{ id: string; status: string; game: { key: string; seats: number; occupied: number; players: Array<{ firstName: string; details: { army?: string } | null }> } | null }>).filter((x) => x.status !== 'cancelled');
    expect(items.length).toBe(2);
    const [a, b] = items;
    expect(a!.game?.key).toBe(b!.game?.key);
    expect(a!.game).toMatchObject({ seats: 2, occupied: 2 });
    expect(a!.game!.players.map((p) => p.firstName)).toEqual(['host', 'right']);
    expect(a!.game!.players.map((p) => p.details?.army)).toEqual(['Pathfinders', 'Kasrkin']);
    expect((await api('GET', `/admin/reservations?limit=5&offset=0`, T.host)).status).toBe(403);
    // категории: игра впереди и подтверждения ждёт — есть в pending, нет в past; count — по тем же фильтрам
    const cat = async (c: string) => (await api('GET', `/admin/reservations?tableId=${tableId}&categories=${c}&limit=50&offset=0`, T.admin)).json as Array<{ status: string }>;
    const pending = await cat('pending');
    const confirmed = await cat('confirmed');
    expect(pending.length + confirmed.length).toBe(2);
    expect((await cat('past')).length).toBe(0);
    expect((await cat('pending,confirmed')).length).toBe(2);
    expect([400, 422]).toContain((await api('GET', `/admin/reservations?categories=bogus&limit=5&offset=0`, T.admin)).status);
  });

  test('в сессиях стола видна игра игроков', async () => {
    const r = await api('GET', `/services/${serviceId}/availability?date=${day}`, T.host);
    expect(r.status).toBe(200);
    const s = JSON.stringify(r.json);
    expect(s).toContain('"game":"kt"');
    expect(s).toContain('Kill Team');
  });

  test('ник Telegram игрока: виден вошедшим, скрыт без входа', async () => {
    const withLogin = await api('GET', `/services/${serviceId}/availability?date=${day}`, T.right);
    expect(JSON.stringify(withLogin.json)).toContain('"username":"host_nick"');
    const anonymous = await api('GET', `/services/${serviceId}/availability?date=${day}`);
    expect(anonymous.status).toBe(200);
    expect(JSON.stringify(anonymous.json)).not.toContain('host_nick');
  });

  test('«Мои записи»: соперники за тем же столом с ником, армией и опытом', async () => {
    const mine = await api('GET', '/reservations/my', T.right);
    expect(mine.status).toBe(200);
    const game = mine.json.reservations.find((r: { tableId: number | null }) => r.tableId === tableId);
    expect(game).toBeDefined();
    expect(game.tablemates).toHaveLength(1);
    expect(game.tablemates[0]).toMatchObject({ firstName: 'host', username: 'host_nick', game: 'kt', army: 'Pathfinders', experienceLevel: 'player' });
    const hosts = await api('GET', '/reservations/my', T.host);
    const hostGame = hosts.json.reservations.find((r: { tableId: number | null }) => r.tableId === tableId);
    expect(hostGame.tablemates.map((p: { firstName: string }) => p.firstName)).toEqual(['right']);
  });
});
