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
const ID = { mila: 3001, petr: 3002, vera: 3003, cheat: 3004, admin: 777 };

async function play(token: string, game: 'runner' | 'egg', score: number, seconds: number) {
  const start = await api('POST', `/minigames/${game}/sessions`, token);
  expect(start.status).toBe(200);
  if (seconds) backdate(start.json.sessionId, seconds);
  return api('POST', `/minigames/sessions/${start.json.sessionId}/finish`, token, { score });
}

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
  // вернуть настройки по умолчанию
  await api('PUT', '/admin/minigames/settings', T.admin, {});
});

describe('mini-games: list', () => {
  test('three games with reward tables; login required', async () => {
    expect((await api('GET', '/minigames')).status).toBe(401);
    const r = await api('GET', '/minigames', T.mila);
    expect(r.status).toBe(200);
    expect(r.json.map((g: any) => g.key)).toEqual(['runner', 'dice', 'egg', 'cards']);
    const runner = r.json[0];
    expect(runner.title).toBe('Зелёный рывок');
    expect(runner.tiers.map((t: any) => [t.minScore, t.label])).toEqual([
      [500, 'Скидка 2%'], [1000, 'Скидка 3%'], [2000, 'Скидка 5%'],
    ]);
    expect(runner.bestScore).toBeNull();
    expect(runner.weekReward).toBeNull();
  });
  test('unknown game → 404', async () => {
    expect((await api('POST', '/minigames/tetris/sessions', T.mila)).status).toBe(404);
  });
});

describe('mini-games: anti-cheat', () => {
  test('runner: 2000 m one second after start is rejected and not counted', async () => {
    const start = await api('POST', '/minigames/runner/sessions', T.cheat);
    const r = await api('POST', `/minigames/sessions/${start.json.sessionId}/finish`, T.cheat, { score: 2000 });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('INVALID_SCORE');
    expect(sql(`select status || ':' || reject_reason from minigame_sessions where id='${start.json.sessionId}'`)).toBe('rejected:implausible');
    // повторно отправить тот же результат нельзя
    const again = await api('POST', `/minigames/sessions/${start.json.sessionId}/finish`, T.cheat, { score: 100 });
    expect(again.status).toBe(409);
    expect((await api('GET', '/minigames/rewards/my', T.cheat)).json).toEqual([]);
  });
  test('egg: 1000 taps in 30 s and fractional/negative scores are rejected', async () => {
    expect((await play(T.cheat, 'egg', 1000, 30)).json.code).toBe('INVALID_SCORE');
    expect((await play(T.cheat, 'egg', 12.5, 30)).json.code).toBe('INVALID_SCORE');
    expect((await play(T.cheat, 'egg', -3, 30)).json.code).toBe('INVALID_SCORE');
  });
  test("cannot finish someone else's attempt", async () => {
    const start = await api('POST', '/minigames/egg/sessions', T.mila);
    const r = await api('POST', `/minigames/sessions/${start.json.sessionId}/finish`, T.cheat, { score: 5 });
    expect(r.status).toBe(404);
  });
  test('old attempt (older than 30 minutes) expires', async () => {
    const r = await play(T.cheat, 'runner', 600, 31 * 60);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('SESSION_EXPIRED');
  });
  test('dice: the client cannot send a score — only the server rolls', async () => {
    const start = await api('POST', '/minigames/dice/sessions', T.cheat);
    expect(start.status).toBe(200);
    const r = await api('POST', `/minigames/sessions/${start.json.sessionId}/finish`, T.cheat, { score: 99 });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('WRONG_GAME');
  });
});

