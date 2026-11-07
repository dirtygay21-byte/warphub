#!/usr/bin/env node
/**
 * Отчёт свежести данных 40K: сравнение backend/roster-data со снимком очков wh-rules.ru (схема whrules-points-snapshot/2 или /3).
 * Только чтение данных приложения: пишет лишь отчёт.
 *
 *   node scripts/whrules-compare.mjs [--snapshot whrules-995.json] [--out 40k/freshness-report.json]
 *
 * Что сравнивается по каждой армии (только свои инфолисты — group "own"; союзники и копии по детачментам — в своих фракциях):
 *  - инфолисты: сопоставление по slug названия (id сайта или slug его названия), затем по таблице переименований сайта
 *    (renames: старый slug → новый или null — убран). Похожие названия не угадываются: они в unmatched;
 *  - очки: полосы цен сайта переводятся тем же costsOf, что и обновление Space Marines, и сравниваются с нашими по размерам
 *    отряда (число моделей, а если его нет — подпись состава: «1 Sword Brother, 4 Neophytes, 5 Initiates»). Вид расхождения:
 *    points (те же размеры, другая цена), sizes (другие размеры), tiers (другие ступени цены за копии);
 *  - платные добавки: запись очков сайта без числа моделей и без пометки (платформа Tidewall Shieldline) ↔ наши addons — по цене;
 *  - платное снаряжение (схема /3, wargearPoints сайта ↔ наши costs[].wargear): та же цена, другая цена, только у нас,
 *    только на сайте; для предметов сайта — считает ли движок их сам по итоговому снаряжению (paidIsAuto) или только счётчиком;
 *    у Space Marines — отдельно цены снаряжения орденов, если у одноимённого инфолиста ордена они другие;
 *  - Legends;
 *  - детачменты (по slug названия): новые, пропавшие, DP; улучшения в сопоставленных детачментах: очки, новые, пропавшие.
 * Space Marines сравниваются с объединением space-marines и пяти орденов (общий юнит — по цене space-marines);
 * свои цены орденов (pointsOverrides) — только счётчиком. Titan Legions — союзники (группа ally:titanicus).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSnapshot } from './updates-40k.mjs';
import { costsOf } from './whrules-convert.mjs';
import { slugify } from './whrules-map.mjs';
import { paidIsAuto } from '../../../client/src/features/roster/engine/compute.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', '..', '..', 'backend', 'roster-data');
export const REPORT_SCHEMA = 'whrules-freshness/1';

/** Армии приложения ↔ фракции сайта. Первая фракция — основная (её цена у общих юнитов). */
export const ARMIES = {
  AS: ['adepta-sororitas'],
  AC: ['adeptus-custodes'],
  AdM: ['adeptus-mechanicus'],
  AE: ['aeldari'],
  AM: ['astra-militarum'],
  CD: ['chaos-daemons'],
  QT: ['chaos-knights'],
  CSM: ['chaos-space-marines'],
  DG: ['death-guard'],
  DRU: ['drukhari'],
  EC: ['emperors-children'],
  GC: ['genestealer-cults'],
  GK: ['grey-knights'],
  AoI: ['imperial-agents'],
  QI: ['imperial-knights'],
  LoV: ['leagues-of-votann'],
  NEC: ['necrons'],
  ORK: ['orks'],
  SM: ['space-marines', 'black-templars', 'blood-angels', 'dark-angels', 'deathwatch', 'space-wolves'],
  TAU: ['tau-empire'],
  TS: ['thousand-sons'],
  TYR: ['tyranids'],
  WE: ['world-eaters'],
};
/** Фракции сайта, которые у нас только союзники: { фракция сайта: [наша фракция инфолистов, группа] }. */
export const ALLY_ONLY = { 'titan-legions': ['TL', 'ally:titanicus'] };

