// Диагностика уведомлений (14.11.2026): журнал отправок и getMe — без настоящего Telegram (fetch подменён).
import { afterAll, describe, expect, test } from 'bun:test';
import { notificationDiagnostics, notifyUser, recentSends, sendTelegramMessageDetailed } from '../src/modules/notifications/service';

const realFetch = globalThis.fetch;
const prev = process.env.TELEGRAM_NOTIFICATIONS;
afterAll(() => {
  globalThis.fetch = realFetch;
  process.env.TELEGRAM_NOTIFICATIONS = prev;
});

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('журнал отправок и диагностика', () => {
  test('доставлено, 403 и обрыв связи — в журнале с причиной; текст сообщения не сохраняется', async () => {
    process.env.TELEGRAM_NOTIFICATIONS = 'on';
    const answers = [reply(200, { ok: true }), reply(403, { ok: false, description: 'Forbidden: bot can\'t initiate conversation with a user' })];
    globalThis.fetch = (async () => {
      const next = answers.shift();
      if (!next) throw new Error('connect ETIMEDOUT');
      return next;
    }) as unknown as typeof fetch;
    expect((await sendTelegramMessageDetailed(111, 'секрет 1', 'admin')).ok).toBe(true);
    const r403 = await sendTelegramMessageDetailed(222, 'секрет 2', 'user');
    expect(r403).toMatchObject({ ok: false, reason: 'telegram', status: 403 });
    expect((await sendTelegramMessageDetailed(333, 'секрет 3', 'user')).ok).toBe(false);
    const [last, mid, first] = recentSends();
    expect(first).toMatchObject({ chatId: '111', kind: 'admin', ok: true });
    expect(mid).toMatchObject({ chatId: '222', ok: false, status: 403 });
    expect(last).toMatchObject({ chatId: '333', ok: false, reason: 'network' });
    expect(JSON.stringify(recentSends())).not.toContain('секрет');
  });

  test('выключено на сервере — в журнале reason disabled, запросов к Telegram нет', async () => {
    process.env.TELEGRAM_NOTIFICATIONS = 'off';
    let calls = 0;
    globalThis.fetch = (async () => (calls++, reply(200, { ok: true }))) as unknown as typeof fetch;
    notifyUser(444, 'x');
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(0);
    expect(recentSends()[0]).toMatchObject({ chatId: '444', reason: 'disabled' });
  });

  test('getMe: имя бота и время ответа; нет связи — понятная ошибка', async () => {
    process.env.TELEGRAM_NOTIFICATIONS = 'on';
    globalThis.fetch = (async () => reply(200, { ok: true, result: { username: 'WarpHubBot' } })) as unknown as typeof fetch;
    const ok = await notificationDiagnostics();
    expect(ok.enabled).toBe(true);
    expect(ok.bot).toMatchObject({ ok: true, username: 'WarpHubBot' });
    expect(ok.admins.length).toBeGreaterThan(0);
    globalThis.fetch = (async () => {
      throw new Error('getaddrinfo ENOTFOUND api.telegram.org');
    }) as unknown as typeof fetch;
    const bad = await notificationDiagnostics();
    expect(bad.bot.ok).toBe(false);
    expect(bad.bot.error).toContain('нет связи с https://api.telegram.org');
  });
});

describe('маршрут к Telegram (14.11.2026)', () => {
  test('по умолчанию — api.telegram.org напрямую; TELEGRAM_API_BASE и TELEGRAM_PROXY меняют маршрут; в описании нет пароля', async () => {
    const { telegramRoute, describeRoute } = await import('../src/modules/notifications/service');
    delete process.env.TELEGRAM_API_BASE;
    delete process.env.TELEGRAM_PROXY;
    expect(telegramRoute()).toEqual({ base: 'https://api.telegram.org', proxy: undefined });
    process.env.TELEGRAM_API_BASE = 'https://tg.example.com/';
    process.env.TELEGRAM_PROXY = 'http://user:secret@10.0.0.1:3128';
    expect(telegramRoute()).toEqual({ base: 'https://tg.example.com', proxy: 'http://user:secret@10.0.0.1:3128' });
    expect(describeRoute()).toEqual({ base: 'https://tg.example.com', proxy: 'http://10.0.0.1:3128' });
    process.env.TELEGRAM_NOTIFICATIONS = 'on';
    let seen: { url: string; proxy?: string } | null = null;
    globalThis.fetch = (async (url: string, init: { proxy?: string }) => ((seen = { url, proxy: init.proxy }), reply(200, { ok: true }))) as unknown as typeof fetch;
    await sendTelegramMessageDetailed(555, 'x');
    expect(seen!.url.startsWith('https://tg.example.com/bot')).toBe(true);
    expect(seen!.url.endsWith('/sendMessage')).toBe(true);
    expect(seen!.proxy).toBe('http://user:secret@10.0.0.1:3128');
    expect(JSON.stringify(await notificationDiagnostics())).not.toContain('secret');
    delete process.env.TELEGRAM_API_BASE;
    delete process.env.TELEGRAM_PROXY;
  });
});
