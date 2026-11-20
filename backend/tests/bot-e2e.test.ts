/**
 * Бот в личном чате (20.11.2026) — с PostgreSQL и сервером e2e: /my показывает запись с типом, игрой и столом,
 * отмена из чата идёт через ту же функцию, что в приложении; /games видит стол, ждущий соперника; /builder и /league отвечают.
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
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
}

// ближайшая суббота с завтрашнего дня — в пределах недели, которую показывает «Ищут соперника»
const day = (() => {
  const d = new Date(Date.now() + 1 * 86400_000);
  while (new Date(d.getTime() + 5 * 3600_000).getUTCDay() !== 6) d.setTime(d.getTime() + 86400_000);
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
})();
const local = (hh: string) => new Date(`${day}T${hh}:00+05:00`).toISOString();

const ID = 4601;
let token = '';
let serviceId = 0;
let tableId = 0;
let reservationId = '';

beforeAll(async () => {
  if (!E2E) return;
  const existing = sql(`select id from services where slug = 'wh_game' limit 1`);
  if (existing) serviceId = Number(existing);
  else {
    const disc = sql(`select id from disciplines where slug = 'wh' limit 1`) || sql(`insert into disciplines (slug, title) values ('wh', 'E2E WH') returning id`);
    serviceId = Number(sql(`insert into services (discipline_id, slug, title, duration, seats_per_table) values (${disc}, 'wh_game', 'E2E игра', 240, 2) returning id`));
  }
  tableId = Number(sql(`insert into tables (name, category) values ('E2E стол бота', 'small') returning id`));
  token = (await api('POST', '/auth/telegram', undefined, { initData: initData({ id: ID, first_name: 'Бот', username: 'bot_e2e' }) })).json.token;
  const r = await api('POST', '/reservations', token, {
    serviceId,
    tableId,
    startsAt: local('14:00'),
    partySize: 1,
    seatClubArmyOptions: [false],
    details: { game: 'kt', army: 'Kommandos', points: null, experienceLevel: 'player' },
  });
  if (r.status !== 200) console.error(`::error::book → ${r.status}: ${JSON.stringify(r.json).slice(0, 400)}`);
  reservationId = r.json.id;
});

describe('бот', () => {
  test('/my: тип · игра, стол с типом и состоянием, кнопка отмены', async () => {
    const { dataReply } = await import('../src/modules/bot');
    const r = await dataReply('my', ID);
    expect(r.text).toContain('Игра · Kill Team');
    expect(r.text).toContain('E2E стол бота · тактические игры — стол ждёт соперника (1/2)');
    expect(r.buttons!.flat().some((b) => b.data === `cancel:${reservationId}`)).toBe(true);
  });

  test('/games видит стол, ждущий соперника; /builder и /league отвечают', async () => {
    const { dataReply } = await import('../src/modules/bot');
    const games = await dataReply('games', ID);
    expect(games.text).toContain('E2E стол бота');
    expect((await dataReply('builder', ID)).text).toContain('WarpBuilder');
    expect((await dataReply('league', ID)).text).toContain('Лига');
    expect((await dataReply('my', 999_999)).text).toContain('ещё не заходили');
  });

  test('отмена из чата: запись отменена; повторно — «уже отменена»', async () => {
    const { cancelFromChat } = await import('../src/modules/bot');
    expect(await cancelFromChat(ID, reservationId)).toContain('Запись отменена: Игра · Kill Team');
    expect(sql(`select status from reservations where id = '${reservationId}'`)).toBe('cancelled');
    expect(await cancelFromChat(ID, reservationId)).toContain('уже отменена');
  });
});