describe('mini-games: weekly reward', () => {
  let code = '';
  let rewardId = '';
  test('runner 600 m → new 2% reward with a code + bot message', async () => {
    const r = await play(T.mila, 'runner', 600, 70);
    expect(r.status).toBe(200);
    expect(r.json.rewardOutcome).toBe('new');
    expect(r.json.reward.label).toBe('Скидка 2%');
    expect(r.json.reward.status).toBe('active');
    expect(r.json.reward.code).toMatch(/^WH-[A-HJ-NP-Z2-9]{6}$/);
    code = r.json.reward.code;
    rewardId = r.json.reward.id;
    const days = (Date.parse(r.json.reward.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    await wait(300);
    const msg = notifications().find((n) => n.chat === String(ID.mila) && n.text.includes(code));
    expect(msg).toBeTruthy();
    expect(msg.text).toContain('Зелёный рывок');
  });
  test('better result the same week upgrades the same reward (same code)', async () => {
    const r = await play(T.mila, 'runner', 1200, 70);
    expect(r.json.rewardOutcome).toBe('upgraded');
    expect(r.json.reward.label).toBe('Скидка 3%');
    expect(r.json.reward.code).toBe(code);
    expect(r.json.bestScore).toBe(1200);
  });
  test('worse result keeps the better reward; only one reward per game per week', async () => {
    const r = await play(T.mila, 'runner', 700, 70);
    expect(r.json.rewardOutcome).toBe('kept');
    expect(r.json.reward.label).toBe('Скидка 3%');
    const mine = await api('GET', '/minigames/rewards/my', T.mila);
    expect(mine.json.filter((x: any) => x.game === 'runner').length).toBe(1);
  });
  test('low score → no reward', async () => {
    const r = await play(T.mila, 'egg', 5, 30);
    expect(r.status).toBe(200);
    expect(r.json.rewardOutcome).toBe('none');
    expect(r.json.reward).toBeNull();
  });
  test('egg 120 taps → 3%, separate reward from the runner', async () => {
    const r = await play(T.mila, 'egg', 120, 30);
    expect(r.json.reward.label).toBe('Скидка 3%');
    expect(r.json.reward.code).not.toBe(code);
  });
  test('admin finds the reward by code typed loosely; regular user cannot', async () => {
    expect((await api('GET', `/admin/minigames/rewards?code=${code}`, T.mila)).status).toBe(403);
    const loose = code.replace('WH-', '').toLowerCase();
    const r = await api('GET', `/admin/minigames/rewards?code=${loose}`, T.admin);
    expect(r.status).toBe(200);
    expect(r.json.length).toBe(1);
    expect(r.json[0].user.username).toBe('mila');
    expect(r.json[0].label).toBe('Скидка 3%');
  });
  test('admin redeems once; second time → 409; user sees "used"', async () => {
    const r = await api('POST', `/admin/minigames/rewards/${rewardId}/redeem`, T.admin);
    expect(r.status).toBe(200);
    expect(r.json.status).toBe('used');
    expect((await api('POST', `/admin/minigames/rewards/${rewardId}/redeem`, T.admin)).status).toBe(409);
    const mine = await api('GET', '/minigames/rewards/my', T.mila);
    expect(mine.json.find((x: any) => x.id === rewardId).status).toBe('used');
    const active = await api('GET', '/admin/minigames/rewards?status=active', T.admin);
    expect(active.json.some((x: any) => x.id === rewardId)).toBe(false);
  });
  test('after using this week’s reward, a new one comes only next week', async () => {
    const r = await play(T.mila, 'runner', 2100, 80);
    expect(r.status).toBe(200);
    expect(r.json.rewardOutcome).toBe('week_used');
    expect(r.json.earnedLabel).toBe('Скидка 5%');
  });
  test('expired reward cannot be redeemed', async () => {
    const r = await play(T.petr, 'egg', 60, 30);
    sql(`update minigame_rewards set expires_at = now() - interval '1 minute' where id='${r.json.reward.id}'`);
    const red = await api('POST', `/admin/minigames/rewards/${r.json.reward.id}/redeem`, T.admin);
    expect(red.status).toBe(400);
    expect(red.json.code).toBe('REWARD_EXPIRED');
  });
});

describe('mini-games: dice battle (server rolls)', () => {
  test('full battle: attack sequence returned, reward matches wins', async () => {
    const start = await api('POST', '/minigames/dice/sessions', T.vera);
    expect(start.status).toBe(200);
    const b = start.json.battle;
    expect(b.player.name).toBeTruthy();
    expect(b.opponent.name).toBeTruthy();
    expect(b.wins).toBe(0);

    let last: any = null;
    for (let i = 0; i < 300; i++) {
      // сразу забираем награду после первой победы
      const action = last?.battle.wins >= 1 ? 'stop' : 'roll';
      const r = await api('POST', `/minigames/sessions/${start.json.sessionId}/dice/${action}`, T.vera);
      expect(r.status).toBe(200);
      last = r.json;
      if (action === 'roll') {
        const pa = last.exchange.playerAttack;
        expect(pa.hitRolls.length).toBe(b.player.attacks);
        expect(pa.woundRolls.length).toBe(pa.hits);
        expect(pa.unsaved).toBeLessThanOrEqual(pa.wounds);
      }
      if (last.battle.finished) break;
    }
    expect(last.battle.finished).toBe(true);
    expect(last.result).toBeTruthy();
    if (last.battle.wins >= 1) {
      expect(last.result.rewardOutcome).toBe('new');
      expect(last.result.reward.label).toMatch(/^Скидка [23]%$/);
    } else {
      expect(last.battle.lost).toBe(true);
      expect(last.result.rewardOutcome).toBe('none');
    }
    // после конца боя бросать нельзя
    const after = await api('POST', `/minigames/sessions/${start.json.sessionId}/dice/roll`, T.vera);
    expect(after.status).toBe(409);
  });
  test('defeat forfeits the attempt’s reward even after wins', async () => {
    const start = await api('POST', '/minigames/dice/sessions', T.cheat);
    const id = start.json.sessionId;
    // как будто уже одержано 2 победы
    sql(`update minigame_sessions set state = jsonb_set(state::jsonb, '{wins}', '2')::text where id='${id}'`);
    let last: any = null;
    for (let i = 0; i < 500 && !last?.battle.finished; i++) {
      last = (await api('POST', `/minigames/sessions/${id}/dice/roll`, T.cheat)).json;
    }
    expect(last.battle.lost).toBe(true);
    expect(last.battle.wins).toBeGreaterThanOrEqual(2);
    expect(last.result.rewardOutcome).toBe('none');
    expect(last.result.reward).toBeNull();
  });
  test('stop before any win → no reward', async () => {
    const start = await api('POST', '/minigames/dice/sessions', T.petr);
    const r = await api('POST', `/minigames/sessions/${start.json.sessionId}/dice/stop`, T.petr);
    expect(r.status).toBe(200);
    expect(r.json.result.rewardOutcome).toBe('none');
  });
});

describe('mini-games: admin settings', () => {
  test('invalid settings rejected', async () => {
    const r = await api('PUT', '/admin/minigames/settings', T.admin, {
      games: { runner: { tiers: [{ minScore: 10, rewardType: 'percent_discount', value: 90 }] } },
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('INVALID_SETTINGS');
    expect((await api('PUT', '/admin/minigames/settings', T.mila, {})).status).toBe(403);
  });
  test('admin changes tiers → users see and get the new reward', async () => {
    const s = (await api('GET', '/admin/minigames/settings', T.admin)).json;
    s.games.egg.tiers = [{ minScore: 1, rewardType: 'bonus_points', value: 50 }];
    const put = await api('PUT', '/admin/minigames/settings', T.admin, s);
    expect(put.status).toBe(200);
    const list = await api('GET', '/minigames', T.vera);
    expect(list.json.find((g: any) => g.key === 'egg').tiers[0].label).toBe('50 бонусных баллов');
    const r = await play(T.vera, 'egg', 3, 30);
    expect(r.json.reward.label).toBe('50 бонусных баллов');
  });
  test('turning a game off hides it and blocks new attempts', async () => {
    const s = (await api('GET', '/admin/minigames/settings', T.admin)).json;
    s.games.egg.enabled = false;
    await api('PUT', '/admin/minigames/settings', T.admin, s);
    const list = await api('GET', '/minigames', T.vera);
    expect(list.json.map((g: any) => g.key)).toEqual(['runner', 'dice', 'cards']);
    const r = await api('POST', '/minigames/egg/sessions', T.vera);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('GAME_DISABLED');
  });
  test('daily attempt limit', async () => {
    const s = (await api('GET', '/admin/minigames/settings', T.admin)).json;
    s.maxSessionsPerDay = 2;
    s.games.egg.enabled = true;
    await api('PUT', '/admin/minigames/settings', T.admin, s);
    const tok = T.petr; // уже 1 попытка яйца сегодня
    expect((await api('POST', '/minigames/egg/sessions', tok)).status).toBe(200);
    const r = await api('POST', '/minigames/egg/sessions', tok);
    expect(r.status).toBe(429);
    expect(r.json.code).toBe('DAILY_LIMIT');
  });
  test('stats for admin', async () => {
    const r = await api('GET', '/admin/minigames/stats', T.admin);
    expect(r.status).toBe(200);
    expect(r.json.games.length).toBe(4);
    expect(r.json.rejectedLast7Days).toBeGreaterThanOrEqual(4);
  });
});
