#!/usr/bin/env node
/**
 * Импорт Wahapedia Export Data (Age of Sigmar 4) → JSON для AoS-части Roster Builder.
 *
 *   node scripts/import-wahapedia-aos.mjs --src ./wahapedia-aos-csv --out ../../backend/roster-data/aos
 *
 * Кроме CSV читает два проверенных вручную файла из tools/roster-data/aos/:
 *   curated.json     — сезон таблиц (Scourge of Ghyran истёк, Scourge of Aqshy действует) и очки опций,
 *                      которых нет в выгрузке (построения, улучшения, лоры, террейн) — из Battle Profiles GW, июль 2026;
 *   eligibility.json — кому можно давать улучшения из таблиц с особыми условиями.
 *
 * Всё, что не удалось однозначно разобрать, печатается в отчёте (и пишется в import-report.json) —
 * ничего не додумывается. Без внешних зависимостей. Данные: powered by Wahapedia.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, htmlToText, cleanWahaText, rawIncomplete } from './import-wahapedia.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILES = [
  'Factions', 'Faction_abilities', 'Faction_ability_subtypes', 'Faction_ability_types', 'Last_update', 'Source', 'Warscrolls',
  'Warscrolls_abilities', 'Warscrolls_bases', 'Warscrolls_keywords', 'Warscrolls_organisation', 'Warscrolls_RoRfactions', 'Warscrolls_weapons',
];
const UNIVERSAL = 'EnS'; // «Endless Spells» — универсальные лоры манифестаций, не отдельная армия
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const ALLIANCES = ['ORDER', 'CHAOS', 'DEATH', 'DESTRUCTION'];
/**
 * Выгрузка Wahapedia AoS обрезает поле description на 1024 символах HTML (68 способностей варскроллов и 112 правил
 * фракций в выгрузке от 25.08.2026 упираются ровно в этот лимит, у 40K лимита нет). Такие правила помечаются
 * incomplete: 'truncated', интерфейс показывает предупреждение и ссылку на полный текст.
 */
const AOS_TEXT_CAP = 1024;
const CORE_TABLES = new Set(['Battle Formations', 'Heroic Traits', 'Artefacts of Power', 'Spell Lore', 'Prayer Lore', 'Manifestation Lore', 'Monstrous Traits']);

