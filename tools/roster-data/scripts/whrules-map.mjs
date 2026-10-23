#!/usr/bin/env node
/**
 * Сопоставление инфолистов wh-rules.ru с данными приложения (Space Marines, ордена, Imperial Agents). Только чтение.
 *
 *   node scripts/whrules-map.mjs                       — отчёт сопоставления по 40k/whrules-981*.json и backend/roster-data
 *   node scripts/whrules-map.mjs --save-renames <файл> — проверить и сохранить снимок переименований (scripts/whrules-renames.js)
 *   node scripts/whrules-map.mjs --save-full <файл>    — проверить и сохранить полный снимок (scripts/whrules-extract-full.js)
 *
 * Правила (задача SM-0):
 *  - существующие id Wahapedia не меняются никогда; переименованный на сайте инфолист сохраняет свой id;
 *  - сопоставление — по slug названия внутри «своей» фракции сайта: ордена Black Templars, Blood Angels, Dark Angels,
 *    Deathwatch, Space Wolves — по ключевому слову ордена, остальное (в т.ч. 6 малых орденов) — space-marines;
 *  - переименования и снятые инфолисты — только из таблицы сайта (whrules-<версия>-renames.json), без догадок;
 *  - новый инфолист получает предложенный id «whr:<фракция сайта>:<slug>» (детерминированный, без коллизий);
 *  - похожие названия (Sicaran / Sicaran Battle Tank) не сопоставляются, а выносятся в «требует решения».
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { loadSnapshot } from './updates-40k.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = path.join(HERE, '..', '40k');
const DATA = path.join(HERE, '..', '..', '..', 'backend', 'roster-data');
export const RENAMES_SCHEMA = 'whrules-renames/1';
export const CHAPTER_FACTIONS = { 'Black Templars': 'black-templars', 'Blood Angels': 'blood-angels', 'Dark Angels': 'dark-angels', Deathwatch: 'deathwatch', 'Space Wolves': 'space-wolves' };
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** slug как на wh-rules.ru: нижний регистр, апострофы убираются, остальное не буквенно-цифровое — дефис. */
export const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
/** Предложенный id нового инфолиста. */
export const newId = (faction, slug) => `whr:${faction}:${slug}`;

export function checkRenames(r) {
  if (r?.schema !== RENAMES_SCHEMA) throw new Error(`переименования: схема ${r?.schema}, ожидается ${RENAMES_SCHEMA}`);
  for (const k of ['site', 'dataVersion', 'date', 'extractedAt', 'asset', 'assetSha256']) if (r.source?.[k] == null || r.source[k] === '') throw new Error(`переименования: нет source.${k}`);
  const { fingerprint, ...content } = r;
  if (sha256(JSON.stringify(content)) !== fingerprint) throw new Error('переименования: fingerprint не совпадает');
  return r;
}
export const loadRenames = (file, dir = SNAP_DIR) => checkRenames(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));

