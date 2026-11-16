#!/usr/bin/env node
/**
 * Снимки фото армии WarpBuilder (16.11.2026): списки ростеров, редакторы (лента «Фото армии», фото в строках), просмотр
 * во всех четырёх играх. Фото — условные рисунки из fixtures/minis/, кладутся в хранилище фото на устройстве
 * (IndexedDB «warphub-unit-photos») только в браузере снимков; у одного юнита каждого ростера фото нет.
 *
 *   node tools/roster-demo/server.mjs &
 *   node tools/ui-shots/photos.mjs [папка]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DATA = path.join(ROOT, 'backend/roster-data');
const OUT = path.resolve(process.argv[2] || 'ui-shots');
const BASE = process.env.DEMO_URL || 'http://localhost:5050';
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR || ROOT, 'noop.js'));
const { chromium } = require('playwright');
fs.mkdirSync(OUT, { recursive: true });
const read = (p) => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'));
const now = Date.now();
const MINIS = [1, 2, 3, 4, 5].map((n) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(HERE, `fixtures/minis/${n}.jpg`)).toString('base64'));

// ---- ростеры: настоящие данные приложения ----
const nec = read('f/NEC.json');
const necUnits = ['Overlord', 'Immortals', 'Necron Warriors', 'Canoptek Doomstalker', 'Lokhust Heavy Destroyers'].map((n) => nec.datasheets.find((d) => d.name === n && d.group === 'own')).filter(Boolean);
const w40 = {
  id: 'ph-40k', name: 'Necrons · Strike Force', factionId: 'NEC', battleSize: 'strike', detachmentIds: [nec.detachments.find((d) => !d.outdated).id], forceDisposition: null, chapter: null,
  units: necUnits.map((d, i) => ({ uid: `n${i}`, datasheetId: d.id, size: d.costs[0].options[0].label, addons: {}, wargear: {}, enhancementId: null, attachedTo: null })),
  warlordUid: 'n0', showLegends: false, dataVersion: null, createdAt: now, updatedAt: now,
};
const ktTeam = read('kt/t/AEL-COR.json');
const ktLeader = ktTeam.operatives.find((o) => o.keywords.includes('LEADER')) ?? ktTeam.operatives[0];
const ktOps = [ktLeader, ...ktTeam.operatives.filter((o) => o !== ktLeader).slice(0, 4)];
const kt = {
  system: 'kt', id: 'ph-kt', name: 'Voidscarred', teamId: ktTeam.id,
  operatives: ktOps.map((o, i) => ({ uid: `kt${i}`, opTypeId: o.id, name: '', weapons: o.weapons.slice(0, 2).map((w) => w.id) })),
  equipment: [], dataVersion: null, createdAt: now, updatedAt: now,
};
const wIndex = read('warcry/index.json');
const wFaction = wIndex.factions.filter((f) => !f.generic && f.fighters >= 6).map((f) => read(`warcry/f/${f.id}.json`))[0];
const wFighters = [...wFaction.fighters.filter((f) => f.runemarks.includes('hero')).slice(0, 1), ...wFaction.fighters.filter((f) => !f.runemarks.includes('hero')).slice(0, 4)];
const wc = {
  system: 'warcry', id: 'ph-wc', name: wFaction.name, factionId: wFaction.id,
  fighters: wFighters.map((f, i) => ({ uid: `wc${i}`, factionId: wFaction.id, fighterId: f.id, role: 'warband', name: '', group: ['dagger', 'shield', 'hammer'][i % 3] })),
  dataVersion: null, createdAt: now, updatedAt: now,
};
const aIndex = read('aos/index.json');
const aFaction = aIndex.factions.filter((f) => !f.legendsOnly).map((f) => read(`aos/f/${f.id}.json`)).find((f) => f.warscrolls.some((w) => w.hero && !w.legends) && f.warscrolls.filter((w) => !w.hero && !w.legends && w.kind !== 'manifestation').length >= 3);
const aHero = aFaction.warscrolls.find((w) => w.hero && !w.legends);
const aRest = aFaction.warscrolls.filter((w) => !w.hero && !w.legends && w.kind !== 'manifestation').slice(0, 3);
const aos = {
  system: 'aos', id: 'ph-aos', name: aFaction.name, factionId: aFaction.id, pointsLimit: 2000, formationId: aFaction.formations[0]?.id ?? null,
  regiments: [{ uid: 'g0', leader: { uid: 'a0', warscrollId: aHero.id, reinforced: false, enhancements: {} }, units: aRest.map((w, i) => ({ uid: `a${i + 1}`, warscrollId: w.id, reinforced: false, enhancements: {} })) }],
  auxiliaries: [], generalUid: 'a0', ror: null, lores: { spell: null, prayer: null, manifestation: null }, terrainId: null, showLegends: false, dataVersion: null, createdAt: now, updatedAt: now,
};
// ключи фото: у последнего юнита каждого ростера фото нет
const photoKeys = [
  ...w40.units.slice(0, -1).map((u) => `40k:${u.datasheetId}`),
  ...kt.operatives.slice(0, -1).map((x) => `kt:${x.opTypeId}`),
  ...wc.fighters.slice(0, -1).map((x) => `warcry:${x.fighterId}`),
  ...[aos.regiments[0].leader, ...aos.regiments[0].units].slice(0, -1).map((u) => `aos:${u.warscrollId}`),
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU', hasTouch: true });
await ctx.addInitScript(
  ([a, b, c, d]) => {
    localStorage.setItem('warphub.learn.done.v1', JSON.stringify({ '40k': true, aos: true, kt: true, warcry: true }));
    localStorage.setItem('warphub:roster-40k-lang', 'ru');
    for (const s of ['', '.1001']) {
      localStorage.setItem('warphub.rosters.v1' + s, JSON.stringify([a]));
      localStorage.setItem('warphub.kt-rosters.v1' + s, JSON.stringify([b]));
      localStorage.setItem('warphub.warcry-rosters.v1' + s, JSON.stringify([c]));
      localStorage.setItem('warphub.aos-rosters.v1' + s, JSON.stringify([d]));
    }
    addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '#demo-back,#demo-user{display:none!important}';
      document.head.appendChild(st);
    });
  },
  [w40, kt, wc, aos],
);
const page = await ctx.newPage();
const log = [];
page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && log.push(`console: ${m.text()}`));
const shot = async (name, fullPage = false) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `photos-${name}.jpg`), type: 'jpeg', quality: 80, fullPage });
  console.log('📸', name);
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    log.push(`${name}: ${String(e.message ?? e).split('\n')[0]}`);
    await shot(`FAILED-${name}`).catch(() => {});
  }
};
const go = async (route) => {
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
};
const tile = (re) => page.getByRole('button', { name: re }).filter({ hasNotText: /Продолжить|Continue/ }).first().click({ timeout: 6000 });

// фото — в хранилище на устройстве, как после «Добавить фото миниатюры»; приложение читает его при запуске
await go('/roster');
await page.evaluate(
  async ([keys, minis]) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('warphub-unit-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const rows = await Promise.all(keys.map(async (k, i) => ({ k, thumb: minis[i % minis.length], full: await (await fetch(minis[i % minis.length])).blob() })));
    await new Promise((res, rej) => {
      const t = db.transaction('photos', 'readwrite');
      for (const r of rows) t.objectStore('photos').put({ thumb: r.thumb, full: r.full, updatedAt: Date.now() }, r.k);
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
    db.close();
  },
  [photoKeys, MINIS],
);

for (const [game, re, name] of [
  ['40k', /Warhammer 40/, w40.name],
  ['aos', /Age of Sigmar/, aos.name],
  ['kt', /Kill Team/, kt.name],
  ['warcry', /Warcry/, wc.name],
]) {
  await step(`${game}-list`, async () => {
    await go('/roster');
    await tile(re);
    await page.waitForTimeout(800);
    await shot(`${game}-list`);
    if (game === '40k' || game === 'kt') {
      await page.getByRole('button', { name: /^Фото:/ }).first().click({ timeout: 5000 });
      await shot(`${game}-list-viewer`);
      await page.getByRole('button', { name: 'Закрыть' }).first().click({ timeout: 5000 });
    }
  });
  await step(`${game}-editor`, async () => {
    await page.getByText(name, { exact: false }).first().click({ timeout: 6000 });
    await page.waitForTimeout(1500);
    await page.getByText('Фото армии').first().scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.evaluate(() => window.scrollBy(0, -140));
    await shot(`${game}-editor`);
    await shot(`${game}-editor-full`, true);
    if (game === '40k') {
      // фото в строке юнита → просмотр без раскрытия карточки → следующее → «Открыть карточку юнита»
      await page.locator('[id^="u-"] button[aria-label^="Фото:"]').nth(1).click({ timeout: 5000 });
      await shot('40k-viewer');
      await page.getByRole('button', { name: 'Следующее фото' }).click({ timeout: 5000 });
      await shot('40k-viewer-next');
      await page.getByRole('button', { name: 'Открыть карточку юнита' }).click({ timeout: 5000 });
      await page.waitForTimeout(900);
      await shot('40k-opened-card');
    }
  });
}

fs.writeFileSync(path.join(OUT, 'log.txt'), log.join('\n') + '\n');
console.log(log.length ? 'замечания:\n' + log.join('\n') : 'без замечаний');
await browser.close();
