#!/usr/bin/env node
/**
 * Импорт Wahapedia Export Data (11-я редакция) → компактные JSON для Roster Builder.
 *
 * Использование:
 *   node scripts/import-wahapedia.mjs --src ./wahapedia-csv --out ./public/data
 *   node scripts/import-wahapedia.mjs --fetch --out ./public/data      # скачать свежие CSV
 *   node scripts/import-wahapedia.mjs --fetch --if-changed ...          # только если Last_update изменился
 *
 * Без внешних зависимостей (Node 18+). Данные: powered by Wahapedia.
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://wahapedia.ru/wh40k11ed/';
const FILES = [
  'Factions', 'Source', 'Datasheets', 'Datasheets_keywords', 'Datasheets_models',
  'Datasheets_unit_composition', 'Datasheets_models_cost', 'Datasheets_enhancements',
  'Datasheets_leader', 'Enhancements', 'Detachment_abilities', 'Detachments',
  'Detachments_chapter_dp', 'Last_update', 'Abilities', 'Datasheets_abilities',
  'Datasheets_wargear', 'Datasheets_options', 'Datasheets_stratagems', 'Stratagems',
];
const REQUIRED = new Set(['Factions', 'Datasheets', 'Datasheets_keywords', 'Datasheets_models_cost', 'Detachments', 'Enhancements']);

// ---------- CLI ----------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(name);
const SRC = path.resolve(opt('--src', './wahapedia-csv'));
const OUT = path.resolve(opt('--out', './public/data'));

// ---------- CSV ----------
/** Wahapedia: разделитель "|", без кавычек, BOM, CRLF, завершающий "|" в каждой строке. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.includes('\r\n') ? text.split('\r\n') : text.split('\n'); // одиночный \n внутри поля (в CRLF-файле) сохраняем
  const header = lines[0].split('|').map((s) => s.trim());
  if (header[header.length - 1] === '') header.pop();
  const rows = [];
  // В HTML-полях встречаются переносы строк (Abilities, Stratagems): склеиваем физические строки,
  // пока не наберётся полная запись — header.length разделителей и завершающий "|".
  let buf = null;
  for (let i = 1; i < lines.length; i++) {
    buf = buf === null ? lines[i] : buf + '\n' + lines[i];
    const count = buf.split('|').length - 1;
    const complete = count >= header.length && buf.trimEnd().endsWith('|');
    if (!complete && i < lines.length - 1) continue;
    const line = buf;
    buf = null;
    if (!line.trim()) continue;
    const parts = line.trimEnd().split('|');
    if (parts.length > header.length && parts[parts.length - 1] === '') parts.pop();
    // если в тексте встретился "|" — склеиваем лишнее в последнее текстовое поле
    while (parts.length > header.length) {
      const extra = parts.pop();
      parts[parts.length - 1] += '|' + extra;
    }
    const row = {};
    header.forEach((h, j) => (row[h] = parts[j] ?? ''));
    rows.push(row);
  }
  return rows;
}

async function fetchAll(dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (flag('--if-changed')) {
    const res = await fetch(BASE_URL + 'Last_update.csv');
    const remote = (await res.text()).trim();
    const localFile = path.join(dir, 'Last_update.csv');
    if (fs.existsSync(localFile) && fs.readFileSync(localFile, 'utf8').trim() === remote) {
      console.log('Last_update не изменился — пропускаю.');
      process.exit(0);
    }
  }
  for (const f of FILES) {
    const res = await fetch(BASE_URL + f + '.csv', { headers: { 'User-Agent': 'WarpHub-RosterBuilder/1.0' } });
    if (!res.ok) throw new Error(`${f}.csv: HTTP ${res.status}`);
    fs.writeFileSync(path.join(dir, f + '.csv'), await res.text());
    console.log('скачан', f);
  }
}

function load(dir, name) {
  const file = path.join(dir, name + '.csv');
  if (!fs.existsSync(file)) {
    if (REQUIRED.has(name)) throw new Error(`Нет обязательного файла ${file}`);
    console.warn(`⚠ нет ${name}.csv — пропускаю`);
    return [];
  }
  return parseCsv(fs.readFileSync(file, 'utf8'));
}

// ---------- текст ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', hellip: '…', times: '×' };
export function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<!--.*?-->/gs, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d|table|ul)>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
const bool = (v) => String(v).trim().toLowerCase() === 'true';
const int = (v) => {
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

// ---------- стоимость (полосы «YOUR 1ST TO 2ND UNITS COST» и т.п.) ----------
export function parseBandHeader(desc) {
  const d = desc.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!d.startsWith('YOUR ')) return null;
  if (/^YOUR UNITS? COSTS?$/.test(d)) return { from: 1, to: null };
  const m = d.match(/^YOUR (\d+)(?:ST|ND|RD|TH)(?: TO (\d+)(?:ST|ND|RD|TH))?( ?\+)? UNITS? COSTS?$/);
  if (!m) return null;
  const from = +m[1];
  const to = m[2] ? +m[2] : m[3] ? null : from;
  return { from, to };
}

/**
 * Datasheets_models_cost → { default: Band[], aoi?: Band[], assigned?: Band[] }
 * Band = { from, to, options:[{label, models, cost}], addons:[{label,cost}], wargear:[{label,cost}] }
 * Особенности данных: у некоторых инфолистов Space Marines несколько таблиц подряд (варианты орденов) —
 * берём первую; строки внутри таблицы иногда дублируются — убираем дубли.
 */