/** Полный снимок wh-rules (scripts/whrules-extract-full.js): схема, источник, SHA модулей, фракции, fingerprint. */
export const FULL_SCHEMA = 'whrules-full/1';
export const FULL_FACTIONS = ['space-marines', 'black-templars', 'blood-angels', 'dark-angels', 'deathwatch', 'space-wolves', 'imperial-agents'];
/** require — какие фракции обязательны (по умолчанию — 7 фракций обновления Space Marines). */
export function checkFull(r, require = FULL_FACTIONS) {
  if (r?.schema !== FULL_SCHEMA) throw new Error(`полный снимок: схема ${r?.schema}, ожидается ${FULL_SCHEMA}`);
  for (const k of ['site', 'dataVersion', 'mfm', 'date', 'extractedAt']) if (r.source?.[k] == null || r.source[k] === '') throw new Error(`полный снимок: нет source.${k}`);
  if (!r.assets || !Object.values(r.assets).length || !Object.values(r.assets).every((h) => /^[0-9a-f]{64}$/.test(h))) throw new Error('полный снимок: нет SHA-256 модулей источника');
  if (!require.length) throw new Error('полный снимок: не указано, какие фракции обязательны');
  for (const f of require) {
    const x = r.factions?.[f];
    if (!x || !Array.isArray(x.datasheets) || !x.datasheets.length) throw new Error(`полный снимок: нет инфолистов ${f}`);
    if (!Array.isArray(x.detachments)) throw new Error(`полный снимок: нет построений ${f}`);
    for (const k of ['datasheetsFile', 'metaFile']) if (!r.assets[x[k]]) throw new Error(`полный снимок: ${f}.${k} без SHA-256`);
  }
  const { fingerprint, ...content } = r;
  if (sha256(JSON.stringify(content)) !== fingerprint) throw new Error('полный снимок: fingerprint не совпадает');
  return r;
}
export const loadFull = (file, dir = SNAP_DIR, require = FULL_FACTIONS) => checkFull(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), require);
/** Имя файла полного снимка: прежнее для 7 фракций Space Marines, иначе с фракциями в имени. */
export const fullFileName = (r) => {
  const fs_ = Object.keys(r.factions).sort();
  return fs_.join() === [...FULL_FACTIONS].sort().join() ? `whrules-${r.source.dataVersion}-full.json` : `whrules-${r.source.dataVersion}-full-${fs_.join('+')}.json`;
};

/** Фракция сайта для инфолиста приложения (по ключевому слову ордена). */
export const siteFactionOf = (ds) => Object.entries(CHAPTER_FACTIONS).find(([kw]) => ds.factionKeywords.includes(kw))?.[1] ?? 'space-marines';

/**
 * Сопоставление. sm — данные SM.json, aoi — AoI.json, others — остальные файлы фракций (для копий Imperial Agents).
 * Возвращает объект только с данными (без функций), порядок детерминированный.
 */
