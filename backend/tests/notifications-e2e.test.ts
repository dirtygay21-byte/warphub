/**
 * Система уведомлений (14.11.2026) — сквозная проверка с PostgreSQL и сервером e2e:
 * настройки игрока, поиск соперника после записи, тексты и выключатели, рассылки (только владелец),
 * очередь и журнал, проход автоматических проверок без ошибок.
 */
import { beforeAll, describe as baseDescribe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';

const E2E = process.env.WARPHUB_E2E === '1' && !!process.env.POSTGRES_URI;
const describe = E2E ? baseDescribe : baseDescribe.skip;
const API = process.env.WARPHUB_E2E_API ?? 'http://127.0.0.1:4100';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '123456:TEST_TOKEN_FOR_LOCAL_RUN';
process.env.NOTIFICATION_LOG = 'on';

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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ближайшее воскресенье не раньше чем через 3 дня (будни могут быть закрыты днём)
const day = (() => {
  const d = new Date(Date.now() + 3 * 86400_000);
  while (new Date(d.getTime() + 5 * 3600_000).getUTCDay() !== 0) d.setTime(d.getTime() + 86400_000);
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
})();
const local = (hh: string) => new Date(`${day}T${hh}:00+05:00`).toISOString();

const T: Record<string, string> = {};
const ID = { seeker: 4501, sub: 4502, busy: 4503, owner: 777 };
let serviceId = 0;
let tableId = 0;

beforeAll(async () => {
  if (!E2E) return;
  const existing = sql(`select id from services where slug = 'wh_game' limit 1`);
  if (existing) serviceId = Number(existing);
  else {
    const disc = sql(`select id from disciplines where slug = 'wh' limit 1`) || sql(`insert into disciplines (slug, title) values ('wh', 'E2E WH') returning id`);
    serviceId = Number(sql(`insert into services (discipline_id, slug, title, duration, seats_per_table) values (${disc}, 'wh_game', 'E2E игра', 240, 2) returning id`));
  }
  tableId = Number(sql(`insert into tables (name, category) values ('E2E стол уведомлений', 'wh') returning id`));
  for (const [name, id] of Object.entries(ID)) {
    const r = await api('POST', '/auth/telegram', undefined, { initData: initData({ id, first_name: name }) });
    T[name] = r.json.token;
  }
});

describe('уведомления', () => {
  test('настройки игрока: по умолчанию поиск соперника выключен; неизвестные игры отбрасываются', async () => {
    const r = await api('GET', '/me/notifications/prefs', T.sub);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ opponentGames: [], news: true, eveReminder: false });
    const saved = await api('PUT', '/me/notifications/prefs', T.sub, { opponentGames: ['40k', 'zzz'] });
    expect(saved.json.opponentGames).toEqual(['40k']);
    await api('PUT', '/me/notifications/prefs', T.busy, { opponentGames: ['40k'] });
  });

  test('запись за стол со свободным местом → «ищут соперника» подписчику 40K в очереди; себе и занятому — нет', async () => {
    // «занятый» уже записан на это время за другой стол
    const other = Number(sql(`insert into tables (name, category) values ('E2E стол 2', 'wh') returning id`));
    const busy = await api('POST', '/reservations', T.busy, { serviceId, tableId: other, startsAt: local('16:00'), partySize: 1, seatClubArmyOptions: [false], details: { game: 'aos', army: 'Seraphon', points: 1000, experienceLevel: 'player' } });
    if (busy.status !== 200) console.error(`::error::busy → ${busy.status}: ${JSON.stringify(busy.json).slice(0, 400)}`);
    expect(busy.status).toBe(200);
    const r = await api('POST', '/reservations', T.seeker, {
      serviceId,
      tableId,
      startsAt: local('16:00'),
      partySize: 1,
      seatClubArmyOptions: [false],
      details: { game: '40k', army: 'Necrons', points: 2000, experienceLevel: 'player' },
    });
    if (r.status !== 200) console.error(`::error::book → ${r.status}: ${JSON.stringify(r.json).slice(0, 400)}`);
    expect(r.status).toBe(200);
    await wait(1500);
    const rows = sql(`select telegram_id from notification_outbox where kind = 'match_new' order by telegram_id`).split('\n').filter(Boolean);
    expect(rows).toContain(String(ID.sub));
    expect(rows).not.toContain(String(ID.seeker));
    expect(rows).not.toContain(String(ID.busy));
    const text = sql(`select text from notification_outbox where kind = 'match_new' and telegram_id = ${ID.sub} limit 1`);
    expect(text).toContain('Necrons');
  });

  test('автоматические: каталог; выключить и свой текст — только владелец', async () => {
    const cat = await api('GET', '/admin/notifications/catalog', T.owner);
    expect(cat.status).toBe(200);
    expect(cat.json.canEdit).toBe(true);
    expect(cat.json.kinds.find((k: { id: string }) => k.id === 'match_new')).toBeTruthy();
    expect((await api('PUT', '/admin/notifications/templates/booking_confirmed', T.seeker, { enabled: false })).status).toBe(403);
    const off = await api('PUT', '/admin/notifications/templates/booking_confirmed', T.owner, { enabled: false, text: '👍 {услуга}' });
    expect(off.json).toMatchObject({ enabled: false, text: '👍 {услуга}' });
    const back = await api('PUT', '/admin/notifications/templates/booking_confirmed', T.owner, { enabled: true, text: null });
    expect(back.json).toMatchObject({ enabled: true, text: null });
    const cfg = await api('PUT', '/admin/notifications/config', T.owner, { quietFrom: 23, quietTo: 10, dailyLimit: 2 });
    expect(cfg.status).toBe(200);
  });

  test('рассылка: только владелец; «сейчас» для «только мне» — в очереди; по пятницам — запланирована', async () => {
    const body = { title: 'Тест', text: '<b>Привет</b>', audience: { kind: 'me' }, schedule: { type: 'now' }, buttons: [{ text: 'Открыть', path: '/' }] };
    expect((await api('POST', '/admin/broadcasts', T.seeker, body)).status).toBe(403);
    const created = await api('POST', '/admin/broadcasts', T.owner, body);
    expect(created.status).toBe(200);
    const started = await api('POST', `/admin/broadcasts/${created.json.id}/start`, T.owner);
    expect(started.json).toMatchObject({ status: 'done', queued: 1 });
    expect(sql(`select count(*) from notification_outbox where kind = 'broadcast' and telegram_id = ${ID.owner}`)).toBe('1');

    const weekly = await api('POST', '/admin/broadcasts', T.owner, { ...body, title: 'Пятница', audience: { kind: 'all' }, schedule: { type: 'weekly', days: [5], time: '12:00' } });
    const sched = await api('POST', `/admin/broadcasts/${weekly.json.id}/start`, T.owner);
    expect(sched.json.status).toBe('scheduled');
    expect(new Date(sched.json.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    const list = await api('GET', '/admin/broadcasts', T.owner);
    expect(list.json.length).toBeGreaterThanOrEqual(2);
    expect((await api('POST', '/admin/broadcasts', T.owner, { ...body, text: '' })).status).toBe(400);
  });

  test('очередь: отправка при выключенных уведомлениях — строки уходят из очереди, в журнале «disabled»', async () => {
    process.env.TELEGRAM_NOTIFICATIONS = 'off';
    const { installSendObserver, processOutbox } = await import('../src/modules/notifications/hub');
    installSendObserver();
    sql(`update notification_outbox set not_before = now() - interval '1 minute'`);
    await processOutbox(new Date(), 50);
    await wait(500);
    expect(Number(sql(`select count(*) from notification_log where reason = 'disabled'`))).toBeGreaterThan(0);
    const log = await api('GET', '/admin/notifications/log?limit=20', T.owner);
    expect(log.status).toBe(200);
    expect(log.json.rows.length).toBeGreaterThan(0);
  });

  test('автоматические проверки проходят без ошибок (первый запуск помечает старое, не рассылая)', async () => {
    const { runScheduledJobs } = await import('../src/modules/notifications/jobs');
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => void warns.push(a.join(' '));
    try {
      await runScheduledJobs(new Date());
    } finally {
      console.warn = orig;
    }
    expect(warns.filter((w) => w.includes('[notify-jobs]'))).toEqual([]);
    expect(sql(`select count(*) from notification_marks where key = 'init:content'`)).toBe('1');
  });
});
