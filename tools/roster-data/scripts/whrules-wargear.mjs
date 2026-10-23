#!/usr/bin/env node
/**
 * Обновление 40K kind «whrules-wargear» (40k/curated.json → updates; задача P1-T5): как платится снаряжение — по данным
 * конструктора ростеров wh-rules.ru (снимок 40k/whrules-<версия>-roster.json, схема whrules-roster/1,
 * scripts/whrules-extract-roster.js).
 *
 * Как считает сайт (rosterEngine: unitPoints = база + ступень копии + defaultWargearPoints + unitWargearPoints):
 *  - платное снаряжение платится на КАЖДОЙ копии юнита (ступень цены за копии — отдельно, в базе);
 *  - за выбранный вариант — его очки; за стандартное снаряжение — unit.dw (очки за модель по типу модели), а вариант,
 *    который снимает такой предмет, возвращает очки (gear.dr);
 *  - у юнита без dw стандартные платные предметы бесплатны (Gladiator Valiant BT: 2 multi-melta в базе, +10 — третья).
 * У нас то же самое — по предметам: цена предмета — wargearPoints сайта (costs[].wargear, обновление whrules-points), платится
 * каждый предмет итогового снаряжения; стандартные штуки — только если у инфолиста paidDefaults (у сайта есть dw).
 * Проверено на всех вариантах сайта с очками (390 вариантов, 61 юнит): разница с конструктором сайта — 0
 * (tests/paid-wargear.test.ts → «сверка с конструктором сайта»).
 *
 * Что меняет обработчик: Datasheet.paidDefaults = true у сопоставленных инфолистов, у которых на сайте есть dw (и у их
 * копий в других файлах — тот же id), снимает флаг у остальных; инфолисту без вариантов в тексте (а у конструктора сайта
 * они есть) — варианты в формулировке конструктора (options[].source = 'whrules-roster'); u.rosterOptions — отдельные варианты
 * конструктора: add — добавить недостающий (Watcher in the Dark у Deathwing Terminator Squad), replace — заменить наш вариант
 * с опечаткой или ссылкой на оружие, которого у юнита нет (Kâhl «Autoch-pattem»), формулировкой сайта. Сопоставление — whrules-compare.mjs → compareArmy по снимку
 * очков (u.points), как у whrules-points. Платный стандартный предмет, которого нет в нашем стандартном снаряжении, —
 * ошибка (иначе цена молча разойдётся с сайтом).
 *
 *   bun scripts/whrules-wargear.mjs [--roster whrules-995-roster.json] [--points whrules-995.json] — план, данные не меняет.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROSTER_SCHEMA, SNAPSHOT_DIR, checkRosterSnapshot, loadSnapshot } from './updates-40k.mjs';
import { ARMIES, compareArmy, wargearKey } from './whrules-compare.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', '..', '..', 'backend', 'roster-data');
export { ROSTER_SCHEMA, checkRosterSnapshot };
export const loadRoster = (file, dir = SNAPSHOT_DIR) => checkRosterSnapshot(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));

/**
 * Формулировки вариантов из конструктора ростеров (texts[gear.t]) для инфолиста, у которого в тексте вариантов нет
 * (Impulsor, Repulsor, Repulsor Executioner Space Marines, Venerable Dreadnought и Wulfen Space Wolves): маркеры списка
 * сайта (▫ ◦ ▪) — как у нас «•», неразрывный дефис — обычный.
 */
export function rosterOptionTexts(roster, unit) {
  const seen = new Set();
  const out = [];
  for (const g of unit.gear ?? []) {
    const t = roster.texts?.[g.t];
    if (!t || seen.has(g.t)) continue;
    seen.add(g.t);
    out.push(t.replace(/\u2011/g, '-').split('\n').map((l) => l.trim().replace(/^[▫◦▪■-]\s*/, '• ')).filter(Boolean).join('\n'));
  }
  return out;
}

/** Предметы стандартного снаряжения юнита сайта по типу модели: [[тип, [[название, штук]]]]. */
const siteDefaults = (roster, unit) => (unit.defaults ?? []).map(([m, list]) => [m, list.map(([id, q]) => [roster.items[id], q ?? 1])]);

/**
 * План: какие инфолисты получают / теряют paidDefaults. files — { "<id>.json": данные }, roster — снимок ростера,
 * points — снимок очков (для сопоставления). Ничего не меняет. Возвращает { set, unset, gaps, unmatched }.
 */