export function mapSpaceMarines(snapshot, renames, sm, aoi, others = []) {
  const own = sm.datasheets.filter((d) => d.group === 'own');
  const ourBy = new Map(); // "<фракция>|<slug>" → [инфолист]
  for (const d of own) {
    const k = `${siteFactionOf(d)}|${slugify(d.name)}`;
    ourBy.set(k, [...(ourBy.get(k) ?? []), d]);
  }
  const ref = (d) => ({ id: d.id, name: d.name, faction: siteFactionOf(d), legends: d.legends, source: d.source });
  const site = (f, w) => ({ faction: f, id: w.id, name: w.name, legends: w.legends });
  const out = { matched: [], renamed: [], new: [], removed: [], unmatched: [], ambiguous: [], review: [] };
  const usedOurs = new Set();
  const siteFactions = Object.keys(snapshot.factions).filter((f) => f !== 'imperial-agents');
  for (const f of siteFactions) {
    const ren = renames.renames[f] ?? {};
    const renamedTo = new Map(Object.entries(ren).filter(([, v]) => v).map(([from, to]) => [to, from]));
    for (const w of snapshot.factions[f].datasheets) {
      if (slugify(w.name) !== w.id) out.review.push({ kind: 'slug', site: site(f, w), note: `slug сайта ${w.id} ≠ slug названия ${slugify(w.name)}` });
      const direct = ourBy.get(`${f}|${w.id}`) ?? [];
      const from = renamedTo.get(w.id);
      const viaRename = from ? (ourBy.get(`${f}|${from}`) ?? []) : [];
      const cands = [...direct, ...viaRename];
      if (cands.length > 1) {
        out.ambiguous.push({ site: site(f, w), ours: cands.map(ref) });
        continue;
      }
      if (cands.length === 1) {
        const d = cands[0];
        if (usedOurs.has(d.id)) {
          out.ambiguous.push({ site: site(f, w), ours: [ref(d)], note: 'инфолист приложения уже сопоставлен' });
          continue;
        }
        usedOurs.add(d.id);
        (direct.length ? out.matched : out.renamed).push({ site: site(f, w), ours: ref(d), ...(direct.length ? {} : { from }) });
        continue;
      }
      out.new.push({ site: site(f, w), proposedId: newId(f, w.id) });
    }
  }
  for (const d of own) {
    if (usedOurs.has(d.id)) continue;
    const f = siteFactionOf(d);
    const s = slugify(d.name);
    if ((renames.renames[f] ?? {})[s] === null) out.removed.push({ ours: ref(d), siteSlug: s });
    else out.unmatched.push({ ours: ref(d), siteSlug: s });
  }
  // похожие названия: новый на сайте и снятый/несопоставленный у нас в той же фракции — решает человек
  for (const n of out.new)
    for (const r of [...out.removed, ...out.unmatched])
      if (r.ours.faction === n.site.faction && (r.siteSlug.startsWith(n.site.id + '-') || n.site.id.startsWith(r.siteSlug + '-')))
        out.review.push({ kind: 'similar', site: n.site, ours: r.ours, note: `новый «${n.site.name}» и «${r.ours.name}» (${r.ours.id}) — одно и то же? Таблица переименований сайта этого не говорит` });

  // Imperial Agents: инфолисты сайта ↔ AoI.json; копии в других фракциях (группа ally:agents)
  const aoiOwn = aoi.datasheets.filter((d) => d.group === 'own');
  const aoiBy = new Map(aoiOwn.map((d) => [slugify(d.name), d]));
  const agents = { matched: [], new: [], unmatched: [], copies: {} };
  const usedAoi = new Set();
  for (const w of snapshot.factions['imperial-agents']?.datasheets ?? []) {
    const d = aoiBy.get(w.id);
    if (d) {
      usedAoi.add(d.id);
      agents.matched.push({ site: site('imperial-agents', w), ours: { id: d.id, name: d.name, legends: d.legends } });
    } else agents.new.push({ site: site('imperial-agents', w), proposedId: newId('imperial-agents', w.id) });
  }
  for (const d of aoiOwn) if (!usedAoi.has(d.id)) agents.unmatched.push({ id: d.id, name: d.name, legends: d.legends });
  for (const fd of [sm, ...others])
    for (const d of fd.datasheets) if (d.group === 'ally:agents') (agents.copies[d.id] ??= []).push(fd.id);
  for (const k of Object.keys(agents.copies)) agents.copies[k].sort();
  out.agents = agents;
  return out;
}

/**
 * Сопоставление одной фракции сайта с армией приложения (для полной конвертации любой фракции, задача P1-T4).
 * snapshot — снимок очков схемы /3 (там же таблица переименований сайта), slug — фракция сайта, army — данные армии
 * (f/<id>.json, свои инфолисты: group "own" и faction = id). Правила те же, что у Space Marines:
 *  - существующие id не меняются; переименованный на сайте инфолист сохраняет свой id;
 *  - сопоставление — по slug названия (id сайта или slug его названия), затем по таблице переименований сайта;
 *  - новый инфолист получает «whr:<фракция сайта>:<slug>»;
 *  - похожие названия (новый на сайте и пропавший у нас) не сопоставляются, а выносятся в review — решает человек.
 * Детачменты и улучшения — по названию без пометки в скобках и артикля The (kept / new / removed).
 */
