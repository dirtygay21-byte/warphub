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
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}
const T: Record<string, string> = {};
let sessionId = '';

beforeAll(async () => {
  if (!E2E) return;
  const response = await api('POST', '/auth/telegram', undefined, { initData: initData({ id: 8891, first_name: 'diceUser', username: 'diceUser' }) });
  expect(response.status).toBe(200);
  T.user = response.json.token;
});

describe('dice: инициатива и действия через API', () => {
  test('инициатива, защита, атака и ульта', async () => {
    const started = await api('POST', '/minigames/dice/sessions', T.user);
    expect(started.status).toBe(200);
    sessionId = started.json.sessionId;
    expect(started.json.battle.playerStarts).toBeNull();

    const initiative = await api('POST', `/minigames/sessions/${sessionId}/dice/initiative_even`, T.user);
    if (initiative.status !== 200) console.error('initiative error', initiative.status, initiative.json);
    expect(initiative.status).toBe(200);
    expect(initiative.json.battle.initiativeRoll).toBeGreaterThanOrEqual(1);
    expect(initiative.json.battle.initiativeRoll).toBeLessThanOrEqual(6);
    const roll = initiative.json.battle.initiativeRoll as number;
    expect(initiative.json.battle.playerStarts).toBe(roll % 2 === 0);
    expect(initiative.json.battle.turn).toBe('player');

    const defended = await api('POST', `/minigames/sessions/${sessionId}/dice/defend`, T.user);
    expect(defended.status).toBe(200);
    expect(defended.json.exchange.action).toBe('defend');
    expect(defended.json.exchange.enemyAttack?.blocked).toBe(true);
    expect(defended.json.battle.playerWounds).toBe(initiative.json.battle.playerWounds);

    const attacked = await api('POST', `/minigames/sessions/${sessionId}/dice/attack`, T.user);
    expect(attacked.status).toBe(200);
    expect(attacked.json.battle.turn).toBe('player');

    const ultimate = await api('POST', `/minigames/sessions/${sessionId}/dice/ult`, T.user);
    expect(ultimate.status).toBe(200);
    expect(ultimate.json.battle.usedUlt).toBe(true);
    expect(ultimate.json.exchange.playerAttack?.guaranteed).toBe(true);
    expect(ultimate.json.exchange.playerAttack?.damage).toBeGreaterThan(0);

    expect((await api('POST', `/minigames/sessions/${sessionId}/dice/ult`, T.user)).status).toBeGreaterThanOrEqual(400);
    expect((await api('POST', `/minigames/sessions/${sessionId}/dice/stop`, T.user)).status).toBe(200);
  });
});
