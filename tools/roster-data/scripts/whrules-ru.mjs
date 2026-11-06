#!/usr/bin/env node
/**
 * Русские тексты 40K с wh-rules.ru (решение владельца 01.11.2026): снимок и сопоставление с данными приложения. Тексты — как на
 * сайте, ничего не переводится вручную; чего нет на сайте — остаётся по-английски и попадает в отчёт.
 *
 *   node scripts/whrules-ru.mjs --save <файл>  — проверить снимок (scripts/whrules-extract-ru.js: JSON или gzip+base64) по fingerprint
 *                                               и сохранить 40k/whrules-<версия>-ru.json;
 *   node scripts/whrules-ru.mjs --report       — покрытие: сколько текстов приложения находится на сайте по-русски
 *                                               → 40k/ru-coverage.{json,md};
 *   node scripts/whrules-ru.mjs --apply        — русские тексты для приложения → backend/roster-data/ru/<id фракции>.json
 *                                               (оверлей поверх f/<id>.json: показ по-русски, английский — запасной).
 *                                               Чего нет на сайте — перевод WarpHub (40k/ru-warphub/, scripts/ru-warphub.mjs, ru-warphub-lib.mjs;
 *                                               решение владельца 06.11.2026), с пометкой src: "warphub"; сайт важнее.
 *
 * Сопоставление (только по названиям, как на сайте):
 *  - фракция: slug названия (Orks → orks); Space Marines: ордена по ключевому слову ордена, остальное — space-marines;
 *  - инфолист: slug названия внутри фракции сайта (затем — любой фракции сайта: союзники, общие юниты); способность: английское название = ключ abilities на сайте;
 *  - детачмент: название = en.detachments[i].name → русские тексты faction.detachments[i] (тот же порядок на сайте);
 *    стратагема и улучшение — по названию внутри детачмента; армейское правило — по названию.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { CHAPTER_FACTIONS, slugify } from './whrules-map.mjs';
import { mergeWarphub, readTranslation } from './ru-warphub-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, '40k');
const DATA = path.resolve(ROOT, '..', '..', 'backend', 'roster-data');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const norm = (s) => String(s ?? '').toLowerCase().replace(/[’'`]/g, "'").replace(/\s+/g, ' ').trim();

export function readRuSnapshot(file) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  const text = raw.startsWith('{') ? raw : zlib.gunzipSync(Buffer.from(raw, 'base64')).toString('utf8');
  const r = JSON.parse(text);
  if (r.schema !== 'whrules-ru/1') throw new Error(`русский снимок: схема ${r.schema}`);
  const { fingerprint, ...content } = r;
  if (sha256(JSON.stringify(content)) !== fingerprint) throw new Error('русский снимок: fingerprint не совпадает');
  return r;
}

export function latestRuSnapshot() {
  const files = fs.readdirSync(DIR).filter((f) => /^whrules-\d+-ru\.json$/.test(f));
  if (!files.length) throw new Error('нет снимка 40k/whrules-<версия>-ru.json — сначала --save');
  const file = files.sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1])).at(-1);
  return { file, snap: readRuSnapshot(path.join(DIR, file)) };
}

/** Фракция сайта для инфолиста приложения: ордена — по ключевому слову ордена (если инфолист есть у ордена), иначе фракция. */
export function siteFactionsFor(faction, ds) {
  const own = slugify(faction.name);
  const chapter = (ds?.factionKeywords ?? []).map((k) => CHAPTER_FACTIONS[k]).find(Boolean);
  return chapter ? [chapter, own] : [own];
}

/** Разделы русского инфолиста на сайте, где лежат тексты способностей. */
const SECTIONS = ['abilities', 'wargear', 'wargearAbilities', 'special', 'specialAbilities', 'rules', 'abilitySets'];
/** Название без пометок в скобках: «The Fiery Heart (Aura)» = «The Fiery Heart», «Ammo Runts (Once per battle, per unit)» = «Ammo Runts». */
const bare = (s) => norm(s).replace(/\s*\([^)]*\)\s*/g, ' ').trim();