export function mapFaction(snapshot, slug, army) {
  const sf = snapshot.factions[slug];
  if (!sf) throw new Error(`сопоставление: в снимке нет фракции ${slug}`);
  const ren = sf.renames ?? {};
  const renamedTo = new Map(Object.entries(ren).filter(([, v]) => v).map(([from, to]) => [to, from]));
  const own = army.datasheets.filter((d) => d.group === 'own' && d.faction === army.id);
  const ourBy = new Map();
  for (const d of own) ourBy.set(slugify(d.name), [...(ourBy.get(slugify(d.name)) ?? []), d]);
  const ref = (d) => ({ id: d.id, name: d.name, legends: !!d.legends, ...(d.outdated ? { outdated: true } : {}) });
  const site = (w) => ({ faction: slug, id: w.id, name: w.name, legends: !!w.legends });
  const out = { matched: [], renamed: [], new: [], removed: [], unmatched: [], ambiguous: [], review: [] };
  const used = new Set();
  for (const w of sf.datasheets) {
    const direct = [...(ourBy.get(w.id) ?? []), ...(slugify(w.name) !== w.id ? (ourBy.get(slugify(w.name)) ?? []) : [])];
    const from = renamedTo.get(w.id);
    const viaRename = from ? (ourBy.get(from) ?? []) : [];
    const cands = [...new Set([...direct, ...viaRename])];
    if (cands.length > 1) {
      out.ambiguous.push({ site: site(w), ours: cands.map(ref) });
      continue;
    }
    if (cands.length === 1 && !used.has(cands[0].id)) {
      used.add(cands[0].id);
      (direct.length ? out.matched : out.renamed).push({ site: site(w), ours: ref(cands[0]), ...(direct.length ? {} : { from }) });
      continue;
    }
    out.new.push({ site: site(w), proposedId: newId(slug, w.id) });
  }
  for (const d of own) {
    if (used.has(d.id)) continue;
    const s = slugify(d.name);
    if (ren[s] === null) out.removed.push({ ours: ref(d), siteSlug: s });
    else out.unmatched.push({ ours: ref(d), siteSlug: s });
  }
  for (const n of out.new)
    for (const r of [...out.removed, ...out.unmatched]) {
      const a = r.siteSlug;
      const b = n.site.id;
      const words = (x) => new Set(x.split('-'));
      const common = [...words(a)].filter((w) => w.length > 3 && words(b).has(w));
      if (common.length) out.review.push({ kind: 'similar', site: n.site, ours: r.ours, note: `новый «${n.site.name}» и «${r.ours.name}» (${r.ours.id}): общие слова ${common.join(', ')} — одно и то же? Таблица переименований сайта этого не говорит` });
    }
  // детачменты и улучшения
  const bare = (n) => slugify(String(n).replace(/\s*\([^)]*\)/g, '')).replace(/^the-/, '');
  const dets = army.detachments.filter((d) => d.faction === army.id);
  const siteDets = new Map(sf.detachments.map((d) => [bare(d.name), d]));
  const detachments = { kept: [], new: [], removed: [] };
  const seenDet = new Set();
  for (const d of dets) {
    const s = siteDets.get(bare(d.name));
    if (!s) {
      detachments.removed.push({ id: d.id, name: d.name, ...(d.outdated ? { outdated: true } : {}) });
      continue;
    }
    seenDet.add(bare(d.name));
    const ourEnh = army.enhancements.filter((e) => e.detachment === d.id);
    const siteEnh = new Map((s.enhancements ?? []).map((e) => [bare(e.name), e]));
    const enh = { kept: [], new: [], removed: [] };
    for (const e of ourEnh) {
      const x = siteEnh.get(bare(e.name));
      if (x) enh.kept.push({ id: e.id, name: e.name, ours: e.cost, site: x.points ?? null });
      else enh.removed.push({ id: e.id, name: e.name, ours: e.cost, ...(e.outdated ? { outdated: true } : {}) });
      siteEnh.delete(bare(e.name));
    }
    for (const x of siteEnh.values()) enh.new.push({ name: x.name, site: x.points ?? null });
    detachments.kept.push({ id: d.id, name: d.name, site: s.id, dp: [d.dp, s.dp ?? null], enhancements: enh });
  }
  for (const [k, s] of siteDets) if (!seenDet.has(k)) detachments.new.push({ site: s.id, name: s.name, dp: s.dp ?? null, enhancements: (s.enhancements ?? []).map((e) => ({ name: e.name, points: e.points ?? null })) });
  out.detachments = detachments;
  out.counts = { ours: own.length, site: sf.datasheets.length, matched: out.matched.length, renamed: out.renamed.length, new: out.new.length, removed: out.removed.length, unmatched: out.unmatched.length, ambiguous: out.ambiguous.length, review: out.review.length };
  return out;
}