// ---------- общие помощники ----------
export const norm = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[‐‑–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const up = (s) => norm(s).toUpperCase();
const int = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
const text = (html) => htmlToText(String(html ?? '').replace(/ /g, ' '));
function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
const byLine = (a, b) => (int(a.line) ?? 0) - (int(b.line) ?? 0);

// ---------- заметки Battle Profiles ----------
/**
 * Разбор колонки notes: Legends, сезонные профили, «может присоединиться к полку как …», «только в полку …»,
 * «1 отряд на каждый …», «не больше N … в полку не-… героя», «нельзя вместе с …», «только в Army of Renown».
 * rest — то, что осталось неразобранным (должно быть пусто или только справочные фразы).
 */
export function parseNotes(html, dataDate, seasonInfo = {}) {
  let s = text(html).replace(/\s+/g, ' ').trim();
  const out = {
    legends: false, legendsDate: null, season: null, joinAs: [], joinLeaders: [], onlyIn: [], perUnitOf: null,
    regimentCap: null, requiresInRegiment: null, exclusiveWith: [], aorOnly: null, previously: null, freeSlot: false,
    noOtherUnique: false, reinforceSingle: false, rest: '',
  };
  const take = (re, fn) => {
    s = s.replace(re, (...m) => (fn(...m), ' '));
  };
  take(/This unit will move to Warhammer Legends on (\d{1,2}) (\w+) (\d{4})\.?/gi, (_, d, mo, y) => {
    const iso = `${y}-${String(MONTHS[mo.toLowerCase()] ?? 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    out.legendsDate = iso;
    if (iso <= dataDate) out.legends = true;
  });
  take(/Legends Warscroll\.?/gi, () => (out.legends = true));
  take(/This unit cannot be reinforced\.?/gi, () => {});
  take(/T?his unit is legal for Matched Play for battles fought using the\s+General.?s Handbook (\d{4})-(\d{2,4}) battlepack\.?/gi, (_, y) => {
    out.season = Object.entries(seasonInfo).find(([, v]) => v?.handbook === y)?.[0] ?? 'season-' + y;
  });
  take(/This HERO regiment as can join an eligible ([^.]+?)\./gi, (_, t) => out.joinAs.push(norm(t)));
  take(/This (?:HERO|Hero) can join (?:an )?eligible regiment as (?:an? )?(.+?)(?:\.|(?=This |You |$))/g, (_, t) => out.joinAs.push(norm(t)));
  take(/This (?:HERO|Hero) can join (?:an? )?(.+?) regiment\.?/g, (_, t) => {
    for (const n of t.split(/,\s*|\s+or\s+/)) out.joinLeaders.push(norm(n.replace(/['’]s?$/, '')));
  });
  take(/This unit can only be taken in (?:an? )?(.+?) Army of Renown\.?/gi, (_, t) => (out.aorOnly = t.trim()));
  take(/This unit can only be taken in a regiment that contains an? (.+?) unit and no other (.+?)\.(?=\s|$)/gi, (_, a, b) => {
    out.requiresInRegiment = { name: norm(a), noOther: norm(b) };
  });
  take(/This unit can only be taken in (.+?)['’]s? regiment\.?/gi, (_, t) => {
    for (const n of t.split(/,\s*|\s+or\s+/)) out.onlyIn.push(norm(n));
  });
  take(/You can include (\d+) units? of this type for each (.+?) in your army\.?/gi, (_, n, t) => (out.perUnitOf = { per: +n, name: norm(t) }));
  take(/You cannot include more than (\d+) (.+?) in a regiment led by a non-(\S+) Hero\.?/gi, (_, n, phrase, kw) => {
    out.regimentCap = { max: +n, phrase: up(phrase), unlessLeader: up(kw) };
  });
  take(/You cannot include this unit and (.+?) in the same army\.?/gi, (_, t) => out.exclusiveWith.push(norm(t)));
  take(/This unit does not count towards the number of friendly units that can accompany a HERO\.?/gi, () => (out.freeSlot = true));
  take(/This unit cannot be included in an army with any other UNIQUE units\.?/gi, () => (out.noOtherUnique = true));
  take(/This unit can be reinforced even though it has a minimum unit size of 1\.?/gi, () => (out.reinforceSingle = true));
  take(/Previously (.+?)(?:\.|$)/gi, (_, t) => (out.previously = t.trim()));
  take(/\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*mm/gi, () => {});
  out.rest = s.replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');
  return out;
}

// ---------- варианты полка (regiment options) ----------
/**
 * «0-1 %id Plague Scion%, Any %id DAEMON%» → [{q:'max1'|'any'|'maxN', required, label, alts}]
 * «0-1 %id Eternus% or %id Ruinous Champion%» — один слот на выбор: alts = ['Eternus','Ruinous Champion'].
 */
export function parseOptionTokens(raw) {
  const s = String(raw ?? '').replace(/\u00a0/g, ' ').trim();
  if (!s || /^none$/i.test(s)) return [];
  const out = [];
  if (s.includes('%')) {
    // делим по запятым вне %…%
    const parts = [];
    let cur = '';
    let inside = false;
    for (const ch of s) {
      if (ch === '%') inside = !inside;
      if (ch === ',' && !inside) {
        parts.push(cur);
        cur = '';
      } else cur += ch;
    }
    parts.push(cur);
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      const qty = p.match(/^(Any|\d+-\d+|\d+)\s+/i)?.[1];
      const alts = [...p.matchAll(/%\d*(.*?)%/g)].map((m) => text(m[1]).trim()).filter(Boolean);
      if (!alts.length) continue;
      const required = /\(required\)/i.test(p) || qty === '1';
      const q = !qty ? 'max1' : /^any$/i.test(qty) ? 'any' : qty === '0-1' || qty === '1' ? 'max1' : 'max' + qty.split('-')[1];
      out.push({ q, required, label: alts.join(' или '), alts });
    }
  } else {
    for (const part of s.split(/[,.]\s*/)) {
      const m = part.trim().match(/^(Any|\d+-\d+|\d+)\s+(.+)$/i);
      if (m) out.push({ q: /^any$/i.test(m[1]) ? 'any' : 'max1', required: m[1] === '1', label: text(m[2]).trim(), alts: [text(m[2]).trim()] });
    }
  }
  return out;
}

/**
 * Подходит ли набор ключевых слов юнита под фразу варианта: «BLADES OF KHORNE DAEMON» = BLADES OF KHORNE + DAEMON,
 * «non-AELF» = нет AELF. Фраза разбивается на известные ключевые слова (динамическое программирование по словам).
 */
export function phraseMatches(phrase, unitKw, allKw) {
  const words = up(phrase).split(' ').filter(Boolean);
  const memo = new Map();
  const go = (i) => {
    if (i === words.length) return true;
    if (memo.has(i)) return memo.get(i);
    let ok = false;
    for (let j = i + 1; j <= words.length && !ok; j++) {
      const seg = words.slice(i, j).join(' ');
      if (seg.startsWith('NON-')) {
        const kw = seg.slice(4);
        if (allKw.has(kw) && !unitKw.has(kw)) ok = go(j);
      } else if (unitKw.has(seg)) ok = go(j);
    }
    memo.set(i, ok);
    return ok;
  };
  return go(0);
}

// ---------- импорт ----------
function loadCsv(dir, name) {
  const file = path.join(dir, name + '.csv');
  if (!fs.existsSync(file)) throw new Error(`Нет файла ${file}`);
  return parseCsv(fs.readFileSync(file, 'utf8'));
}

export function importAos(src, { curated, eligibility }) {
  const T = Object.fromEntries(FILES.map((f) => [f, loadCsv(src, f)]));
  const report = { errors: [], warnings: [], info: [] };
  const lastUpdate = (T.Last_update[0]?.last_update ?? '').trim();
  const dataDate = lastUpdate.slice(0, 10) || new Date().toISOString().slice(0, 10);

  const kwBy = groupBy(T.Warscrolls_keywords, 'warscroll_id');
  const abBy = groupBy(T.Warscrolls_abilities, 'warscroll_id');
  const wpBy = groupBy(T.Warscrolls_weapons, 'warscroll_id');
  const baseBy = groupBy(T.Warscrolls_bases, 'warscroll_id');
  const orgBy = groupBy(T.Warscrolls_organisation, 'warscroll_id');
  const rorBy = groupBy(T.Warscrolls_RoRfactions, 'warscroll_id');
  const sourceName = new Map(T.Source.map((s) => [s.id, s.name]));
  const allKw = new Set(T.Warscrolls_keywords.map((k) => up(k.keyword)));

  const rule = (a) => {
    const r = { name: text(a.name), text: text(a.description) };
    const inc = rawIncomplete(a.description, AOS_TEXT_CAP);
    if (inc) r.incomplete = inc;
    if (a.condition) r.timing = text(a.condition);
    if (a.ability_type) r.type = a.ability_type;
    if (a.keywords) r.keywords = text(a.keywords);
    if (a.points_type && a.points) r.value = `${a.points_type} ${a.points}`.trim();
    if (a.is_reaction === 'true') r.reaction = true;
    return r;
  };

  /** Профиль варскролла (общий для своих юнитов и юнитов полков славы). */
  const wsCache = new Map();
  function warscroll(x) {
    if (wsCache.has(x.id)) return wsCache.get(x.id);
    const kws = kwBy.get(x.id) ?? [];
    const keywords = [...new Set(kws.filter((k) => k.is_faction_keyword !== 'true').map((k) => up(k.keyword)))];
    const factionKeywords = [...new Set(kws.filter((k) => k.is_faction_keyword === 'true').map((k) => up(k.keyword)))];
    const param = (kw) => kws.find((k) => up(k.keyword) === kw)?.parameter?.trim() || null;
    const hero = /hero/i.test(x.role) || keywords.includes('HERO');
    const notes = parseNotes(x.notes, dataDate, curated.seasonInfo);
    const name = text(x.name);
    const seasonByName = Object.entries(curated.seasonInfo).find(([, v]) => v?.label && name.toLowerCase().startsWith(v.label.toLowerCase() + ' '))?.[0] ?? null;
    const season = notes.season ?? seasonByName;
    const kind = x.role === 'Faction Terrain' ? 'terrain' : /Endless Spell|Manifestation/i.test(x.role) || x.faction_id === UNIVERSAL ? 'manifestation' : 'unit';
    // у не-героев колонка regiment_options = «значимые ключевые слова» из Battle Profiles
    const regimentKeywords = hero
      ? []
      : String(x.regiment_options)
          .replace(/<[^>]+>/g, '')
          .split(/[,\n]/)
          .map((t) => up(t.replace(/\[\d+\]/g, '').replace(/%\d*/g, '')))
          .filter((t) => t && allKw.has(t));
    const ws = {
      id: x.id,
      faction: x.faction_id,
      name,
      baseName: season && curated.seasonInfo[season]?.label && name.toLowerCase().startsWith(curated.seasonInfo[season].label.toLowerCase() + ' ') ? name.slice(curated.seasonInfo[season].label.length + 1) : name,
      role: x.role,
      kind,
      hero,
      unitSize: int(x.UnitSize) ?? 1,
      cost: int(x.Cost),
      // юнит из 1 модели усилить нельзя, если в Battle Profiles прямо не сказано обратное
      reinforceable: x.no_reinforced !== 'true' && kind === 'unit' && !keywords.includes('UNIQUE') && ((int(x.UnitSize) ?? 1) > 1 || notes.reinforceSingle),
      unique: keywords.includes('UNIQUE'),
      warmaster: keywords.includes('WARMASTER'),
      keywords,
      factionKeywords,
      regimentKeywords,
      wizard: keywords.includes('WIZARD') ? int(param('WIZARD')) ?? 1 : null,
      priest: keywords.includes('PRIEST') ? int(param('PRIEST')) ?? 1 : null,
      params: Object.fromEntries(kws.filter((k) => k.parameter?.trim()).map((k) => [up(k.keyword), k.parameter.trim()])),
      stats: { move: x.Move || '-', save: x.Save || '-', control: x.Control || '-', health: x.Health || '-', ward: x.Ward || '' },
      weapons: (wpBy.get(x.id) ?? []).sort(byLine).map((w) => ({
        name: text(w.name),
        type: /melee/i.test(w.type) ? 'melee' : 'ranged',
        range: w.Rng || '',
        attacks: w.Atk || '',
        hit: w.Hit || '',
        wound: w.Wnd || '',
        rend: w.Rnd || '',
        damage: w.Dmg || '',
        abilities: text(w.abilities),
      })),
      abilities: (abBy.get(x.id) ?? []).sort(byLine).map(rule),
      bases: (baseBy.get(x.id) ?? []).sort(byLine).map((b) => (b.model && b.model !== name ? `${text(b.model)}: ${b.base}` : b.base)).join(', '),
      composition: (orgBy.get(x.id) ?? []).sort(byLine).map((o) => ({ unit: text(o.unit), size: o.size })),
      legends: notes.legends,
      legendsDate: notes.legendsDate,
      season,
      notes: text(x.notes),
      link: x.link,
      source: sourceName.get(x.source_id) ?? null,
      // заполняется ниже, в контексте фракции
      options: [],
      joinAs: notes.joinAs,
      joinLeaderIds: [],
      onlyInIds: [],
      perUnitOf: null,
      regimentCap: notes.regimentCap,
      requiresInRegiment: null,
      exclusiveWithIds: [],
      aorOnly: notes.aorOnly,
      freeSlot: notes.freeSlot,
      noOtherUnique: notes.noOtherUnique,
      exclusiveWithRorNames: [],
      _notes: notes,
      _rawOptions: x.regiment_options,
    };
    wsCache.set(x.id, ws);
    return ws;
  }

  const isSpearhead = (x) => /Spearhead:/i.test(x.notes);
  const usable = (x) => x.virtual !== 'true' && x.role !== 'Regiment of Renown' && !isSpearhead(x);

  // ---------- таблицы правил фракции ----------
  const seasonOf = (subtypeId) => curated.seasons[subtypeId] ?? null;
  const typeDesc = new Map(T.Faction_ability_types.map((t) => [`${t.faction_id}|${t.id}`, text(t.description)]));
  const subDesc = new Map(T.Faction_ability_subtypes.map((t) => [`${t.faction_id}|${t.id}`, text(t.description)]));
  const abilitiesByFaction = groupBy(T.Faction_abilities, 'faction_id');

  // ключ очков терпим к пробелам и опечаткам (Murderhost = Murder Host, Blesssings = Blessings)
  const ptsKey = (s) => norm(s).replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  const ptsIndex = new Map(
    Object.entries(curated.points).map(([fid, m]) => [fid, new Map(Object.entries(m).map(([k, v]) => [k.split(':')[0] + ':' + ptsKey(k.slice(k.indexOf(':') + 1)), v]))]),
  );
  const ptsFor = (fid, kind, name) => {
    const v = ptsIndex.get(fid)?.get(`${kind}:${ptsKey(name)}`);
    return typeof v === 'number' ? v : null;
  };

  const universalLores = [];
  {
    const rows = abilitiesByFaction.get(UNIVERSAL) ?? [];
    for (const [sid, items] of groupBy(rows.filter((r) => r.type_name === 'Manifestation Lore'), 'subtype_id')) {
      const name = text(items[0].subtype_name);
      const pts = curated.universalLores[norm(name)];
      if (typeof pts !== 'number') report.warnings.push(`универсальный лор без очков: ${name}`);
      universalLores.push({ id: sid, kind: 'manifestation', name, points: typeof pts === 'number' ? pts : null, universal: true, season: 'standard', items: items.sort(byLine).map(rule), summons: [] });
    }
  }
  const universalManifestations = T.Warscrolls.filter((x) => x.faction_id === UNIVERSAL && x.virtual !== 'true').map(warscroll);
  for (const lore of universalLores) lore.summons = universalManifestations.filter((w) => norm(w.role) === norm(lore.name)).map((w) => w.id);

  // ---------- полки славы (Regiments of Renown) ----------
  const rorCache = new Map();
  const rorPool = T.Warscrolls.filter((y) => y.role !== 'Regiment of Renown' && !isSpearhead(y));
  const nameKey = (s) => norm(s).replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
  /** Состав полка славы из Warscrolls_organisation: «X unit with N models», «0-1 X» (собираемый полк), служебные строки → заметки. */
  function buildRor(x) {
    if (rorCache.has(x.id)) return rorCache.get(x.id);
    const name = text(x.name);
    const unitsOf = [];
    const notes = [text(x.notes)].filter(Boolean);
    let perUnitPoints = null;
    for (const o of (orgBy.get(x.id) ?? []).sort(byLine)) {
      const t = text(o.unit).replace(/\s+/g, ' ').replace(/\.$/, '').trim();
      if (!t) continue;
      const unitLine = /^(.+?) units? with (\d+) models?$/i.test(t);
      if (!String(o.size).trim() && !unitLine) {
        // строка-пояснение; таблица очков собираемого полка: «Edmark Valoran, the Manticore Knight +110 …»
        const pts = [...t.matchAll(/([A-Z][^+]*?)\s*\+(\d+)/g)].map((m) => [nameKey(m[1].replace(/^Unit\s*Points\s*/i, '')), +m[2]]);
        if (pts.length >= 2) perUnitPoints = new Map(pts);
        else notes.push(t);
        continue;
      }
      const m = t.match(/^(.+?)(?:\s+units?)?(?:\s+with\s+(\d+)\s+models?)?$/i);
      const nm = m[1].replace(/\s*\(.*?\)\s*$/, '').trim();
      const models = m[2] ? +m[2] : null;
      const cands = rorPool.filter((y) => [nameKey(nm), nameKey(nm).replace(/s$/, '')].includes(nameKey(y.name)));
      const legendsOf = (y) => parseNotes(y.notes, dataDate, curated.seasonInfo).legends;
      const pick =
        cands.find((y) => y.faction_id === x.faction_id && y.virtual !== 'true' && !legendsOf(y)) ??
        cands.find((y) => y.faction_id === x.faction_id) ??
        cands.find((y) => y.virtual !== 'true' && !legendsOf(y)) ??
        cands[0];
      if (!pick) {
        report.errors.push(`полк славы «${name}» — не найден юнит «${nm}»`);
        continue;
      }
      const w = warscroll(pick);
      const optional = /^0-1$/.test(String(o.size).trim());
      const same = unitsOf.find((u) => u.id === w.id && !optional && !u.optional && u.models === (models ?? w.unitSize));
      if (same) same.count += int(o.size) ?? 1;
      else unitsOf.push({ id: w.id, count: optional ? 1 : int(o.size) ?? 1, models: models ?? w.unitSize, optional, points: null });
    }
    if (perUnitPoints) for (const u of unitsOf) u.points = perUnitPoints.get(nameKey(wsCache.get(u.id).name)) ?? null;
    const built = unitsOf.some((u) => u.optional);
    const cost = int(x.Cost);
    if (!built && cost == null) report.errors.push(`полк славы «${name}» без очков`);
    if (built && unitsOf.some((u) => u.points == null)) report.errors.push(`полк славы «${name}» — нет очков у части юнитов`);
    const ror = {
      id: x.id,
      name,
      owner: x.faction_id,
      cost: built ? null : cost,
      built,
      units: unitsOf,
      abilities: (abBy.get(x.id) ?? []).sort(byLine).map(rule),
      notes: notes.join('\n'),
      allowed: (rorBy.get(x.id) ?? []).map((r) => r.faction_id),
      link: x.link,
      source: sourceName.get(x.source_id) ?? null,
    };
    rorCache.set(x.id, ror);
    return ror;
  }

  const factions = [];
  const files = {};
  for (const f of T.Factions) {
    if (f.id === UNIVERSAL) continue;
    const fid = f.id;
    const own = T.Warscrolls.filter((x) => x.faction_id === fid && usable(x)).map(warscroll);
    const units = own.filter((w) => w.kind === 'unit');
    const byNorm = new Map();
    for (const w of own) {
      for (const n of new Set([norm(w.name), norm(w.baseName)])) {
        if (!byNorm.has(n)) byNorm.set(n, []);
        byNorm.get(n).push(w.id);
      }
    }
    /**
     * Юниты по имени из заметок и вариантов полка. Там имена бывают сокращёнными и с опечатками:
     * «Eternus» = «Eternus, Blade of the First Prince», «a Slann Starmaster», «Command Corp Adjutant» = «… Corps Adjutants».
     */
    const idsByName = (n) => {
      const keys = new Set();
      const base = norm(n).replace(/^(?:an?|the) /, '').replace(/\bcorp\b/g, 'corps');
      for (const k of [norm(n), base]) for (const v of [k, k.replace(/s$/, ''), k + 's']) keys.add(v);
      for (const k of keys) if (byNorm.has(k)) return byNorm.get(k);
      // сокращённое имя персонажа: «Trugg» → «Trugg, the Troggoth King»
      const pre = [...byNorm.keys()].filter((k) => k.startsWith(base + ','));
      return [...new Set(pre.flatMap((k) => byNorm.get(k)))];
    };
    const kwSet = (w) => new Set([...w.keywords, ...w.factionKeywords, ...w.regimentKeywords]);

    // варианты полков героев: метка (joinAs) → имя варскролла → фраза из ключевых слов
    const tagHeroes = new Map();
    for (const w of units) if (w.hero) for (const t of w.joinAs) (tagHeroes.get(t) ?? tagHeroes.set(t, []).get(t)).push(w.id);
    for (const w of units) {
      if (!w.hero) continue;
      for (const tok of parseOptionTokens(w._rawOptions)) {
        // «A или B» — один слот: подходят юниты любого из вариантов
        const kinds = new Set();
        const ids = new Set();
        for (const alt of tok.alts) {
          const key = norm(alt);
          if (tagHeroes.has(key)) {
            kinds.add('tag');
            for (const id of tagHeroes.get(key)) ids.add(id);
          } else if (idsByName(alt).length) {
            kinds.add('unit');
            for (const id of idsByName(alt)) ids.add(id);
          } else {
            kinds.add('keyword');
            for (const u of units) if (!u.hero && phraseMatches(alt, kwSet(u), allKw)) ids.add(u.id);
          }
        }
        if (!ids.size) (w.legends ? report.info : report.warnings).push(`${fid}: «${w.name}» — вариант полка «${tok.label}» не подходит ни одному юниту фракции`);
        w.options.push({ q: tok.q, required: tok.required, label: tok.label, kind: kinds.size === 1 ? [...kinds][0] : 'mixed', ids: [...ids] });
      }
      if (!w.options.length && w._rawOptions && !/^none$/i.test(w._rawOptions.trim())) report.errors.push(`${fid}: «${w.name}» — не разобраны варианты полка: ${w._rawOptions}`);
    }
    for (const w of own) {
      const n = w._notes;
      const resolve = (names, what) =>
        names.flatMap((nm) => {
          const ids = idsByName(nm);
          if (!ids.length) report.warnings.push(`${fid}: «${w.name}» — ${what}: не найден «${nm}»`);
          return ids;
        });
      w.joinLeaderIds = resolve(n.joinLeaders, 'может присоединиться к полку');
      w.onlyInIds = resolve(n.onlyIn, 'только в полку');
      w.exclusiveWithIds = n.exclusiveWith.flatMap((nm) => idsByName(nm));
      // «нельзя вместе с Blades of the Hollow King» — это и юнит, и полк славы с тем же именем
      w.exclusiveWithRorNames = n.exclusiveWith.map((nm) => norm(nm).replace(/^the /, ''));
      for (const nm of n.exclusiveWith) if (!idsByName(nm).length) report.info.push(`${fid}: «${w.name}» — «нельзя вместе с ${nm}»: юнита нет, проверяется только полк славы`);
      if (n.perUnitOf) w.perUnitOf = { per: n.perUnitOf.per, ids: resolve([n.perUnitOf.name], '1 на каждый'), label: n.perUnitOf.name };
      if (n.requiresInRegiment) {
        const req = resolve([n.requiresInRegiment.name], 'нужен в полку');
        const no = resolve([n.requiresInRegiment.noOther], 'нельзя второй');
        w.requiresInRegiment = { ids: req, noOtherIds: no, text: `только в полку, где есть ${n.requiresInRegiment.name} и нет другого ${n.requiresInRegiment.noOther}` };
      }
      if (w.regimentCap) {
        w.regimentCap.ids = units.filter((u) => phraseMatches(w.regimentCap.phrase, kwSet(u), allKw)).map((u) => u.id);
        if (!w.regimentCap.ids.includes(w.id)) report.warnings.push(`${fid}: «${w.name}» — ограничение «${w.regimentCap.phrase}» не относится к самому юниту`);
      }
      if (n.rest) report.info.push(`${fid}: «${w.name}» — неразобранная заметка: ${n.rest}`);
      const pointsNote = missingPointsNote(fid, w, curated);
      if (pointsNote) report.info.push(pointsNote);
      delete w._notes;
      delete w._rawOptions;
    }

    // ---------- правила фракции ----------
    const rows = abilitiesByFaction.get(fid) ?? [];
    const bySub = groupBy(rows, 'subtype_id');
    const battleTraits = [];
    const formations = [];
    const lores = [];
    const enhancementTypes = new Map();
    for (const [sid, items] of bySub) {
      const typeName = items[0].type_name;
      const subName = text(items[0].subtype_name);
      items.sort(byLine);
      if (curated.stale.subtypes[sid]) continue; // заменено новым батлтомом, текста новых правил в выгрузке нет
      if (typeName === 'Battle Traits') {
        battleTraits.push(...items.map(rule));
        continue;
      }
      const season = seasonOf(sid);
      if (!season) {
        // Army of Renown, Spearhead, Path to Glory — в конструктор не входят (у них type_name = имя армии/режима).
        // Таблица основного типа без сезона — новая, ещё не размеченная в curated.json: об этом нужно знать.
        if (CORE_TABLES.has(typeName)) report.warnings.push(`${fid}: таблица «${subName}» (${typeName}) не размечена в curated.json — пропущена`);
        continue;
      }
      if (!seasonActive(curated, season)) continue; // сезон закончился (curated.json → seasonInfo)
      if (typeName === 'Battle Formations') {
        const pts = ptsFor(fid, 'formation', subName);
        if (pts == null) report.warnings.push(`${fid}: построение «${subName}» — нет очков`);
        // примечание подтипа: сроки перехода в Warhammer Legends («On 1st June 2027, these rules will move over…»)
        const notes = subDesc.get(`${fid}|${sid}`) ?? '';
        const lm = notes.match(/(?:on|from)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4}),?\s+these rules will move (?:over )?to Warhammer Legends/i);
        const legendsDate = lm ? `${lm[3]}-${String(MONTHS[lm[2].toLowerCase()] ?? 1).padStart(2, '0')}-${String(lm[1]).padStart(2, '0')}` : null;
        if (/Warhammer Legends/i.test(notes) && !legendsDate) report.warnings.push(`${fid}: построение «${subName}» — упоминание Legends без даты: ${notes.slice(0, 80)}`);
        formations.push({ id: sid, name: subName, points: pts, season, rules: items.map(rule), notes, legendsDate, legends: !!legendsDate && legendsDate <= dataDate });
      } else if (/^(Spell|Prayer|Manifestation) Lore$/.test(typeName)) {
        const kind = typeName.split(' ')[0].toLowerCase();
        const pts = ptsFor(fid, 'lore', subName);
        if (pts == null) report.warnings.push(`${fid}: лор «${subName}» — нет очков`);
        lores.push({ id: sid, kind, name: subName, points: pts, universal: false, season, items: items.map(rule), summons: [] });
      } else {
        const key = typeName === 'Heroic Traits' ? 'heroic' : typeName === 'Artefacts of Power' ? 'artefact' : typeName === 'Monstrous Traits' ? 'monstrous' : 'x:' + norm(typeName);
        const label = typeName === 'Heroic Traits' ? 'Героические черты' : typeName === 'Artefacts of Power' ? 'Артефакты силы' : typeName === 'Monstrous Traits' ? 'Черты чудовищ' : typeName;
        const desc = [subDesc.get(`${fid}|${sid}`), typeDesc.get(`${fid}|${items[0].type_id}`)].filter(Boolean).join(' ');
        let elig = eligibility.rules[`${fid}|${subName}`];
        if (!elig) {
          if (/hero only/i.test(desc) || /instead of from other/i.test(desc) || key === 'heroic' || key === 'artefact') elig = { hero: true, text: 'HERO only' };
          else if (key === 'monstrous') elig = { all: ['MONSTER'], text: 'MONSTER only' };
          else {
            report.errors.push(`${fid}: таблица «${subName}» — неизвестно, кому её можно давать (${desc.slice(0, 80)})`);
            elig = { hero: true, text: desc };
          }
        }
        const table = {
          id: sid,
          name: subName,
          season,
          eligibility: elig,
          items: items.map((a) => {
            const pts = ptsFor(fid, 'enh', a.name);
            if (pts == null) report.warnings.push(`${fid}: улучшение «${text(a.name)}» (${subName}) — нет очков`);
            return { id: `${sid}:${a.line}`, ...rule(a), points: pts };
          }),
        };
        if (!enhancementTypes.has(key)) enhancementTypes.set(key, { key, name: label, tables: [] });
        enhancementTypes.get(key).tables.push(table);
      }
    }
    // манифестации, которые призывают лоры фракции
    const manifestations = own.filter((w) => w.kind === 'manifestation');
    for (const lore of lores.filter((l) => l.kind === 'manifestation')) {
      for (const it of lore.items) {
        const m = it.name.match(/^summon (.+)$/i);
        const ids = m ? manifestations.filter((w) => norm(w.name) === norm(m[1])).map((w) => w.id) : [];
        lore.summons.push(...ids);
      }
    }

    // ---------- полки славы (Regiments of Renown) ----------
    const rors = [];
    const rorUnits = new Map();
    for (const x of T.Warscrolls) {
      if (x.role !== 'Regiment of Renown' || x.virtual !== 'true') continue;
      const ror = buildRor(x);
      if (!ror.allowed.includes(fid)) continue;
      rors.push(ror);
      for (const u of ror.units) {
        const w = wsCache.get(u.id);
        rorUnits.set(w.id, w);
      }
    }
    // свои юниты фракции уже есть в warscrolls; в rorUnits — только чужие и «виртуальные» профили полка
    for (const w of own) rorUnits.delete(w.id);
    for (const w of own) {
      w.exclusiveWithRorIds = rors.filter((r) => w.exclusiveWithRorNames.includes(norm(r.name).replace(/^the /, ''))).map((r) => r.id);
      delete w.exclusiveWithRorNames;
    }

    const allianceCount = new Map();
    for (const w of units) for (const k of w.factionKeywords) if (ALLIANCES.includes(k)) allianceCount.set(k, (allianceCount.get(k) ?? 0) + 1);
    const grandAlliance = [...allianceCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const selectable = units.filter((w) => w.cost != null && !w.legends && seasonActive(curated, w.season) && !w.aorOnly);
    const terrain = own.filter((w) => w.kind === 'terrain');
    for (const t of terrain) {
      const curatedPts = ptsFor(fid, 'terrain', t.name);
      if (curatedPts != null && t.cost != null && curatedPts !== t.cost) report.warnings.push(`${fid}: террейн «${t.name}» — ${t.cost} в CSV, ${curatedPts} в Battle Profiles (берём Battle Profiles)`);
      t.cost = curatedPts ?? t.cost;
      if (t.cost == null) report.warnings.push(`${fid}: террейн «${t.name}» — нет очков`);
    }

    const data = {
      system: 'aos',
      id: fid,
      name: f.name,
      grandAlliance,
      link: f.link,
      warscrolls: own,
      rorUnits: [...rorUnits.values()],
      rors,
      battleTraits,
      formations,
      enhancementTypes: [...enhancementTypes.values()],
      lores: [...lores, ...universalLores],
      universalManifestations,
      // правила фракции в выгрузке устарели (вышел новый батлтом) — показываем предупреждение
      rulesNotice: rulesNoticeOf(curated, fid),
    };
    files[fid] = data;
    // без доступного героя полк не собрать — такая фракция играется только с Legends
    factions.push({ id: fid, name: f.name, grandAlliance, units: selectable.length, legendsOnly: !selectable.some((w) => w.hero && !w.onlyInIds.length) });
    if (!formations.length) (curated.stale.factions[fid] ? report.info : report.warnings).push(`${fid}: нет боевых построений`);
    if (!selectable.some((w) => w.hero)) report.info.push(`${fid}: все юниты в Legends — фракция доступна только с «Показать Legends»`);
  }

  // служебные поля разбора не попадают в данные (универсальные манифестации и юниты полков славы тоже)
  for (const w of wsCache.values()) {
    delete w._notes;
    delete w._rawOptions;
    delete w.exclusiveWithRorNames;
  }
  const index = {
    system: 'aos',
    edition: '4',
    lastUpdate,
    generatedAt: new Date().toISOString(),
    credit: 'powered by Wahapedia',
    pointsSource: curated.sources,
    factions: factions.sort((a, b) => ALLIANCES.indexOf(a.grandAlliance) - ALLIANCES.indexOf(b.grandAlliance) || a.name.localeCompare(b.name)),
  };
  const refs = warscrollRefs(files);
  for (const [fid, data] of Object.entries(files)) {
    normaliseAosFaction(data, curated, refs);
    for (const where of findMarkup(data)) report.errors.push(`${fid}: служебная разметка в тексте — ${where}`);
  }
  report.info.push(...fullTextReport(files, curated));
  const inc = { truncated: 0, table: 0 };
  for (const data of Object.values(files)) for (const r of rulesOf(data)) if (r.incomplete) inc[r.incomplete]++;
  if (inc.truncated || inc.table)
    report.warnings.push(`неполные тексты в выгрузке: обрезано лимитом 1024 символа — ${inc.truncated}, таблица не выгружена — ${inc.table}; в конструкторе помечены, полный текст на Wahapedia`);
  return { index, files, report };
}

// ---------- последняя обработка данных фракции ----------
/** Сезон действует? Неизвестный сезон считается действующим, но тест данных потребует его описать. */
export const seasonActive = (curated, season) => !season || season === 'standard' || curated.seasonInfo?.[season]?.active !== false;

const RULE_FIELDS = ['name', 'text', 'timing', 'type', 'keywords', 'value'];
/** Все объекты-правила фракции: способности, черты, построения, улучшения, заклинания, правила полков славы. */
function* rulesOf(data) {
  const scrolls = [...data.warscrolls, ...data.rorUnits, ...data.universalManifestations];
  for (const w of scrolls) yield* w.abilities;
  yield* data.battleTraits;
  for (const f of data.formations) yield* f.rules;
  for (const t of data.enhancementTypes) for (const tb of t.tables) yield* tb.items;
  for (const l of data.lores) yield* l.items;
  for (const r of data.rors) yield* r.abilities;
}

/** То же, что rulesOf, но с владельцем правила: ключ «ws:<варскролл>», «trait», «form:<построение>»,
 *  «enh:<таблица улучшений>», «lore:<лор>», «ror:<полк славы>» — по нему подставляются полные тексты. */
export function* rulesWithOwner(data) {
  for (const w of [...data.warscrolls, ...data.rorUnits, ...data.universalManifestations]) for (const r of w.abilities) yield [`ws:${w.name}`, r];
  for (const r of data.battleTraits) yield ['trait', r];
  for (const f of data.formations) for (const r of f.rules) yield [`form:${f.name}`, r];
  for (const t of data.enhancementTypes) for (const tb of t.tables) for (const r of tb.items) yield [`enh:${tb.name}`, r];
  for (const l of data.lores) for (const r of l.items) yield [`lore:${l.name}`, r];
  for (const r0 of data.rors) for (const r of r0.abilities) yield [`ror:${r0.name}`, r];
}

/** Полные тексты правил из curated.fullTexts по ключу «<фракция>|<владелец>|<правило>». */
function fullTextIndex(curated) {
  const map = new Map();
  for (const it of curated.fullTexts?.items ?? []) for (const at of it.in) map.set(`${at}|${it.name}`, it);
  return map;
}
const looseText = (s) => s.replace(/•/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
/**
 * Подходит ли полный текст к обрывку из выгрузки: начало совпадает (обрезанный хвост слова не в счёт),
 * а у правил без таблицы — все строки до и после таблицы. Правила, у которых на сайте уже другая редакция
 * (revised в curated), подставляются без этой проверки — так записано в curated осознанно.
 */
export function fullTextFits(stored, item) {
  if (item.revised) return true;
  const full = looseText(item.text);
  const parts = stored.split(/\n\n/).map(looseText).filter(Boolean);
  const head = looseText(stored).replace(/\s*\S+$/, '');
  return full.startsWith(head) || parts.every((p) => full.includes(p));
}

/**
 * Одинаковая обработка для свежего импорта и для уже готовых файлов (scripts/repair-aos-data.mjs):
 * чистка всех текстовых полей правил и заметок; сезон у построений; неполные тексты выгрузки (обрезанные
 * лимитом 1024 символа или без таблицы) заменяются полными из curated.fullTexts, если они там есть;
 * правки варскроллов из curated.warscrollOverrides; предупреждение об устаревших правилах из curated.stale.
 * refs — варскроллы всех фракций по id (warscrollRefs), нужны правкам copyFrom.
 */
export function normaliseAosFaction(data, curated, refs = null) {
  applyWarscrollOverrides(data, curated, refs);
  if ('rulesNotice' in data) data.rulesNotice = rulesNoticeOf(curated, data.id);
  for (const r of rulesOf(data)) {
    // в готовых файлах обрывок тега и заглушка таблицы могли остаться — отмечаем до чистки
    const inc = r.incomplete ?? rawIncomplete(r.text);
    if (inc) r.incomplete = inc;
    for (const k of RULE_FIELDS) if (typeof r[k] === 'string') r[k] = cleanWahaText(r[k]);
  }
  const full = fullTextIndex(curated);
  if (full.size)
    for (const [owner, r] of rulesWithOwner(data)) {
      if (!r.incomplete) continue;
      const it = full.get(`${data.id}|${owner}|${r.name}`);
      if (!it || !fullTextFits(r.text, it)) continue;
      r.text = it.text;
      delete r.incomplete;
      // откуда текст: в выгрузке его не было целиком (а у revised — другая, более старая редакция)
      r.textSource = it.revised ? 'wahapedia-site-revised' : 'wahapedia-site';
    }
  for (const w of [...data.warscrolls, ...data.rorUnits, ...data.universalManifestations]) {
    if (typeof w.notes === 'string') w.notes = cleanWahaText(w.notes);
    for (const wp of w.weapons) if (typeof wp.abilities === 'string') wp.abilities = cleanWahaText(wp.abilities);
  }
  for (const r of data.rors) if (typeof r.notes === 'string') r.notes = cleanWahaText(r.notes);
  for (const f of data.formations) f.season ??= curated.seasons?.[f.id] ?? 'standard';
  return data;
}

/** Предупреждение «правила фракции устарели» (curated.stale.factions) — одно место и для импорта, и для repair. */
export const rulesNoticeOf = (curated, fid) => curated.stale?.factions?.[fid] ?? null;

/**
 * curated.warscrollOverrides — проверенные по источнику правки варскроллов, которых нет в выгрузке.
 * Схема узкая, всё остальное — ошибка:
 *   { ids: [id варскролла…], set?: { legends?: true, setUpBy?: { warscroll, ability } }, copyFrom?: id, why, source, checked }
 * set.legends — юнит из публикации Warhammer Legends, а заметки «Legends Warscroll» в выгрузке нет;
 * set.setUpBy — юнит не покупается, его ставит на стол способность другого варскролла (очков нет по правилам);
 * copyFrom — строка выгрузки сломана, а на сайте тот же варскролл, что и у другой фракции: копируются поля
 *   COPY_FIELDS, свои id, фракция и ссылка остаются; варианты полка (options) пересчитываются по юнитам своей фракции.
 */
const OVERRIDE_KEYS = new Set(['ids', 'set', 'copyFrom', 'why', 'source', 'checked']);
const OVERRIDE_SET_KEYS = new Set(['legends', 'setUpBy']);
const COPY_FIELDS = ['unitSize', 'cost', 'stats', 'weapons', 'abilities', 'bases', 'legends', 'legendsDate', 'notes', 'options'];

/** Правки по id варскролла; схема проверяется — неизвестный ключ или пустое обоснование останавливают обработку. */
export function warscrollOverrides(curated) {
  const map = new Map();
  for (const it of curated.warscrollOverrides?.items ?? []) {
    const bad = Object.keys(it).filter((k) => !OVERRIDE_KEYS.has(k)).concat(Object.keys(it.set ?? {}).filter((k) => !OVERRIDE_SET_KEYS.has(k)));
    if (bad.length) throw new Error(`curated.warscrollOverrides: неизвестные поля ${bad.join(', ')}`);
    if (!it.ids?.length || !it.why || !it.source || (!it.set && !it.copyFrom)) throw new Error(`curated.warscrollOverrides: неполная правка ${JSON.stringify(it.ids)}`);
    if (it.set && 'legends' in it.set && it.set.legends !== true) throw new Error('curated.warscrollOverrides: set.legends может быть только true');
    if (it.set?.setUpBy && (!it.set.setUpBy.warscroll || !it.set.setUpBy.ability)) throw new Error('curated.warscrollOverrides: setUpBy = { warscroll, ability }');
    for (const id of it.ids) {
      if (map.has(id)) throw new Error(`curated.warscrollOverrides: ${id} указан дважды`);
      map.set(id, it);
    }
  }
  return map;
}

/** Варскроллы всех фракций по id — источник для copyFrom. */
export function warscrollRefs(files) {
  const refs = new Map();
  for (const data of Object.values(files)) for (const w of data.warscrolls) if (!refs.has(w.id)) refs.set(w.id, w);
  return refs;
}

/** Заметка отчёта импорта о юните без очков (null — отмечать нечего). */
export function missingPointsNote(fid, w, curated) {
  if (w.kind !== 'unit' || w.cost != null || w.legends) return null;
  const o = warscrollOverrides(curated).get(w.id);
  if (o?.set?.setUpBy) return `${fid}: «${w.name}» — очков нет по правилам: ставится способностью «${o.set.setUpBy.ability}» (${o.set.setUpBy.warscroll})`;
  if (o) return null; // Legends или восстановлен copyFrom — см. curated.warscrollOverrides
  return `${fid}: «${w.name}» — нет очков в Battle Profiles, юнит нельзя добавить`;
}

function applyWarscrollOverrides(data, curated, refs) {
  const overrides = warscrollOverrides(curated);
  if (!overrides.size) return;
  const kwSet = (u) => new Set([...u.keywords, ...u.factionKeywords, ...u.regimentKeywords]);
  for (const w of [...data.warscrolls, ...data.rorUnits, ...data.universalManifestations]) {
    const o = overrides.get(w.id);
    if (!o) continue;
    if (o.copyFrom) {
      const src = refs?.get(o.copyFrom);
      if (!src) throw new Error(`curated.warscrollOverrides: для ${w.id} нет варскролла-источника ${o.copyFrom}`);
      if (src.name !== w.name) throw new Error(`curated.warscrollOverrides: ${w.id} «${w.name}» ≠ источник «${src.name}»`);
      for (const k of COPY_FIELDS) w[k] = structuredClone(src[k]);
      // варианты полка — по своей фракции; поддерживается только вариант по ключевым словам без NON- и «или»
      const own = data.warscrolls.filter((u) => u.kind === 'unit' && !u.hero);
      const allKw = new Set(data.warscrolls.flatMap((u) => [...kwSet(u)]));
      for (const opt of w.options) {
        if (opt.kind !== 'keyword' || / или |\bNON-/i.test(opt.label)) throw new Error(`curated.warscrollOverrides: вариант полка «${opt.label}» (${opt.kind}) у ${w.id} не поддерживается`);
        opt.ids = own.filter((u) => phraseMatches(opt.label, kwSet(u), allKw)).map((u) => u.id);
      }
    }
    if (o.set?.legends) w.legends = true;
    if (o.set?.setUpBy) w.setUpBy = { ...o.set.setUpBy };
  }
}

/** Строки отчёта импорта про полные тексты из curated.fullTexts (сколько подставлено, что не подошло). */
export function fullTextReport(files, curated) {
  const out = [];
  const ft = curated.fullTexts;
  if (!ft) return out;
  const applied = new Map();
  for (const data of Object.values(files))
    for (const [owner, r] of rulesWithOwner(data)) if (r.textSource) applied.set(`${data.id}|${owner}|${r.name}`, r.textSource);
  const unused = [];
  for (const it of ft.items) for (const at of it.in) if (!applied.has(`${at}|${it.name}`)) unused.push(`${at} «${it.name}»`);
  out.push(`полные тексты правил (aos/curated.json → fullTexts, сайт Wahapedia ${ft.checked}): подставлено ${applied.size}`);
  const revised = ft.items.filter((it) => it.revised).map((it) => `«${it.name}»`);
  if (revised.length) out.push(`на сайте Wahapedia другая редакция, чем в выгрузке, — взят текст сайта: ${revised.join(', ')}`);
  if (unused.length) out.push(`полный текст из curated не подставлен (правило не найдено, уже полное или текст не совпал с началом): ${unused.join('; ')}`);
  for (const m of ft.missing ?? []) out.push(`полного текста нет: ${m.in} «${m.name}» — ${m.why}`);
  return out;
}

/** Где в данных осталась разметка Wahapedia (пусто — всё чисто). */
export function findMarkup(data) {
  const bad = /%\d{6,}|<\/?[A-Za-z][A-Za-z0-9]{0,9}\s*\/?>|&(#\d+|#x[0-9a-f]+|[a-z]+);/i;
  const out = [];
  for (const r of rulesOf(data)) for (const k of RULE_FIELDS) if (typeof r[k] === 'string' && bad.test(r[k])) out.push(`«${r.name}» (${k})`);
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, def) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : def;
  };
  const SRC = path.resolve(opt('--src', './wahapedia-aos-csv'));
  const OUT = path.resolve(opt('--out', '../../backend/roster-data/aos'));
  const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, '..', 'aos', f), 'utf8'));
  const { index, files, report } = importAos(SRC, { curated: read('curated.json'), eligibility: read('eligibility.json') });
  fs.mkdirSync(path.join(OUT, 'f'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
  for (const [id, data] of Object.entries(files)) fs.writeFileSync(path.join(OUT, 'f', id + '.json'), JSON.stringify(data));
  fs.writeFileSync(path.join(HERE, '..', 'aos', 'import-report.json'), JSON.stringify(report, null, 1));
  console.log(`AoS: ${index.factions.length} фракций, данные Wahapedia от ${index.lastUpdate}`);
  console.log(`отчёт: ${report.errors.length} ошибок, ${report.warnings.length} предупреждений, ${report.info.length} заметок → tools/roster-data/aos/import-report.json`);
  for (const e of report.errors) console.log('  ✗', e);
  if (report.errors.length) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('import-wahapedia-aos.mjs')) main();
