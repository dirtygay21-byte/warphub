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

// навык: «N/A» и «7+» (TORRENT у wh-rules) — одно и то же: атака попадает автоматически
const sk = (v) => { const x = num(v).replace(/\+$/, ''); return x === '7' || x === '-' ? 'n/a' : x; };
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
  const r = { army, matched: 0, onlyOurs: [], points: [], copies: [], stats: [], weapons: [], leads: [], leadsExtra: [], detachments: [], enhancements: [] };
  for (const d of own) {
    const u = units.get(`${siteOf(d)}|${norm(d.name)}`) ?? slugs.map((s) => units.get(`${s}|${norm(d.name)}`)).find(Boolean);
    if (!u) {
      r.onlyOurs.push(`${d.name}${d.legends ? ' (Legends)' : ''}`);
      continue;
    }
    r.matched++;
    const a = ourPrice(d);
    const b = wmPrice(u);
    // размеры без числа моделей у нас (подписи сайта «1 Sword Brother, 4 Neophytes, 5 Initiates») — сверяются очки:
    // каждая цена Warmind есть среди наших цен этой ступени
    const noModels = (band) => band?.options.length && band.options.every((o) => o.models == null);
    const costsIn = (band, sizes) => Object.values(sizes).every((p) => band.options.some((o) => o.cost === p));
    const later = d.costs?.find((x) => x.from > 1);
    const baseOk = noModels(d.costs?.[0]) ? costsIn(d.costs[0], b.base) : eq(a.base, b.base);
    const copiesOk = !b.copies || (noModels(later) ? later.from === b.copies.from && costsIn(later, b.copies.sizes) : eq(a.copies, b.copies));
    if (!baseOk) r.points.push({ unit: d.name, ours: a.base, warmind: b.base });
    if (!copiesOk) r.copies.push({ unit: d.name, ours: a.copies, warmind: b.copies });
    // характеристики: по подписи профиля, иначе по порядку
    const ws = u.statlines ?? [];
    (d.stats ?? []).forEach((s, i) => {
      // подписи профиля — без учёта множественного числа («Gellerpox Mutants» у нас, «Gellerpox Mutant» у Warmind)
      const one = (t) => norm(t).replace(/s$/, '');
      // подпись короче («Grimaldus» у Warmind, «Chaplain Grimaldus» у нас) — по вхождению
      const w = ws.find((x) => one(x.label) === one(s.name)) ?? ws.find((x) => one(s.name).endsWith(one(x.label)) || one(x.label).endsWith(one(s.name))) ?? (ws.length === (d.stats ?? []).length ? ws[i] : null);
      if (!w) return;
      const k1 = statKey({ M: s.M, T: s.T, Sv: s.Sv, W: s.W, Ld: s.Ld, OC: s.OC });
      const k2 = statKey(w);
      if (k1 !== k2) r.stats.push({ unit: d.name, profile: s.name, ours: k1, warmind: k2 });
    });
    // оружие: каждый наш профиль, у которого есть оружие с тем же названием у Warmind
    // название + вид (у одного оружия бывают дальний и ближний профили с тем же названием)
    const kindOf = (p) => (p.type === 'Melee' ? 'melee' : 'ranged');
    // у Warmind бывает несколько профилей с одним названием (разные модели отряда) — расхождение, если не совпал ни один
    const wmw = new Map();
    for (const w of u.weapons ?? []) wmw.set(`${norm(w.name)}|${w.kind}`, [...(wmw.get(`${norm(w.name)}|${w.kind}`) ?? []), w]);
    for (const w of d.weapons ?? [])
      for (const p of w.profiles ?? []) {
        const xs = wmw.get(`${norm(w.profiles.length > 1 ? p.name : w.name)}|${kindOf(p)}`) ?? wmw.get(`${norm(p.name ?? w.name)}|${kindOf(p)}`);
        if (xs && !xs.some((x) => ourWeaponKey(p) === weaponKey(x))) r.weapons.push({ unit: d.name, weapon: p.name ?? w.name, ours: ourWeaponKey(p), warmind: xs.map(weaponKey).join(' | ') });
      }
    // Leader: названия юнитов
    if (u.attachTo) {
      // сравниваются только действующие инфолисты: цели Legends «*» или которых нет в данных — связь некуда добавить
      const live = new Set(F.datasheets.filter((x) => !x.outdated).map((x) => norm(x.name)));
      const ours = (d.leads ?? []).map((id) => byId.get(id)).filter((x) => x && !x.outdated).map((x) => norm(x.name)).sort();
      const theirs = u.attachTo.map(norm).filter((x) => live.has(x)).sort();
      // наши связи не убираются (решение владельца 07.11.2026: у Warmind список бывает уже) — расхождение, только если
      // у Warmind есть цель, которой нет у нас; лишние наши — в leadsExtra (для сведения)
      const onlyWarmind = theirs.filter((x) => !ours.includes(x));
      const onlyOurs = [...new Set(ours.filter((x) => !theirs.includes(x)))];
      if (onlyWarmind.length) r.leads.push({ unit: d.name, onlyOurs, onlyWarmind });
      else if (onlyOurs.length) r.leadsExtra.push({ unit: d.name, onlyOurs });
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