/** Размер отряда для сравнения: число моделей или нормализованная подпись состава (если числа нет). */
const sizeOf = (o) => (o.models != null ? String(o.models) : o.label ? `[${String(o.label).toLowerCase().replace(/\s+/g, ' ').trim()}]` : null);
/** Канон цен: «1-2: 4=170,5=215 | 3-+: …» — только размеры отряда, без снаряжения и доп. моделей. */
export function costKey(bands) {
  return (bands ?? [])
    .map((b) => ({ t: `${b.from}-${b.to ?? '+'}`, o: (b.options ?? []).filter((o) => sizeOf(o) != null).map((o) => `${sizeOf(o)}=${o.cost}`).sort((x, y) => (parseInt(x) || 0) - (parseInt(y) || 0) || x.localeCompare(y)) }))
    .filter((b) => b.o.length)
    .sort((a, b) => a.t.localeCompare(b.t, 'en', { numeric: true }))
    .map((b) => `${b.t}: ${b.o.join(',')}`)
    .join(' | ');
}
/** Вид расхождения цен: null — совпадают. */
export function costDiff(ours, site) {
  const a = costKey(ours);
  const b = costKey(site);
  if (a === b) return null;
  const tiers = (k) => k.split(' | ').map((x) => x.split(':')[0]).join(',');
  const sizes = (k) => k.split(' | ').map((x) => x.replace(/=\d+/g, '')).join(' | ');
  const kind = tiers(a) !== tiers(b) ? 'tiers' : sizes(a) !== sizes(b) ? 'sizes' : 'points';
  return { kind, ours: a, site: b };
}

/** Очки сайта → { bands, addons }: запись без числа моделей и без пометки — платная добавка, а не размер отряда. */
export function siteCosts(points) {
  const isAddon = (p) => p.models == null && !p.note && !p.label;
  return { bands: costsOf(points.filter((p) => !isAddon(p))), addons: points.filter(isAddon).map((p) => p.points) };
}