/**
 * Русский текст способности инфолиста: у большинства фракций строка, у Necrons — { name, text }; набор на выбор (abilitySets,
 * «Temple Relics») — { options: { название: текст } } → варианты строками «**название:** текст».
 */
export const ruAbility = (v) =>
  v == null
    ? null
    : typeof v === 'string'
      ? { text: v }
      : v.options && typeof v.options === 'object'
        ? { text: Object.entries(v.options).map(([n, t]) => `**${n}:** ${t}`).join('\n\n') }
        : { name: v.name ?? null, text: v.text ?? null };

/**
 * Армейское правило на сайте — основной текст и разделы «### English | Русское» с остальными правилами фракции
 * (у Orks: Da Boss, Unstable Energies, Special Move Types). Разделы сопоставляются с отдельными правилами приложения.
 */
export function splitArmyRule(body) {
  const parts = body.split(/\n(?=### )/);
  const sections = [];
  for (const p of parts.slice(1)) {
    const m = p.match(/^### (.+?)(?:\s*\|\s*(.+))?\n([\s\S]*)$/);
    if (m) sections.push({ en: m[1].trim(), ru: m[2]?.trim() ?? null, text: m[3].trim() });
  }
  return { main: parts[0].trim(), sections };
}

/** Русская подпись стратагемы как на wh-rules.ru (подписи КОГДА / ЦЕЛЬ / ЭФФЕКТ / ОГРАНИЧЕНИЯ — из интерфейса сайта). */
export function stratagemText(s) {
  return [
    s.when && `КОГДА: ${s.when}`,
    s.target && `ЦЕЛЬ: ${s.target}`,
    s.effect && `ЭФФЕКТ: ${s.effect}`,
    s.restrictions && `ОГРАНИЧЕНИЯ: ${s.restrictions}`,
    s.extraCost && s.extraCost,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Русские тексты одной фракции приложения: оверлей (что показывать по-русски), что нашлось и чего нет.
 * Оверлей — по id приложения: rules (армейские правила и ссылки на них), datasheets (способности по английскому названию,
 * снаряжение, варианты, лидер, транспорт, повреждения), detachments (название и правила), stratagems, enhancements.
 */
export function matchFaction(snap, faction) {
  const site = (slug) => snap.factions[slug] ?? null;
  const own = site(slugify(faction.name));
  const ru = { rules: {}, datasheets: {}, detachments: {}, stratagems: {}, enhancements: {} };
  const out = { ru, missing: { factions: [], datasheets: [], abilities: [], detachments: [], detRules: [], stratagems: [], enhancements: [], armyRules: [] }, counts: {} };
  const count = (k, ok) => {
    const c = (out.counts[k] ??= { total: 0, ru: 0 });
    c.total++;
    if (ok) c.ru++;
  };
  if (!own) out.missing.factions.push(faction.name);
  // армейские правила сайта — всех фракций: на инфолистах есть чужие (Dark Pacts у всех фракций Хаоса, Assigned Agents у Империума)
  const armyRules = new Map();
  for (const x of Object.values(snap.factions)) {
    if (!x?.en?.armyRule || !x.faction?.armyRule?.body) continue;
    const { main, sections } = splitArmyRule(x.faction.armyRule.body);
    armyRules.set(norm(x.en.armyRule.name), { name: x.faction.armyRuleNameRu ?? null, text: main });
    for (const sec of sections) if (!armyRules.has(norm(sec.en))) armyRules.set(norm(sec.en), { name: sec.ru, text: sec.text });
  }
  const ruleRu = (id) => {
    const r = faction.rules?.[id];
    const hit = r && armyRules.get(norm(r.name));
    if (hit) ru.rules[id] = hit;
    return !!hit;
  };

  // инфолисты и их способности
  for (const ds of faction.datasheets) {
    const slug = slugify(ds.name);
    // своя фракция (и орден), затем — любая фракция сайта: союзники и общие юниты (Imperial Agents, Deathwatch у Space Marines…)
    const owner = [...siteFactionsFor(faction, ds), ...Object.keys(snap.factions)].find((s) => site(s)?.datasheets?.[slug]);
    const hit = owner ? site(owner).datasheets[slug] : null;
    count('datasheets', !!hit);
    if (!hit) {
      out.missing.datasheets.push(ds.name);
      continue;
    }
    const names = site(owner).abilityNamesRu ?? {};
    const abil = {};
    // на сайте тексты инфолиста по разделам: abilities, wargear (снаряжение), special (ауры и т. п.), rules (ATTACHED UNIT…)
    const sections = Object.entries(hit).filter(([k, v]) => SECTIONS.includes(k) && v && typeof v === 'object' && !Array.isArray(v));
    for (const a of ds.abilities) {
      if (a.type === 'core') continue; // основные способности — глоссарий (раздел 24)
      if (a.type === 'faction') {
        // ссылка на армейское правило (Waaagh!, Acts of Faith): текст — армейское правило
        count('factionAbilities', a.ref ? ruleRu(a.ref) : armyRules.has(norm(a.name)));
        continue;
      }
      let found = null;
      for (const [, sec] of sections) {
        const key = Object.keys(sec).find((k) => bare(k) === bare(a.name));
        if (key) {
          const v = ruAbility(sec[key]);
          const nameKey = Object.keys(names).find((k) => bare(k) === bare(a.name));
          found = { ...(v.name || nameKey ? { name: v.name ?? names[nameKey] } : {}), text: v.text };
          break;
        }
      }
      count('abilities', !!found?.text);
      if (found?.text) abil[a.name] = found;
      else out.missing.abilities.push(`${ds.name}: ${a.name}`);
    }
    const entry = {
      ...(Object.keys(abil).length ? { abilities: abil } : {}),
      ...(hit.loadout ? { loadout: hit.loadout } : {}),
      ...(hit.options?.length ? { options: hit.options } : {}),
      ...(hit.leader?.text ? { leader: hit.leader.text } : {}),
      ...(hit.transport ? { transport: hit.transport } : {}),
      ...(ds.damaged && hit.damaged?.text ? { damaged: hit.damaged.text } : {}),
    };
    if (Object.keys(entry).length) ru.datasheets[ds.id] = entry;
  }

  // детачменты, правила, стратагемы, улучшения: детачмент ищется у фракции и у орденов (Space Marines)
  const siteDets = [own, ...Object.values(CHAPTER_FACTIONS).map(site)]
    .filter((s) => s?.en && s.faction?.detachments)
    .flatMap((s) => s.en.detachments.map((d, i) => ({ en: d, ru: s.faction.detachments[i], names: s.faction })));
  const detOf = new Map();
  for (const d of faction.detachments) {
    const sd = siteDets.find((x) => norm(x.en.name) === norm(d.name));
    count('detachments', !!sd);
    if (!sd) {
      out.missing.detachments.push(d.name);
      for (const a of d.abilities ?? []) {
        count('detRules', false);
        out.missing.detRules.push(`${d.name}: ${a.name}`);
      }
      continue;
    }
    detOf.set(d.id, sd);
    const det = { ...(sd.names.detNamesRu?.[sd.en.name] ? { name: sd.names.detNamesRu[sd.en.name] } : {}), rules: {} };
    for (const a of d.abilities ?? []) {
      // правило детачмента: одно на детачмент на сайте; совпадение по названию правила
      const ok = !!(sd.ru?.rule?.body && norm(sd.en.rule) === norm(a.name));
      count('detRules', ok);
      if (ok) det.rules[a.id] = { ...(sd.names.detRuleNamesRu?.[sd.en.rule] ? { name: sd.names.detRuleNamesRu[sd.en.rule] } : {}), text: sd.ru.rule.body };
      else out.missing.detRules.push(`${d.name}: ${a.name}`);
    }
    if (!Object.keys(det.rules).length) delete det.rules;
    if (Object.keys(det).length) ru.detachments[d.id] = det;
  }
  for (const s of faction.stratagems) {
    if (!s.detachment) continue; // общие стратагемы основных правил — отдельно
    const sd = detOf.get(s.detachment);
    const i = sd ? sd.en.stratagems.findIndex((n) => norm(n) === norm(s.name)) : -1;
    const st = i >= 0 ? sd.ru?.stratagems?.[i] : null;
    count('stratagems', !!st);
    if (st) ru.stratagems[s.id] = { ...(sd.names.stratNamesRu?.[sd.en.stratagems[i]] ? { name: sd.names.stratNamesRu[sd.en.stratagems[i]] } : {}), text: stratagemText(st) };
    else out.missing.stratagems.push(s.name);
  }
  for (const e of faction.enhancements) {
    const sd = detOf.get(e.detachment);
    const i = sd ? sd.en.enhancements.findIndex((n) => norm(n) === norm(e.name)) : -1;
    const en = i >= 0 ? sd.ru?.enhancements?.[i] : null;
    count('enhancements', !!en?.body);
    if (en?.body) ru.enhancements[e.id] = { ...(sd.names.enhNamesRu?.[sd.en.enhancements[i]] ? { name: sd.names.enhNamesRu[sd.en.enhancements[i]] } : {}), text: en.body };
    else out.missing.enhancements.push(e.name);
  }
  for (const id of faction.armyRules ?? []) {
    const ok = ruleRu(id);
    count('armyRules', ok);
    if (!ok) out.missing.armyRules.push(faction.rules?.[id]?.name ?? id);
  }
  return out;
}

const LABELS = { datasheets: 'Инфолисты', abilities: 'Способности инфолистов', factionAbilities: 'Ссылки на армейское правило', armyRules: 'Армейские правила', detachments: 'Детачменты', detRules: 'Правила детачментов', stratagems: 'Стратагемы детачментов', enhancements: 'Улучшения' };

function report() {
  const { file, snap } = latestRuSnapshot();
  const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
  const factions = {};
  const total = {};
  for (const f of index.factions) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${f.id}.json`), 'utf8'));
    const m = matchFaction(snap, data);
    const w = mergeWarphub(data, m.ru, readTranslation(f.id));
    factions[f.id] = {
      name: f.name,
      counts: m.counts,
      missing: Object.fromEntries(Object.entries(m.missing).filter(([, v]) => v.length)),
      ...(w.applied || w.stale.length || w.unknown.length ? { warphub: { applied: w.applied, stale: w.stale, unknown: w.unknown } } : {}),
    };
    for (const [k, c] of Object.entries(m.counts)) {
      total[k] ??= { total: 0, ru: 0 };
      total[k].total += c.total;
      total[k].ru += c.ru;
    }
  }
  const out = { schema: 'warphub-ru-coverage/1', snapshot: { file: `tools/roster-data/40k/${file}`, fingerprint: snap.fingerprint, source: snap.source }, total, factions };
  fs.writeFileSync(path.join(DIR, 'ru-coverage.json'), JSON.stringify(out, null, 1) + '\n');
  const pct = (c) => (c.total ? Math.round((100 * c.ru) / c.total) : 100);
  const lines = [
    `# Русские тексты 40K с wh-rules.ru — покрытие`,
    ``,
    `Снимок: \`${file}\` (версия данных ${snap.source.dataVersion}, MFM ${snap.source.mfm}, ${snap.source.date}). Тексты — как на сайте; чего нет — остаётся по-английски.`,
    ``,
    `| Что | Есть по-русски | Всего | % |`,
    `|---|---|---|---|`,
    ...Object.entries(LABELS).map(([k, l]) => `| ${l} | ${total[k]?.ru ?? 0} | ${total[k]?.total ?? 0} | ${pct(total[k] ?? { total: 0, ru: 0 })} |`),
    ``,
    `## По фракциям (%)`,
    ``,
    `| Фракция | ${Object.values(LABELS).join(' | ')} |`,
    `|---|${Object.keys(LABELS).map(() => '---').join('|')}|`,
    ...Object.values(factions).map((f) => `| ${f.name} | ${Object.keys(LABELS).map((k) => (f.counts[k] ? `${pct(f.counts[k])} (${f.counts[k].total - f.counts[k].ru} нет)` : '—')).join(' | ')} |`),
    ``,
    `Списки того, чего нет на сайте, — в \`ru-coverage.json\` (поле missing у каждой фракции).`,
    ``,
    `## Перевод WarpHub (тексты, которых нет на wh-rules.ru)`,
    ``,
    `| Фракция | Переводов применено | Устарели (английский изменился) | Неизвестные id |`,
    `|---|---|---|---|`,
    ...Object.values(factions)
      .filter((f) => f.warphub)
      .map((f) => `| ${f.name} | ${f.warphub.applied} | ${f.warphub.stale.length} | ${f.warphub.unknown.length} |`),
    ``,
  ];
  fs.writeFileSync(path.join(DIR, 'ru-coverage.md'), lines.join('\n'));
  console.log(lines.slice(4, 4 + 2 + Object.keys(LABELS).length).join('\n'));
}

/** Оверлеи приложения: backend/roster-data/ru/<id фракции>.json (схема warphub-ru/1). Только русские тексты сайта; английское — в f/. */
export function buildOverlays(snap, file) {
  const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
  const source = { ...snap.source, snapshot: `tools/roster-data/40k/${file}`, fingerprint: snap.fingerprint };
  const out = {};
  for (const f of index.factions) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${f.id}.json`), 'utf8'));
    const { ru } = matchFaction(snap, data);
    mergeWarphub(data, ru, readTranslation(f.id));
    out[f.id] = { schema: 'warphub-ru/1', faction: f.id, source, ...Object.fromEntries(Object.entries(ru).filter(([, v]) => Object.keys(v).length)) };
  }
  return out;
}

function apply() {
  const { file, snap } = latestRuSnapshot();
  const dir = path.join(DATA, 'ru');
  fs.mkdirSync(dir, { recursive: true });
  for (const old of fs.readdirSync(dir)) if (old.endsWith('.json')) fs.rmSync(path.join(dir, old));
  let bytes = 0;
  for (const [id, o] of Object.entries(buildOverlays(snap, file))) {
    const text = JSON.stringify(o) + '\n';
    bytes += text.length;
    fs.writeFileSync(path.join(dir, `${id}.json`), text);
  }
  console.log(`оверлеи ru/: ${fs.readdirSync(dir).length} фракций, ${(bytes / 1024).toFixed(0)} КБ (из ${file})`);
}

const args = process.argv.slice(2);
if (args[0] === '--save') {
  const r = readRuSnapshot(args[1]);
  const out = path.join(DIR, `whrules-${r.source.dataVersion}-ru.json`);
  fs.writeFileSync(out, JSON.stringify(r) + '\n');
  console.log(`русский снимок wh-rules ${r.source.dataVersion} (MFM ${r.source.mfm}, ${r.source.date}): фракций ${Object.keys(r.factions).length}; fingerprint ${r.fingerprint.slice(0, 16)}… → ${path.relative(process.cwd(), out)}`);
} else if (args[0] === '--report') report();
else if (args[0] === '--apply') apply();
else if (import.meta.main) console.log('usage: node scripts/whrules-ru.mjs --save <файл> | --report | --apply');
