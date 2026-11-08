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
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}

function sql(query: string): string {
  const result = Bun.spawnSync(['psql', process.env.POSTGRES_URI!, '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

const day = (() => {
  const date = new Date(Date.now() + 2 * 86_400_000);
  while (new Date(date.getTime() + 5 * 3_600_000).getUTCDay() !== 0) date.setTime(date.getTime() + 86_400_000);
  return new Date(date.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
})();
const local = (hh: string) => new Date(`${day}T${hh}:00+05:00`).toISOString();
const paintDetails = { faction: 'Orks', model: 'Boyz', paintSource: 'own', needsHelp: false };
const trainingDetails = { game: 'kt', army: 'Pathfinders', experienceLevel: 'player' };

const T: Record<string, string> = {};
const IDS = { admin: 777, player: 8801, other: 8802, raceTraining: 8803 };
let trainingServiceId = 0;
let paintingServiceId = 0;
let tableId = 0;
const reservation: Record<string, string> = {};

function insertReward(code: string, telegramId: number, type: 'fixed_discount' | 'percent_discount' | 'badge', value: number, expires = "now() + interval '7 days'") {
  return sql(`insert into minigame_rewards (user_id, game, week_key, tier_rank, score, reward_type, reward_value, label, code, expires_at)
    select id, 'runner', 'pricing-e2e-${code}', 1, 100, '${type}', ${value}, 'Награда ${code}', '${code}', ${expires} from users where telegram_id = ${telegramId} returning id`);
}

async function createPainting(hh: string, partySize: number, key: string) {
  const response = await api('POST', '/reservations', T.player, {
    serviceId: paintingServiceId,
    startsAt: local(hh),
    partySize,
    details: paintDetails,
  });
  expect(response.status).toBe(200);
  reservation[key] = response.json.id;
}

async function createTraining(hh: string, key: string) {
  const response = await api('POST', '/reservations', T.player, {
    serviceId: trainingServiceId,
    tableId,
    startsAt: local(hh),
    partySize: 1,
    seatClubArmyOptions: [false],
    details: trainingDetails,
  });
  expect(response.status).toBe(200);
  reservation[key] = response.json.id;
}

beforeAll(async () => {
  if (!E2E) return;
  for (const [name, id] of Object.entries(IDS)) {
    const response = await api('POST', '/auth/telegram', undefined, {
      initData: initData({ id, first_name: name, username: `pricing_${name}` }),
    });
    expect(response.status).toBe(200);
    T[name] = response.json.token;
  }
  const discipline = sql(`select id from disciplines where slug = 'wh' order by id limit 1`) || sql(`insert into disciplines (slug, title) values ('wh', 'E2E pricing') returning id`);
  trainingServiceId = Number(sql(`insert into services (discipline_id, slug, title, duration, seats_per_table, has_trainer)
    values (${discipline}, 'wh_group_training', 'E2E тренировка с ценой', 60, 2, true) returning id`));
  paintingServiceId = Number(sql(`insert into services (discipline_id, slug, title, duration, visitors_capacity, pool_capacity)
    values (${discipline}, 'wh_painting', 'E2E покраска с ценой', 120, 10, 10) returning id`));
  tableId = Number(sql(`insert into tables (name, category) values ('E2E стол цен', 'small') returning id`));

  expect((await api('PUT', `/admin/pricing/services/${trainingServiceId}`, T.admin, {
    billingMode: 'per_table', unitPrice: 1000, thirdGameDiscountPercent: 50,
  })).status).toBe(200);
  expect((await api('PUT', `/admin/pricing/services/${paintingServiceId}`, T.admin, {
    billingMode: 'per_guest', unitPrice: 100,
  })).status).toBe(200);
});

describe('pricing: тарифы и создание записей', () => {
  test('только админ управляет тарифами; список содержит услуги', async () => {
    expect((await api('GET', '/admin/pricing/services', T.player)).status).toBe(403);
    const response = await api('GET', '/admin/pricing/services', T.admin);
    expect(response.status).toBe(200);
    expect(response.json.some((item: any) => item.id === trainingServiceId && item.thirdGameDiscountPercent === 50)).toBe(true);
    const services = await api('GET', '/services');
    expect(services.status).toBe(200);
    expect(services.json.some((item: any) => item.id === trainingServiceId)).toBe(true);
  });

  test('pool: цена за гостя сохраняется в записи', async () => {
    await createPainting('16:00', 3, 'guest');
    const response = await api('GET', `/admin/reservations/${reservation.guest}/pricing`, T.admin);
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ billingMode: 'per_guest', unitPrice: 100, baseAmount: 300, totalAmount: 300, paidAmount: 0, remainingAmount: 300, status: 'unpaid' });
  });

  test('смена тарифа: за пару и за стол; старый счёт не пересчитывается', async () => {
    expect((await api('PUT', `/admin/pricing/services/${paintingServiceId}`, T.admin, {
      billingMode: 'per_pair', unitPrice: 100,
    })).status).toBe(200);
    await createPainting('18:00', 3, 'pair');
    const pair = await api('GET', `/admin/reservations/${reservation.pair}/pricing`, T.admin);
    expect(pair.json).toMatchObject({ billingMode: 'per_pair', baseAmount: 200, totalAmount: 200 });

    expect((await api('PUT', `/admin/pricing/services/${paintingServiceId}`, T.admin, {
      billingMode: 'per_table', unitPrice: 750,
    })).status).toBe(200);
    await createPainting('20:00', 4, 'table');
    const table = await api('GET', `/admin/reservations/${reservation.table}/pricing`, T.admin);
    expect(table.json).toMatchObject({ billingMode: 'per_table', baseAmount: 750, totalAmount: 750 });
    const old = await api('GET', `/admin/reservations/${reservation.guest}/pricing`, T.admin);
    expect(old.json.totalAmount).toBe(300);
  });

  test('каждая третья активная тренировка получает 50%', async () => {
    await createTraining('12:00', 'training1');
    await createTraining('13:00', 'training2');
    await createTraining('14:00', 'training3');
    const first = await api('GET', `/admin/reservations/${reservation.training1}/pricing`, T.admin);
    const second = await api('GET', `/admin/reservations/${reservation.training2}/pricing`, T.admin);
    const third = await api('GET', `/admin/reservations/${reservation.training3}/pricing`, T.admin);
    expect(first.json.totalAmount).toBe(1000);
    expect(second.json.totalAmount).toBe(1000);
    expect(third.json.baseAmount).toBe(1000);
    expect(third.json.totalAmount).toBe(500);
    expect(third.json.discounts).toHaveLength(1);
    expect(third.json.discounts[0]).toMatchObject({ kind: 'training', percent: 50 });
  });

  test('три одновременные тренировки на разных столах получают ровно одну скидку', async () => {
    const tableIds = [1, 2, 3].map((index) => Number(sql(`insert into tables (name, category) values ('E2E параллельная тренировка ${index}', 'wh') returning id`)));
    const responses = await Promise.all(tableIds.map((id) => api('POST', '/reservations', T.raceTraining, {
      serviceId: trainingServiceId,
      tableId: id,
      startsAt: local('12:00'),
      partySize: 1,
      seatClubArmyOptions: [false],
      details: { game: '40k', army: 'Orks', points: 1000, experienceLevel: 'player' },
    })));
    expect(responses.map((item) => item.status)).toEqual([200, 200, 200]);
    const pricing = await Promise.all(responses.map((item) => api('GET', `/admin/reservations/${item.json.id}/pricing`, T.admin)));
    expect(pricing.map((item) => item.json.totalAmount).sort((a, b) => a - b)).toEqual([500, 1000, 1000]);
    expect(pricing.flatMap((item) => item.json.discounts).filter((item) => item.kind === 'training')).toHaveLength(1);
  });
});

describe('pricing: скидки, награды и оплата', () => {
  test('членство и код применяются последовательно; код одноразовый', async () => {
    const membership = await api('POST', `/admin/reservations/${reservation.training3}/discounts`, T.admin, {
      kind: 'membership', percent: 10, note: 'Членство в клубе',
    });
    expect(membership.status).toBe(200);
    expect(membership.json.totalAmount).toBe(450);

    insertReward('WH-PRZA50', IDS.player, 'fixed_discount', 50);
    const reward = await api('POST', `/admin/reservations/${reservation.training3}/reward`, T.admin, { code: 'prza50' });
    expect(reward.status).toBe(200);
    expect(reward.json.totalAmount).toBe(400);
    expect(reward.json.discounts.some((item: any) => item.kind === 'reward' && item.amount === 50)).toBe(true);
    expect(sql(`select used_at is not null from minigame_rewards where code = 'WH-PRZA50'`)).toBe('t');
    expect((await api('POST', `/admin/reservations/${reservation.training3}/reward`, T.admin, { code: 'WH-PRZA50' })).status).toBe(409);
  });

  test('чужой, истёкший и неденежный код не применяется', async () => {
    insertReward('WH-OTHR50', IDS.other, 'fixed_discount', 50);
    const foreign = await api('POST', `/admin/reservations/${reservation.training3}/reward`, T.admin, { code: 'WH-OTHR50' });
    expect(foreign.status).toBe(404);
    expect(foreign.json.code).toBe('REWARD_NOT_FOUND');

    insertReward('WH-OLDX50', IDS.player, 'fixed_discount', 50, "now() - interval '1 minute'");
    const expired = await api('POST', `/admin/reservations/${reservation.training3}/reward`, T.admin, { code: 'WH-OLDX50' });
    expect(expired.status).toBe(400);
    expect(expired.json.code).toBe('REWARD_EXPIRED');

    insertReward('WH-BADGE5', IDS.player, 'badge', 1);
    const badge = await api('POST', `/admin/reservations/${reservation.training3}/reward`, T.admin, { code: 'WH-BADGE5' });
    expect(badge.status).toBe(400);
    expect(badge.json.code).toBe('REWARD_TYPE');
  });

  test('ручные оплаты дают остаток; переплата и скидка ниже оплаченного запрещены', async () => {
    const first = await api('POST', `/admin/reservations/${reservation.training3}/payments`, T.admin, {
      amount: 150, method: 'cash', note: 'Аванс',
    });
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ paidAmount: 150, remainingAmount: 250, status: 'partial' });
    const second = await api('POST', `/admin/reservations/${reservation.training3}/payments`, T.admin, {
      amount: 250, method: 'transfer',
    });
    expect(second.status).toBe(200);
    expect(second.json).toMatchObject({ paidAmount: 400, remainingAmount: 0, status: 'paid' });
    expect(second.json.payments).toHaveLength(2);

    const exceeded = await api('POST', `/admin/reservations/${reservation.training3}/payments`, T.admin, { amount: 1, method: 'cash' });
    expect(exceeded.status).toBe(409);
    expect(exceeded.json.code).toBe('PAYMENT_EXCEEDED');
    const discount = await api('POST', `/admin/reservations/${reservation.training3}/discounts`, T.admin, {
      kind: 'manual', percent: 10, note: 'Поздняя скидка',
    });
    expect(discount.status).toBe(409);
    expect(discount.json.code).toBe('DISCOUNT_BELOW_PAID');
  });

  test('две одновременные оплаты не превышают остаток', async () => {
    const responses = await Promise.all([
      api('POST', `/admin/reservations/${reservation.guest}/payments`, T.admin, { amount: 200, method: 'card' }),
      api('POST', `/admin/reservations/${reservation.guest}/payments`, T.admin, { amount: 200, method: 'cash' }),
    ]);
    expect(responses.map((item) => item.status).sort()).toEqual([200, 409]);
    const current = await api('GET', `/admin/reservations/${reservation.guest}/pricing`, T.admin);
    expect(current.json.paidAmount).toBe(200);
    expect(current.json.remainingAmount).toBe(100);
    expect(current.json.payments).toHaveLength(1);
  });

  test('один код нельзя одновременно применить к двум записям', async () => {
    await createPainting('22:00', 2, 'race1');
    await createPainting('22:00', 2, 'race2');
    expect(reservation.race1).not.toBe(reservation.race2);
    const rewardId = insertReward('WH-RACE10', IDS.player, 'percent_discount', 10);
    const responses = await Promise.all([
      api('POST', `/admin/reservations/${reservation.race1}/reward`, T.admin, { code: 'WH-RACE10' }),
      api('POST', `/admin/reservations/${reservation.race2}/reward`, T.admin, { code: 'WH-RACE10' }),
    ]);
    expect(responses.map((item) => item.status).sort()).toEqual([200, 409]);
    expect(Number(sql(`select count(*) from reservation_discounts where reward_id = '${rewardId}'`))).toBe(1);
    expect(Number(sql(`select count(*) from minigame_rewards where id = '${rewardId}' and used_at is not null`))).toBe(1);
  });

  test('ручная скидка удаляется с пересчётом; автоматическая и награда защищены', async () => {
    const added = await api('POST', `/admin/reservations/${reservation.table}/discounts`, T.admin, {
      kind: 'manual', amount: 50, note: 'Проверка удаления',
    });
    expect(added.status).toBe(200);
    expect(added.json.totalAmount).toBe(700);
    const manual = added.json.discounts.find((item: any) => item.kind === 'manual');
    const removed = await api('DELETE', `/admin/reservations/discounts/${manual.id}`, T.admin);
    expect(removed.status).toBe(200);
    expect(removed.json.totalAmount).toBe(750);

    const third = await api('GET', `/admin/reservations/${reservation.training3}/pricing`, T.admin);
    const training = third.json.discounts.find((item: any) => item.kind === 'training');
    const reward = third.json.discounts.find((item: any) => item.kind === 'reward');
    expect((await api('DELETE', `/admin/reservations/discounts/${training.id}`, T.admin)).status).toBe(409);
    expect((await api('DELETE', `/admin/reservations/discounts/${reward.id}`, T.admin)).status).toBe(409);
  });
});