/** Ключ предмета снаряжения — как в движке (compute.ts → wkey): без регистра, ’ = ', без окончания s/es. */
export const wargearKey = (s) => String(s).toLowerCase().replace(/[’']/g, "'").replace(/e?s$/, '');

/** Сравнение платного снаряжения юнита. ourDs — наш инфолист, siteW — wargearPoints сайта. */
export function compareWargear(ourDs, siteW = []) {
  const ours = new Map();
  for (const b of ourDs.costs ?? []) for (const w of b.wargear ?? []) if (!ours.has(wargearKey(w.label))) ours.set(wargearKey(w.label), w);
  const site = new Map(siteW.map((w) => [wargearKey(w.name), w]));
  const auto = (name) => paidIsAuto(ourDs, name);
  const r = { same: [], priceChanged: [], onlyOurs: [], onlySite: [] };
  for (const [k, w] of ours) {
    const x = site.get(k);
    if (!x) r.onlyOurs.push({ name: w.label, ours: w.cost, unverified: !!w.unverified });
    else if (x.points !== w.cost) r.priceChanged.push({ name: x.name, ours: w.cost, site: x.points, auto: auto(x.name) });
    else r.same.push({ name: x.name, points: x.points, auto: auto(x.name) });
  }
  for (const [k, x] of site) if (!ours.has(k)) r.onlySite.push({ name: x.name, site: x.points, auto: auto(x.name) });
  return r;
}

/** Ключ названия без пометки в скобках: «False Majesty (Aura)» = «False Majesty», «'Ardboyz (Upgrade)» = «'Ardboyz». */
export const bareSlug = (name) => slugify(String(name).replace(/\s*\([^)]*\)/g, '')).replace(/^the-/, '');

/** Где ещё на сайте есть инфолист с этим slug (другая фракция — например, Khorne Berzerkers у World Eaters). */
function elsewhere(snap, slugs, slug) {
  return Object.entries(snap.factions)
    .filter(([s, f]) => !slugs.includes(s) && f.datasheets.some((d) => d.id === slug || slugify(d.name) === slug))
    .map(([s]) => s);
}

/** Инфолисты сайта армии: по id, плюс индекс slug названия. Общий юнит берётся из первой фракции, где он есть. */
function siteIndex(snap, slugs) {
  const byId = new Map();
  // одноимённые инфолисты орденов (тот же id в другой фракции сайта) — для сравнения их цен снаряжения
  const variants = new Map();
  for (const s of slugs)
    for (const d of snap.factions[s]?.datasheets ?? []) {
      if (!byId.has(d.id)) byId.set(d.id, { ...d, siteFaction: s });
      else variants.set(d.id, [...(variants.get(d.id) ?? []), { ...d, siteFaction: s }]);
    }
  const bySlug = new Map();
  for (const d of byId.values()) {
    if (!bySlug.has(d.id)) bySlug.set(d.id, d);
    const k = slugify(d.name);
    if (!bySlug.has(k)) bySlug.set(k, d);
  }
  const renames = {};
  for (const s of slugs) Object.assign(renames, snap.factions[s]?.renames ?? {});
  return { byId, bySlug, renames, variants };
}

/** Сравнение одной армии. ours — данные фракции (f/<id>.json). */
export function compareArmy(ours, snap, slugs, { group = 'own', faction = ours.id } = {}) {
  const { byId, bySlug, renames, variants } = siteIndex(snap, slugs);
  const own = ours.datasheets.filter((d) => d.group === group && d.faction === faction);
  // версия ордена: наш инфолист с источником «Black Templars» сравнивается с инфолистом фракции сайта black-templars
  const factionOfSource = new Map(slugs.map((s) => [String(snap.factions[s]?.name ?? '').toLowerCase(), s]));
  const ownVersion = (d) => {
    const s = factionOfSource.get(String(d.source ?? '').toLowerCase());
    if (!s || s === slugs[0]) return null;
    const slug = slugify(d.name);
    return snap.factions[s].datasheets.find((x) => x.id === slug || slugify(x.name) === slug) ?? null;
  };
  const ourVersions = new Set(own.map((d) => `${slugify(d.name)}|${String(d.source ?? '').toLowerCase()}`));
  const seen = new Set();
  const r = { pointsChanged: [], sizesChanged: [], tiersChanged: [], legendsChanged: [], renamed: [], removedOnSite: [], outdated: [], otherFactionOnSite: [], legendsNotOnSite: [], unmatched: [], newOnSite: [], noPointsOnSite: [], same: 0, pairs: [] };
  const wg = { same: 0, priceChanged: [], onlyOurs: [], onlySite: [], notAuto: [], chapterVariants: [] };
  const addons = { same: 0, changed: [] };
  for (const d of own) {
    const slug = slugify(d.name);
    const ver = ownVersion(d);
    let site = ver ? { ...ver, siteFaction: factionOfSource.get(String(d.source).toLowerCase()) } : bySlug.get(slug);
    let renamedTo = null;
    if (!site && slug in renames) {
      if (renames[slug] === null) {
        (d.outdated ? r.outdated : r.removedOnSite).push({ id: d.id, name: d.name });
        continue;
      }
      site = byId.get(renames[slug]);
      if (site) renamedTo = site.name;
    }
    if (!site) {
      const where = elsewhere(snap, slugs, slug);
      // не на сайте: уже помечен устаревшим; есть в другой фракции сайта; Legends/Forge World, которых на сайте нет; остальное — без догадок
      if (d.outdated) r.outdated.push({ id: d.id, name: d.name });
      else if (where.length) r.otherFactionOnSite.push({ id: d.id, name: d.name, siteFactions: where, source: d.source ?? null });
      else if (d.legends || d.forgeWorld) r.legendsNotOnSite.push({ id: d.id, name: d.name, source: d.source ?? null });
      else r.unmatched.push({ id: d.id, name: d.name, source: d.source ?? null });
      continue;
    }
    seen.add(ver ? `${site.siteFaction}:${site.id}` : site.id);
    r.pairs.push({ id: d.id, siteFaction: site.siteFaction, siteId: site.id });
    if (renamedTo) r.renamed.push({ id: d.id, name: d.name, to: renamedTo, siteId: site.id });
    if (!!d.legends !== !!site.legends) r.legendsChanged.push({ id: d.id, name: d.name, ours: !!d.legends, site: !!site.legends });
    // платное снаряжение: сравнивается у всех сопоставленных, даже без очков отряда
    const w = compareWargear(d, site.wargearPoints);
    wg.same += w.same.length;
    const unitName = ver ? `${d.name} (${d.source})` : d.name;
    for (const x of w.priceChanged) wg.priceChanged.push({ id: d.id, unit: unitName, ...x });
    for (const x of w.onlyOurs) wg.onlyOurs.push({ id: d.id, unit: unitName, ...x });
    for (const x of w.onlySite) wg.onlySite.push({ id: d.id, unit: unitName, ...x });
    for (const x of [...w.same, ...w.priceChanged, ...w.onlySite]) if (!x.auto) wg.notAuto.push({ id: d.id, unit: unitName, name: x.name });
    for (const v of ver ? [] : variants.get(site.id) ?? []) {
      // у нас есть свой инфолист этой версии ордена — он сравнивается отдельно
      if (ourVersions.has(`${slug}|${String(snap.factions[v.siteFaction]?.name ?? '').toLowerCase()}`)) continue;
      const key = (list) => (list ?? []).map((x) => `${wargearKey(x.name)}=${x.points}`).sort().join(',');
      if (key(v.wargearPoints) !== key(site.wargearPoints)) wg.chapterVariants.push({ id: d.id, unit: d.name, faction: v.siteFaction, site: v.wargearPoints ?? [], base: site.wargearPoints ?? [] });
    }
    if (!site.points.length) {
      r.noPointsOnSite.push({ id: d.id, name: d.name });
      continue;
    }
    const sc = siteCosts(site.points);
    const ourAddons = [...new Set((d.costs ?? []).flatMap((b) => (b.addons ?? []).map((a) => a.cost)))].sort().join(',');
    if (ourAddons || sc.addons.length) {
      if (ourAddons === [...new Set(sc.addons)].sort().join(',')) addons.same++;
      else addons.changed.push({ id: d.id, name: d.name, ours: (d.costs ?? []).flatMap((b) => b.addons ?? []), site: sc.addons });
    }
    const diff = costDiff(d.costs, sc.bands);
    if (!diff) r.same++;
    else r[`${diff.kind}Changed`].push({ id: d.id, name: d.name, ...(ver ? { version: d.source } : {}), siteName: site.name, ours: diff.ours, site: diff.site });
  }
  for (const d of byId.values()) if (!seen.has(d.id) && !seen.has(`${d.siteFaction}:${d.id}`)) r.newOnSite.push({ siteId: d.id, name: d.name, faction: d.siteFaction, legends: !!d.legends, points: costKey(siteCosts(d.points).bands), ...(d.wargearPoints ? { wargear: d.wargearPoints } : {}) });
  r.counts = { ours: own.length, site: byId.size, matched: seen.size };
  r.wargear = wg;
  r.addons = addons;
  return r;
}

/** Детачменты и улучшения армии. */
export function compareDetachments(ours, snap, slugs) {
  const site = new Map();
  for (const s of slugs) for (const d of snap.factions[s]?.detachments ?? []) if (!site.has(bareSlug(d.name))) site.set(bareSlug(d.name), { ...d, siteFaction: s });
  const dets = ours.detachments.filter((d) => d.faction === ours.id);
  const r = { dpChanged: [], missingOnSite: [], outdated: [], newOnSite: [], enhancements: { pointsChanged: [], newOnSite: [], missingOnSite: [], outdated: [], possibleRenames: [], same: 0 }, same: 0 };
  const seen = new Set();
  for (const d of dets) {
    const s = site.get(bareSlug(d.name));
    if (!s) {
      (d.outdated ? r.outdated : r.missingOnSite).push({ id: d.id, name: d.name });
      continue;
    }
    seen.add(bareSlug(d.name));
    if (s.dp != null && d.dp !== s.dp) r.dpChanged.push({ id: d.id, name: d.name, ours: d.dp, site: s.dp });
    else r.same++;
    const ourEnh = ours.enhancements.filter((e) => e.detachment === d.id);
    const siteEnh = new Map(s.enhancements.map((e) => [bareSlug(e.name), e]));
    for (const e of ourEnh) {
      const x = siteEnh.get(bareSlug(e.name));
      if (!x) (e.outdated ? r.enhancements.outdated : r.enhancements.missingOnSite).push({ detachment: d.name, name: e.name, ours: e.cost });
      else if (x.points != null && x.points !== e.cost) r.enhancements.pointsChanged.push({ id: e.id, detachment: d.name, name: e.name, ours: e.cost, site: x.points });
      else r.enhancements.same++;
      siteEnh.delete(bareSlug(e.name));
    }
    for (const x of siteEnh.values()) r.enhancements.newOnSite.push({ detachment: d.name, name: x.name, site: x.points });
  }
  for (const [k, s] of site) if (!seen.has(k)) r.newOnSite.push({ siteId: s.id, name: s.name, faction: s.siteFaction, dp: s.dp, enhancements: s.enhancements.length });
  // пара «пропало у нас / новое на сайте» в одном детачменте с той же ценой — возможное переименование: только отмечается
  const E = r.enhancements;
  for (const m of [...E.missingOnSite]) {
    const cands = E.newOnSite.filter((x) => x.detachment === m.detachment && x.site === m.ours);
    const mine = E.missingOnSite.filter((x) => x.detachment === m.detachment && x.ours === m.ours);
    if (cands.length !== 1 || mine.length !== 1) continue;
    E.possibleRenames.push({ detachment: m.detachment, ours: m.name, site: cands[0].name, points: m.ours });
    E.missingOnSite.splice(E.missingOnSite.indexOf(m), 1);
    E.newOnSite.splice(E.newOnSite.indexOf(cands[0]), 1);
  }
  r.counts = { ours: dets.length, site: site.size, matched: seen.size };
  return r;
}

/** Изменения на сайте после даты нашего источника: число записей истории обновлений по фракциям армии. */
export function changesSince(snap, slugs, after) {
  const list = snap.patches.filter((p) => p.date > after);
  return {
    after,
    updates: list.map((p) => p.id),
    items: list.reduce((n, p) => n + slugs.reduce((m, s) => m + (p.counts?.[s] ?? 0), 0), 0),
  };
}

const n = (r) => r.length;
export function summaryOf(a, det) {
  return {
    datasheets: { ...a.counts, same: a.same, points: n(a.pointsChanged), sizes: n(a.sizesChanged), tiers: n(a.tiersChanged), legends: n(a.legendsChanged), renamed: n(a.renamed), newOnSite: n(a.newOnSite), removedOnSite: n(a.removedOnSite), outdated: n(a.outdated), otherFactionOnSite: n(a.otherFactionOnSite), legendsNotOnSite: n(a.legendsNotOnSite), unmatched: n(a.unmatched), noPointsOnSite: n(a.noPointsOnSite) },
    wargear: { same: a.wargear.same, priceChanged: n(a.wargear.priceChanged), onlyOurs: n(a.wargear.onlyOurs), onlySite: n(a.wargear.onlySite), notAuto: n(a.wargear.notAuto), chapterVariants: n(a.wargear.chapterVariants) },
    addons: { same: a.addons.same, changed: n(a.addons.changed) },
    detachments: det ? { ...det.counts, dp: n(det.dpChanged), newOnSite: n(det.newOnSite), missingOnSite: n(det.missingOnSite), outdated: n(det.outdated) } : null,
    enhancements: det ? { same: det.enhancements.same, points: n(det.enhancements.pointsChanged), newOnSite: n(det.enhancements.newOnSite), missingOnSite: n(det.enhancements.missingOnSite), possibleRenames: n(det.enhancements.possibleRenames), outdated: n(det.enhancements.outdated) } : null,
  };
}

/** Полный отчёт. files — { "<id>.json": данные }, index — index.json. */
export function buildReport(files, index, snap, snapshotFile) {
  // дата нашего источника: обновление из wh-rules (по scope) или выгрузка Wahapedia
  const whrScope = new Map();
  // Leader по Warmind — не источник данных wh-rules (версия 1.6 — версия MFM у Warmind)
  for (const u of index.updates ?? []) if (u.kind !== 'warmind-leaders') for (const id of u.scope ?? []) whrScope.set(id, u.source);
  const wahaDate = String(index.lastUpdate ?? '').slice(0, 10);
  const armies = {};
  for (const [id, slugs] of Object.entries(ARMIES)) {
    const f = files[`${id}.json`];
    if (!f) {
      armies[id] = { missingInApp: true, siteFactions: slugs };
      continue;
    }
    const src = whrScope.get(id);
    const a = compareArmy(f, snap, slugs);
    const det = compareDetachments(f, snap, slugs);
    armies[id] = {
      name: f.name,
      siteFactions: slugs,
      ourSource: src ? { site: src.site, dataVersion: src.dataVersion, mfm: src.mfm, date: src.date } : { site: 'wahapedia', date: wahaDate },
      siteChangesSince: changesSince(snap, slugs, src ? src.date : wahaDate),
      summary: summaryOf(a, det),
      datasheets: a,
      detachments: det,
    };
  }
  const allies = {};
  for (const [slug, [fid, group]] of Object.entries(ALLY_ONLY)) {
    const holder = Object.values(files).find((f) => f.datasheets.some((d) => d.faction === fid && d.group === group));
    if (!holder) continue;
    const a = compareArmy(holder, snap, [slug], { group, faction: fid });
    allies[slug] = { ourFaction: fid, group, summary: summaryOf(a, null), datasheets: a };
  }
  const covered = new Set([...Object.values(ARMIES).flat(), ...Object.keys(ALLY_ONLY)]);
  return {
    schema: REPORT_SCHEMA,
    snapshot: { file: snapshotFile, schema: snap.schema, dataVersion: snap.source.dataVersion, mfm: snap.source.mfm, date: snap.source.date, fingerprint: snap.fingerprint },
    ours: { lastUpdate: index.lastUpdate, updates: (index.updates ?? []).map((u) => ({ id: u.id, scope: u.scope, dataVersion: u.source?.dataVersion })) },
    notInApp: Object.keys(snap.factions).filter((s) => !covered.has(s)),
    armies,
    allies,
  };
}

const wgCell = (w) => `${w.same}/${w.priceChanged}/${w.onlyOurs}/${w.onlySite}/${w.notAuto}`;

/** Короткая сводка по армиям (Markdown). */
export function reportMarkdown(rep) {
  const lines = [
    `# Свежесть данных 40K — wh-rules.ru ${rep.snapshot.dataVersion} (MFM ${rep.snapshot.mfm}, ${rep.snapshot.date})`,
    '',
    `Снимок \`${rep.snapshot.file}\`, fingerprint \`${rep.snapshot.fingerprint.slice(0, 16)}…\`. Наши данные: Wahapedia ${rep.ours.lastUpdate}${rep.ours.updates.map((u) => ` + ${u.id} (${u.scope.join(', ')})`).join('')}.`,
    'Сравниваются размеры отряда и цены, платные добавки и платное снаряжение. Отчёт строит scripts/whrules-compare.mjs; данные приложения он не меняет.',
    '',
    '| Армия | Изм. на сайте | Инфолисты наши/сайт | Совпало | Очки | Размеры | Ступени | Legends | Переим. | Новые | Убраны | В др. фракции | Legends/FW нет | Не сопост. | Детачм. новые/нет/DP | Улучш. очки/новые/нет/переим.? | Снаряж. совп./цена/только у нас/только на сайте/не по выбору |',
    '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
  ];
  for (const [id, a] of Object.entries(rep.armies)) {
    if (a.missingInApp) {
      lines.push(`| ${id} | — | нет в приложении | | | | | | | | | | | | | | |`);
      continue;
    }
    const s = a.summary.datasheets;
    const d = a.summary.detachments;
    const e = a.summary.enhancements;
    lines.push(`| ${a.name} | ${a.siteChangesSince.items} | ${s.ours}/${s.site} | ${s.same} | ${s.points} | ${s.sizes} | ${s.tiers} | ${s.legends} | ${s.renamed} | ${s.newOnSite} | ${s.removedOnSite + s.outdated} | ${s.otherFactionOnSite} | ${s.legendsNotOnSite} | ${s.unmatched} | ${d.newOnSite}/${d.missingOnSite}/${d.dp} | ${e.points}/${e.newOnSite}/${e.missingOnSite}/${e.possibleRenames} | ${wgCell(a.summary.wargear)} |`);
  }
  for (const [slug, a] of Object.entries(rep.allies)) {
    const s = a.summary.datasheets;
    lines.push(`| ${slug} (союзник ${a.ourFaction}) | — | ${s.ours}/${s.site} | ${s.same} | ${s.points} | ${s.sizes} | ${s.tiers} | ${s.legends} | ${s.renamed} | ${s.newOnSite} | ${s.removedOnSite + s.outdated} | ${s.otherFactionOnSite} | ${s.legendsNotOnSite} | ${s.unmatched} | — | — | ${wgCell(a.summary.wargear)} |`);
  }
  if (rep.notInApp.length) lines.push('', `Нет в приложении: ${rep.notInApp.join(', ')}.`);
  lines.push(
    '',
    '«Убраны» — инфолисты, которых на сайте больше нет (таблица переименований сайта: null), и наши уже помеченные устаревшими.',
    '«В др. фракции» — наш инфолист есть на сайте, но в другой фракции (например, культовые отряды CSM — у World Eaters, Emperor’s Children и т.д.).',
    '«Legends/FW нет» — наши Legends и Forge World, которых на сайте нет. «Не сопост.» — без пары, требуют проверки вручную.',
    'Детачменты и улучшения: «нет» — наших нет на сайте (уже помеченные устаревшими не считаются); «переим.?» — в том же детачменте',
    'пропало одно наше и появилось одно на сайте с той же ценой (например, «The Ephemeral Tome» → «Ephemeral Tome»): отмечено для проверки, не объединено.',
    'Снаряжение: «не по выбору» — предмета сайта нет ни в вариантах снаряжения, ни в стандартном снаряжении обязательной модели инфолиста: движок посчитает его только ручным счётчиком.',
  );
  // подробности по снаряжению: всё, что расходится
  const wl = [];
  for (const [id, a] of Object.entries(rep.armies)) {
    if (a.missingInApp) continue;
    const w = a.datasheets.wargear;
    const yn = (x) => (x.auto ? 'да' : 'нет');
    for (const x of w.priceChanged) wl.push(`| ${id} | ${x.unit} | ${x.name} | ${x.ours} → ${x.site} | ${yn(x)} |`);
    for (const x of w.onlyOurs) wl.push(`| ${id} | ${x.unit} | ${x.name} | ${x.ours} → нет на сайте${x.unverified ? ' (у нас «не проверено»)' : ''} | — |`);
    for (const x of w.onlySite) wl.push(`| ${id} | ${x.unit} | ${x.name} | нет → ${x.site} | ${yn(x)} |`);
    for (const x of w.chapterVariants) wl.push(`| ${id} | ${x.unit} (${x.faction}) | ${x.site.map((y) => `${y.name} ${y.points}`).join(', ') || '—'} | цена ордена; у space-marines: ${x.base.map((y) => `${y.name} ${y.points}`).join(', ') || '—'} | — |`);
    for (const x of a.datasheets.addons.changed) wl.push(`| ${id} | ${x.name} | добавка | ${x.ours.map((y) => `${y.label} ${y.cost}`).join(', ') || 'нет'} → ${x.site.join(', ') || 'нет'} | — |`);
  }
  if (wl.length) lines.push('', '## Платное снаряжение и добавки: расхождения', '', '| Армия | Юнит | Предмет | Наше → сайт | По выбору замен |', '|---|---|---|---|---|', ...wl);
  lines.push('');
  return lines.join('\n');
}

function main() {
  const arg = (k, d) => {
    const i = process.argv.indexOf(k);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const snapFile = arg('--snapshot', 'whrules-995.json');
  const out = path.resolve(arg('--out', path.join(HERE, '..', '40k', 'freshness-report.json')));
  const snap = loadSnapshot(snapFile);
  if (!['whrules-points-snapshot/2', 'whrules-points-snapshot/3'].includes(snap.schema)) throw new Error(`нужен снимок схемы /2 или /3 (все фракции), а не ${snap.schema}`);
  if (snap.schema !== 'whrules-points-snapshot/3') console.warn('снимок /2: платного снаряжения в нём нет — раздел снаряжения будет пустым');
  const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
  const files = Object.fromEntries(fs.readdirSync(path.join(DATA, 'f')).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(fs.readFileSync(path.join(DATA, 'f', f), 'utf8'))]));
  const rep = buildReport(files, index, snap, snapFile);
  fs.writeFileSync(out, JSON.stringify(rep, null, 1) + '\n');
  const md = reportMarkdown(rep);
  fs.writeFileSync(out.replace(/\.json$/, '.md'), md);
  console.log(md);
  console.log(`→ ${path.relative(process.cwd(), out)} и .md`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
