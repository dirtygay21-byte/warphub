/**
 * Напоминания о визите (14.11.2026): правило «когда напоминать», текст и проход по базе (e2e, если есть PostgreSQL).
 */
import { afterAll, beforeAll, describe as baseDescribe, describe, expect, test } from 'bun:test';
import { reminderText } from '../src/modules/booking/notify-text';
import { dueForReminder, REMIND_BEFORE_MS } from '../src/modules/booking/rules';

const H = 60 * 60_000;
const now = new Date(Date.UTC(2026, 10, 14, 10));
const r = (o: Partial<{ status: string; startsAt: Date | null; createdAt: Date; remindAt: Date | null }> = {}) => ({
  status: 'confirmed',
  startsAt: new Date(now.getTime() + 2 * H),
  createdAt: new Date(now.getTime() - 24 * H),
  remindAt: null,
  ...o,
});

describe('dueForReminder', () => {
  test('за 3 часа и ближе — да; раньше, после начала, уже отправлено, отменена — нет', () => {
    expect(dueForReminder(r(), now)).toBe(true);
    expect(dueForReminder(r({ status: 'pending' }), now)).toBe(true);
    expect(dueForReminder(r({ startsAt: new Date(now.getTime() + REMIND_BEFORE_MS + 60_000) }), now)).toBe(false);
    expect(dueForReminder(r({ startsAt: new Date(now.getTime() - 60_000) }), now)).toBe(false);
    expect(dueForReminder(r({ remindAt: now }), now)).toBe(false);
    expect(dueForReminder(r({ status: 'cancelled' }), now)).toBe(false);
    expect(dueForReminder(r({ startsAt: null }), now)).toBe(false);
  });
  test('запись создана только что (меньше 30 минут) — не напоминаем, подтверждение уже пришло', () => {
    expect(dueForReminder(r({ createdAt: new Date(now.getTime() - 10 * 60_000) }), now)).toBe(false);
  });
});

describe('reminderText', () => {
  test('что, когда, стол, соперник с ником; ожидает подтверждения — отдельной строкой; HTML экранирован', () => {
    const t = reminderText({
      serviceTitle: 'Игра <Warhammer>',
      startsAt: new Date(Date.UTC(2026, 10, 14, 13)),
      endsAt: new Date(Date.UTC(2026, 10, 14, 16)),
      tableName: 'Стол 1',
      status: 'pending',
      opponents: [{ firstName: 'Иван', username: 'ivan' }],
    });
    expect(t.split('\n')[0]).toBe('⏰ <b>Напоминание: Игра &lt;Warhammer&gt;</b>');
    expect(t).toContain('Стол: Стол 1');
    expect(t).toContain('Соперник: Иван (@ivan)');
    expect(t).toContain('ждёт подтверждения');
  });
});

// проход по базе: отметка remind_at, одно напоминание на запись
const E2E = process.env.WARPHUB_E2E === '1' && !!process.env.POSTGRES_URI;
const e2e = E2E ? baseDescribe : baseDescribe.skip;

function sql(query: string): string {
  const res = Bun.spawnSync(['psql', process.env.POSTGRES_URI!, '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  if (res.exitCode !== 0) throw new Error(res.stderr.toString());
  return res.stdout.toString().trim();
}

e2e('sendDueReminders (PostgreSQL)', () => {
  const ids: string[] = [];
  let userId = '';
  beforeAll(() => {
    process.env.TELEGRAM_NOTIFICATIONS = 'off';
    userId = sql(`insert into users (telegram_id, first_name) values (4409001, 'Напоминание') on conflict (telegram_id) do update set first_name = excluded.first_name returning id`);
    const service = sql(`select id from services order by id limit 1`);
    const insert = (startsInH: number, createdAgoH: number) =>
      sql(
        `insert into reservations (user_id, service_id, starts_at, ends_at, status, created_at) values ('${userId}', ${service}, now() + interval '${startsInH} hours', now() + interval '${startsInH + 2} hours', 'confirmed', now() - interval '${createdAgoH} hours') returning id`,
      );
    ids.push(insert(2, 24), insert(5, 24), insert(2, 0));
  });
  afterAll(() => {
    if (ids.length) sql(`delete from reservations where id in (${ids.map((id) => `'${id}'`).join(',')})`);
  });

  test('напоминает только записи в окне 3 часов, созданные заранее; второй проход ничего не шлёт', async () => {
    const { sendDueReminders } = await import('../src/modules/booking/reminders');
    const { recentSends } = await import('../src/modules/notifications/service');
    await sendDueReminders();
    const marked = sql(`select id from reservations where remind_at is not null and id in (${ids.map((id) => `'${id}'`).join(',')})`).split('\n').filter(Boolean);
    expect(marked).toEqual([ids[0]!]);
    expect(recentSends().some((e) => e.chatId === '4409001' && e.kind === 'user')).toBe(true);
    const before = recentSends().length;
    await sendDueReminders();
    expect(recentSends().length).toBe(before);
  });
});
