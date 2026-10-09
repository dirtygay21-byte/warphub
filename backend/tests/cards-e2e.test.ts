/**
 * Mini-games end-to-end: real server + PostgreSQL.
 * Time is "fast-forwarded" by moving started_at back in the database,
 * so we can test realistic scores without waiting.
 */
import { afterAll, beforeAll, describe as baseDescribe, expect, test } from 'bun:test';

/**
 * Эти проверки идут против запущенного тестового сервера и тестовой базы.
 * На боевом сервере они не запускаются: включаются только при WARPHUB_E2E=1.
 */
const E2E = process.env.WARPHUB_E2E === '1';
const describe = E2E ? baseDescribe : baseDescribe.skip;
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const API = 'http://127.0.0.1:4100';
const BOT_TOKEN = '123456:TEST_TOKEN_FOR_LOCAL_RUN';
const NOTIFY_LOG = '/tmp/claude-0/notify.log';

function initData(user: { id: number; first_name: string; username?: string }) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAE' + user.id,
    user: JSON.stringify(user),
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}

function sql(query: string) {
  const r = Bun.spawnSync([
    '/usr/lib/postgresql/16/bin/psql', '-h', '/tmp/claude-0', '-p', '5433', '-U', 'postgres',
    '-d', 'wh_e2e', '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', query,
  ]);
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
}

/** «Прошло N секунд с начала попытки» */
const backdate = (sessionId: string, seconds: number) =>
  sql(`update minigame_sessions set started_at = now() - interval '${seconds} seconds' where id = '${sessionId}'`);

