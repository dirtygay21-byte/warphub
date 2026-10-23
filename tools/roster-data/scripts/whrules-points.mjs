#!/usr/bin/env node
/**
 * Обновление 40K kind «whrules-points» (40k/curated.json → updates; применяет scripts/updates-40k.mjs → apply40kUpdates):
 * значения из снимка очков wh-rules.ru (схема whrules-points-snapshot/3) поверх данных приложения — без смены id,
 * профилей, оружия и правил. Сопоставление — та же функция, что и отчёт свежести (whrules-compare.mjs → compareArmy,
 * compareDetachments), поэтому отчёт и обновление не расходятся.
 *
 * Что меняется (только у сопоставленных записей):
 *  - цены отряда (points) и ступени цены за копии (tiers); размеры отряда (sizes) — никогда: это смена состава, её делает
 *    полная конвертация. Подписи размеров и названия снаряжения берутся наши, если размер/предмет тот же, — сохранённые
 *    ростеры хранят размер по подписи (unit.size) и ручной счётчик снаряжения по названию (unit.wargear);
 *  - Legends; DP детачментов; очки улучшений (точное совпадение названия; «возможные переименования» не трогаются);
 *  - платное снаряжение: список = wargearPoints сайта (цена сайта, пометка unverified снимается); нашего предмета
 *    на сайте нет — он убирается; добавки (addons) остаются как есть. Сайт не говорит, с какой копии платится снаряжение
 *    («+5, за штуку»); в данных Wahapedia все 70 платных предметов были только в последней ступени цены за копии
 *    (Killsaw — с 3-й Meganobz). Решение владельца 2026-10-23: снаряжение — только в последней ступени (у юнита без
 *    ступеней — в единственной); так же исправляются предметы, которые обновление 981 разнесло по всем ступеням.
 * Копии юнита в других файлах (союзники — тот же id; инфолисты детачментов — то же название и те же прежние цены)
 * получают те же значения; цены союзника Agents of the Imperium (ally:agents) не трогаются никогда.
 * Ограничение по армии: u.only = { "<армия>": ["points", "tiers", "legends", "wargear", "dp", "enhancements"] } —
 * у этой армии меняется только перечисленное (Adeptus Custodes: только points — остальное в полной конвертации).
 *
 *   bun scripts/whrules-points.mjs [--snapshot whrules-995.json] [--out 40k/whrules-points-applied.json]
 *     — план обновления на текущих данных (что изменится и что пропущено), данные не меняет.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSnapshot } from './updates-40k.mjs';
import { WHRULES_APPLIERS as CONVERT_APPLIERS } from './whrules-convert.mjs';
import { ARMIES, compareArmy, compareDetachments, siteCosts, wargearKey } from './whrules-compare.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', '..', '..', 'backend', 'roster-data');
export const KINDS = ['points', 'tiers', 'legends', 'wargear', 'dp', 'enhancements'];
const AGENTS = 'ally:agents';

const sizeKey = (o) => (o.models != null ? `m:${o.models}` : `l:${String(o.label ?? '').toLowerCase().replace(/\s+/g, ' ').trim()}`);
const json = (x) => JSON.stringify(x);

/** Снаряжение — только в последней ступени цены (см. решение в шапке). */
export const placeWargear = (bands, wargear) => bands.map((b, i) => ({ ...b, wargear: i === bands.length - 1 ? wargear.map((w) => ({ ...w })) : [] }));

