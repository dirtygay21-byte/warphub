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
function sql(query: string): string {
  const result = Bun.spawnSync(['psql', process.env.POSTGRES_URI!, '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
const T: Record<string, string> = {};
let userId = '';
let bulkUserId = '';
let serviceId = 0;
const day = (() => {
  const date = new Date(Date.now() + 2 * 86_400_000);
  while (new Date(date.getTime() + 5 * 3_600_000).getUTCDay() !== 0) date.setTime(date.getTime() + 86_400_000);
  return new Date(date.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
})();
const local = (hh: string) => new Date(`${day}T${hh}:00+05:00`).toISOString();
const codes: string[] = [];
const reservations: string[] = [];

beforeAll(async () => {
  if (!E2E) return;
  for (const [name, id] of Object.entries({ admin: 777, promoUser: 8890, bulkUser: 8892 })) {
    const response = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name, username: name }) });
    expect(response.status).toBe(200);
    T[name] = response.json.token;
  }
  userId = sql(`select id from users where telegram_id = 8890`);
  bulkUserId = sql(`select id from users where telegram_id = 8892`);
  const discipline = sql(`select id from disciplines where slug = 'wh' order by id limit 1`) || sql(`insert into disciplines (slug, title) values ('wh', 'E2E promos') returning id`);
  serviceId = Number(sql(`insert into services (discipline_id, slug, title, duration, visitors_capacity, pool_capacity) values (${discipline}, 'wh_painting', 'E2E покраска промокодов', 120, 10, 10) returning id`));
});

describe('point promos: выдача и применение', () => {
  test('каждые 25 000 накопленных очков создают одноразовый код 25%', async () => {
    expect((await api('POST', `/admin/minigames/points/${userId}/adjust`, T.admin, { delta: 24999, note: 'До порога' })).status).toBe(200);
    expect((await api('GET', '/admin/point-promos', T.admin)).json).toHaveLength(0);
    expect((await api('POST', `/admin/minigames/points/${userId}/adjust`, T.admin, { delta: 1, note: 'Порог 25K' })).status).toBe(200);
    expect((await api('POST', `/admin/minigames/points/${userId}/adjust`, T.admin, { delta: 25000, note: 'Порог 50K' })).status).toBe(200);
    const promos = await api('GET', '/admin/point-promos', T.admin);
    expect(promos.status).toBe(200);
    expect(promos.json).toHaveLength(2);
    expect(promos.json.map((item: any) => item.milestone ?? item.score).sort((a: number, b: number) => a - b)).toEqual([25000, 50000]);
    for (const promo of promos.json) {
      expect(promo.rewardValue).toBe(25);
      expect(promo.code).toMatch(/^WH-[A-HJ-NP-Z2-9]{6}$/);
      codes.push(promo.code);
    }
    const mine = await api('GET', '/minigames/rewards/my', T.promoUser);
    expect(mine.json.map((item: any) => item.code).sort()).toEqual([...codes].sort());
  });

  test('код применяется к счёту, повторное использование запрещено, срок истекает', async () => {
    for (const [index, code] of codes.entries()) {
      const created = await api('POST', '/reservations', T.promoUser, {
        serviceId,
        startsAt: local(`${12 + index}:00`),
        partySize: 1,
        details: { faction: 'Orks', model: 'Boyz', paintSource: 'own', needsHelp: false },
      });
      expect(created.status).toBe(200);
      reservations.push(created.json.id);
      const applied = await api('POST', `/admin/reservations/${created.json.id}/reward`, T.admin, { code });
      expect(applied.status).toBe(200);
      expect(applied.json.totalAmount).toBe(375);
      expect(applied.json.discounts[0].percent).toBe(25);
    }
    const duplicate = await api('POST', `/admin/reservations/${reservations[0]}/reward`, T.admin, { code: codes[0] });
    expect(duplicate.status).toBe(409);
    expect(duplicate.json.code).toBe('REWARD_USED');

    const expired = await api('POST', '/reservations', T.promoUser, {
      serviceId,
      startsAt: local('14:00'),
      partySize: 1,
      details: { faction: 'Orks', model: 'Boyz', paintSource: 'own', needsHelp: false },
    });
    expect(expired.status).toBe(200);
    sql(`update point_promo_codes set expires_at = now() - interval '1 minute', used_at = null where code = '${codes[0]}'`);
    const rejected = await api('POST', `/admin/reservations/${expired.json.id}/reward`, T.admin, { code: codes[0] });
    expect(rejected.status).toBe(400);
    expect(rejected.json.code).toBe('REWARD_EXPIRED');
  });

  test('одно начисление 50 000 создаёт промокоды за оба пройденных порога', async () => {
    const adjusted = await api('POST', `/admin/minigames/points/${bulkUserId}/adjust`, T.admin, { delta: 50000, note: 'Два порога сразу' });
    expect(adjusted.status).toBe(200);
    const milestones = sql(`select string_agg(milestone::text, ',' order by milestone) from point_promo_codes where user_id = '${bulkUserId}'`);
    expect(milestones).toBe('25000,50000');
  });
});
