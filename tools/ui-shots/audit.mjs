#!/usr/bin/env node
/**
 * Аудит вёрстки (13.11.2026): обход всех разделов приложения в демо на 390 и 360 px — снимок всей страницы и проверки:
 * страница не шире экрана, нет элементов, выходящих за правый край, нет слишком мелких целей нажатия (< 32 px).
 *
 *   node tools/roster-demo/server.mjs &
 *   node tools/ui-shots/audit.mjs [папка]         (по умолчанию ui-audit/)
 *
 * Замечания печатаются в log.txt и не роняют задачу: это обзор, а не проверка.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || 'ui-audit');
const BASE = process.env.DEMO_URL || 'http://localhost:5050';
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR || ROOT, 'noop.js'));
const { chromium } = require('playwright');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['home', '/'],
  ['reservations', '/reservations'],
  ['news', '/news'],
  ['profile', '/profile'],
  ['games', '/games'],
  ['games-rewards', '/games/rewards'],
  ['games-cards', '/games/cards'],
  ['games-collection', '/games/cards/collection'],
  ['games-dice', '/games/dice'],
  ['games-egg', '/games/egg'],
  ['games-runner', '/games/runner'],
  ['learn', '/learn'],
  ['learn-40k', '/learn/40k'],
  ['learn-aos', '/learn/aos'],
  ['learn-kt', '/learn/kt'],
  ['learn-warcry', '/learn/warcry'],
  ['roster', '/roster'],
  ['admin', '/admin'],
  ['admin-pricing', '/admin/pricing'],
  ['admin-content', '/admin/content'],
  ['admin-warhammer', '/admin/warhammer'],
  ['admin-dnd', '/admin/dnd'],
  ['admin-roster', '/admin/roster'],
  ['admin-rewards', '/admin/rewards'],
  ['admin-admins', '/admin/admins'],
  ['admin-supporters', '/admin/supporters'],
  ['admin-dominatus', '/admin/dominatus'],
];
const only = process.env.AUDIT_ONLY ? new Set(process.env.AUDIT_ONLY.split(',')) : null;

const browser = await chromium.launch();
const log = [];
let n = 0;
for (const width of [390, 360]) {
  // высота 2200: страницы прокручиваются внутри своего контейнера — высокий экран показывает их целиком
  const ctx = await browser.newContext({ viewport: { width, height: Number(process.env.AUDIT_HEIGHT || 2200) }, deviceScaleFactor: 1, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 160)));
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160) + ' @ ' + String(e.stack ?? '').split('\n').slice(1, 3).join(' ← ').replace(/https?:\/\/[^/]+\//g, '').slice(0, 200)));
  page.on('response', (r) => r.status() >= 400 && errs.push(`${r.status()} ${new URL(r.url()).pathname}`));
  for (const [name, route] of ROUTES) {
    if (only && !only.has(name)) continue;
    errs.length = 0;
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const vw = window.innerWidth;
        const over = document.documentElement.scrollWidth - vw;
        const clipped = [];
        const small = [];
        const scrollsX = (el) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/(auto|scroll|hidden)/.test(s.overflowX) && p !== document.body && p !== document.documentElement) return true;
          }
          return false;
        };
        for (const el of document.querySelectorAll('body *')) {
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          const s = getComputedStyle(el);
          if (s.visibility === 'hidden' || s.display === 'none' || s.position === 'fixed') continue;
          if (b.right > vw + 1 && !scrollsX(el) && el.children.length === 0) clipped.push(`${el.tagName.toLowerCase()} «${(el.textContent || '').trim().slice(0, 30)}» +${Math.round(b.right - vw)}px`);
          if ((el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') && (b.width < 32 || b.height < 32) && b.top < 4000)
            small.push(`${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}» ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
        return { over, clipped: clipped.slice(0, 6), small: small.slice(0, 8), h: document.documentElement.scrollHeight, text: document.body.innerText.length, path: location.pathname };
      });
      const file = `${String(++n).padStart(2, '0')}-${width}-${name}.jpg`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true, type: 'jpeg', quality: 60 });
      log.push(`${width} ${name} (${route} → ${r.path}): высота ${r.h}${r.over > 1 ? `; ШИРЕ ЭКРАНА на ${r.over}px` : ''}${r.clipped.length ? `; за краем: ${r.clipped.join(' | ')}` : ''}${r.small.length ? `; мелкие цели: ${r.small.join(' | ')}` : ''}${errs.length ? `; ошибки консоли: ${[...new Set(errs)].filter((e) => !e.startsWith('Failed to load resource')).slice(0, 6).join(' | ')}` : ''}`);
      console.log('📸', file);
      // админка: окно игры за столом (14.11.2026)
      if (name === 'admin') {
        const game = page.getByRole('button', { name: /Игра за столом/ }).first();
        if (await game.count()) {
          await game.click({ timeout: 5000 });
          await page.waitForTimeout(500);
          const f2 = `${String(++n).padStart(2, '0')}-${width}-admin-game.jpg`;
          await page.screenshot({ path: path.join(OUT, f2), type: 'jpeg', quality: 70 });
          console.log('📸', f2);
          await page.keyboard.press('Escape');
        } else log.push(`${width} admin: строки «Игра за столом» нет`);
      }
    } catch (e) {
      log.push(`${width} ${name}: НЕ ОТКРЫЛОСЬ — ${String(e.message ?? e).split('\n')[0]}`);
    }
  }
  await ctx.close();
}
fs.writeFileSync(path.join(OUT, 'log.txt'), log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
