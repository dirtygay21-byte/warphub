#!/usr/bin/env node
/**
 * Демо Roster Builder и кодов доступа — без Telegram, базы данных и настоящего бэкенда.
 *
 *   1) cd client && npm install && npm run build:demo     (один раз; собирает client/dist-demo)
 *   2) node tools/roster-demo/server.mjs                  (из корня репозитория)
 *   3) открыть http://localhost:5050
 *
 * Сервер имитирует API WarpHub в памяти: вход через Telegram, профиль, админку и всё, что связано
 * с кодами доступа (создание, ввод, лимит попыток, отзыв). «Сообщения бота» печатаются в эту консоль.
 * Пользователя переключает вкладка «ДЕМО» у левого края экрана. Остальные разделы приложения в демо пустые.
 * После перезапуска сервера всё обнуляется.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = process.env.DEMO_DIST || path.join(ROOT, 'client/dist-demo');
const DATA = process.env.ROSTER_DATA_DIR || path.join(ROOT, 'backend/roster-data');
const PORT = Number(process.env.PORT || 5050);

// те же правила, что в backend/src/modules/roster/codes.ts
const TTL_MS = 24 * 3600e3, WINDOW_MS = 3600e3, MAX_USER = 5, MAX_GLOBAL = 30;

const USERS = [
  { id: 'u-admin', telegramId: 1001, firstName: 'Егор', lastName: 'Коренев', username: 'KorenevEgor', photoUrl: '', admin: true, role: 'админ' },
  { id: 'u-ivan', telegramId: 2002, firstName: 'Иван', lastName: 'Петров', username: 'ivan_demo', photoUrl: '', admin: false, role: 'игрок' },
  { id: 'u-anna', telegramId: 3003, firstName: 'Анна', lastName: 'Смирнова', username: 'anna_demo', photoUrl: '', admin: false, role: 'игрок' },
];
const byTg = (id) => USERS.find((u) => u.telegramId === Number(id));
const pub = ({ admin, role, ...u }) => u;
const nameOf = (u) => `${u.firstName} ${u.lastName}`.trim() + (u.username ? ` (@${u.username})` : '');

const codes = []; // { id, code, createdBy, createdAt, expiresAt, usedAt, usedBy, revokedAt }
const access = new Map(); // userId -> { grantedAt, grantedBy, codeId }
const attempts = []; // { userId, success, at }
let nextId = 1;

const now = () => Date.now();
const iso = (t) => (t ? new Date(t).toISOString() : null);
const isActive = (c) => !c.usedAt && !c.revokedAt && c.expiresAt > now();
const hasAccess = (u) => u.admin || access.has(u.id);
const fmt = (t) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function bot(to, text) {
  const line = '─'.repeat(52);
  console.log(`\n${line}\n📨 Бот @WarpHubBot → ${nameOf(to)}\n\n${text}\n${line}\n`);
}

function createCode(admin) {
  const taken = new Set(codes.filter(isActive).map((c) => c.code));
  let code;
  do code = String(randomInt(10000)).padStart(4, '0');
  while (taken.has(code));
  const c = { id: nextId++, code, createdBy: admin.id, createdAt: now(), expiresAt: now() + TTL_MS, usedAt: null, usedBy: null, revokedAt: null };
  codes.push(c);
  bot(admin, `🔑 Код доступа к Roster Builder\n\n    ${code}\n\nДействует до ${fmt(c.expiresAt)}, один раз.\nЧеловек вводит его в WarpHub: Профиль → «Есть код?».`);
  return { id: c.id, expiresAt: iso(c.expiresAt), delivered: true };
}

function redeem(user, input) {
  if (hasAccess(user)) return [200, { hasAccess: true }];
  const code = String(input ?? '').replace(/\D/g, '');
  if (code.length !== 4) return [400, { error: 'Код — это 4 цифры' }];
  const since = now() - WINDOW_MS;
  const fails = attempts.filter((a) => !a.success && a.at > since);
  const mine = fails.filter((a) => a.userId === user.id).sort((a, b) => a.at - b.at);
  if (mine.length >= MAX_USER) {
    const min = Math.ceil((mine[mine.length - MAX_USER].at + WINDOW_MS - now()) / 60000);
    return [429, { error: `Слишком много попыток. Попробуйте через ${min} мин.` }];
  }
  if (fails.length >= MAX_GLOBAL) return [429, { error: 'Слишком много попыток. Попробуйте через 10 мин.' }];
  const c = codes.find((x) => isActive(x) && x.code === code);
  if (!c) {
    attempts.push({ userId: user.id, success: false, at: now() });
    const left = MAX_USER - mine.length - 1;
    console.log(`✗ ${nameOf(user)} ввёл неверный код ${code} (осталось попыток: ${Math.max(left, 0)})`);
    return [400, { error: left > 0 ? `Неверный или устаревший код. Осталось попыток: ${left}` : 'Неверный код. Попытки закончились — попробуйте позже.' }];
  }
  c.usedAt = now();
  c.usedBy = user.id;
  attempts.push({ userId: user.id, success: true, at: now() });
  access.set(user.id, { grantedAt: now(), grantedBy: c.createdBy, codeId: c.id });
  for (const owner of USERS.filter((u) => u.admin)) bot(owner, `✅ ${nameOf(user)} открыл Roster Builder по коду.`);
  return [200, { hasAccess: true }];
}

function listCodes() {
  return [...codes].reverse().slice(0, 30).map((c) => {
    const u = USERS.find((x) => x.id === c.usedBy);
    return {
      id: c.id, createdAt: iso(c.createdAt), expiresAt: iso(c.expiresAt), usedAt: iso(c.usedAt), revokedAt: iso(c.revokedAt),
      usedByName: u?.firstName ?? null, usedByUsername: u?.username ?? null,
      status: c.usedAt ? 'used' : c.revokedAt ? 'revoked' : c.expiresAt <= now() ? 'expired' : 'active',
    };
  });
}

function listAccess() {
  return [...access.entries()].reverse().map(([userId, a]) => {
    const u = USERS.find((x) => x.id === userId);
    return { userId, grantedAt: iso(a.grantedAt), firstName: u.firstName, lastName: u.lastName, username: u.username, telegramId: u.telegramId };
  });
}

// ---------- HTTP ----------

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let s = '';
    req.on('data', (d) => (s += d));
    req.on('end', () => {
      try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); }
    });
  });

function userFrom(req) {
  const m = /^Bearer demo:(\d+)$/.exec(req.headers.authorization || '');
  return m ? byTg(m[1]) : undefined;
}

async function api(req, res, p) {
  const m = req.method;
  if (p === '/auth/telegram' && m === 'POST') {
    const { initData } = await readBody(req);
    const raw = new URLSearchParams(initData || '').get('user');
    const u = raw && byTg(JSON.parse(raw).id);
    if (!u) return send(res, 401, { error: 'Unauthorized' });
    return send(res, 200, { token: `demo:${u.telegramId}`, user: pub(u) });
  }
  const user = userFrom(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });

  if (p === '/me') return send(res, 200, pub(user));
  if (p === '/events/nearest') return send(res, 404, { error: 'Нет событий' });

  if (p === '/roster/access') return send(res, 200, { hasAccess: hasAccess(user), isOwner: user.admin });
  if (p === '/roster/redeem' && m === 'POST') {
    const [s, body] = redeem(user, (await readBody(req)).code);
    return send(res, s, body);
  }
  const data = /^\/roster\/data\/([A-Za-z]{1,6}|index|battlefield)$/.exec(p);
  if (data) {
    if (!hasAccess(user)) return send(res, 403, { error: 'Нет доступа к Roster Builder' });
    const f = data[1] === 'index' || data[1] === 'battlefield' ? path.join(DATA, `${data[1]}.json`) : path.join(DATA, 'f', `${data[1]}.json`);
    if (!fs.existsSync(f)) return send(res, 404, { error: 'Нет данных' });
    return send(res, 200, fs.readFileSync(f));
  }

  if (p.startsWith('/admin/')) {
    if (!user.admin) return send(res, 403, { error: 'Forbidden' });
    if (p === '/admin/roster/codes' && m === 'POST') return send(res, 200, createCode(user));
    if (p === '/admin/roster/codes') return send(res, 200, listCodes());
    let r = /^\/admin\/roster\/codes\/(\d+)$/.exec(p);
    if (r && m === 'DELETE') {
      const c = codes.find((x) => x.id === Number(r[1]) && !x.usedAt && !x.revokedAt);
      if (!c) return send(res, 404, { error: 'Код не найден или уже использован' });
      c.revokedAt = now();
      console.log(`⊘ Код №${c.id} (${c.code}) отозван`);
      return send(res, 200, { ok: true });
    }
    if (p === '/admin/roster/access') return send(res, 200, listAccess());
    r = /^\/admin\/roster\/access\/(.+)$/.exec(p);
    if (r && m === 'DELETE') {
      if (!access.delete(r[1])) return send(res, 404, { error: 'У пользователя нет доступа' });
      console.log(`⊘ Доступ закрыт: ${nameOf(USERS.find((u) => u.id === r[1]))}`);
      return send(res, 200, { ok: true });
    }
  }
  // остальные разделы WarpHub в демо пустые
  return send(res, 200, m === 'GET' ? [] : { ok: true });
}

// Вместо настоящего telegram-web-app.js — имитация Telegram с выбором пользователя
const fakeTelegram = `<script>
(() => {
  const USERS = ${JSON.stringify(USERS.map(({ telegramId, firstName, lastName, username, role }) => ({ telegramId, firstName, lastName, username, role })))};
  let i = 0;
  try { i = Math.max(0, USERS.findIndex(u => u.telegramId === Number(sessionStorage.getItem('demoUser')))); } catch {}
  const u = USERS[i];
  const noop = () => {};
  const bar = { visible: false, sync() { if (bar.back) bar.back.hidden = !bar.visible; } };
  const back = { handlers: [], show() { bar.visible = true; bar.sync(); }, hide() { bar.visible = false; bar.sync(); }, onClick(f) { this.handlers.push(f); }, offClick(f) { this.handlers = this.handlers.filter(h => h !== f); }, isVisible: false };
  const btn = { show: noop, hide: noop, onClick: noop, offClick: noop, setText: noop, setParams: noop, enable: noop, disable: noop, showProgress: noop, hideProgress: noop, isVisible: false };
  const tgUser = { id: u.telegramId, first_name: u.firstName, last_name: u.lastName, username: u.username, language_code: 'ru' };
  window.Telegram = { WebApp: {
    initData: 'user=' + encodeURIComponent(JSON.stringify(tgUser)) + '&auth_date=' + Math.floor(Date.now() / 1000) + '&hash=demo',
    initDataUnsafe: { user: tgUser }, version: '8.0', platform: 'web', colorScheme: 'dark', themeParams: {},
    isExpanded: true, viewportHeight: innerHeight, viewportStableHeight: innerHeight,
    ready: noop, expand: noop, close: noop, setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop,
    onEvent: noop, offEvent: noop, disableVerticalSwipes: noop, enableVerticalSwipes: noop, requestFullscreen: noop,
    enableClosingConfirmation: noop, disableClosingConfirmation: noop, isVersionAtLeast: () => true,
    openLink: (url) => open(url, '_blank'), openTelegramLink: (url) => open(url, '_blank'),
    showAlert: (m, cb) => { alert(m); cb && cb(); }, showConfirm: (m, cb) => cb(confirm(m)),
    showPopup: (p, cb) => { alert(p.message); cb && cb('ok'); },
    BackButton: back, MainButton: btn, SecondaryButton: btn, SettingsButton: btn,
    HapticFeedback: { notificationOccurred: noop, impactOccurred: noop, selectionChanged: noop },
    CloudStorage: {
      setItem: (k, v, cb) => { localStorage.setItem('cs:' + u.telegramId + ':' + k, v); cb && cb(null, true); },
      getItem: (k, cb) => cb(null, localStorage.getItem('cs:' + u.telegramId + ':' + k) ?? ''),
      getItems: (ks, cb) => cb(null, Object.fromEntries(ks.map(k => [k, localStorage.getItem('cs:' + u.telegramId + ':' + k) ?? '']))),
      removeItem: (k, cb) => { localStorage.removeItem('cs:' + u.telegramId + ':' + k); cb && cb(null, true); },
      removeItems: (ks, cb) => { ks.forEach(k => localStorage.removeItem('cs:' + u.telegramId + ':' + k)); cb && cb(null, true); },
      getKeys: (cb) => { const p = 'cs:' + u.telegramId + ':'; cb(null, Object.keys(localStorage).filter(k => k.startsWith(p)).map(k => k.slice(p.length))); },
    },
  } };
  addEventListener('DOMContentLoaded', () => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:9999;display:flex;flex-direction:column;gap:6px;font:700 11px/1 system-ui,sans-serif;letter-spacing:.04em';
    const tab = 'writing-mode:vertical-rl;transform:rotate(180deg);border:1px solid rgba(234,255,68,.55);border-left:0;background:rgba(17,17,16,.95);color:#eaff44;border-radius:0 8px 8px 0;padding:10px 5px;cursor:pointer';
    el.innerHTML = '<button id="demo-back" style="' + tab + '">← НАЗАД</button><button id="demo-user" title="Сменить пользователя" style="' + tab + '">ДЕМО · ' + u.firstName.toUpperCase() + ' ⇄</button>';
    document.body.appendChild(el);
    bar.back = el.querySelector('#demo-back');
    bar.sync();
    bar.back.onclick = () => back.handlers.slice(-1).forEach(f => f());
    el.querySelector('#demo-user').onclick = () => {
      const next = USERS[(i + 1) % USERS.length];
      // у каждого демо-пользователя свои ростеры (в Telegram они и так у каждого свои)
      const KEYS = ['warphub.rosters.v1', 'warphub.rosters.deleted.v1'];
      for (const k of KEYS) {
        const v = localStorage.getItem(k);
        if (v === null) localStorage.removeItem('demo:' + u.telegramId + ':' + k); else localStorage.setItem('demo:' + u.telegramId + ':' + k, v);
        const w = localStorage.getItem('demo:' + next.telegramId + ':' + k);
        if (w === null) localStorage.removeItem(k); else localStorage.setItem(k, w);
      }
      localStorage.removeItem('authToken');
      sessionStorage.setItem('demoUser', next.telegramId);
      location.href = '/profile';
    };
  });
})();
</script>`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' };

function staticFile(res, p) {
  let f = path.join(DIST, path.normalize(decodeURIComponent(p)).replace(/^([/\\])+/, ''));
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  let body = fs.readFileSync(f);
  if (f.endsWith('index.html')) {
    body = body.toString().replace(/<script[^>]*telegram-web-app\.js[^>]*><\/script>/, '').replace('<head>', '<head>' + fakeTelegram);
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`Не найдена сборка ${DIST}\nСначала: cd client && npm install && npm run build:demo`);
  process.exit(1);
}
if (!fs.existsSync(path.join(DATA, 'index.json'))) {
  console.error(`Не найдены данные Roster Builder в ${DATA}`);
  process.exit(1);
}

http
  .createServer(async (req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    try {
      if (p.startsWith('/api/')) return await api(req, res, p.slice(4));
      return staticFile(res, p);
    } catch (e) {
      console.error(e);
      send(res, 500, { error: String(e.message || e) });
    }
  })
  .listen(PORT, () => {
    console.log(`\nДемо WarpHub · Roster Builder: http://localhost:${PORT}\n`);
    console.log('Пользователи (переключение — вкладка «ДЕМО» у левого края):');
    for (const u of USERS) console.log(`  • ${nameOf(u)} — ${u.role}`);
    console.log('\nСюда будут приходить «сообщения бота» с кодами. Ctrl+C — остановить.\n');
  });