export function parseCosts(rows) {
  const ctx = {};
  let cur = 'default';
  let band = null;
  let mode = 'size';
  const done = new Set(); // контексты, которые уже завершены (начался повтор таблицы)
  const sorted = [...rows].sort((a, b) => int(a.line) - int(b.line));
  for (const r of sorted) {
    const raw = r.description || '';
    if (/dsHeaderAoI/.test(raw)) {
      const t = htmlToText(raw).toUpperCase();
      cur = t.includes('ASSIGNED') ? 'assigned' : 'aoi';
      band = null;
      mode = 'size';
      continue;
    }
    if (done.has(cur)) continue;
    const label = htmlToText(raw).replace(/^\+\s*/, '+ ').trim();
    const bh = parseBandHeader(label);
    const bands = (ctx[cur] ||= []);
    if (bh) {
      const existing = bands.find((b) => b.from === bh.from && b.to === bh.to);
      if (existing) {
        if (existing.options.length) {
          // повтор уже заполненной полосы = следующий вариант таблицы → стоп
          done.add(cur);
          continue;
        }
        band = existing;
      } else {
        band = { from: bh.from, to: bh.to, options: [], addons: [], wargear: [] };
        bands.push(band);
      }
      mode = 'size';
      continue;
    }
    if (/^WARGEAR OPTIONS$/i.test(label)) {
      mode = 'wargear';
      continue;
    }
    if (!band) {
      band = { from: 1, to: null, options: [], addons: [], wargear: [] };
      bands.push(band);
    }
    const cost = int(r.cost);
    if (cost === null) continue;
    if (mode === 'wargear' || /^per /i.test(label)) {
      const l = label.replace(/^per /i, '');
      if (!band.wargear.some((w) => w.label === l)) band.wargear.push({ label: l, cost });
      continue;
    }
    if (label.startsWith('+')) {
      const l = label.replace(/^\+\s*/, '');
      if (!band.addons.some((a) => a.label === l)) band.addons.push({ label: l, cost });
      continue;
    }
    if (band.options.some((o) => o.label === label)) continue;
    const models = (label.match(/\d+/g) || []).reduce((s, n) => s + +n, 0) || 1;
    band.options.push({ label, models, cost });
  }
  // полосы без вариантов размера (только wargear) наследуют размеры соседней
  for (const bands of Object.values(ctx)) {
    bands.sort((a, b) => a.from - b.from);
    const proto = bands.find((b) => b.options.length);
    for (const b of bands) {
      if (!b.options.length && proto) b.options = proto.options;
      if (!b.wargear.length && proto) b.wargear = proto.wargear;
    }
  }
  if (!ctx.default && ctx.aoi) ctx.default = ctx.aoi;
  delete ctx.aoi;
  if (ctx.default && !ctx.default.length) delete ctx.default;
  return ctx;
}