/** Новые полосы цен из очков сайта с нашими подписями размеров, добавками и (новым) снаряжением. */
export function rebuildCosts(ourCosts, sitePoints, wargear) {
  const ourOpts = new Map();
  for (const b of ourCosts ?? []) for (const o of b.options ?? []) if (!ourOpts.has(sizeKey(o))) ourOpts.set(sizeKey(o), o);
  const addons = [];
  for (const b of ourCosts ?? []) for (const a of b.addons ?? []) if (!addons.some((x) => x.label === a.label)) addons.push({ ...a });
  const bands = siteCosts(sitePoints).bands.map((b) => ({
    from: b.from,
    to: b.to,
    options: b.options.map((o) => {
      const mine = ourOpts.get(sizeKey(o));
      if (!mine) throw new Error(`whrules-points: размер «${o.label}» без пары в наших ценах — это смена состава, не цены`);
      return { ...mine, cost: o.cost };
    }),
    addons: addons.map((a) => ({ ...a })),
    wargear: [],
  }));
  return placeWargear(bands, wargear);
}

/** Снаряжение по сайту с нашими названиями (если предмет тот же). */
export function siteWargear(ourCosts, siteW = []) {
  const ours = new Map();
  for (const b of ourCosts ?? []) for (const w of b.wargear ?? []) if (!ours.has(wargearKey(w.label))) ours.set(wargearKey(w.label), w.label);
  return siteW.map((w) => ({ label: ours.get(wargearKey(w.name)) ?? w.name, cost: w.points }));
}
const wargearOf = (costs) => {
  const seen = new Map();
  for (const b of costs ?? []) for (const w of b.wargear ?? []) if (!seen.has(w.label)) seen.set(w.label, w);
  return [...seen.values()];
};

/**
 * План обновления: files — { "<id>.json": данные }, snap — снимок /3. Ничего не меняет.
 * Возвращает { units: [...], detachments, enhancements, copies, skipped } — по одной записи на изменяемое значение.
 */
export function planPoints(files, snap, u = {}) {
  if (snap.schema !== 'whrules-points-snapshot/3') throw new Error(`whrules-points: нужен снимок схемы /3, а не ${snap.schema}`);
  const allowed = (army, kind) => !u.only?.[army] || u.only[army].includes(kind);
  const plan = { units: [], detachments: [], enhancements: [], skipped: [] };
  for (const [army, slugs] of Object.entries(ARMIES)) {
    const F = files[`${army}.json`];
    if (!F) continue;
    const a = compareArmy(F, snap, slugs);
    const det = compareDetachments(F, snap, slugs);
    const pairOf = new Map(a.pairs.map((p) => [p.id, snap.factions[p.siteFaction].datasheets.find((x) => x.id === p.siteId)]));
    const byId = new Map(F.datasheets.filter((d) => d.group === 'own' && d.faction === F.id).map((d) => [d.id, d]));
    const changes = new Map();
    const want = (id) => {
      if (!changes.has(id)) changes.set(id, { army, id, name: byId.get(id).name, kinds: [] });
      return changes.get(id);
    };
    for (const kind of ['points', 'tiers']) {
      for (const x of a[`${kind}Changed`]) {
        if (!allowed(army, kind)) {
          plan.skipped.push({ army, id: x.id, name: x.name, kind, why: `армия ${army}: только ${u.only[army].join(', ')}` });
          continue;
        }
        Object.assign(want(x.id), { costs: true, before: x.ours, after: x.site });
        want(x.id).kinds.push(kind);
      }
    }
    for (const x of a.sizesChanged) plan.skipped.push({ army, id: x.id, name: x.name, kind: 'sizes', why: 'другие размеры отряда — смена состава, полная конвертация', before: x.ours, after: x.site });
    for (const x of a.legendsChanged) {
      if (!allowed(army, 'legends')) {
        plan.skipped.push({ army, id: x.id, name: x.name, kind: 'legends', why: `армия ${army}: только ${u.only[army].join(', ')}` });
        continue;
      }
      Object.assign(want(x.id), { legends: x.site });
      want(x.id).kinds.push('legends');
    }
    // снаряжение: у каждого сопоставленного юнита, где наш список (цены, состав, пометка «не проверено») не совпадает с сайтом
    for (const [id, site] of pairOf) {
      const d = byId.get(id);
      const now = wargearOf(d.costs);
      const next = siteWargear(d.costs, site.wargearPoints);
      const key = (list) => list.map((w) => `${w.label}=${w.cost}${w.unverified ? '?' : ''}`).sort().join(',');
      // и состав, и размещение по ступеням (только последняя) должны совпадать
      const placed = (costs) => json((costs ?? []).map((b) => (b.wargear ?? []).map((w) => `${w.label}=${w.cost}${w.unverified ? '?' : ''}`).sort()));
      if (key(now) === key(next) && placed(d.costs) === placed(placeWargear(d.costs, next))) continue;
      if (!allowed(army, 'wargear')) {
        plan.skipped.push({ army, id, name: d.name, kind: 'wargear', why: `армия ${army}: только ${u.only[army].join(', ')}`, before: key(now), after: key(next) });
        continue;
      }
      Object.assign(want(id), { wargear: next, wargearBefore: placed(d.costs), wargearAfter: placed(placeWargear(d.costs, next)) });
      want(id).kinds.push('wargear');
    }
    for (const c of changes.values()) {
      const site = pairOf.get(c.id);
      c.siteFaction = snap.factions[Object.keys(snap.factions).find((s) => snap.factions[s].datasheets.includes(site))]?.name ?? null;
      c.sitePoints = site.points;
      plan.units.push(c);
    }
    for (const x of det.dpChanged) {
      if (!allowed(army, 'dp')) plan.skipped.push({ army, id: x.id, name: x.name, kind: 'dp', why: `армия ${army}: только ${u.only[army].join(', ')}` });
      else plan.detachments.push({ army, id: x.id, name: x.name, before: x.ours, after: x.site });
    }
    for (const x of det.enhancements.pointsChanged) {
      if (!allowed(army, 'enhancements')) plan.skipped.push({ army, id: x.id, name: x.name, kind: 'enhancements', why: `армия ${army}: только ${u.only[army].join(', ')}` });
      else plan.enhancements.push({ army, id: x.id, detachment: x.detachment, name: x.name, before: x.ours, after: x.site });
    }
  }
  return plan;
}