/** Пояснение к пометке «*» у инфолиста, которого нет в собранном снимке (client: engine/source.ts → OUTDATED_NOTE). */
export const outdatedText = (source) => `* Данные устарели — инфолист не обновлён: его нет в собранном источнике wh-rules.ru (версия ${source.dataVersion}).`;

/**
 * План перевода Space Marines на источник (задача SM-3): стратегия id, таблица замен для сохранённых ростеров
 * и список инфолистов без покрытия источником. Только вычисление — данные не меняются.
 *
 * Стратегия id:
 *  - сопоставленные (в т.ч. переименованные) инфолисты сохраняют прежний id — сохранённые ростеры не затрагиваются;
 *  - новые инфолисты получают whr:<фракция сайта>:<slug> (newId);
 *  - объединённые (несколько прежних → один на сайте, решение SM-0: Sicaran) — прежние id переводятся на новый (merged);
 *  - копии ордена, которые орден теперь берёт из общих инфолистов Space Marines (sharedUnitIds) — переводятся
 *    на общий инфолист (shared);
 *  - инфолисты без покрытия источником остаются доступными и помечаются «*» (outdated), без замены.
 * keepPicks: false — варианты снаряжения у нового инфолиста другие; выбранные замены откладываются и показываются
 * игроку (client: engine/migrate.ts). Конвертер (SM-4) может выставить true, если варианты совпали дословно.
 */
export function planSpaceMarines(map, full, sm, decisions = { merged: { sicaran: ['Sicaran Arcus', 'Sicaran Battle Tank', 'Sicaran Omega', 'Sicaran Punisher', 'Sicaran Venator'] }, keepSeparate: ['000003875'] }) {
  const src = `wh-rules ${full.source.dataVersion} (MFM ${full.source.mfm}, ${full.source.date})`;
  const ourIdOf = new Map([...map.matched, ...map.renamed].map((x) => [`${x.site.faction}|${x.site.id}`, x.ours.id]));
  const idOfSite = (f, id) => ourIdOf.get(`${f}|${id}`) ?? newId(f, id);
  const datasheets = {};
  const add = (from, m) => {
    if (datasheets[from]) throw new Error(`план SM: две замены для ${from}`);
    datasheets[from] = m;
  };
  const leftovers = [...map.removed, ...map.unmatched];
  // объединённые инфолисты
  for (const [siteId, names] of Object.entries(decisions.merged)) {
    const target = idOfSite('space-marines', siteId);
    const site = full.factions['space-marines'].datasheets.find((d) => d.id === siteId);
    if (!site) throw new Error(`план SM: на сайте нет ${siteId}`);
    for (const r of leftovers.filter((x) => names.includes(x.ours.name) && x.ours.faction === 'space-marines'))
      add(r.ours.id, { to: target, reason: 'merged', note: `«${r.ours.name}» объединён в инфолист «${site.name}» (${src}).`, keepPicks: false });
  }
  // копии ордена → общий инфолист Space Marines
  for (const r of leftovers) {
    if (datasheets[r.ours.id] || decisions.keepSeparate.includes(r.ours.id) || r.ours.faction === 'space-marines') continue;
    const shared = full.factions[r.ours.faction]?.sharedUnitIds ?? [];
    if (!shared.includes(r.siteSlug)) continue;
    const target = ourIdOf.get(`space-marines|${r.siteSlug}`);
    if (!target) throw new Error(`план SM: общий инфолист ${r.siteSlug} не сопоставлен`);
    add(r.ours.id, { to: target, reason: 'shared', note: `Орден использует общий инфолист Space Marines «${r.ours.name}» (${src}).`, keepPicks: false });
  }
  for (const [from, m] of Object.entries(datasheets)) if (m.to === from || datasheets[m.to]) throw new Error(`план SM: цепочка или цикл замен ${from} → ${m.to}`);
  // без покрытия источником: остаются, помечаются «*»
  const sel = (d) => sm.datasheets.find((x) => x.id === d.ours.id);
  const outdated = leftovers
    .filter((r) => !datasheets[r.ours.id])
    .map((r) => ({ id: r.ours.id, name: r.ours.name, faction: r.ours.faction, legends: !!sel(r)?.legends, forgeWorld: !!sel(r)?.forgeWorld, siteSlug: r.siteSlug, removedOnSite: map.removed.includes(r) }))
    .sort((a, b) => a.faction.localeCompare(b.faction) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    source: src,
    keep: [...map.matched, ...map.renamed].length,
    newIds: map.new.map((x) => x.proposedId),
    migrations: { source: src, datasheets: Object.fromEntries(Object.entries(datasheets).sort()), detachments: {}, enhancements: {} },
    outdated,
    outdatedNote: outdatedText(full.source),
  };
}