// ---------- правила детачментов из текста ----------
const KW_SEP = /\s*(?:,|\band\b|\bor\b)\s*/i;
export function parseDetachmentRules(texts) {
  const out = { tag: null, chapter: null, battleline: [], grants: [] };
  for (const t of texts) {
    const one = t.replace(/\n/g, ' ');
    const tag = one.match(/has the ([A-Z][A-Z'’\- ]+?) tag/);
    if (tag) out.tag = tag[1].trim();
    const ch = one.match(/Your army can include ([A-Za-z’' ]+?) units, but it cannot include (?:any )?ADEPTUS ASTARTES units drawn from any other Chapter/i);
    if (ch) out.chapter = titleKw(ch[1]);
    for (const line of t.split('\n')) {
      const m = line.match(/(?:^|\.\s*|KEYWORDS\s*|Detachment,\s*)([A-Za-z’'\- ,]+?) (?:units|models) from your army (?:gain|have) the BATTLELINE keyword/i);
      if (m) {
        const names = m[1].replace(/^.*Detachment,\s*/i, '').replace(/^(KEYWORDS|TRAVELLING PLAYERS)\s*/i, '').split(KW_SEP).map((s) => s.trim()).filter(Boolean);
        out.battleline.push(...names);
      }
    }
    for (const m of one.matchAll(/You can include (?:the )?([A-Za-z’' ]+?) units in your army/gi)) {
      out.grants.push(titleKw(m[1]));
    }
  }
  out.battleline = [...new Set(out.battleline.map((s) => s.toUpperCase()))];
  out.grants = [...new Set(out.grants)];
  return out;
}
function titleKw(s) {
  return s.trim().toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

// ---------- союзники (настраиваемо; значения 11-й ред. частично из вторичных источников) ----------
const ALLY_GROUPS = [
  {
    // Abilities.csv «Assigned Agents»: Retinue 1/2/3, Character 1/2/3, Requisitioned 1/1/2; Dedicated Transport — как обычно
    key: 'agents', name: 'Assigned Agents', rule: 'Assigned Agents', allegiance: ['Imperium'], excludeFactions: ['AoI'],
    pick: (ds) => ds.faction === 'AoI' && ['RETINUE', 'CHARACTER', 'REQUISITIONED', 'DEDICATED TRANSPORT'].some((k) => ds._kw.has(k)),
    costContext: 'assigned',
    note: 'Retinue 1/2/3 · Character 1/2/3 · Requisitioned 1/1/2 (Incursion/Strike Force/Onslaught). Транспорт — только с пассажирами.',
  },
  {
    key: 'freeblades', name: 'Freeblades', rule: 'Freeblades', allegiance: ['Imperium'], excludeFactions: ['QI'],
    pick: (ds) => ds.faction === 'QI' && (ds._kw.has('ARMIGER') || ds._kw.has('TITANIC')),
    note: '1 TITANIC рыцарь или до 3 ARMIGER. Не Warlord, без улучшений.',
  },
  {
    key: 'titanicus', name: 'Titanic Support', rule: 'Titanic Support', allegiance: ['Imperium'], excludeFactions: ['TL'],
    pick: (ds) => ds.faction === 'TL',
    note: '1 модель ADEPTUS TITANICUS в армии ИМПЕРИУМА.',
  },
  {
    key: 'dreadblades', name: 'Dreadblades', rule: 'Dreadblades', allegiance: ['Chaos'], excludeFactions: ['QT'],
    pick: (ds) => ds.faction === 'QT' && (ds._kw.has('WAR DOG') || ds._kw.has('TITANIC')),
    note: '1 TITANIC рыцарь или до 3 WAR DOG. Не Warlord, без улучшений.',
  },
  {
    // армии, где у всех моделей есть Chaos Knights или Heretic Astartes
    key: 'daemons', name: 'Daemonic Pact', rule: 'Daemonic Pact', allegiance: ['Chaos'], onlyFactions: ['CSM', 'DG', 'TS', 'WE', 'EC', 'QT'],
    pick: (ds) => ds.faction === 'CD',
    note: 'До 250/500/750 очков. Не Warlord, без улучшений. По каждому богу не-BATTLELINE юнитов не больше, чем BATTLELINE.',
  },
];

// ---------- снаряжение ----------
const normName = (s) => s.toLowerCase().replace(/[’`‘]/g, "'").replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
/** Datasheets_wargear → оружие, сгруппированное по профилям (line_in_wargear > 1 — доп. профиль). */
export function parseWeapons(rows) {
  const out = [];
  for (const w of [...rows].sort(byLine)) {
    const full = htmlToText(w.name).trim();
    const profile = {
      name: full, type: w.type || '', range: (w.range || '').replace(/"$/, '') ? w.range : w.range, A: w.A, skill: w.BS_WS, S: w.S, AP: w.AP, D: w.D,
      keywords: htmlToText(w.description).replace(/\s*,\s*/g, ', '),
    };
    const base = full.split(/\s+[–-]\s+/)[0].trim();
    const last = out[out.length - 1];
    if (last && int(w.line_in_wargear) > 1 && normName(last.name) === normName(base)) last.profiles.push(profile);
    else if (last && int(w.line_in_wargear) > 1 && last.profiles.length) last.profiles.push(profile);
    else out.push({ name: int(w.line_in_wargear) > 1 || /\s[–-]\s/.test(full) ? base : full, profiles: [profile] });
  }
  // одинаковые названия (дубли у разных моделей) — объединяем
  const merged = [];
  for (const w of out) {
    const same = merged.find((m) => normName(m.name) === normName(w.name));
    if (!same) merged.push(w);
  }
  return merged;
}

/**
 * Разбор «This model is equipped with: …», «Every model…», «The Sergeant is…», «Every other model…»
 * → правила стандартного снаряжения: who = 'all' | 'one' | 'rest' | число.
 */
export function parseLoadout(text, weapons) {
  const rules = [];
  const names = weapons.map((w) => ({ w: w.name, n: normName(w.name) }));
  const find = (item) => {
    const n = normName(item).replace(/^the /, '');
    return (
      names.find((x) => x.n === n) ||
      names.find((x) => x.n === n.replace(/s$/, '')) ||
      names.find((x) => x.n.replace(/s$/, '') === n.replace(/s$/, ''))
    )?.w;
  };
  for (const m of text.matchAll(/(^|\n|\.\s*)([^.\n:]*?)\s+(?:is|are) equipped with:\s*([^.\n]+)/gi)) {
    const subj = m[2].trim();
    let who;
    if (/^(this model|this unit)$/i.test(subj)) who = 'one';
    else if (/^(every|each|all)( model| models)?( in (this|the) unit)?$/i.test(subj) || /\band (every|each|all)\b/i.test(subj)) who = 'all';
    else if (/^(every|each) other|^the other|^other|^every [a-z]|^all [a-z]/i.test(subj)) who = 'rest';
    else if (/^(\d+)\s/.test(subj)) who = +subj.match(/^(\d+)/)[1];
    else if (/^(the|a|an|1)\s/i.test(subj)) who = 'one';
    else who = 'rest';
    const items = [];
    for (let raw of m[3].split(/;|,(?![^(]*\))/)) {
      raw = raw.trim();
      if (!raw) continue;
      const q = raw.match(/^(\d+)\s+(.*)$/);
      const qty = q ? +q[1] : 1;
      const weapon = find(q ? q[2] : raw.replace(/^(an?|the)\s+/i, ''));
      if (weapon) items.push({ weapon, qty });
    }
    if (items.length) rules.push({ who, subject: subj.replace(/^(the|an?|\d+)\s+/i, ''), items });
  }
  return rules;
}

const ABILITY_TYPE = {
  Core: 'core', Faction: 'faction', Datasheet: 'datasheet', Wargear: 'wargear', 'Wargear profile': 'wargear',
  Psychic: 'datasheet', Primarch: 'datasheet', 'Fortification (левая колонка)': 'datasheet', 'Special (правая колонка)': 'datasheet',
};

// ---------- main ----------
async function main() {
  if (flag('--fetch')) await fetchAll(SRC);
  const T = Object.fromEntries(FILES.map((f) => [f, load(SRC, f)]));
  const lastUpdate = T.Last_update[0]?.last_update?.trim() || null;

  const sources = new Map(T.Source.map((s) => [s.id, s]));
  const kwBy = groupBy(T.Datasheets_keywords, 'datasheet_id');
  const costBy = groupBy(T.Datasheets_models_cost, 'datasheet_id');
  const modelsBy = groupBy(T.Datasheets_models, 'datasheet_id');
  const compBy = groupBy(T.Datasheets_unit_composition, 'datasheet_id');
  const enhByDs = groupBy(T.Datasheets_enhancements, 'datasheet_id');
  const leadBy = groupBy(T.Datasheets_leader, 'leader_id');
  const abilBy = groupBy(T.Datasheets_abilities, 'datasheet_id');
  const wargearBy = groupBy(T.Datasheets_wargear, 'datasheet_id');
  const optionsBy = groupBy(T.Datasheets_options, 'datasheet_id');
  const stratBy = groupBy(T.Datasheets_stratagems, 'datasheet_id');
  const abilityDefs = new Map(T.Abilities.map((a) => [a.id, { name: htmlToText(a.name), text: htmlToText(a.description), faction: a.faction_id }]));

  // --- инфолисты ---
  const all = new Map();
  for (const d of T.Datasheets) {
    if (bool(d.virtual)) continue;
    const src = sources.get(d.source_id);
    const srcName = src?.name || '';
    const kws = (kwBy.get(d.id) || []).filter((k) => k.keyword.trim());
    const fk = uniq(kws.filter((k) => bool(k.is_faction_keyword)).map((k) => k.keyword.trim()));
    // ключевые слова юнита (без привязки к отдельной модели либо «ALL MODELS»)
    const kw = uniq(kws.filter((k) => !bool(k.is_faction_keyword)).map((k) => k.keyword.trim()));
    const ctx = parseCosts(costBy.get(d.id) || []);
    const kwSet = new Set(kw.map((k) => k.toUpperCase()));
    const footer = htmlToText(d.leader_footer);
    const rec = {
      id: d.id,
      name: htmlToText(d.name),
      faction: d.faction_id,
      role: d.role,
      keywords: kw,
      factionKeywords: fk,
      support: bool(d.is_support),
      legends: /legends/i.test(srcName),
      forgeWorld: /forge world/i.test(srcName),
      source: srcName,
      link: d.link,
      character: kwSet.has('CHARACTER'),
      epicHero: kwSet.has('EPIC HERO'),
      battleline: kwSet.has('BATTLELINE'),
      dedicatedTransport: kwSet.has('DEDICATED TRANSPORT'),
      titanic: kwSet.has('TITANIC'),
      costs: ctx.default || [],
      leads: uniq((leadBy.get(d.id) || []).map((l) => l.attached_id)),
      leaderNote: htmlToText(d.leader_head) ? htmlToText(d.leader_head) + (footer ? '\n' + footer : '') : footer,
      leaderExtra: /even if/i.test(footer),
      composition: (compBy.get(d.id) || []).sort(byLine).map((c) => htmlToText(c.description)).filter(Boolean),
      stats: (modelsBy.get(d.id) || []).sort(byLine).map((m) => ({
        name: htmlToText(m.name), M: m.M, T: m.T, Sv: m.Sv, inv: m.inv_sv && m.inv_sv !== '-' ? m.inv_sv : '', W: m.W, Ld: m.Ld, OC: m.OC, base: m.base_size,
      })),
      loadout: htmlToText(d.loadout),
      transport: htmlToText(d.transport),
      damaged: d.damaged_w ? { w: d.damaged_w, text: htmlToText(d.damaged_description) } : null,
      invulnNote: uniq((modelsBy.get(d.id) || []).map((m) => htmlToText(m.inv_sv_descr)).filter(Boolean)).join('\n'),
      abilities: (abilBy.get(d.id) || []).sort(byLine).map((a) => {
        const def = a.ability_id ? abilityDefs.get(a.ability_id) : null;
        return {
          type: ABILITY_TYPE[a.type] || 'datasheet',
          name: def?.name || htmlToText(a.name),
          param: htmlToText(a.parameter),
          text: def ? '' : htmlToText(a.description),
          ref: def ? a.ability_id : undefined,
        };
      }).filter((a) => a.name || a.text),
      weapons: [],
      defaultLoadout: [],
      options: (optionsBy.get(d.id) || []).sort(byLine).map((o) => ({ star: o.button === '*', text: htmlToText(o.description) })),
      stratagems: uniq((stratBy.get(d.id) || []).map((x) => x.stratagem_id)),
      enhancements: uniq((enhByDs.get(d.id) || []).map((e) => e.enhancement_id)),
    };
    rec.weapons = parseWeapons(wargearBy.get(d.id) || []);
    rec.defaultLoadout = parseLoadout(rec.loadout, rec.weapons);
    Object.defineProperty(rec, '_kw', { value: kwSet });
    Object.defineProperty(rec, '_ctx', { value: ctx });
    all.set(d.id, rec);
  }

  // --- принадлежность фракций (Imperium/Chaos/Xenos) ---
  const allegiance = {};
  for (const f of T.Factions) {
    const ds = [...all.values()].filter((d) => d.faction === f.id);
    const imp = ds.filter((d) => d._kw.has('IMPERIUM')).length;
    const cha = ds.filter((d) => d._kw.has('CHAOS')).length;
    allegiance[f.id] = imp > ds.length / 2 ? 'Imperium' : cha > ds.length / 2 ? 'Chaos' : 'Xenos';
    if (f.id === 'GC') allegiance[f.id] = 'Xenos'; // Brood Brothers дают IMPERIUM части юнитов, но армия — ксеносы
  }

  // --- детачменты ---
  const abilByDet = groupBy(T.Detachment_abilities, 'detachment_id');
  const chapterDp = groupBy(T.Detachments_chapter_dp, 'detachment_id');
  const detachments = T.Detachments.map((d) => {
    const abil = (abilByDet.get(d.id) || []).map((a) => ({ name: htmlToText(a.name), text: htmlToText(a.description) }));
    const rules = parseDetachmentRules(abil.map((a) => a.text));
    return {
      id: d.id,
      faction: d.faction_id,
      name: htmlToText(d.name),
      type: d.type || '',
      dp: int(d.dp),
      forceDisposition: d.force_disposition || null,
      chapterDp: Object.fromEntries((chapterDp.get(d.id) || []).map((c) => [c.keyword, int(c.dp)])),
      ...rules,
      abilities: abil,
    };
  }).filter((d) => !d.type && d.dp !== null); // Boarding Actions и т.п. — отдельный режим, не выводим

  // --- улучшения ---
  const enhancements = T.Enhancements.map((e) => ({
    id: e.id,
    faction: e.faction_id,
    name: htmlToText(e.name),
    cost: int(e.cost) ?? 0,
    detachment: e.detachment_id,
    upgrade: bool(e.upgrade),
    restriction: htmlToText(e.support_leader),
    text: htmlToText(e.description),
  }));

  // --- сборка по фракциям ---
  fs.mkdirSync(path.join(OUT, 'f'), { recursive: true });
  const index = [];
  for (const f of T.Factions) {
    const own = [...all.values()].filter((d) => d.faction === f.id && d.costs.length);
    if (!own.length) continue;
    const dets = detachments.filter((d) => d.faction === f.id);
    const detIds = new Set(dets.map((d) => d.id));
    const enh = enhancements.filter((e) => detIds.has(e.detachment));
    const ownIds = new Set(own.map((d) => d.id));

    // юниты, которые разрешают детачменты, но которых нет среди своих (кросс-фракционные)
    const granted = [];
    for (const det of dets) {
      for (const g of det.grants) {
        const G = g.toUpperCase();
        for (const d of all.values()) {
          if (ownIds.has(d.id) || !d.costs.length) continue;
          if (d.factionKeywords.some((k) => k.toUpperCase() === G)) {
            granted.push({ ...d, group: 'det:' + det.id });
            ownIds.add(d.id);
          }
        }
      }
    }
    // союзники
    const allies = [];
    const allyUnits = [];
    for (const g of ALLY_GROUPS) {
      if (!g.allegiance.includes(allegiance[f.id]) || g.excludeFactions?.includes(f.id)) continue;
      if (g.onlyFactions && !g.onlyFactions.includes(f.id)) continue;
      const units = [...all.values()].filter((d) => g.pick(d) && !ownIds.has(d.id) && (d._ctx.default || d._ctx.assigned));
      if (!units.length) continue;
      const ruleText = T.Abilities.find((a) => htmlToText(a.name) === g.rule);
      allies.push({ key: g.key, name: g.name, note: g.note, text: ruleText ? htmlToText(ruleText.description) : '' });
      for (const u of units) {
        const costs = g.costContext ? u._ctx[g.costContext] || u.costs : u.costs;
        allyUnits.push({ ...u, costs, group: 'ally:' + g.key, enhancements: [] });
      }
    }

    // общие правила (Core/Faction), на которые ссылаются инфолисты этого файла
    const allDs = [...own.map((d) => ({ ...d, group: 'own' })), ...granted, ...allyUnits];
    const rules = {};
    for (const d of allDs) for (const a of d.abilities) if (a.ref && !rules[a.ref]) rules[a.ref] = { name: a.name, text: abilityDefs.get(a.ref)?.text || '' };
    const armyRules = uniq(own.flatMap((d) => d.abilities.filter((a) => a.type === 'faction' && a.ref).map((a) => a.ref)));
    // стратагемы детачментов (для справки)
    const stratagems = T.Stratagems.filter((st) => detIds.has(st.detachment_id)).map((st) => ({
      id: st.id, detachment: st.detachment_id, name: htmlToText(st.name), cp: st.cp_cost, type: htmlToText(st.type),
      turn: st.turn, phase: st.phase, text: htmlToText(st.description),
    }));

    const chapters = f.id === 'SM'
      ? uniq(own.flatMap((d) => d.factionKeywords).filter((k) => !['Adeptus Astartes', 'Imperium', 'Agents of the Imperium'].includes(k))).sort()
      : [];
    const data = {
      id: f.id,
      name: f.name,
      allegiance: allegiance[f.id],
      primaryKeyword: primaryKeyword(own),
      chapters,
      armyRules,
      rules,
      datasheets: allDs,
      detachments: dets,
      stratagems,
      enhancements: enh,
      allies,
    };
    fs.writeFileSync(path.join(OUT, 'f', f.id + '.json'), JSON.stringify(data));
    index.push({ id: f.id, name: f.name, allegiance: allegiance[f.id], units: own.length, detachments: dets.length });
  }
  index.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
    edition: '11',
    lastUpdate,
    generatedAt: new Date().toISOString(),
    credit: 'powered by Wahapedia',
    factions: index,
  }, null, 1));
  console.log(`Готово: ${index.length} фракций, ${all.size} инфолистов, ${detachments.length} детачментов, ${enhancements.length} улучшений → ${OUT}`);
  console.log(`Данные Wahapedia от ${lastUpdate} (GMT+3)`);
}

function primaryKeyword(ds) {
  const c = new Map();
  for (const d of ds) for (const k of d.factionKeywords) c.set(k, (c.get(k) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
function uniq(a) {
  return [...new Set(a)];
}
function byLine(a, b) {
  return (int(a.line) ?? 0) - (int(b.line) ?? 0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('import-wahapedia.mjs')) {
  main().catch((e) => {
    console.error('Ошибка импорта:', e.message);
    process.exit(1);
  });
}
