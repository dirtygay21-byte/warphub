#!/usr/bin/env node
/**
 * Отчёт свежести данных 40K: сравнение backend/roster-data со снимком очков wh-rules.ru (схема whrules-points-snapshot/2).
 * Только чтение данных приложения: пишет лишь отчёт.
 *
 *   node scripts/whrules-compare.mjs [--snapshot whrules-995.json] [--out 40k/freshness-report.json]
 *
 * Что сравнивается по каждой армии (только свои инфолисты — group "own"; союзники и копии по детачментам — в своих фракциях):
 *  - инфолисты: сопоставление по slug названия (id сайта или slug его названия), затем по таблице переименований сайта
 *    (renames: старый slug → новый или null — убран). Похожие названия не угадываются: они в unmatched;
 *  - очки: полосы цен сайта переводятся тем же costsOf, что и обновление Space Marines, и сравниваются с нашими
 *    (только размеры отряда; платное снаряжение на сайте не указано). Вид расхождения: points (те же размеры, другая цена),
 *    sizes (другие размеры), tiers (другие ступени цены за копии);
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

/** Канон цен: «1-2: 4=170,5=215 | 3-+: …» — только размеры отряда (models), без снаряжения и доп. моделей. */
export function costKey(bands) {
  return (bands ?? [])
    .map((b) => ({ t: `${b.from}-${b.to ?? '+'}`, o: (b.options ?? []).filter((o) => o.models != null).map((o) => `${o.models}=${o.cost}`).sort((x, y) => parseInt(x) - parseInt(y) || x.localeCompare(y)) }))
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
  for (const s of slugs)
    for (const d of snap.factions[s]?.datasheets ?? []) if (!byId.has(d.id)) byId.set(d.id, { ...d, siteFaction: s });
  const bySlug = new Map();
  for (const d of byId.values()) {
    if (!bySlug.has(d.id)) bySlug.set(d.id, d);
    const k = slugify(d.name);
    if (!bySlug.has(k)) bySlug.set(k, d);
  }
  const renames = {};
  for (const s of slugs) Object.assign(renames, snap.factions[s]?.renames ?? {});
  return { byId, bySlug, renames };
}

/** Сравнение одной армии. ours — данные фракции (f/<id>.json). */
export function compareArmy(ours, snap, slugs, { group = 'own', faction = ours.id } = {}) {
  const { byId, bySlug, renames } = siteIndex(snap, slugs);
  const own = ours.datasheets.filter((d) => d.group === group && d.faction === faction);
  const seen = new Set();
  const r = { pointsChanged: [], sizesChanged: [], tiersChanged: [], legendsChanged: [], renamed: [], removedOnSite: [], outdated: [], otherFactionOnSite: [], legendsNotOnSite: [], unmatched: [], newOnSite: [], noPointsOnSite: [], same: 0 };
  for (const d of own) {
    const slug = slugify(d.name);
    let site = bySlug.get(slug);
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
    seen.add(site.id);
    if (renamedTo) r.renamed.push({ id: d.id, name: d.name, to: renamedTo, siteId: site.id });
    if (!!d.legends !== !!site.legends) r.legendsChanged.push({ id: d.id, name: d.name, ours: !!d.legends, site: !!site.legends });
    if (!site.points.length) {
      r.noPointsOnSite.push({ id: d.id, name: d.name });
      continue;
    }
    const diff = costDiff(d.costs, costsOf(site.points));
    if (!diff) r.same++;
    else r[`${diff.kind}Changed`].push({ id: d.id, name: d.name, siteName: site.name, ours: diff.ours, site: diff.site });
  }
  for (const d of byId.values()) if (!seen.has(d.id)) r.newOnSite.push({ siteId: d.id, name: d.name, faction: d.siteFaction, legends: !!d.legends, points: costKey(costsOf(d.points)) });
  r.counts = { ours: own.length, site: byId.size, matched: seen.size };
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
      else if (x.points != null && x.points !== e.cost) r.enhancements.pointsChanged.push({ detachment: d.name, name: e.name, ours: e.cost, site: x.points });
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
    detachments: det ? { ...det.counts, dp: n(det.dpChanged), newOnSite: n(det.newOnSite), missingOnSite: n(det.missingOnSite), outdated: n(det.outdated) } : null,
    enhancements: det ? { same: det.enhancements.same, points: n(det.enhancements.pointsChanged), newOnSite: n(det.enhancements.newOnSite), missingOnSite: n(det.enhancements.missingOnSite), possibleRenames: n(det.enhancements.possibleRenames), outdated: n(det.enhancements.outdated) } : null,
  };
}

