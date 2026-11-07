#!/usr/bin/env node
/**
 * Сверка данных 40K с Warmind (решение владельца 07.11.2026: Warmind — вторая сверка цифр; основной источник — wh-rules.ru).
 * Снимок 40k/warmind-11e.json — данные веб-приложения warmind.online (встроены в его скрипт; источник Warmind — BSData
 * wh40k-11e-mfm, Munitorum Field Manual): очки по размерам и за копии, характеристики, оружие, Leader, DP детачментов и очки
 * улучшений. Тексты правил Warmind не сравниваются (у Warmind они местами пересказаны).
 *
 *   bun scripts/warmind-compare.mjs [--army AS,QT]   → 40k/warmind-compare.{json,md}
 *
 * Только чтение: данные приложения не меняются. Сопоставление — по названию (без регистра, апострофов и дефисов) внутри фракции
 * (у Space Marines — фракция ордена по ключевому слову ордена, иначе space-marines).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMIES } from './whrules-compare.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', '..', '..', 'backend', 'roster-data');
const SNAP = path.join(HERE, '..', '40k', 'warmind-11e.json');
const OUT = path.join(HERE, '..', '40k', 'warmind-compare');

export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[’'`‘]/g, '').replace(/[‐-―-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const num = (s) => String(s ?? '').replace(/["”″]/g, '').replace(/\s+/g, '').replace(/^\+/, '').toLowerCase();
const statKey = (s) => ['M', 'T', 'Sv', 'W', 'Ld', 'OC'].map((k) => `${k}${num(s[k])}`).join(' ');
export const CHAPTERS = { 'Black Templars': 'black-templars', 'Blood Angels': 'blood-angels', 'Dark Angels': 'dark-angels', Deathwatch: 'deathwatch', 'Space Wolves': 'space-wolves' };

/** Наши цены: размер → очки первой ступени; за копии — первая ступень с from > 1. */
function ourPrice(d) {
  const b0 = d.costs?.[0];
  const later = d.costs?.find((b) => b.from > 1);
  const sizes = (b) => Object.fromEntries((b?.options ?? []).filter((o) => o.models != null).map((o) => [o.models, o.cost]));
  return { base: sizes(b0), copies: later ? { from: later.from, sizes: sizes(later) } : null };
}
function wmPrice(u) {
  const sizes = (list) => Object.fromEntries((list ?? []).map((p) => [p.models, p.points]));
  return { base: sizes(u.pricing), copies: u.requisition ? { from: u.requisition.from, sizes: sizes(u.requisition.pricing) } : null };
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const sk = (v) => num(v).replace(/\+$/, '');
function weaponKey(w) {
  return [num(w.range ?? ''), num(w.a), sk(w.skill), num(w.s), num(w.ap), num(w.d)].join('/');
}
const ourWeaponKey = (p) => [num(p.type === 'Melee' ? 'melee' : p.range), num(p.A), sk(p.skill), num(p.S), num(p.AP), num(p.D)].join('/');

function compareArmy(army, slugs, wm) {
  const F = JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${army}.json`), 'utf8'));
  const byId = new Map(F.datasheets.map((d) => [d.id, d]));
  const units = new Map();
  for (const s of slugs) for (const u of wm.factions.find((f) => f.id === s)?.units ?? []) if (!units.has(`${s}|${norm(u.name)}`)) units.set(`${s}|${norm(u.name)}`, u);
  const siteOf = (d) => (army === 'SM' ? CHAPTERS[Object.keys(CHAPTERS).find((c) => d.factionKeywords?.includes(c))] ?? 'space-marines' : slugs[0]);
  const own = F.datasheets.filter((d) => d.group === 'own' && d.faction === F.id && !d.outdated);
  const r = { army, matched: 0, onlyOurs: [], points: [], copies: [], stats: [], weapons: [], leads: [], detachments: [], enhancements: [] };
  for (const d of own) {
    const u = units.get(`${siteOf(d)}|${norm(d.name)}`) ?? slugs.map((s) => units.get(`${s}|${norm(d.name)}`)).find(Boolean);
    if (!u) {
      r.onlyOurs.push(`${d.name}${d.legends ? ' (Legends)' : ''}`);
      continue;
    }
    r.matched++;
    const a = ourPrice(d);
    const b = wmPrice(u);
    if (!eq(a.base, b.base)) r.points.push({ unit: d.name, ours: a.base, warmind: b.base });
    if (b.copies && !eq(a.copies, b.copies)) r.copies.push({ unit: d.name, ours: a.copies, warmind: b.copies });
    // характеристики: по подписи профиля, иначе по порядку
    const ws = u.statlines ?? [];
    (d.stats ?? []).forEach((s, i) => {
      // подписи профиля — без учёта множественного числа («Gellerpox Mutants» у нас, «Gellerpox Mutant» у Warmind)
      const one = (t) => norm(t).replace(/s$/, '');
      const w = ws.find((x) => one(x.label) === one(s.name)) ?? (ws.length === (d.stats ?? []).length ? ws[i] : null);
      if (!w) return;
      const k1 = statKey({ M: s.M, T: s.T, Sv: s.Sv, W: s.W, Ld: s.Ld, OC: s.OC });
      const k2 = statKey(w);
      if (k1 !== k2) r.stats.push({ unit: d.name, profile: s.name, ours: k1, warmind: k2 });
    });
    // оружие: каждый наш профиль, у которого есть оружие с тем же названием у Warmind
    // название + вид (у одного оружия бывают дальний и ближний профили с тем же названием)
    const kindOf = (p) => (p.type === 'Melee' ? 'melee' : 'ranged');
    const wmw = new Map((u.weapons ?? []).map((w) => [`${norm(w.name)}|${w.kind}`, w]));
    for (const w of d.weapons ?? [])
      for (const p of w.profiles ?? []) {
        const x = wmw.get(`${norm(w.profiles.length > 1 ? p.name : w.name)}|${kindOf(p)}`) ?? wmw.get(`${norm(p.name ?? w.name)}|${kindOf(p)}`);
        if (x && ourWeaponKey(p) !== weaponKey(x)) r.weapons.push({ unit: d.name, weapon: p.name ?? w.name, ours: ourWeaponKey(p), warmind: weaponKey(x) });
      }
    // Leader: названия юнитов
    if (u.attachTo) {
      const ours = (d.leads ?? []).map((id) => byId.get(id)?.name).filter(Boolean).map(norm).sort();
      const theirs = u.attachTo.map(norm).sort();
      if (!eq([...new Set(ours)], [...new Set(theirs)])) r.leads.push({ unit: d.name, onlyOurs: ours.filter((x) => !theirs.includes(x)), onlyWarmind: theirs.filter((x) => !ours.includes(x)) });
    }
  }
  const dets = slugs.flatMap((s) => wm.factions.find((f) => f.id === s)?.detachments ?? []);
  for (const det of F.detachments.filter((x) => !x.outdated && (army !== 'SM' || true))) {
    const w = dets.find((x) => norm(x.name) === norm(det.name));
    if (!w) continue;
    if (w.dp != null && det.dp != null && w.dp !== det.dp) r.detachments.push({ detachment: det.name, ours: det.dp, warmind: w.dp });
    for (const e of F.enhancements.filter((x) => x.detachment === det.id && !x.outdated)) {
      const we = (w.enhancements ?? []).find((x) => norm(x.name) === norm(e.name));
      if (we && we.points != null && Number(e.cost ?? e.points) !== we.points) r.enhancements.push({ detachment: det.name, enhancement: e.name, ours: e.cost ?? e.points, warmind: we.points });
    }
  }
  return r;
}

function main() {
  const wm = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  const ai = process.argv.indexOf('--army');
  const only = ai >= 0 ? process.argv[ai + 1].split(',') : null;
  const res = Object.entries(ARMIES)
    .filter(([a]) => !only || only.includes(a))
    .map(([a, slugs]) => compareArmy(a, slugs, wm));
  fs.writeFileSync(`${OUT}.json`, JSON.stringify({ schema: 'warmind-compare/1', snapshot: { file: '40k/warmind-11e.json', fingerprint: wm.fingerprint, source: wm.source }, armies: res }, null, 1) + '\n');
  const L = [
    `# Сверка с Warmind — ${wm.source.extractedAt.slice(0, 10)}`,
    '',
    `Снимок \`40k/warmind-11e.json\` (${wm.source.dataSource}; скрипт ${wm.source.bundle}). Сравниваются цифры: очки, очки за копии, характеристики, оружие, Leader, DP и очки улучшений. Строит \`scripts/warmind-compare.mjs\`; данные приложения не меняются.`,
    '',
    '| Армия | Сопост. | Только у нас | Очки | За копии | Характ. | Оружие | Leader | DP | Улучш. |',
    '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
    ...res.map((r) => `| ${r.army} | ${r.matched} | ${r.onlyOurs.length} | ${r.points.length} | ${r.copies.length} | ${r.stats.length} | ${r.weapons.length} | ${r.leads.length} | ${r.detachments.length} | ${r.enhancements.length} |`),
  ];
  fs.writeFileSync(`${OUT}.md`, L.join('\n') + '\n');
  console.log(L.slice(4).join('\n'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
