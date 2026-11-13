#!/usr/bin/env node
/**
 * Снимки Test Army 40K в демо (13.11.2026): выбор поля, стол, панель отрядов, панель отряда, атака и лист расчёта.
 * Экран телефона 390×844 (портрет) и 844×390 (альбом). Запуск — как tools/ui-shots/shots.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'backend/roster-data');
const OUT = path.resolve(process.argv[2] || 'ui-shots');
const BASE = process.env.DEMO_URL || 'http://localhost:5050';
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR || ROOT, 'noop.js'));
const { chromium } = require('playwright');
fs.mkdirSync(OUT, { recursive: true });
const read = (p) => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'));
const now = Date.now();
const roster = (id, name, fac, names) => {
  const F = read(`f/${fac}.json`);
  const ds = names.map((n) => F.datasheets.find((d) => d.name === n && d.group === 'own')).filter(Boolean);
  return {
    id, name, factionId: fac, battleSize: 'strike', detachmentIds: [F.detachments.find((d) => !d.outdated).id], forceDisposition: null, chapter: null,
    units: ds.map((d, i) => ({ uid: `${id}-${i}`, datasheetId: d.id, size: d.costs[0].options[0].label, addons: {}, wargear: {}, enhancementId: null, attachedTo: null })),
    warlordUid: `${id}-0`, showLegends: false, dataVersion: null, createdAt: now, updatedAt: now,
  };
};
const mine = roster('ta-nec', 'Демо: Necrons', 'NEC', ['Overlord', 'Necron Warriors', 'Immortals', 'Canoptek Doomstalker']);
const foe = roster('ta-sm', 'Демо: Space Marines', 'SM', ['Captain', 'Intercessor Squad', 'Redemptor Dreadnought']);

const browser = await chromium.launch();
const log = [];
let n = 0;
for (const [tag, viewport] of [['p', { width: 390, height: 844 }], ['l', { width: 844, height: 390 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'ru-RU', hasTouch: true });
  await ctx.addInitScript(([a, b]) => { for (const s of ['', '.1001']) localStorage.setItem('warphub.rosters.v1' + s, JSON.stringify([a, b])); }, [mine, foe]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log.push(`${tag} pageerror: ${e.message}`));
  const shot = async (name) => {
    await page.waitForTimeout(500);
    const file = `${String(++n).padStart(2, '0')}-ta-${tag}-${name}.jpg`;
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 72 });
    console.log('📸', file);
  };
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { log.push(`${tag} ${name}: ${String(e.message ?? e).split('\n')[0]}`); await shot(`FAILED-${name}`); }
  };
  const tapField = async (fx, fy) => {
    const box = await page.locator('svg').last().boundingBox();
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(350);
  };
  await step('open', async () => {
    await page.goto(BASE + '/roster', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Warhammer\s+40,000/ }).first().click({ timeout: 8000 });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /^Игра/ }).first().click({ timeout: 5000 });
    // плитка «Игра» тоже содержит «Test Army» в подписи — нажимаем пункт листа по его описанию
    await page.getByText('Расставить армию на поле', { exact: false }).first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Демо: Necrons/ }).first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Мой ростер' }).click({ timeout: 5000 });
    await page.getByRole('button', { name: /Демо: Space Marines/ }).first().click({ timeout: 5000 });
    await shot('field');
    await page.getByRole('button', { name: 'Расставить армии' }).click({ timeout: 5000 });
    await page.waitForTimeout(900);
    await shot('board-empty');
  });
  const place = async (tabName, unitName, fx, fy) => {
    if (!(await page.getByText('Test Army', { exact: true }).count())) await page.getByRole('button', { name: 'Отряды' }).first().click({ timeout: 5000 });
    const back = page.getByRole('button', { name: 'К списку отрядов' });
    if (await back.count()) await back.first().click({ timeout: 5000 });
    if (tabName) await page.getByRole('button', { name: new RegExp(tabName) }).first().click({ timeout: 5000 });
    await page.getByRole('button', { name: new RegExp(unitName) }).first().click({ timeout: 5000 });
    await page.getByRole('button', { name: /^Поставить$/ }).click({ timeout: 5000 });
    await tapField(fx, fy);
  };
  await step('panel', async () => {
    await page.getByRole('button', { name: 'Отряды' }).first().click({ timeout: 5000 });
    await shot('panel-list');
    await page.getByRole('button', { name: /Necron Warriors/ }).first().click({ timeout: 5000 });
    await shot('panel-unit');
    await page.getByRole('button', { name: /^Поставить$/ }).click({ timeout: 5000 });
    await tapField(0.5, tag === 'p' ? 0.7 : 0.5);
    await shot('unit-placed');
  });
  await step('place-more', async () => {
    await page.getByRole('button', { name: 'К списку отрядов' }).click({ timeout: 3000 }).catch(() => {});
    await place(null, 'Immortals', 0.3, tag === 'p' ? 0.75 : 0.6);
    await page.getByRole('button', { name: 'Отряды' }).first().click({ timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: 'К списку отрядов' }).click({ timeout: 3000 }).catch(() => {});
    await place('Соперник', 'Intercessor Squad', 0.5, tag === 'p' ? 0.35 : 0.3);
    await shot('both-placed');
  });
  await step('attack', async () => {
    await page.getByRole('button', { name: 'Отряды' }).first().click({ timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: 'К списку отрядов' }).click({ timeout: 3000 }).catch(() => {});
    await page.getByRole('button', { name: /Моя армия/ }).first().click({ timeout: 5000 });
    await page.getByRole('button', { name: /Necron Warriors/ }).first().click({ timeout: 5000 });
    await shot('panel-unit-placed');
    await page.getByRole('button', { name: /Атаковать/ }).click({ timeout: 5000 });
    await shot('attack-pick-target');
    await tapField(0.5, tag === 'p' ? 0.35 : 0.3);
    await page.waitForTimeout(600);
    await shot('attack-sheet-top');
    for (const t of ['Модификаторы атакующего', 'Модификаторы цели']) await page.getByText(t, { exact: true }).click({ timeout: 4000 });
    const dlg = page.getByRole('dialog').last();
    await dlg.evaluate((el) => { const s = [...el.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(x).overflowY)) ?? el; s.scrollTop = 420; });
    await shot('attack-sheet-mods');
    await dlg.evaluate((el) => { const s = [...el.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(x).overflowY)) ?? el; s.scrollTop = s.scrollHeight; });
    await shot('attack-sheet-result');
  });
  await ctx.close();
}
fs.writeFileSync(path.join(OUT, 'log.txt'), log.join('\n') + '\n');
console.log(log.length ? 'замечания:\n' + log.join('\n') : 'без замечаний');
await browser.close();