/** Полный отчёт. files — { "<id>.json": данные }, index — index.json. */
export function buildReport(files, index, snap, snapshotFile) {
  // дата нашего источника: обновление из wh-rules (по scope) или выгрузка Wahapedia
  const whrScope = new Map();
  for (const u of index.updates ?? []) for (const id of u.scope ?? []) whrScope.set(id, u.source);
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

/** Короткая сводка по армиям (Markdown). */
export function reportMarkdown(rep) {
  const lines = [
    `# Свежесть данных 40K — wh-rules.ru ${rep.snapshot.dataVersion} (MFM ${rep.snapshot.mfm}, ${rep.snapshot.date})`,
    '',
    `Снимок \`${rep.snapshot.file}\`, fingerprint \`${rep.snapshot.fingerprint.slice(0, 16)}…\`. Наши данные: Wahapedia ${rep.ours.lastUpdate}${rep.ours.updates.map((u) => ` + ${u.id} (${u.scope.join(', ')})`).join('')}.`,
    'Сравниваются только размеры отряда и цены (снаряжения на сайте нет). Отчёт строит scripts/whrules-compare.mjs; данные приложения он не меняет.',
    '',
    '| Армия | Изм. на сайте | Инфолисты наши/сайт | Совпало | Очки | Размеры | Ступени | Legends | Переим. | Новые | Убраны | В др. фракции | Legends/FW нет | Не сопост. | Детачм. новые/нет/DP | Улучш. очки/новые/нет/переим.? |',
    '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
  ];
  for (const [id, a] of Object.entries(rep.armies)) {
    if (a.missingInApp) {
      lines.push(`| ${id} | — | нет в приложении | | | | | | | | | | | | | |`);
      continue;
    }
    const s = a.summary.datasheets;
    const d = a.summary.detachments;
    const e = a.summary.enhancements;
    lines.push(`| ${a.name} | ${a.siteChangesSince.items} | ${s.ours}/${s.site} | ${s.same} | ${s.points} | ${s.sizes} | ${s.tiers} | ${s.legends} | ${s.renamed} | ${s.newOnSite} | ${s.removedOnSite + s.outdated} | ${s.otherFactionOnSite} | ${s.legendsNotOnSite} | ${s.unmatched} | ${d.newOnSite}/${d.missingOnSite}/${d.dp} | ${e.points}/${e.newOnSite}/${e.missingOnSite}/${e.possibleRenames} |`);
  }
  for (const [slug, a] of Object.entries(rep.allies)) {
    const s = a.summary.datasheets;
    lines.push(`| ${slug} (союзник ${a.ourFaction}) | — | ${s.ours}/${s.site} | ${s.same} | ${s.points} | ${s.sizes} | ${s.tiers} | ${s.legends} | ${s.renamed} | ${s.newOnSite} | ${s.removedOnSite + s.outdated} | ${s.otherFactionOnSite} | ${s.legendsNotOnSite} | ${s.unmatched} | — | — |`);
  }
  if (rep.notInApp.length) lines.push('', `Нет в приложении: ${rep.notInApp.join(', ')}.`);
  lines.push(
    '',
    '«Убраны» — инфолисты, которых на сайте больше нет (таблица переименований сайта: null), и наши уже помеченные устаревшими.',
    '«В др. фракции» — наш инфолист есть на сайте, но в другой фракции (например, культовые отряды CSM — у World Eaters, Emperor’s Children и т.д.).',
    '«Legends/FW нет» — наши Legends и Forge World, которых на сайте нет. «Не сопост.» — без пары, требуют проверки вручную.',
    'Детачменты и улучшения: «нет» — наших нет на сайте (уже помеченные устаревшими не считаются); «переим.?» — в том же детачменте',
    'пропало одно наше и появилось одно на сайте с той же ценой (например, «The Ephemeral Tome» → «Ephemeral Tome»): отмечено для проверки, не объединено.',
    '',
  );
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
  if (snap.schema !== 'whrules-points-snapshot/2') throw new Error(`нужен снимок схемы /2 (все фракции), а не ${snap.schema}`);
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
