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

// 40K: Necrons — Overlord, Necron Warriors, Immortals (первый размер отряда)
const nec = read('f/NEC.json');
const necUnits = ['Overlord', 'Necron Warriors', 'Immortals'].map((n) => nec.datasheets.find((d) => d.name === n)).filter(Boolean);
const w40 = {
  id: 'shot-40k',
  name: 'Демо: Necrons',
  factionId: 'NEC',
  battleSize: 'strike',
  detachmentIds: [nec.detachments[0].id],
  forceDisposition: null,
  chapter: null,
  units: necUnits.map((d, i) => ({ uid: `n${i}`, datasheetId: d.id, size: d.costs[0].options[0].label, addons: {}, wargear: {}, enhancementId: null, attachedTo: null })),
  warlordUid: 'n0',
  showLegends: false,
  dataVersion: null,
  createdAt: now,
  updatedAt: now,
};
// AoS: первая фракция с героем и обычными отрядами — полк из героя и двух отрядов
const aIndex = read('aos/index.json');
const aFaction = aIndex.factions.filter((f) => !f.legendsOnly).map((f) => read(`aos/f/${f.id}.json`)).find((f) => f.warscrolls.some((w) => w.hero && !w.legends) && f.warscrolls.filter((w) => !w.hero && !w.legends && w.kind !== 'manifestation').length >= 2);
const aHero = aFaction.warscrolls.find((w) => w.hero && !w.legends);
const aRest = aFaction.warscrolls.filter((w) => !w.hero && !w.legends && w.kind !== 'manifestation').slice(0, 2);
const aos = {
  system: 'aos',
  id: 'shot-aos',
  name: `Демо: ${aFaction.name}`,
  factionId: aFaction.id,
  pointsLimit: 2000,
  formationId: aFaction.formations[0]?.id ?? null,
  regiments: [{ uid: 'g0', leader: { uid: 'a0', warscrollId: aHero.id, reinforced: false, enhancements: {} }, units: aRest.map((w, i) => ({ uid: `a${i + 1}`, warscrollId: w.id, reinforced: false, enhancements: {} })) }],
  auxiliaries: [],
  generalUid: 'a0',
  ror: null,
  lores: { spell: null, prayer: null, manifestation: null },
  terrainId: null,
  showLegends: false,
  dataVersion: null,
  createdAt: now,
  updatedAt: now,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU' });
await ctx.addInitScript(
  ([k, w, r40, ra]) => {
    for (const s of ['', '.1001']) {
      localStorage.setItem('warphub.kt-rosters.v1' + s, JSON.stringify([k]));
      localStorage.setItem('warphub.warcry-rosters.v1' + s, JSON.stringify([w]));
      localStorage.setItem('warphub.rosters.v1' + s, JSON.stringify([r40]));
      localStorage.setItem('warphub.aos-rosters.v1' + s, JSON.stringify([ra]));
    }
  },
  [kt, wc, w40, aos],
);
const page = await ctx.newPage();
const log = [];
page.on('console', (m) => m.type() === 'error' && log.push(`console: ${m.text()}`));
page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
let n = 0;
// проверки (07.11.2026): ошибка — задача screenshots завершается с ошибкой
const failures = [];
const fail = (m) => (failures.push(m), log.push(`ПРОВЕРКА: ${m}`));
/**
 * Подсказка правила не меняет то, что под ней: открыть, закрыть крестиком, открыть, закрыть нажатием мимо (на строку
 * под карточкой) — состояние (state) до и после совпадает, карточка закрыта.
 */
async function popoverHasNoSideEffect(label, trigger, _state, outside) {
  // состояние страницы: все переключатели (aria-expanded / aria-checked / aria-pressed) и очки в шапке
  const state = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[aria-expanded],[aria-checked],[aria-pressed]')]
        .filter((e) => !e.closest('[role="dialog"]'))
        .map((e) => `${e.getAttribute('aria-expanded')}${e.getAttribute('aria-checked')}${e.getAttribute('aria-pressed')}`)
        .join(),
    );
  let at = 'начало';
  try {
    const before = await state();
    at = 'открыть подсказку';
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    // события, которые закрывают подсказку (прокрутка, смена размера окна) — для разбора, если она не открылась
    await page.evaluate(() => {
      window.__closers = [];
      for (const t of ['scroll', 'resize']) window.addEventListener(t, (e) => window.__closers.push(`${t}:${e.target?.nodeName ?? e.target?.id ?? '?'}`), true);
    });
    await trigger.click({ timeout: 5000 });
    await page.waitForTimeout(300);
    if (!(await page.getByRole('dialog').count())) {
      log.push(`  ${label}: подсказка не открылась с первого нажатия; события: ${(await page.evaluate(() => window.__closers.slice(0, 8).join(', ')))}`);
      await trigger.click({ timeout: 5000 });
      await page.waitForTimeout(300);
    }
    at = 'закрыть крестиком';
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click({ timeout: 5000 });
    await page.waitForTimeout(300);
    if ((await state()) !== before) fail(`${label}: закрытие подсказки крестиком изменило выбор`);
    at = 'открыть снова';
    await trigger.click({ timeout: 5000 });
    await page.waitForTimeout(200);
    at = 'нажать мимо';
    // мимо карточки, в той же строке, что и подсказка (на экране, без прокрутки — прокрутка сама закрывает карточку)
    const tb = await trigger.boundingBox();
    const ob = outside ? await outside.boundingBox() : null;
    await page.mouse.click(ob ? ob.x + 6 : page.viewportSize().width - 10, tb.y + tb.height / 2);
    await page.waitForTimeout(300);
    if ((await state()) !== before) fail(`${label}: нажатие мимо подсказки изменило выбор`);
    if (await page.getByRole('dialog').count()) fail(`${label}: подсказка не закрылась`);
  } catch (e) {
    fail(`${label}: проверка не выполнена (${at}): ${String(e.message ?? e).split('\n')[0]}`);
    const html = await trigger.evaluate((el) => el.outerHTML.slice(0, 300)).catch(() => '?');
    log.push(`  подсказка: ${html}; диалогов: ${await page.getByRole('dialog').count()}`);
    await shot(`FAILED-check-${label.split(':')[0]}`);
  }
}
const shot = async (name, full = false) => {
  // JPEG: снимки читаются и из лога задачи (workflow печатает их base64, если артефакты недоступны)
  const file = path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.jpg`);
  await page.waitForTimeout(500);
  // проверка вёрстки (07.11.2026): страница не шире экрана (нет прокрутки вбок)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
  if (over > 1) fail(`вёрстка: «${name}» шире экрана на ${over} px`);
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
    if (label === 'kt') {
      // правило оружия (Lethal, Piercing…) — нажатие открывает текст
      const rule = page.locator('[id^="u-"] button.underline').first();
      const row = rule.locator('xpath=ancestor::div[@role="checkbox"][1]');
      if (await row.count()) {
        const checked = () => row.getAttribute('aria-checked');
        await popoverHasNoSideEffect('KT: правило оружия в редакторе', rule, null, row);
        // выбор строки сам по себе работает
        const was = await checked();
        await row.click({ timeout: 5000, position: { x: 4, y: 4 } });
        if ((await checked()) === was) fail('KT: нажатие на строку оружия не меняет выбор');
        await row.click({ timeout: 5000, position: { x: 4, y: 4 } });
      } else fail('KT: строка оружия с правилом не найдена');
      await rule.scrollIntoViewIfNeeded();
      await rule.click({ timeout: 5000 });
      await page.waitForTimeout(400);
      await shot('kt-weapon-rule');
      await page.keyboard.press('Escape');
    }
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
  for (const p of [0, 4, 8, 12]) {
    await page.goto(`${BASE}/learn/40k/round?p=${p}`, { waitUntil: 'networkidle' });
    await shot(`learn-40k-round-${p}`, true);
  }
});

// Вёрстка (07.11.2026): списки и редакторы всех игр, раскрытая карточка юнита; затем узкий экран 360 px
const SYSTEMS = [
  ['40k', /40,000|40K/i, w40.name, necUnits[1]?.name],
  ['aos', /Sigmar|AoS/i, aos.name, aRest[0]?.name],
  ['kt', /Kill Team/, kt.name, null],
  ['warcry', /Warcry/, wc.name, null],
];
for (const width of [390, 360]) {
  await page.setViewportSize({ width, height: 844 });
  for (const [label, sw, name, unit] of SYSTEMS) {
    await step(`layout-${width}-${label}`, async () => {
      await page.goto(BASE + '/roster', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: sw }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
      await shot(`layout-${width}-${label}-list`, true);
      if (width === 390)
        for (const [k, t] of [['rules', /^Правила/], ['game', /^Игра/]]) {
          await page.getByRole('button', { name: t }).first().click({ timeout: 5000 });
          await page.waitForTimeout(500);
          await shot(`layout-${label}-menu-${k}`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
        }
      await clickText(name);
      await page.waitForTimeout(1500);
      await shot(`layout-${width}-${label}-editor`, true);
      if (label === '40k') {
        // Добавить юнит (07.11.2026): цены размеров, сортировка, «Помещается», поиск по ключевому слову
        await page.getByRole('button', { name: 'Добавить юнит' }).first().click({ timeout: 5000 });
        await page.waitForTimeout(600);
        await shot(`layout-${width}-40k-picker`);
        await page.getByRole('radio', { name: 'По очкам' }).click({ timeout: 5000 });
        const fits = page.getByRole('button', { name: /^Помещается/ });
        if (await fits.count()) await fits.click({ timeout: 5000 });
        else fail('40K: в «Добавить юнит» нет «Помещается» (у ростера нет лимита очков?)');
        await page.getByPlaceholder('Название, ключевое слово или способность').fill('fly');
        await page.waitForTimeout(400);
        await shot(`layout-${width}-40k-picker-sorted`);
        if (!(await page.locator('[role="dialog"] li').count())) fail('40K: поиск «fly» в «Добавить юнит» ничего не нашёл');
        // настройки — на устройстве; вернуть по умолчанию для следующих шагов
        await page.getByRole('radio', { name: 'По типу' }).click({ timeout: 5000 });
        if (await fits.count()) await fits.click({ timeout: 5000 });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
      if (label === 'warcry' && width === 390) {
        // рунмарка бойца: какие способности она открывает
        await page.locator('[id^="u-"] > button[aria-expanded]').first().click({ timeout: 5000 });
        await page.getByRole('button', { name: 'Датакарта' }).first().click({ timeout: 5000 });
        const rm = page.locator('[id^="u-"] div.flex-wrap > button').last();
        await rm.scrollIntoViewIfNeeded();
        await rm.click({ timeout: 5000 });
        await page.waitForTimeout(400);
        await shot('warcry-runemark');
        await page.keyboard.press('Escape');
        await popoverHasNoSideEffect('Warcry: рунмарка', page.locator('[id^="u-"] [data-rule-trigger]').last(), null, null);
      }
      if (unit) {
        await page.getByText(unit, { exact: false }).first().click({ timeout: 5000 });
        await page.waitForTimeout(1000);
        await shot(`layout-${width}-${label}-unit`, true);
        if (label === '40k') {
          // «Действует на юнит» (07.11.2026): армейское правило и детачмент — сразу при открытии юнита
          const row = page.locator('[id^="u-"]').getByText('Действует на юнит').first();
          if (!(await row.count()) || !(await row.isVisible())) fail(`40K ${width}: в карточке юнита нет «Действует на юнит»`);
          else {
            await row.scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);
            await shot(`layout-${width}-40k-unit-rules`);
            if (width === 390) await popoverHasNoSideEffect('40K: правило армии', page.locator('[id^="u-"] [data-rule-trigger]', { hasText: 'Армия' }).first(), null, null);
          }
        }
        if (label === '40k' && width === 390) {
          // способность оружия 40K в карточке юнита: подсказка не меняет карточку
          const tag = page.locator('[id^="u-"] [data-rule-trigger]').first();
          if (await tag.count()) await popoverHasNoSideEffect('40K: способность оружия', tag, null, null);
          else fail('40K: в карточке юнита нет подсказок правил');
        }
        if (label === 'aos' && width === 390) {
          // варскролл: способность оружия и ключевое слово нажимаются и открывают текст
          await page.getByRole('button', { name: 'Варскролл' }).first().click({ timeout: 5000 });
          await page.waitForTimeout(500);
          const chip = page.locator('td button').first();
          await chip.scrollIntoViewIfNeeded();
          await chip.click({ timeout: 5000 });
          await page.waitForTimeout(400);
          await shot('aos-weapon-ability');
          await page.keyboard.press('Escape');
          await popoverHasNoSideEffect('AoS: способность оружия', chip, null, null);
        }
      }
    });
  }
}

fs.writeFileSync(path.join(OUT, 'log.txt'), log.join('\n') + '\n');
console.log(log.length ? `замечания:\n${log.join('\n')}` : 'без замечаний');
await browser.close();
if (failures.length) {
  console.log(`ПРОВЕРКИ НЕ ПРОЙДЕНЫ: ${failures.length}`);
  process.exitCode = 1;
}