const notifications = () =>
  existsSync(NOTIFY_LOG)
    ? readFileSync(NOTIFY_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const T: Record<string, string> = {};
const ID = { lena: 4001, olya: 4002, race: 4003, admin: 777 };

beforeAll(async () => {
  if (!E2E) return;
  for (const [name, id] of Object.entries(ID)) {
    const r = await api('POST', '/auth/telegram', undefined, {
      initData: initData({ id, first_name: name[0]!.toUpperCase() + name.slice(1), username: name }),
    });
    expect(r.status).toBe(200);
    T[name] = r.json.token;
  }
});

afterAll(async () => {
  if (!E2E) return;
  await api('PUT', '/admin/minigames/settings', T.admin, {});
});

describe('cards: state and opening', () => {
  test('four games in the list; cards show the rarity table', async () => {
    const r = await api('GET', '/minigames', T.lena);
    expect(r.json.map((g: any) => g.key)).toEqual(['runner', 'dice', 'egg', 'cards']);
    const cards = r.json[3];
    expect(cards.title).toBe('Легенды Warp Hub');
    expect(cards.cards.rarities.map((x: any) => [x.rarity, x.points])).toEqual([
      ['common', 100], ['uncommon', 300], ['rare', 500], ['epic', 750], ['legendary', 1000],
    ]);
    expect(cards.cards.rarities.reduce((s: number, x: any) => s + x.chance, 0)).toBeCloseTo(100, 0);
  });
  test('initial state: full catalog, empty collection, 1 pack, 0 points', async () => {
    const r = await api('GET', '/minigames/cards', T.lena);
    expect(r.status).toBe(200);
    expect(r.json.catalog.length).toBe(35);
    expect(r.json.catalog[0]).toMatchObject({ factionLabel: expect.any(String), rarityLabel: expect.any(String) });
    expect(r.json.collection).toEqual({});
    expect(r.json.packsLeft).toBe(1);
    expect(r.json.balance).toBe(0);
  });
  test('cards cannot be played as a score game', async () => {
    const r = await api('POST', '/minigames/cards/sessions', T.lena);
    expect(r.status).toBe(400);
  });
  let opened: any;
  test('open a pack: 5 cards, points credited, collection saved', async () => {
    const r = await api('POST', '/minigames/cards/open', T.lena);
    expect(r.status).toBe(200);
    opened = r.json;
    expect(opened.cards.length).toBe(5);
    expect(opened.cards.some((c: any) => c.rarity !== 'common')).toBe(true);
    const sum = opened.cards.reduce((s: number, c: any) => s + c.points, 0);
    expect(opened.points).toBe(sum);
    expect(opened.balance).toBe(sum);
    expect(opened.packsLeft).toBe(0);
    expect(opened.nextPackAt).toBeTruthy();
    expect(opened.cards[0].isNew).toBe(true);
    const state = await api('GET', '/minigames/cards', T.lena);
    const total = Object.values(state.json.collection as Record<string, number>).reduce((s, n) => s + n, 0);
    expect(total).toBe(5);
    expect(state.json.balance).toBe(sum);
    expect(state.json.lastPack.cards.length).toBe(5);
    const history = await api('GET', '/minigames/points/my', T.lena);
    expect(history.json.history[0]).toMatchObject({ delta: sum, reason: 'card_pack' });
  });
  test('second pack the same day → 429', async () => {
    const r = await api('POST', '/minigames/cards/open', T.lena);
    expect(r.status).toBe(429);
    expect(r.json.code).toBe('PACK_LIMIT');
  });
  test('double tap: two parallel requests open only one pack', async () => {
    const [a, b] = await Promise.all([
      api('POST', '/minigames/cards/open', T.race),
      api('POST', '/minigames/cards/open', T.race),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 429]);
    const state = await api('GET', '/minigames/cards', T.race);
    expect(state.json.packsOpened).toBe(1);
  });
});

describe('cards: admin economy', () => {
  test('legendary is worth 1000 points; table changes apply immediately', async () => {
    const s = (await api('GET', '/admin/minigames/settings', T.admin)).json;
    s.games.cards.params.packsPerDay = 5;
    for (const r of ['common', 'uncommon', 'rare', 'epic']) s.games.cards.params.rarities[r].weight = 0;
    s.games.cards.params.rarities.legendary.weight = 1;
    expect((await api('PUT', '/admin/minigames/settings', T.admin, s)).status).toBe(200);
    const r = await api('POST', '/minigames/cards/open', T.olya);
    expect(r.json.cards.every((c: any) => c.rarity === 'legendary' && c.points === 1000)).toBe(true);
    expect(r.json.points).toBe(5000);
    await wait(300);
    expect(notifications().some((n) => n.chat === String(ID.olya) && n.text.includes('Легендарная'))).toBe(true);
    await api('PUT', '/admin/minigames/settings', T.admin, {});
  });
  test('admin finds a player, spends points; cannot go below zero', async () => {
    expect((await api('GET', '/admin/minigames/points?q=olya', T.olya)).status).toBe(403);
    const found = await api('GET', '/admin/minigames/points?q=olya', T.admin);
    expect(found.json.length).toBe(1);
    const p = found.json[0];
    expect(p.balance).toBe(5000);
    expect(p.totalCards).toBe(5);
    const spend = await api('POST', `/admin/minigames/points/${p.id}/adjust`, T.admin, { delta: -1500, note: 'Скидка на игру' });
    expect(spend.status).toBe(200);
    expect(spend.json.balance).toBe(3500);
    const over = await api('POST', `/admin/minigames/points/${p.id}/adjust`, T.admin, { delta: -9999 });
    expect(over.status).toBe(409);
    expect(over.json.code).toBe('NOT_ENOUGH_POINTS');
    const bad = await api('POST', `/admin/minigames/points/${p.id}/adjust`, T.admin, { delta: 1.5 });
    expect(bad.status).toBe(400);
    const byTelegramId = await api('GET', `/admin/minigames/points?q=${ID.olya}`, T.admin);
    expect(byTelegramId.json[0].balance).toBe(3500);
    const hist = await api('GET', `/admin/minigames/points/${p.id}`, T.admin);
    expect(hist.json.history[0]).toMatchObject({ delta: -1500, reason: 'admin_spend', note: 'Скидка на игру' });
    await wait(300);
    expect(notifications().some((n) => n.chat === String(ID.olya) && n.text.includes('Списано 1500'))).toBe(true);
  });
  test('turning cards off blocks opening', async () => {
    const s = (await api('GET', '/admin/minigames/settings', T.admin)).json;
    s.games.cards.enabled = false;
    s.games.cards.params.packsPerDay = 9;
    await api('PUT', '/admin/minigames/settings', T.admin, s);
    const r = await api('POST', '/minigames/cards/open', T.olya);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('GAME_DISABLED');
    const list = await api('GET', '/minigames', T.olya);
    expect(list.json.map((g: any) => g.key)).not.toContain('cards');
    await api('PUT', '/admin/minigames/settings', T.admin, {});
  });
});
