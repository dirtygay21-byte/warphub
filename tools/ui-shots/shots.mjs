#!/usr/bin/env node
/**
 * Скриншоты экранов WarpBuilder в демо (без Telegram и сервера): ростеры Kill Team и Warcry кладутся в localStorage,
 * затем открываются редакторы и (по возможности) экран начала игры. Телефонный размер 390×844, deviceScaleFactor 2.
 *
 *   node tools/roster-demo/server.mjs &          (нужна собранная client/dist-demo)
 *   node tools/ui-shots/shots.mjs [папка]        (по умолчанию ui-shots/)
 *
 * Playwright ищется рядом (node_modules) или в PLAYWRIGHT_DIR. Используется в .github/workflows/ui-shots.yml.
 * Каждый шаг снимается, даже если следующий не удался: по снимкам видно, где остановилось.
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

// ---- ростеры для демо: настоящие данные приложения ----
const ktTeam = read('kt/t/AEL-COR.json');
const leader = ktTeam.operatives.find((o) => o.keywords.includes('LEADER')) ?? ktTeam.operatives[0];
const ktOps = [leader, ...ktTeam.operatives.filter((o) => o !== leader).slice(0, 5)];
const now = Date.now();
const kt = {
  system: 'kt',
  id: 'shot-kt',
  name: 'Демо: Voidscarred',
  teamId: ktTeam.id,
  operatives: ktOps.map((o, i) => ({ uid: `kt${i}`, opTypeId: o.id, name: i === 1 ? 'Саэлин' : '', weapons: o.weapons.slice(0, 2).map((w) => w.id) })),
  equipment: ktTeam.equipment.slice(0, 2).map((e) => e.id),
  dataVersion: null,
  createdAt: now,
  updatedAt: now,
};
const wIndex = read('warcry/index.json');
const wFaction = wIndex.factions.filter((f) => !f.generic && f.fighters >= 6).map((f) => read(`warcry/f/${f.id}.json`))[0];
const heroes = wFaction.fighters.filter((f) => f.runemarks.includes('hero'));
const rest = wFaction.fighters.filter((f) => !f.runemarks.includes('hero'));
const wFighters = [...heroes.slice(0, 1), ...rest.slice(0, 6)];
const groups = ['dagger', 'shield', 'hammer'];
const wc = {
  system: 'warcry',
  id: 'shot-wc',
  name: `Демо: ${wFaction.name}`,
  factionId: wFaction.id,
  fighters: wFighters.map((f, i) => ({ uid: `wc${i}`, factionId: wFaction.id, fighterId: f.id, role: 'warband', name: '', group: i === wFighters.length - 1 ? null : groups[i % 3] })),
  dataVersion: null,
  createdAt: now,
  updatedAt: now,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU' });
await ctx.addInitScript(
  ([k, w]) => {
    for (const s of ['', '.1001']) {
      localStorage.setItem('warphub.kt-rosters.v1' + s, JSON.stringify([k]));
      localStorage.setItem('warphub.warcry-rosters.v1' + s, JSON.stringify([w]));
    }
  },
  [kt, wc],
);
const page = await ctx.newPage();
const log = [];
page.on('console', (m) => m.type() === 'error' && log.push(`console: ${m.text()}`));
page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
let n = 0;
const shot = async (name, full = false) => {
  // JPEG: снимки читаются и из лога задачи (workflow печатает их base64, если артефакты недоступны)
  const file = path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.jpg`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: file, fullPage: full, type: 'jpeg', quality: 70 });
  console.log('📸', path.basename(file));
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    log.push(`${name}: ${String(e.message ?? e).split('\n')[0]}`);
    await shot(`FAILED-${name}`);
  }
};
const clickText = (t) => page.getByText(t, { exact: false }).first().click({ timeout: 8000 });

await step('open', async () => {
  await page.goto(BASE + '/roster', { waitUntil: 'networkidle' });
  await shot('roster-home');
});

for (const [label, name] of [
  ['kt', kt.name],
  ['warcry', wc.name],
]) {
  await step(`${label}-editor`, async () => {
    await page.goto(BASE + '/roster', { waitUntil: 'networkidle' });
    await clickText(name);
    await page.waitForTimeout(1200);
    await shot(`${label}-editor-top`);
    await shot(`${label}-editor-full`, true);
  });
  await step(`${label}-army-open`, async () => {
    // блок команды / варбанды и панель правил
    await page.locator('section button[aria-expanded]').first().click({ timeout: 5000 });
    await page.getByRole('button', { name: 'Показать' }).first().click({ timeout: 5000 });
    await shot(`${label}-army-and-rules`, true);
    await page.locator('section button[aria-expanded="true"]').first().click({ timeout: 5000 });
  });
  await step(`${label}-card-open`, async () => {
    const card = page.locator('[id^="u-"] > button[aria-expanded]').nth(1);
    await card.scrollIntoViewIfNeeded();
    await card.click({ timeout: 5000 });
    await shot(`${label}-card-open`);
    await page.getByRole('button', { name: 'Датакарта' }).first().click({ timeout: 5000 });
    await page.locator('[id^="u-"] [aria-expanded="true"]').first().scrollIntoViewIfNeeded();
    await shot(`${label}-card-datasheet`, true);
  });
  await step(`${label}-view-mode`, async () => {
    await page.getByRole('button', { name: 'Режим просмотра' }).first().click({ timeout: 5000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(`${label}-view-mode`, true);
    await page.getByRole('button', { name: 'Редактировать' }).first().click({ timeout: 5000 });
  });
  await step(`${label}-game-start`, async () => {
    await page.getByRole('button', { name: 'Меню' }).first().click({ timeout: 5000 });
    await page.getByText('Начать игру', { exact: false }).first().click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    await shot(`${label}-game-start`, true);
    if (label === 'kt') {
      await page.getByRole('button', { name: /Поле боя/ }).first().click({ timeout: 5000 });
      await page.waitForTimeout(800);
      await shot('kt-field-view', true);
      await page.getByRole('button', { name: 'Назад' }).first().click({ timeout: 5000 });
    }
  });
  await step(`${label}-game-setup`, async () => {
    await page.getByRole('button', { name: 'Начать подготовку' }).first().click({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot(`${label}-game-setup`, true);
    // оба игрока — демо-ростер (выбор из листа), затем начало битвы
    const empty = page.getByRole('button', { name: label === 'kt' ? /Выберите kill team/ : /Выберите варбанду/ });
    for (let i = 0; i < 2 && (await empty.count()) > 0; i++) {
      await empty.first().click({ timeout: 5000 });
      await page.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).last().click({ timeout: 5000 });
      await page.waitForTimeout(300);
    }
    await shot(`${label}-game-setup-filled`, true);
    await page.getByRole('button', { name: 'Начать битву' }).first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await shot(`${label}-battle`, true);
    if (label === 'kt') {
      await page.getByText(/^Карта ·/).first().click({ timeout: 5000 });
      await shot('kt-battle-map', true);
      await page.getByRole('button', { name: 'Мастер' }).first().click({ timeout: 5000 });
      await shot('kt-battle-master');
      await page.getByRole('button', { name: 'Ростер' }).first().click({ timeout: 5000 });
      await page.waitForTimeout(1200);
      await shot('kt-master-roster', true);
      await page.getByRole('button', { name: /К списку|Назад/ }).first().click({ timeout: 5000 });
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Мастер' }).first().click({ timeout: 5000 });
    }
    // переключатель кубиков: «Вручную» — ввод итога, затем обратно «В приложении»
    await page.getByRole('radio', { name: 'Вручную' }).first().click({ timeout: 5000 });
    await shot(`${label}-battle-dice-manual`, true);
    await page.getByRole('radio', { name: 'В приложении' }).first().click({ timeout: 5000 });
    await page.getByRole('button', { name: /Бросить/ }).first().click({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot(`${label}-battle-initiative`, true);
    if (label === 'kt') {
      await page.getByRole('button', { name: 'Mobile Engagement' }).first().click({ timeout: 5000 });
      await page.getByRole('button', { name: '1 CP' }).first().click({ timeout: 5000 });
      await shot('kt-ploy-open', true);
      await page.getByRole('button', { name: /Использовать за 1 CP/ }).first().click({ timeout: 5000 });
      await page.waitForTimeout(500);
      await shot('kt-ploy-used', true);
    }
  });
}

// «Учебный раунд» Kill Team: вступление, шаги с примерами, следующий раунд
await step('kt-list-learn', async () => {
  await page.goto(BASE + '/roster', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Kill Team/ }).first().click({ timeout: 5000 });
  await page.waitForTimeout(800);
  await shot('kt-list-tiles');
});
await step('learn-kt-round', async () => {
  await page.goto(BASE + '/learn', { waitUntil: 'networkidle' });
  await shot('learn-hub', true);
  for (const p of [0, 4, 9, 11]) {
    await page.goto(`${BASE}/learn/kt/round?p=${p}`, { waitUntil: 'networkidle' });
    await shot(`learn-kt-round-${p}`, true);
  }
  await page.goto(`${BASE}/learn/kt/round?p=15`, { waitUntil: 'networkidle' });
  await shot('learn-kt-round-next', true);
  for (const p of [0, 4, 9]) {
    await page.goto(`${BASE}/learn/warcry/round?p=${p}`, { waitUntil: 'networkidle' });
    await shot(`learn-warcry-round-${p}`, true);
  }
  for (const p of [0, 7, 11, 13]) {
    await page.goto(`${BASE}/learn/aos/round?p=${p}`, { waitUntil: 'networkidle' });
    await shot(`learn-aos-round-${p}`, true);
  }
});

fs.writeFileSync(path.join(OUT, 'log.txt'), log.join('\n') + '\n');
console.log(log.length ? `замечания:\n${log.join('\n')}` : 'без замечаний');
await browser.close();
