#!/usr/bin/env node
/**
 * Снимки экранов для промо-картинок WarpHub и WarpBuilder (16.11.2026): демо-сборка, телефон 390×844, deviceScaleFactor 3,
 * только видимая часть экрана (как на телефоне), без демо-панели («← НАЗАД», «ДЕМО · …»).
 *
 *   node tools/roster-demo/server.mjs &
 *   node tools/ui-shots/promo.mjs [папка]         (по умолчанию ui-promo/)
 *
 * Картинки собираются отдельно: tools/design/promo/ (HTML → PNG). Каждый шаг снимается, даже если следующий не удался.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'backend/roster-data');
const OUT = path.resolve(process.argv[2] || 'ui-promo');
const BASE = process.env.DEMO_URL || 'http://localhost:5050';
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR || ROOT, 'noop.js'));
const { chromium } = require('playwright');
fs.mkdirSync(OUT, { recursive: true });
const read = (p) => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'));
const now = Date.now();

// ---- ростеры: настоящие данные приложения ----
const roster40 = (id, name, fac, names) => {
  const F = read(`f/${fac}.json`);
  const ds = names.map((n) => F.datasheets.find((d) => d.name === n && d.group === 'own')).filter(Boolean);
  return {
    id, name, factionId: fac, battleSize: 'strike', detachmentIds: [F.detachments.find((d) => !d.outdated).id], forceDisposition: null, chapter: null,
    units: ds.map((d, i) => ({ uid: `${id}-${i}`, datasheetId: d.id, size: d.costs[0].options[0].label, addons: {}, wargear: {}, enhancementId: null, attachedTo: null })),
    warlordUid: `${id}-0`, showLegends: false, dataVersion: null, createdAt: now, updatedAt: now,
  };
};
const nec = roster40('p-nec', 'Necrons · Strike Force', 'NEC', ['Overlord', 'Necron Warriors', 'Immortals', 'Canoptek Doomstalker', 'Lokhust Heavy Destroyers']);
const sm = roster40('p-sm', 'Space Marines · Strike Force', 'SM', ['Captain', 'Intercessor Squad', 'Redemptor Dreadnought']);
const ktTeam = read('kt/t/AEL-COR.json');
const leader = ktTeam.operatives.find((o) => o.keywords.includes('LEADER')) ?? ktTeam.operatives[0];
const kt = {
  system: 'kt', id: 'p-kt', name: 'Voidscarred', teamId: ktTeam.id,
  operatives: [leader, ...ktTeam.operatives.filter((o) => o !== leader).slice(0, 5)].map((o, i) => ({ uid: `kt${i}`, opTypeId: o.id, name: '', weapons: o.weapons.slice(0, 2).map((w) => w.id) })),
  equipment: ktTeam.equipment.slice(0, 2).map((e) => e.id), dataVersion: null, createdAt: now, updatedAt: now,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'ru-RU', hasTouch: true });
await ctx.addInitScript(([a, b, k]) => {
  localStorage.setItem('warphub.learn.done.v1', JSON.stringify({ '40k': true, aos: true, kt: true, warcry: true }));
  if (!localStorage.getItem('warphub:roster-40k-lang')) localStorage.setItem('warphub:roster-40k-lang', 'ru');
  for (const s of ['', '.1001']) {
    localStorage.setItem('warphub.rosters.v1' + s, JSON.stringify([a, b]));
    localStorage.setItem('warphub.kt-rosters.v1' + s, JSON.stringify([k]));
  }
  // демо-панель не попадает в снимок
  addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '#demo-back,#demo-user{display:none!important}';
    document.head.appendChild(st);
  });
}, [nec, sm, kt]);
const page = await ctx.newPage();
const log = [];
page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 90 });
  console.log('📸', name);
};
const step = async (name, fn) => {
  try { await fn(); } catch (e) { log.push(`${name}: ${String(e.message ?? e).split('\n')[0]}`); await shot(`FAILED-${name}`).catch(() => {}); }
};
const go = async (route) => { await page.goto(BASE + route, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); };
const top = (loc) => loc.evaluate((el) => el.scrollIntoView({ block: 'start' }));
const clickText = (t) => page.getByText(t, { exact: false }).first().click({ timeout: 8000 });

// ===== WarpHub =====
await step('hub-booking', async () => {
  await go('/');
  await shot('hub-home');
  await page.getByRole('button', { name: /Warhammer 40/ }).first().click({ timeout: 5000 });
  await shot('hub-booking-service');
  await page.locator('ul.ds-stagger li button').first().click({ timeout: 5000 });
  await shot('hub-booking-time');
  await page.locator('.ds-stagger button:not([disabled])').first().click({ timeout: 5000 });
  await shot('hub-booking-details');
  await page.evaluate(() => window.__warphubStages?.getState().resetStages());
  await page.evaluate(() => { const st = window.__warphubStages; if (st) for (let i = 0; i < 4; i++) st.getState().nextStage(); });
  await shot('hub-booking-done');
  await page.evaluate(() => window.__warphubStages?.getState().resetStages());
});
await step('hub-opponents', async () => {
  await go('/');
  await top(page.getByText('Ищут соперника').first());
  await page.evaluate(() => { const s = document.scrollingElement; s && (s.scrollTop -= 12); });
  await shot('hub-opponents');
});
for (const [name, route] of [
  ['hub-reservations', '/reservations'],
  ['hub-news', '/news'],
  ['hub-profile-notifications', '/profile'],
  ['hub-league', '/league'],
  ['hub-league-table', '/league?tab=table'],
  ['hub-tournament', '/tournament/2'],
  ['hub-games', '/games'],
  ['hub-games-egg', '/games/egg'],
  ['hub-games-cards', '/games/cards'],
  ['hub-games-rewards', '/games/rewards'],
]) {
  await step(name, async () => {
    await go(route);
    if (name === 'hub-profile-notifications') await page.getByRole('tab', { name: 'Уведомления' }).click({ timeout: 5000 });
    await shot(name);
  });
}

// ===== WarpBuilder =====
await step('wb-home', async () => {
  await go('/roster');
  await shot('wb-home');
});
for (const lang of ['ru', 'en']) {
  await step(`wb-40k-${lang}`, async () => {
    await page.evaluate((l) => localStorage.setItem('warphub:roster-40k-lang', l), lang);
    await go('/roster');
    await page.getByRole('button', { name: /Warhammer 40/ }).filter({ hasNotText: /Продолжить|Continue/ }).first().click({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot(`wb-40k-${lang}-list`);
    await clickText(nec.name);
    await page.waitForTimeout(1500);
    await shot(`wb-40k-${lang}-editor`);
    await clickText('Immortals');
    await page.waitForTimeout(800);
    await top(page.locator('[id^="u-"]').filter({ hasText: 'Immortals' }).first());
    await shot(`wb-40k-${lang}-card`);
    await page.getByText(/Способности и подробности|Abilities and details/).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(`wb-40k-${lang}-card-abilities`);
    await page.locator('[id^="u-"] [data-rule-trigger]').first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await shot(`wb-40k-${lang}-popover`);
    await page.keyboard.press('Escape');
    if (lang === 'ru') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: 'Добавить юнит' }).first().click({ timeout: 5000 });
      await page.waitForTimeout(700);
      await shot('wb-40k-picker');
      await page.keyboard.press('Escape');
    }
  });
}
await page.evaluate(() => localStorage.setItem('warphub:roster-40k-lang', 'ru'));

await step('wb-kt-game', async () => {
  await go('/roster');
  await clickText(kt.name);
  await page.waitForTimeout(1200);
  await shot('wb-kt-editor');
  await page.getByRole('button', { name: 'Меню' }).first().click({ timeout: 5000 });
  await page.getByText('Начать игру', { exact: false }).first().click({ timeout: 5000 });
  await page.waitForTimeout(1200);
  await shot('wb-kt-game-start');
  await page.getByRole('button', { name: 'Начать подготовку' }).first().click({ timeout: 5000 });
  const empty = page.getByRole('button', { name: /Выберите kill team/ });
  for (let i = 0; i < 2 && (await empty.count()) > 0; i++) {
    await empty.first().click({ timeout: 5000 });
    await page.getByRole('button', { name: new RegExp(kt.name) }).last().click({ timeout: 5000 });
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: 'Начать битву' }).first().click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  await shot('wb-kt-battle');
  await page.getByRole('button', { name: /Бросить/ }).first().click({ timeout: 5000 });
  await page.waitForTimeout(900);
  await shot('wb-kt-battle-initiative');
  await page.getByRole('button', { name: 'Mobile Engagement' }).first().click({ timeout: 5000 });
  await page.getByRole('button', { name: '1 CP' }).first().click({ timeout: 5000 });
  await shot('wb-kt-ploy');
});

await step('wb-testarmy', async () => {
  const tap = async (fx, fy) => {
    const box = await page.locator('svg').last().boundingBox();
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(350);
  };
  await go('/roster');
  await page.getByRole('button', { name: /Warhammer\s+40,000/ }).first().click({ timeout: 8000 });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Игра/ }).first().click({ timeout: 5000 });
  await page.getByText('Расставить армию на поле', { exact: false }).first().click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: new RegExp(nec.name) }).first().click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Мой ростер' }).click({ timeout: 5000 });
  await page.getByRole('button', { name: new RegExp(sm.name) }).first().click({ timeout: 5000 });
  await shot('wb-ta-field');
  await page.getByRole('button', { name: 'Расставить армии' }).click({ timeout: 5000 });
  await page.waitForTimeout(900);
  const place = async (tab, unit, fx, fy) => {
    if (!(await page.getByText('Test Army', { exact: true }).count())) await page.getByRole('button', { name: 'Отряды' }).first().click({ timeout: 5000 });
    const back = page.getByRole('button', { name: 'К списку отрядов' });
    if (await back.count()) await back.first().click({ timeout: 5000 });
    if (tab) await page.getByRole('button', { name: new RegExp(tab) }).first().click({ timeout: 5000 });
    await page.getByRole('button', { name: new RegExp(unit) }).first().click({ timeout: 5000 });
    await page.getByRole('button', { name: /^Поставить$/ }).click({ timeout: 5000 });
    await tap(fx, fy);
  };
  await place(null, 'Necron Warriors', 0.5, 0.72);
  await place(null, 'Immortals', 0.28, 0.76);
  await place(null, 'Canoptek Doomstalker', 0.74, 0.78);
  await place('Соперник', 'Intercessor Squad', 0.5, 0.33);
  await place('Соперник', 'Redemptor Dreadnought', 0.3, 0.28);
  await shot('wb-ta-board');
  await page.getByRole('button', { name: 'Отряды' }).first().click({ timeout: 5000 }).catch(() => {});
  await page.getByRole('button', { name: 'К списку отрядов' }).click({ timeout: 3000 }).catch(() => {});
  await page.getByRole('button', { name: /Моя армия/ }).first().click({ timeout: 5000 });
  await page.getByRole('button', { name: /Necron Warriors/ }).first().click({ timeout: 5000 });
  await page.getByRole('button', { name: /Атаковать/ }).click({ timeout: 5000 });
  await tap(0.5, 0.33);
  await page.waitForTimeout(700);
  await shot('wb-ta-attack');
  const dlg = page.getByRole('dialog').last();
  await dlg.evaluate((el) => { const s = [...el.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(x).overflowY)) ?? el; s.scrollTop = s.scrollHeight; });
  await shot('wb-ta-attack-result');
});

fs.writeFileSync(path.join(OUT, 'log.txt'), log.join('\n') + '\n');
console.log(log.length ? 'замечания:\n' + log.join('\n') : 'без замечаний');
await browser.close();
