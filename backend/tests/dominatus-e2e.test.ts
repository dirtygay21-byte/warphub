/**
 * Кампания Dominatus (DM2) — сквозная проверка: настоящий сервер + PostgreSQL (CI job «Backend e2e»).
 * Warmaster создаёт кампанию и фазу; участник записывает битву; награды, выбор карты, конец фазы, конец кампании.
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

const ID = { admin: 777, anna: 5101, boris: 5102, cara: 5103, noaccess: 5104 };
const T: Record<string, string> = {};
const U: Record<string, string> = {};
const P: Record<string, number> = {};
const battle = (over: object = {}) => ({
  gameKey: 'dom-e2e-game-1',
  player1Id: P.anna,
  player2Id: P.boris,
  vp1: 70,
  vp2: 50,
  result: 'p1',
  agenda1: 'dom-planetfall',
  agenda2: 'dom-dig-in',
  achieved1: 1,
  achieved2: 0,
  ...over,
});
const view = async (who: string) => (await api('GET', '/roster/dominatus/campaign', T[who])).json;

beforeAll(async () => {
  if (!E2E) return;
  sql(`delete from dominatus_campaigns`);
  for (const [name, id] of Object.entries(ID)) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name }) });
    if (r.status !== 200) console.error(`::error::login ${name} → ${r.status}: ${JSON.stringify(r.json).slice(0, 400)}`);
    T[name] = r.json.token;
    U[name] = r.json.user?.id ?? sql(`select id from users where telegram_id = ${id}`);
  }
  sql(`insert into roster_access (user_id) select id from users where telegram_id in (${ID.anna}, ${ID.boris}, ${ID.cara}) on conflict do nothing`);
});

describe('dominatus campaign (DM2)', () => {
  test('access: not logged in 401, no WarpBuilder 403, not admin 403; no campaign → null', async () => {
    expect((await api('GET', '/roster/dominatus/campaign')).status).toBe(401);
    expect((await api('GET', '/roster/dominatus/campaign', T.noaccess)).status).toBe(403);
    expect((await api('POST', '/admin/dominatus/campaign', T.anna, { name: 'X' })).status).toBe(403);
    expect((await view('anna')).campaign).toBeNull();
  });

  test('Warmaster: campaign, players, alliances; one active campaign', async () => {
    const c = await api('POST', '/admin/dominatus/campaign', T.admin, { name: 'Осень 2026' });
    if (c.status !== 200) console.error(`::error::campaign → ${c.status}: ${JSON.stringify(c.json).slice(0, 400)}`);
    expect(c.status).toBe(200);
    expect((await api('POST', '/admin/dominatus/campaign', T.admin, { name: 'Вторая' })).status).toBe(409);
    expect((await api('PUT', `/admin/dominatus/players/${U.anna}`, T.admin, { alliance: 'pirates' })).status).toBe(400);
    for (const [who, alliance] of [
      ['anna', 'liberators'],
      ['boris', 'oppressors'],
      ['cara', 'liberators'],
    ] as const)
      expect((await api('PUT', `/admin/dominatus/players/${U[who]}`, T.admin, { alliance })).status).toBe(200);
    const v = await view('anna');
    expect(v.campaign.name).toBe('Осень 2026');
    for (const p of v.players) P[p.name] = p.id;
    expect(v.me.alliance).toBe('liberators');
    expect((await api('GET', '/admin/dominatus/players/search?q=5102', T.admin)).json.length).toBe(1);
  });

  test('phase: location must match the roll and phase; no battles before a phase', async () => {
    expect((await api('POST', '/roster/dominatus/battles', T.anna, battle())).status).toBe(409);
    expect((await api('POST', '/admin/dominatus/phases', T.admin, { phase: 2, locationId: 'cerbera-base' })).status).toBe(400);
    expect((await api('POST', '/admin/dominatus/phases', T.admin, { phase: 1, locationId: 'mannheim-gap', roll: 3 })).status).toBe(400);
    expect((await api('POST', '/admin/dominatus/phases', T.admin, { phase: 1, locationId: 'cerbera-base' })).status).toBe(400);
    expect((await api('POST', '/admin/dominatus/phases', T.admin, { phase: 1, locationId: 'volcanus-archipelago', roll: 3 })).status).toBe(200);
    expect((await api('POST', '/admin/dominatus/phases', T.admin, { phase: 1, locationId: 'mannheim-gap' })).status).toBe(409);
    const v = await view('anna');
    expect(v.currentPhase).toBe(1);
    expect(v.phases[0].location.id).toBe('volcanus-archipelago');
  });

  test('battle: participant only, different alliances, own-alliance Agenda; rewards created; re-record replaces', async () => {
    expect((await api('POST', '/roster/dominatus/battles', T.cara, battle())).status).toBe(403);
    expect((await api('POST', '/roster/dominatus/battles', T.anna, battle({ player2Id: P.cara, agenda2: null }))).status).toBe(400);
    expect((await api('POST', '/roster/dominatus/battles', T.anna, battle({ agenda1: 'dom-dig-in' }))).status).toBe(400);
    const r = await api('POST', '/roster/dominatus/battles', T.boris, battle());
    if (r.status !== 200) console.error(`::error::battle → ${r.status}: ${JSON.stringify(r.json).slice(0, 400)}`);
    expect(r.status).toBe(200);
    expect(r.json.updated).toBe(false);
    const again = await api('POST', '/roster/dominatus/battles', T.anna, battle({ vp1: 72 }));
    expect(again.json.updated).toBe(true);

    const anna = (await view('anna')).me.cards;
    expect(anna.filter((c: any) => c.kind === 'honour')).toEqual([expect.objectContaining({ pending: true, draw: 2 })]);
    expect(anna.filter((c: any) => c.kind === 'agenda').length).toBe(1);
    const boris = (await view('boris')).me.cards;
    expect(boris).toEqual([expect.objectContaining({ kind: 'skill', pending: true, draw: 1 })]);
    const v = await view('cara');
    expect(v.battles.length).toBe(1);
    expect(v.battles[0].vp1).toBe(72);
    expect(v.standings.liberators.wins).toBe(1);
  });

  test('claim: own card, right deck, once; battle locked after a claim', async () => {
    const card = (await view('anna')).me.cards.find((c: any) => c.kind === 'honour');
    expect((await api('POST', `/roster/dominatus/cards/${card.id}/claim`, T.boris, { name: 'Shadow Stalker' })).status).toBe(403);
    expect((await api('POST', `/roster/dominatus/cards/${card.id}/claim`, T.anna, { name: 'Front-line Champion' })).status).toBe(400);
    expect((await api('POST', `/roster/dominatus/cards/${card.id}/claim`, T.anna, { name: 'Shadow Stalker' })).status).toBe(200);
    expect((await api('POST', `/roster/dominatus/cards/${card.id}/claim`, T.anna, { name: 'Undying Duty' })).status).toBe(409);
    expect((await api('POST', '/roster/dominatus/battles', T.anna, battle({ vp1: 80 }))).status).toBe(409);
    expect((await view('anna')).standings.liberators.phaseHonours).toBe(1);
  });

  test('end of phase: control, Ascendancy, Narrative Points, Relic award, Agenda Achieved discarded', async () => {
    const pre = await api('GET', '/admin/dominatus/phases/end', T.admin);
    expect(pre.json.controller).toBe('liberators');
    expect(pre.json.ascendant).toEqual(['liberators']);
    expect(pre.json.narrative).toEqual({ liberators: 2 });
    const r = await api('POST', '/admin/dominatus/phases/end', T.admin, {});
    expect(r.status).toBe(200);
    const v = await view('anna');
    expect(v.currentPhase).toBeNull();
    expect(v.phases[0]).toEqual(expect.objectContaining({ status: 'resolved', controller: 'liberators' }));
    expect(v.standings.liberators.narrative).toBe(2);
    expect(v.me.cards.some((c: any) => c.kind === 'agenda')).toBe(false);
    const relic = v.me.cards.find((c: any) => c.kind === 'relic');
    expect(relic).toEqual(expect.objectContaining({ pending: true, draw: 1 }));
    expect((await api('POST', `/roster/dominatus/cards/${relic.id}/claim`, T.anna, { name: 'Blade of Sacrifice' })).status).toBe(200);
    expect((await api('POST', '/admin/dominatus/phases/end', T.admin, {})).status).toBe(409);
  });

  test('finish: players with battles cannot be removed; campaign closes', async () => {
    expect((await api('DELETE', `/admin/dominatus/players/${P.anna}`, T.admin)).status).toBe(409);
    expect((await api('DELETE', `/admin/dominatus/players/${P.cara}`, T.admin)).status).toBe(200);
    expect((await api('POST', '/admin/dominatus/campaign/finish', T.admin, { winnerAlliance: 'liberators' })).status).toBe(200);
    expect((await view('anna')).campaign).toBeNull();
  });
});