function main() {
  const args = process.argv.slice(2);
  const full = args.indexOf('--save-full');
  if (full >= 0) {
    // файл: JSON снимка или base64 от gzip (window.__whrulesFullGz)
    const raw = fs.readFileSync(args[full + 1], 'utf8').trim();
    const json = raw.startsWith('{') ? raw : zlib.gunzipSync(Buffer.from(raw, 'base64')).toString('utf8');
    const parsed = JSON.parse(json);
    const r = checkFull(parsed, Object.keys(parsed.factions ?? {}));
    const out = path.join(SNAP_DIR, fullFileName(r));
    fs.writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
    console.log(`полный снимок wh-rules ${r.source.dataVersion} (MFM ${r.source.mfm}, ${r.source.date}), fingerprint ${r.fingerprint.slice(0, 16)}… → ${path.relative(process.cwd(), out)}`);
    return;
  }
  const at = args.indexOf('--save-renames');
  if (at >= 0) {
    const r = checkRenames(JSON.parse(fs.readFileSync(args[at + 1], 'utf8')));
    const out = path.join(SNAP_DIR, `whrules-${r.source.dataVersion}-renames.json`);
    fs.writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
    console.log(`переименования wh-rules ${r.source.dataVersion} (${r.source.date}), fingerprint ${r.fingerprint.slice(0, 16)}… → ${path.relative(process.cwd(), out)}`);
    return;
  }
  const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, 'f', f), 'utf8'));
  const fi = args.indexOf('--faction');
  if (fi >= 0) {
    // bun scripts/whrules-map.mjs --faction adeptus-custodes --army AC [--snapshot whrules-995.json] — сопоставление одной фракции
    const slug = args[fi + 1];
    const army = args[args.indexOf('--army') + 1];
    const snapFile = args.includes('--snapshot') ? args[args.indexOf('--snapshot') + 1] : 'whrules-995.json';
    const snap = loadSnapshot(snapFile);
    const m = mapFaction(snap, slug, load(`${army}.json`));
    const out = path.join(SNAP_DIR, `whrules-${snap.source.dataVersion}-map-${slug}.json`);
    fs.writeFileSync(out, JSON.stringify({ schema: 'whrules-map/1', snapshot: { file: snapFile, fingerprint: snap.fingerprint }, faction: slug, army, ...m }, null, 1) + '\n');
    console.log(JSON.stringify(m.counts));
    console.log(`→ ${path.relative(process.cwd(), out)}`);
    return;
  }
  const others = fs.readdirSync(path.join(DATA, 'f')).filter((f) => f.endsWith('.json') && f !== 'SM.json' && f !== 'AoI.json').sort().map(load);
  const m = mapSpaceMarines(loadSnapshot('whrules-981.json'), loadRenames('whrules-981-renames.json'), load('SM.json'), load('AoI.json'), others);
  console.log(JSON.stringify(m, null, 1));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
