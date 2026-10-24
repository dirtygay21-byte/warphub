/**
 * Игра на двух телефонах (T1) — сквозная проверка: настоящий сервер + PostgreSQL (CI job «Backend e2e»).
 * Создание, вход по коду, порядок журнала, конфликт отставшего телефона, места, доступ.
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

const ID = { anna: 5001, boris: 5002, third: 5003, noaccess: 5004 };
const T: Record<string, string> = {};
let game: { id: string; code: string } = { id: '', code: '' };
const ev = (seq: number, type: string, seat: string | null, extra: object = {}) => ({ id: `ev-${seq}-${Math.random()}`, seq, at: new Date().toISOString(), type, seat, ...extra });
const post = (who: string, expectedSeq: number, event: object) => api('POST', `/roster/games/${game.id}/events`, T[who], { expectedSeq, event });

beforeAll(async () => {
  if (!E2E) return;
  for (const [name, id] of Object.entries(ID)) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name }) });
    if (r.status !== 200) console.error(`::error::login ${name} → ${r.status}: ${JSON.stringify(r.json).slice(0, 400)}`);
    T[name] = r.json.token;
  }
  // доступ к Roster Builder — всем, кроме noaccess
  sql(`insert into roster_access (user_id) select id from users where telegram_id in (${ID.anna}, ${ID.boris}, ${ID.third}) on conflict do nothing`);
});

describe('online games (T1)', () => {
  test('without Roster Builder access — 403; not logged in — 401', async () => {
    expect((await api('POST', '/roster/games')).status).toBe(401);
    expect((await api('POST', '/roster/games', T.noaccess)).status).toBe(403);
  });

  test('create: creator is player 1 with a 5-character code', async () => {
    const r = await api('POST', '/roster/games', T.anna);
    if (r.status !== 200) console.error(`::error::create → ${r.status}: ${JSON.stringify(r.json).slice(0, 400)}`);
    expect(r.status).toBe(200);
    expect(r.json.seat).toBe('p1');
    expect(r.json.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(r.json.players.p1.name).toBe('anna');
    expect(r.json.players.p2).toBeNull();
    game = r.json;
  });

  test('join by code (any case); re-join keeps the seat; a third player is refused', async () => {
    expect((await api('POST', '/roster/games/join', T.boris, { code: 'xxxxx' })).status).toBe(404);
    const j = await api('POST', '/roster/games/join', T.boris, { code: game.code.toLowerCase() });
    expect(j.status).toBe(200);
    expect(j.json.seat).toBe('p2');
    expect((await api('POST', '/roster/games/join', T.boris, { code: game.code })).json.seat).toBe('p2');
    expect((await api('POST', '/roster/games/join', T.anna, { code: game.code })).json.seat).toBe('p1');
    expect((await api('POST', '/roster/games/join', T.third, { code: game.code })).status).toBe(409);
  });

  test('journal: in order, own seat or shared; behind phone gets 409 with lastSeq; outsiders refused', async () => {
    expect((await post('anna', 0, ev(1, 'player-set', null))).status).toBe(400); // первое — создание игры
    expect((await post('anna', 0, ev(1, 'game-created', null))).json).toEqual({ lastSeq: 1 });
    expect((await post('boris', 1, ev(2, 'player-set', 'p2'))).json).toEqual({ lastSeq: 2 });
    const behind = await post('anna', 1, ev(2, 'player-set', 'p1'));
    expect(behind.status).toBe(409);
    expect(behind.json).toMatchObject({ code: 'CONFLICT', lastSeq: 2 });
    expect((await post('anna', 2, ev(3, 'player-set', 'p2'))).status).toBe(403); // чужое место
    expect((await post('anna', 2, ev(3, 'dispositions-revealed', null))).json).toEqual({ lastSeq: 3 });
    expect((await post('third', 3, ev(4, 'player-set', null))).status).toBe(403);
    expect((await api('GET', `/roster/games/${game.id}/events`, T.third)).status).toBe(403);
  });

  test('events after N; a roster code up to 32 KB fits, larger is refused', async () => {
    const all = await api('GET', `/roster/games/${game.id}/events?after=0`, T.boris);
    expect(all.status).toBe(200);
    expect(all.json.events.map((e: any) => e.seq)).toEqual([1, 2, 3]);
    expect(all.json.game).toMatchObject({ seat: 'p2', lastSeq: 3 });
    expect((await api('GET', `/roster/games/${game.id}/events?after=2`, T.anna)).json.events.map((e: any) => e.seq)).toEqual([3]);
    expect((await post('boris', 3, ev(4, 'player-set', 'p2', { roster: { code: 'W'.repeat(20_000) } }))).status).toBe(200);
    expect((await post('boris', 4, ev(5, 'player-set', 'p2', { roster: { code: 'W'.repeat(40_000) } }))).status).toBe(413);
  });

  test('my games list', async () => {
    const r = await api('GET', '/roster/games', T.boris);
    expect(r.status).toBe(200);
    expect(r.json.games.some((g: any) => g.id === game.id && g.seat === 'p2')).toBe(true);
  });
});
