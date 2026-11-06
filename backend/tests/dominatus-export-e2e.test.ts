/**
 * Экспорт битвы на сайт Dominatus: настоящий WarpHub API + PostgreSQL + mock принимающего сайта.
 * Проверяются payload, integration token, идемпотентность, статусы двух устройств и retry.
 */
import { afterAll, beforeAll, describe as baseDescribe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import http from 'node:http';

const E2E = process.env.WARPHUB_E2E === '1' && !!process.env.POSTGRES_URI;
const describe = E2E ? baseDescribe : baseDescribe.skip;
const API = process.env.WARPHUB_E2E_API ?? 'http://127.0.0.1:4100';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '123456:TEST_TOKEN_FOR_LOCAL_RUN';
const ID = { admin: 777, anna: 5201, boris: 5202, noaccess: 5203 };
const MOCK_PORT = 41999;
const T: Record<string, string> = {};
const U: Record<string, string> = {};
const P: Record<string, number> = {};
const requests: Array<{ gameKey: string; token: string | undefined; body: any }> = [];
const applied = new Map<string, string>();
let mock: http.Server | undefined;
let sequence = 0;

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
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}
function sql(query: string): string {
  const r = Bun.spawnSync(['psql', process.env.POSTGRES_URI!, '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
}
const view = async (who: string) => (await api('GET', '/roster/dominatus/campaign', T[who])).json;
const battle = (over: object = {}) => ({
  gameKey: 'dom-export-game-1', player1Id: P.anna, player2Id: P.boris, vp1: 70, vp2: 50,
  result: 'p1', agenda1: 'dom-planetfall', agenda2: 'dom-dig-in', achieved1: 1, achieved2: 0,
  details: { events: [{ seq: 1, type: 'score', text: 'full export payload' }] },
  ...over,
});

beforeAll(async () => {
  if (!E2E) return;
  sql(`delete from dominatus_campaigns`);
  mock = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/integrations/warphub/battles') {
      res.writeHead(404).end();
      return;
    }
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const gameKey = body.battle.gameKey as string;
      requests.push({ gameKey, token: req.headers['x-integration-token'] as string | undefined, body });
      if (gameKey === 'retry-once' && requests.filter((r) => r.gameKey === gameKey).length === 1) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: { message: 'temporary site failure' } }));
        return;
      }
      const updated = applied.has(gameKey);
      const battleId = applied.get(gameKey) ?? `site-${++sequence}`;
      applied.set(gameKey, battleId);
      res.writeHead(updated ? 200 : 201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data: { battleId, updated } }));
    })().catch((error) => {
      res.writeHead(500).end(String(error));
    });
  });
  await new Promise<void>((resolve) => mock!.listen(MOCK_PORT, '127.0.0.1', resolve));
  process.env.DOMINATUS_API_URL = `http://127.0.0.1:${MOCK_PORT}`;
  process.env.DOMINATUS_INTEGRATION_TOKEN = 'test-integration-secret';

  for (const [name, id] of Object.entries(ID)) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name }) });
    if (r.status !== 200) throw new Error(`login ${name}: ${r.status}`);
    T[name] = r.json.token;
    U[name] = r.json.user?.id ?? sql(`select id from users where telegram_id = ${id}`);
  }
  sql(`insert into roster_access (user_id) select id from users where telegram_id in (${ID.anna}, ${ID.boris}) on conflict do nothing`);
  expect((await api('POST', '/admin/dominatus/campaign', T.admin, { name: 'Export Campaign' })).status).toBe(200);
  for (const [who, alliance] of [['anna', 'liberators'], ['boris', 'oppressors']] as const) {
    expect((await api('PUT', `/admin/dominatus/players/${U[who]}`, T.admin, { alliance })).status).toBe(200);
  }
  const v = await view('anna');
  for (const p of v.players) P[p.name] = p.id;
  expect((await api('POST', '/admin/dominatus/phases', T.admin, { phase: 1, locationId: 'volcanus-archipelago', roll: 3 })).status).toBe(200);
});

afterAll(() => {
  mock?.close();
});

describe('dominatus export', () => {
  test('participant uploads once; another upload updates the same site battle and both see status', async () => {
    expect((await api('POST', '/roster/dominatus/battles', T.anna, battle())).status).toBe(200);
    expect((await api('POST', '/roster/dominatus/exports', T.noaccess, { gameKey: 'dom-export-game-1' })).status).toBe(403);
    const first = await api('POST', '/roster/dominatus/exports', T.anna, { gameKey: 'dom-export-game-1' });
    expect(first.status).toBe(200);
    expect(first.json.status).toBe('applied');
    expect(first.json.battleIdOnSite).toBe('site-1');
    const second = await api('POST', '/roster/dominatus/exports', T.boris, { gameKey: 'dom-export-game-1' });
    expect(second.json.status).toBe('applied');
    expect(second.json.battleIdOnSite).toBe('site-1');
    for (const who of ['anna', 'boris']) {
      const v = await view(who);
      expect(v.battles[0].exportStatus).toBe('applied');
      expect(v.battles[0].exportBattleId).toBe('site-1');
    }
    const sent = requests.find((r) => r.gameKey === 'dom-export-game-1');
    expect(sent?.token).toBe('test-integration-secret');
    expect(sent?.body.campaign.name).toBe('Export Campaign');
    expect(sent?.body.battle.phase).toBe(1);
    expect(sent?.body.battle.locationKey).toBe('volcanus-archipelago');
    expect(sent?.body.battle.achieved1).toBe(1);
    expect(sent?.body.battle.achieved2).toBe(0);
    expect(sent?.body.battle.details.events[0].text).toBe('full export payload');
    expect(sent?.body.players.map((p: any) => p.id).sort((a: number, b: number) => a - b).length).toBeGreaterThanOrEqual(2);
    expect(applied.size).toBe(1);
  });

  test('temporary failure becomes retry, explicit retry delivers without a duplicate', async () => {
    expect((await api('POST', '/roster/dominatus/battles', T.anna, battle({ gameKey: 'retry-once', achieved1: 0, achieved2: 0, agenda1: null, agenda2: null }))).status).toBe(200);
    const failed = await api('POST', '/roster/dominatus/exports', T.anna, { gameKey: 'retry-once' });
    expect(failed.json.status).toBe('retry');
    expect(failed.json.error).toContain('temporary site failure');
    const retried = await api('POST', '/roster/dominatus/exports/retry-once/retry', T.boris);
    expect(retried.status).toBe(200);
    expect(retried.json.status).toBe('applied');
    expect(retried.json.updated).toBe(true);
    expect(requests.filter((r) => r.gameKey === 'retry-once').length).toBe(2);
    expect(applied.get('retry-once')).toBe('site-2');
  });
});