/** Применить план к files (в памяти). Возвращает { changed, copies, lines }. */
export function applyPlan(files, plan) {
  let changed = 0;
  const copies = [];
  const ambiguous = [];
  // прежние цены всех исходных юнитов — для поиска копий инфолистов детачментов (то же название и те же цены)
  const originals = [];
  for (const F of Object.values(files)) for (const d of F.datasheets) if (d.group === 'own' && d.faction === F.id) originals.push({ F, d, costs: json(d.costs) });
  const updated = new Map();
  for (const c of plan.units) {
    const F = files[`${c.army}.json`];
    const d = F.datasheets.find((x) => x.id === c.id && x.group === 'own' && x.faction === F.id);
    const old = { costs: json(d.costs), legends: d.legends };
    const wargear = c.wargear ?? wargearOf(d.costs).map(({ unverified: _u, ...w }) => w);
    if (c.costs) d.costs = rebuildCosts(d.costs, c.sitePoints, wargear);
    else if (c.wargear) d.costs = placeWargear(d.costs, wargear);
    if (c.legends !== undefined) d.legends = c.legends;
    changed += c.kinds.length;
    updated.set(d, old);
  }
  // копии: тот же id в другом файле (союзники) — кроме ally:agents; то же название и прежние цены (инфолисты детачментов)
  for (const F of Object.values(files)) {
    for (const x of F.datasheets) {
      if (x.group === 'own' && x.faction === F.id) continue;
      if (x.group === AGENTS) continue;
      let src = [...updated.keys()].filter((d) => d.id === x.id);
      if (!src.length) {
        const same = originals.filter((o) => o.d.name.toLowerCase() === x.name.toLowerCase() && o.costs === json(x.costs));
        src = same.map((o) => o.d).filter((d) => updated.has(d));
        // одинаковое название и цены у нескольких исходных, а новые значения разные — не угадываем
        if (src.length && new Set(same.map((o) => json([o.d.costs, o.d.legends]))).size > 1) {
          ambiguous.push({ file: F.id, id: x.id, name: x.name });
          continue;
        }
      }
      if (!src.length) continue;
      const d = src[0];
      if (json(x.costs) === json(d.costs) && x.legends === d.legends) continue;
      x.costs = structuredClone(d.costs);
      x.legends = d.legends;
      copies.push({ file: F.id, group: x.group, id: x.id, name: x.name });
    }
  }
  for (const x of plan.detachments) {
    const det = files[`${x.army}.json`].detachments.find((d) => d.id === x.id);
    if (det.dp !== x.after) (det.dp = x.after), changed++;
  }
  for (const x of plan.enhancements) {
    for (const F of Object.values(files)) for (const e of F.enhancements) if (e.id === x.id && e.cost !== x.after) (e.cost = x.after), changed++;
  }
  return { changed, copies, ambiguous };
}