export function planWargear(files, roster, points, u = {}) {
  const plan = { set: [], unset: [], gaps: [], unmatched: [], options: [], fixes: [], fixErrors: [] };
  // отдельные варианты из конструктора (u.rosterOptions): { army, id, add | replace, site } — добавить недостающий вариант
  // или заменить наш (опечатка, ссылка на оружие, которого у юнита нет) формулировкой сайта, где есть текст site
  const fixesById = new Map();
  for (const f of u.rosterOptions ?? []) fixesById.set(f.id, [...(fixesById.get(f.id) ?? []), f]);
  const want = new Map(); // наш id → true/false
  for (const [army, slugs] of Object.entries(ARMIES)) {
    const F = files[`${army}.json`];
    if (!F) continue;
    const a = compareArmy(F, points, slugs);
    const byId = new Map(F.datasheets.filter((d) => d.group === 'own' && d.faction === F.id).map((d) => [d.id, d]));
    for (const p of a.pairs) {
      const unit = roster.factions[p.siteFaction]?.units.find((x) => x.id === p.siteId);
      const d = byId.get(p.id);
      if (!unit) {
        plan.unmatched.push({ army, id: p.id, name: d.name, site: `${p.siteFaction}/${p.siteId}` });
        continue;
      }
      // вариантов в тексте инфолиста нет, а у конструктора сайта есть — берём его формулировки
      const real = d.options.filter((o) => !/^none\.?$/i.test(o.text.trim()));
      const texts = rosterOptionTexts(roster, unit);
      if (!real.length && texts.length) plan.options.push({ army, id: p.id, name: d.name, source: d.source, texts });
      for (const f of fixesById.get(p.id) ?? []) {
        fixesById.set(p.id, fixesById.get(p.id).filter((x) => x !== f));
        const text = texts.find((t) => t.toLowerCase().includes(f.site.toLowerCase()));
        if (!text) {
          plan.fixErrors.push(`${army}/${d.name}: у конструктора сайта нет варианта «${f.site}»`);
          continue;
        }
        if (d.options.some((o) => o.text === text)) continue; // уже применено
        if (f.replace && !d.options.some((o) => o.text.includes(f.replace))) {
          plan.fixErrors.push(`${army}/${d.name}: нет нашего варианта с «${f.replace}»`);
          continue;
        }
        plan.fixes.push({ army, id: p.id, name: d.name, ...(f.replace ? { replace: f.replace } : { add: true }), text, why: f.why });
      }
      const paid = (unit.dw ?? []).some(([, pts]) => pts > 0);
      want.set(p.id, paid);
      if (paid) {
        // каждый платный стандартный предмет сайта должен быть в нашем стандартном снаряжении
        const priced = new Set(d.costs.flatMap((b) => b.wargear.map((w) => wargearKey(w.label))));
        const ours = new Set(d.defaultLoadout.flatMap((r) => r.items.map((it) => wargearKey(it.weapon))));
        for (const [, list] of siteDefaults(roster, unit))
          for (const [name] of list) if (priced.has(wargearKey(name)) && !ours.has(wargearKey(name))) plan.gaps.push({ army, id: p.id, name: d.name, item: name });
      }
      if (paid && !d.paidDefaults) plan.set.push({ army, id: p.id, name: d.name, dw: unit.dw });
      if (!paid && d.paidDefaults) plan.unset.push({ army, id: p.id, name: d.name });
    }
  }
  for (const [id, rest] of fixesById) for (const f of rest) plan.fixErrors.push(`${f.army}/${id}: инфолист не сопоставлен с сайтом`);
  plan.want = want;
  return plan;
}

/** Применить план: свой инфолист и его копии в других файлах (тот же id). Возвращает число изменённых инфолистов. */
export function applyWargearPlan(files, plan) {
  let changed = 0;
  const opts = new Map(plan.options.map((x) => [x.id, x.texts]));
  for (const F of Object.values(files))
    for (const d of F.datasheets) {
      for (const f of plan.fixes.filter((x) => x.id === d.id)) {
        if (d.options.some((o) => o.text === f.text)) continue;
        const opt = { star: false, text: f.text, source: 'whrules-roster' };
        const i = f.replace ? d.options.findIndex((o) => o.text.includes(f.replace)) : -1;
        if (i >= 0) d.options[i] = opt;
        else if (!f.replace) d.options.push(opt);
        changed++;
      }
      if (opts.has(d.id) && !d.options.some((o) => !/^none\.?$/i.test(o.text.trim()))) {
        d.options = opts.get(d.id).map((text) => ({ star: false, text, source: 'whrules-roster' }));
        changed++;
      }
      if (!plan.want.has(d.id)) continue;
      const paid = plan.want.get(d.id);
      if (!!d.paidDefaults === paid) continue;
      if (paid) d.paidDefaults = true;
      else delete d.paidDefaults;
      changed++;
    }
  return changed;
}

/** Обработчик curated.updates kind «whrules-wargear». u.points — снимок очков для сопоставления. */
export function applyWhrulesWargear(files, roster, u) {
  const plan = planWargear(files, roster, loadSnapshot(u.points), u);
  if (plan.fixErrors.length) throw new Error(`whrules-wargear: rosterOptions — ${plan.fixErrors.join('; ')}`);
  if (plan.gaps.length) throw new Error(`whrules-wargear: платного стандартного предмета нет в стандартном снаряжении — ${plan.gaps.map((g) => `${g.army}/${g.name}: ${g.item}`).join(', ')}`);
  const changed = applyWargearPlan(files, plan);
  return {
    changed,
    lines: [
      `стандартное снаряжение платное (paidDefaults): ${[...plan.want.values()].filter(Boolean).length} инфолистов; варианты из конструктора сайта: ${plan.options.map((x) => x.name).join(', ') || 'нет'}; отдельные варианты (rosterOptions): ${(u.rosterOptions ?? []).length}; изменено записей: ${changed}`,
    ],
  };
}
applyWhrulesWargear.load = loadRoster;

function main() {
  const arg = (k, d) => {
    const i = process.argv.indexOf(k);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const roster = loadRoster(arg('--roster', 'whrules-995-roster.json'));
  const points = loadSnapshot(arg('--points', 'whrules-995.json'));
  const files = Object.fromEntries(fs.readdirSync(path.join(DATA, 'f')).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(fs.readFileSync(path.join(DATA, 'f', f), 'utf8'))]));
  const curated = JSON.parse(fs.readFileSync(path.join(HERE, '..', '40k', 'curated.json'), 'utf8'));
  const u = (curated.updates?.items ?? []).find((x) => x.kind === 'whrules-wargear') ?? {};
  const { want, ...plan } = planWargear(files, roster, points, u);
  console.log(JSON.stringify({ paid: [...want.entries()].filter(([, v]) => v).map(([k]) => k), ...plan }, null, 1));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