/** Обработчик curated.updates kind «whrules-points». Повторный запуск ничего не меняет (план пуст). */
export function applyWhrulesPoints(files, snap, u) {
  const plan = planPoints(files, snap, u);
  const res = applyPlan(files, plan);
  if (res.ambiguous.length) throw new Error(`whrules-points: неоднозначные копии — ${res.ambiguous.map((x) => `${x.file}/${x.name}`).join(', ')}`);
  const lines = [
    `значений: ${res.changed} (юнитов ${plan.units.length}, детачментов ${plan.detachments.length}, улучшений ${plan.enhancements.length}), копий в других файлах: ${res.copies.length}`,
  ];
  if (plan.skipped.length) lines.push(`пропущено: ${plan.skipped.length} (размеры отряда и ограничения u.only — см. 40k/whrules-points-applied.json)`);
  return { changed: res.changed + res.copies.length, lines };
}

/** Все обработчики обновлений 40K: полная конвертация (whrules-faction) и значения (whrules-points). */
export const WHRULES_APPLIERS = { ...CONVERT_APPLIERS, 'whrules-points': applyWhrulesPoints };

function main() {
  const arg = (k, d) => {
    const i = process.argv.indexOf(k);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const snapFile = arg('--snapshot', 'whrules-995.json');
  const out = path.resolve(arg('--out', path.join(HERE, '..', '40k', 'whrules-points-applied.json')));
  const curated = JSON.parse(fs.readFileSync(path.join(HERE, '..', '40k', 'curated.json'), 'utf8'));
  const u = (curated.updates?.items ?? []).find((x) => x.kind === 'whrules-points' && x.snapshot === snapFile) ?? {};
  const snap = loadSnapshot(snapFile);
  const files = Object.fromEntries(fs.readdirSync(path.join(DATA, 'f')).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(fs.readFileSync(path.join(DATA, 'f', f), 'utf8'))]));
  const plan = planPoints(files, snap, u);
  const res = applyPlan(structuredClone(files), plan);
  const strip = ({ sitePoints: _p, wargear: _w, ...c }) => c;
  const report = {
    schema: 'whrules-points-applied/1',
    snapshot: { file: snapFile, dataVersion: snap.source.dataVersion, mfm: snap.source.mfm, date: snap.source.date, fingerprint: snap.fingerprint },
    update: u.id ?? null,
    only: u.only ?? null,
    summary: { units: plan.units.length, values: res.changed, detachments: plan.detachments.length, enhancements: plan.enhancements.length, copies: res.copies.length, skipped: plan.skipped.length, ambiguous: res.ambiguous.length },
    units: plan.units.map(strip),
    detachments: plan.detachments,
    enhancements: plan.enhancements,
    copies: res.copies,
    skipped: plan.skipped,
    ambiguous: res.ambiguous,
  };
  fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify(report.summary));
  console.log(`→ ${path.relative(process.cwd(), out)}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
