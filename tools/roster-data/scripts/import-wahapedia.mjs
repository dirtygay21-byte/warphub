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
import { repair40kData } from './updates-40k.mjs';

const BASE_URL = 'https://wahapedia.ru/wh40k11ed/';
const FILES = [
  'Factions', 'Source', 'Datasheets', 'Datasheets_keywords', 'Datasheets_models',
  'Datasheets_unit_composition', 'Datasheets_models_cost', 'Datasheets_enhancements',
  'Datasheets_leader', 'Enhancements', 'Detachment_abilities', 'Detachments',
  'Detachments_chapter_dp', 'Last_update', 'Abilities', 'Datasheets_abilities',
  'Datasheets_wargear', 'Datasheets_options', 'Datasheets_stratagems', 'Stratagems', 'Datasheets_detachment_abilities',
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
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', emsp: ' ', ensp: ' ', thinsp: ' ',
  laquo: '«', raquo: '»', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', times: '×', bull: '•',
};
const decodeEntities = (s) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/**
 * Последняя чистка любого текста из выгрузки (та же логика, что cleanRuleText в client/src/features/roster/text.ts —
 * их совпадение проверяет tests/text.test.ts):
 *   • повторно закодированные сущности («&amp;emsp;», «&lt;KY&gt;») раскодируются, после чего теги убираются ещё раз;
 *   • ссылки Wahapedia «%000009837Redeploy%» превращаются в «Redeploy».
 */
export function cleanWahaText(input) {
  if (!input) return '';
  // дважды закодированное («&amp;emsp;») раскодируем, пока текст меняется (не больше 3 раз)
  let out = String(input);
  for (let i = 0; i < 3; i++) {
    const next = decodeEntities(out);
    if (next === out) break;
    out = next;
  }
  out = out.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[A-Za-z][A-Za-z0-9]{0,9}\s*\/?>/g, '');
  out = out.replace(/%\d{6,}([^%\n]*)%/g, '$1').replace(/%\d{6,}/g, '');
  // текст оборвался посреди тега («… inflict D3 <a href="/aos4/the-rul») — обрывок тега убираем;
  // заглушка таблицы «$000001417» (сама таблица в выгрузку не попала) — тоже. Что текст неполный,
  // отмечает rawIncomplete (поле incomplete у правила), а не молчаливое удаление.
  out = out.replace(/<[A-Za-z/][^>\n]*$/, '').replace(/\n?\$\d{6,}/g, '');
  return out
    .replace(/[ \t\u00a0\u2002\u2003\u2009]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Признак неполного текста по сырому HTML из выгрузки:
 *   'table'     — вместо таблицы заглушка «$000001417» (таблиц в выгрузке нет, см. Export_Data_Specs);
 *   'truncated' — текст оборван: длина упёрлась в лимит поля выгрузки (cap; у AoS — 1024 символа,
 *                 пробел на месте обрыва Wahapedia срезает, поэтому 1023 тоже обрыв) или кончается посреди тега.
 * Иначе null.
 */
export function rawIncomplete(html, cap = 0) {
  const t = String(html ?? '');
  if (/\$\d{6,}/.test(t)) return 'table';
  if (cap && t.length >= cap - 1) return 'truncated';
  if (/<[A-Za-z/][^>]*$/.test(t.trimEnd())) return 'truncated';
  return null;
}

export function htmlToText(html) {
  if (!html) return '';
  const text = html
    .replace(/<!--.*?-->/gs, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d|table|ul)>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '');
  return cleanWahaText(text);
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
 * Datasheets_models_cost → { default: Band[], assigned?: Band[], variants: { default?: Band[][], … } }
 * Band = { from, to, options:[{label, models, cost}], addons:[{label,cost}], wargear:[{label,cost}] }
 *
 * Таблица = полосы от первого заголовка «YOUR … COST» до его повтора в уже заполненной полосе.
 * У части инфолистов Space Marines несколько таблиц подряд — цены орденов (Blood Angels, Dark Angels, Deathwatch);
 * в выгрузке не подписано, какая чья. Первая таблица — обычная цена (default); остальные, отличные от неё, —
 * variants (порядок как в выгрузке). Какому ордену какая — задаётся в 40k/curated.json → chapterCosts.
 * Строки внутри таблицы иногда задублированы (каждая дважды) — дубли убираются.
 */
export function parseCosts(rows) {
  const tables = {}; // контекст → [[band…], …]
  let cur = 'default';
  let bands = null;
  let band = null;
  let mode = 'size';
  const newTable = () => {
    bands = [];
    (tables[cur] ||= []).push(bands);
    band = null;
    mode = 'size';
  };
  const sorted = [...rows].sort((a, b) => int(a.line) - int(b.line));
  for (const r of sorted) {
    const raw = r.description || '';
    if (/dsHeaderAoI/.test(raw)) {
      const t = htmlToText(raw).toUpperCase();
      cur = t.includes('ASSIGNED') ? 'assigned' : 'aoi';
      newTable();
      continue;
    }
    if (!bands) newTable();
    const label = htmlToText(raw).replace(/^\+\s*/, '+ ').trim();
    const bh = parseBandHeader(label);
    if (bh) {
      const existing = bands.find((b) => b.from === bh.from && b.to === bh.to);
      if (existing && existing.options.length) {
        // повтор уже заполненной полосы = следующая таблица цен
        newTable();
      } else if (existing) {
        band = existing;
        mode = 'size';
        continue;
      }
      band = { from: bh.from, to: bh.to, options: [], addons: [], wargear: [] };
      bands.push(band);
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
  const ctx = {};
  const variants = {};
  for (const [key, list] of Object.entries(tables)) {
    const filled = [];
    for (const bs of list) {
      // полосы без вариантов размера (только wargear) наследуют размеры соседней
      bs.sort((a, b) => a.from - b.from);
      const proto = bs.find((b) => b.options.length);
      if (!proto) continue;
      for (const b of bs) {
        if (!b.options.length) b.options = proto.options;
        if (!b.wargear.length) b.wargear = proto.wargear;
      }
      filled.push(bs);
    }
    if (!filled.length) continue;
    ctx[key] = filled[0];
    const seen = new Set([JSON.stringify(filled[0])]);
    const rest = [];
    for (const bs of filled.slice(1)) {
      const k = JSON.stringify(bs);
      if (seen.has(k)) continue;
      seen.add(k);
      rest.push(bs);
    }
    if (rest.length) variants[key] = rest;
  }
  if (!ctx.default && ctx.aoi) {
    ctx.default = ctx.aoi;
    if (variants.aoi) variants.default = variants.aoi;
  }
  delete ctx.aoi;
  delete variants.aoi;
  ctx.variants = variants;
  return ctx;
}

// ---------- правила детачментов из текста ----------
const KW_SEP = /\s*(?:,|\band\b|\bor\b)\s*/i;
/**
 * Правила формирования армии из текста детачмента.
 * vocab — все ключевые слова (UPPER), names — все названия инфолистов (UPPER).
 */
export function parseDetachmentRules(texts, vocab = new Set(), names = new Set()) {
  const out = { tag: null, chapter: null, battleline: [], grants: [], forbid: null, requires: [], limitOverride: null, disablesArmyRule: null };
  const toMatcher = (subject, excluding = '') => {
    const m = { names: [], keywords: [], exclude: [] };
    const items = subject.includes('/') ? subject.split('/') : [subject];
    for (let it of items) {
      it = it.replace(/\bunits?\b/gi, '').trim();
      if (!it) continue;
      const U = it.toUpperCase();
      if (names.has(U)) m.names.push(U);
      else if (vocab.has(U)) m.keywords.push([U]);
      else {
        // «Tyranids Vanguard Invader» → [TYRANIDS, VANGUARD INVADER]
        const words = U.split(/\s+/);
        const seq = [];
        for (let i = 0; i < words.length; ) {
          let j = words.length;
          while (j > i && !vocab.has(words.slice(i, j).join(' '))) j--;
          if (j === i) {
            seq.length = 0;
            break;
          }
          seq.push(words.slice(i, j).join(' '));
          i = j;
        }
        if (seq.length) m.keywords.push(seq);
        else if (names.has(U)) m.names.push(U);
        else m.keywords.push([U]);
      }
    }
    for (const x of excluding.split(/,|;|\band\b|\bor\b/)) {
      const v = x.replace(/\bunits?\b/gi, '').trim().toUpperCase();
      if (v) m.exclude.push(v);
    }
    return m;
  };
  const capsOf = (t) => {
    const a = t.match(/Incursion:?\s*Up to (\d+)\s*pts[\s\S]*?Strike Force:?\s*Up to (\d+)\s*pts[\s\S]*?Onslaught:?\s*Up to (\d+)\s*pts/i);
    if (a) return [+a[1], +a[2], +a[3]];
    const b = t.match(/cannot exceed (\d+) points/i);
    return b ? [+b[1], +b[1], +b[1]] : null;
  };
  for (const t of texts) {
    const one = t.replace(/\n/g, ' ');
    const tag = one.match(/has the ([A-Z][A-Z'’\- ]+?) tag/);
    if (tag) out.tag = tag[1].trim();
    const ch = one.match(/Your army can include ([A-Za-z’' ]+?) units, but it cannot include (?:any )?ADEPTUS ASTARTES units drawn from any other Chapter/i);
    if (ch) out.chapter = titleKw(ch[1]);
    for (const line of t.split('\n')) {
      // строка может начинаться с маркера списка: «• Troupe units from your army gain…», «• WAR DOG units … have…»
      const m = line.match(/(?:^|\.\s*|KEYWORDS\s*|Detachment,\s*)(?:[•▪◦]\s*)?([A-Za-z’'\- ,]+?) (?:units|models) from your army (?:gain|have) the BATTLELINE keyword/i);
      if (m) {
        const nm = m[1].replace(/^.*Detachment,\s*/i, '').replace(/^(KEYWORDS|TRAVELLING PLAYERS)\s*/i, '').split(KW_SEP).map((x) => x.trim()).filter(Boolean);
        out.battleline.push(...nm);
      }
    }
    // юниты, которые разрешает детачмент (+ лимит очков, запреты на Warlord, исключённые ключевые слова)
    const grantFrom = (matcher) => {
      const nw = one.match(/No ([A-Za-z’' ]+?) models? from your army can be your WARLORD/i);
      const wm = one.match(/An? ([A-Za-z’' ]+?) model must be your WARLORD/i);
      const ex = one.match(/cannot include units with any of the following keywords in your army using this rule:\s*([^.]+)\./i);
      if (ex) for (const x of ex[1].split(';')) if (x.trim()) matcher.exclude.push(x.trim().toUpperCase());
      out.grants.push({ ...matcher, caps: capsOf(t), noWarlord: nw ? nw[1].toUpperCase() : null, warlordMust: wm ? wm[1].toUpperCase() : null });
    };
    for (const m of one.matchAll(/You can include (?:the )?([A-Za-z’'\/\- ]+?) units(?: \(excluding ([^)]*)\))? in your army/gi)) grantFrom(toMatcher(m[1], m[2] || ''));
    const list = t.match(/you can include the following [A-Z’' ]+ units:\s*\n((?:\s*•[^\n]+\n?)+)/i);
    if (list) {
      const m = { names: [], keywords: [], exclude: [] };
      for (const b of list[1].split('\n')) {
        const v = b.replace(/^\s*•\s*/, '').trim();
        if (!v) continue;
        const sub = toMatcher(v);
        m.names.push(...sub.names);
        m.keywords.push(...sub.keywords);
      }
      grantFrom(m);
    }
    // запреты: «you cannot include any Daemon Prince, … or Epic Hero units (excluding Be’lakor)»
    const fb = one.match(/When mustering your army, you cannot include any (.+?) units(?: \(excluding ([^)]*)\))?/i);
    if (fb) {
      const m = { names: [], keywords: [], exclude: [] };
      for (const x of fb[1].split(/,|\bor\b/)) {
        const sub = toMatcher(x.trim());
        m.names.push(...sub.names);
        m.keywords.push(...sub.keywords);
      }
      if (fb[2]) m.exclude.push(...fb[2].split(/,|\band\b/).map((x) => x.trim().toUpperCase()).filter(Boolean));
      out.forbid = m;
    }
    // обязательные юниты
    const rq = one.match(/You must include (.+?) in your army, and one of those models must be your WARLORD/i);
    if (rq) {
      const m = { names: rq[1].split(/\s*(?:and\/or|,|\bor\b)\s*/).map((x) => x.trim().toUpperCase()).filter(Boolean), keywords: [], exclude: [] };
      out.requires.push({ matcher: m, min: 1, warlord: true });
    }
    const mn = one.match(/Your army must include (one|two|three|four|\d+) or more ([A-Za-z’' ]+?) units/i);
    if (mn) {
      const n = { one: 1, two: 2, three: 3, four: 4 }[mn[1].toLowerCase()] ?? +mn[1];
      out.requires.push({ matcher: toMatcher(mn[2]), min: n, warlord: false });
    }
    const lo = one.match(/You can include up to (two|three|four|\d+) of each of the following models in your army:\s*([^.•]+?)(?:\.|•|$)/i);
    if (lo) {
      const n = { two: 2, three: 3, four: 4 }[lo[1].toLowerCase()] ?? +lo[1];
      out.limitOverride = { names: lo[2].split(/,|\band\b/).map((x) => x.trim().toUpperCase()).filter(Boolean), max: n };
    }
    const dis = one.match(/you cannot use the ([A-Za-z’' ]+?) army rule/i);
    if (dis) out.disablesArmyRule = dis[1].trim();
  }
  out.battleline = [...new Set(out.battleline.map((x) => x.toUpperCase()))];
  return out;
}

/** Подходит ли инфолист под описание (названия / наборы ключевых слов / исключения). */
export function matchesUnit(ds, m) {
  const kws = new Set([...ds.keywords, ...ds.factionKeywords].map((k) => k.toUpperCase()));
  const name = ds.name.toUpperCase();
  if (m.exclude.some((x) => kws.has(x) || kws.has(x + 'S') || name === x || name === x + 'S')) return false;
  return m.names.includes(name) || m.keywords.some((set) => set.every((k) => kws.has(k)));
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
    // Drukhari: Harlequins и Anhrathe до 250/500/750 очков; Reaper's Wager отключает это правило
    key: 'corsairs', name: 'Corsairs and Travelling Players', rule: 'Corsairs and Travelling Players', allegiance: ['Xenos'], onlyFactions: ['DRU'],
    pick: (ds) => ds.faction === 'AE' && (ds.factionKeywords.includes('Harlequins') || ds._kw.has('ANHRATHE')),
    note: 'Harlequins и Anhrathe до 250/500/750 очков. Не Warlord, без улучшений.',
  },
  {
    // армии, где у всех моделей есть Chaos Knights или Heretic Astartes
    key: 'daemons', name: 'Daemonic Pact', rule: 'Daemonic Pact', allegiance: ['Chaos'], onlyFactions: ['CSM', 'DG', 'TS', 'WE', 'EC', 'QT'],
    pick: (ds) => ds.faction === 'CD',
    note: 'До 250/500/750 очков. Не Warlord, без улучшений. По каждому богу не-BATTLELINE юнитов не больше, чем BATTLELINE.',
  },
];

/** Ключевые слова фракции армии, если их несколько (иначе — самое частое). */
const ARMY_KEYWORDS = {
  AE: ['Asuryani', 'Harlequins', 'Aeldari'],
};

// ---------- снаряжение ----------
const normName = (s) => s.toLowerCase().replace(/[’`‘]/g, "'").replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
/** Datasheets_wargear → оружие, сгруппированное по профилям (line_in_wargear > 1 — доп. профиль). */
export function parseWeapons(rows) {
  const out = [];
  for (const w of [...rows].sort(byLine)) {
    const full = htmlToText(w.name).trim();
    if (!full) continue; // пустые строки выгрузки (без названия и характеристик)
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
  // «the» снимается с обеих сторон: в тексте «the Axe Mortalis», в оружии «The Axe Mortalis»
  const names = weapons.map((w) => ({ w: w.name, n: normName(w.name).replace(/^the /, '') }));
  const find = (item) => {
    const n = normName(item).replace(/^the /, '');
    if (!n) return undefined;
    const exact =
      names.find((x) => x.n === n) ||
      names.find((x) => x.n === n.replace(/s$/, '')) ||
      names.find((x) => x.n.replace(/s$/, '') === n.replace(/s$/, ''));
    if (exact) return exact.w;
    // сокращённое название в тексте: «Perdition» ↔ оружие «Perdition Pistol» — только если такое оружие одно
    const pre = names.filter((x) => x.n.startsWith(n + ' '));
    return pre.length === 1 ? pre[0].w : undefined;
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

// ---------- ручные дополнения и отчёт импорта ----------
const HERE = path.dirname(new URL(import.meta.url).pathname);
const CURATED = path.join(HERE, '..', '40k', 'curated.json');
const REPORT = path.join(HERE, '..', '40k', 'import-report.json');

function loadCurated() {
  return fs.existsSync(CURATED) ? JSON.parse(fs.readFileSync(CURATED, 'utf8')) : {};
}

/**
 * Проверка самой выгрузки: повторы id, ссылки на несуществующие записи, пустые строки.
 * Ничего не исправляет — только записывает в отчёт, чтобы новая выгрузка не принесла проблемы молча.
 */
export function auditSource(T) {
  const report = { errors: [], warnings: [], info: [] };
  const ids = (t) => new Set(T[t].map((r) => r.id));
  for (const t of ['Factions', 'Source', 'Datasheets', 'Abilities', 'Detachments', 'Enhancements', 'Stratagems', 'Detachment_abilities']) {
    const seen = new Map();
    for (const r of T[t]) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
    const dup = [...seen].filter(([, n]) => n > 1);
    if (dup.length) report.info.push(`${t}: ${dup.length} id повторяются (${dup.slice(0, 5).map(([k]) => k).join(', ')}${dup.length > 5 ? '…' : ''})`);
  }
  const ds = ids('Datasheets');
  const fk = (t, col, target, label) => {
    const bad = T[t].filter((r) => r[col] && !target.has(r[col]));
    if (bad.length) report.info.push(`${t}.${col}: ${bad.length} ссылок на несуществующие ${label} (${uniq(bad.map((r) => r[col])).slice(0, 5).join(', ')})`);
  };
  for (const t of ['Datasheets_abilities', 'Datasheets_keywords', 'Datasheets_models', 'Datasheets_models_cost', 'Datasheets_options', 'Datasheets_unit_composition', 'Datasheets_wargear', 'Datasheets_enhancements', 'Datasheets_stratagems', 'Datasheets_detachment_abilities'])
    fk(t, 'datasheet_id', ds, 'инфолисты');
  fk('Datasheets_leader', 'leader_id', ds, 'инфолисты');
  fk('Datasheets_leader', 'attached_id', ds, 'инфолисты');
  fk('Datasheets_abilities', 'ability_id', ids('Abilities'), 'способности');
  fk('Datasheets_enhancements', 'enhancement_id', ids('Enhancements'), 'улучшения');
  fk('Datasheets_stratagems', 'stratagem_id', ids('Stratagems'), 'стратагемы');
  fk('Datasheets_detachment_abilities', 'detachment_ability_id', ids('Detachment_abilities'), 'правила детачментов');
  for (const t of ['Enhancements', 'Stratagems', 'Detachment_abilities', 'Detachments_chapter_dp']) fk(t, 'detachment_id', ids('Detachments'), 'детачменты');
  const noLine = T.Datasheets_wargear.filter((r) => !String(r.line).trim()).length;
  if (noLine) report.info.push(`Datasheets_wargear: ${noLine} строк без номера line — порядок профилей берётся из файла`);
  const emptyKw = T.Datasheets_keywords.filter((r) => !r.keyword.trim()).length;
  if (emptyKw) report.info.push(`Datasheets_keywords: ${emptyKw} пустых ключевых слов (пропущены)`);
  const noSrc = T.Datasheets.filter((d) => !bool(d.virtual) && !d.source_id);
  if (noSrc.length) report.warnings.push(`Datasheets: без source_id — ${noSrc.map((d) => `${d.faction_id} «${htmlToText(d.name)}»`).join(', ')}`);
  const mfm = T.Source.find((s) => /munitorum field manual/i.test(s.name));
  if (mfm && /^0?1\.0?1\.0+1/.test(mfm.errata_date)) report.warnings.push(`Source: у «${mfm.name}» нет даты версии (${mfm.errata_date}) — версию очков по выгрузке не установить`);
  return report;
}

/** Мин. и макс. число моделей по составу отряда («1 Sergeant», «4-9 Intercessors»); null — состав не разобрать. */
export function compositionRange(lines) {
  if (lines.some((l) => /\bor\b|one of the following|models maximum/i.test(l))) return null;
  let lo = 0;
  let hi = 0;
  for (const l of lines) {
    for (const part of l.split(/,|\band\b/)) {
      const m = part.trim().match(/^(\d+)(?:\s*[-‑–]\s*(\d+))?\s+\S/);
      if (!m) continue;
      lo += +m[1];
      hi += +(m[2] ?? m[1]);
    }
  }
  return hi ? { lo, hi } : null;
}

function checkDatasheet(rec, ctx, report) {
  const where = `${rec.faction}: «${rec.name}» (${rec.id})`;
  if (!rec.costs.length && !ctx.assigned) report.warnings.push(`${where} — нет цены в выгрузке; юнит нельзя взять законно`);
  // размеры из таблицы цен вне состава отряда («1 model» у Bike Squad при составе 3–7)
  const range = compositionRange(rec.composition);
  const sizes = uniq(rec.costs.flatMap((b) => b.options.map((o) => o.models)));
  const out = range ? sizes.filter((n) => n < range.lo || n > range.hi) : [];
  if (out.length) report.warnings.push(`${where} — размер в ценах (${out.join(', ')} мод.) вне состава отряда ${range.lo}–${range.hi}; проверить по Munitorum Field Manual`);
  // снаряжение по умолчанию: оружие есть, текст «equipped with» есть, а разобрать не удалось
  if (rec.weapons.length && /equipped with:(?!\s*nothing)/i.test(rec.loadout) && !rec.defaultLoadout.length)
    report.warnings.push(`${where} — снаряжение по умолчанию не разобрано: ${rec.loadout.slice(0, 100)}`);
  for (const a of rec.abilities) if (a.incomplete) report.info.push(`${where} — способность «${a.name}»: ${a.incomplete === 'table' ? 'таблица или схема не выгружена' : 'текст обрезан'}`);
}

// ---------- main ----------
async function main() {
  if (flag('--fetch')) await fetchAll(SRC);
  const T = Object.fromEntries(FILES.map((f) => [f, load(SRC, f)]));
  const lastUpdate = T.Last_update[0]?.last_update?.trim() || null;
  const curated = loadCurated();
  const chapterMap = curated.chapterCosts?.map ?? {};
  const report = auditSource(T);

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
  const detAbilBy = groupBy(T.Datasheets_detachment_abilities, 'datasheet_id');
  const usedStrat = new Set(T.Datasheets_stratagems.map((x) => x.stratagem_id));
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
      // цены орденов: дополнительные таблицы цен и орден каждой (40k/curated.json → chapterCosts)
      costVariants: (ctx.variants.default || []).map((costs, i) => ({ chapter: chapterMap[d.id]?.[i] ?? null, costs })),
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
          // заглушка невыгруженной таблицы/схемы («$000003426») — текст неполный
          incomplete: def ? undefined : rawIncomplete(a.description) ?? undefined,
        };
      }).filter((a) => a.name || a.text),
      weapons: [],
      defaultLoadout: [],
      options: (optionsBy.get(d.id) || []).sort(byLine).map((o) => ({ star: o.button === '*', text: htmlToText(o.description) })),
      stratagems: uniq((stratBy.get(d.id) || []).map((x) => x.stratagem_id)),
      detachmentAbilities: uniq((detAbilBy.get(d.id) || []).map((x) => x.detachment_ability_id)),
      enhancements: uniq((enhByDs.get(d.id) || []).map((e) => e.enhancement_id)),
    };
    rec.weapons = parseWeapons(wargearBy.get(d.id) || []);
    rec.defaultLoadout = parseLoadout(rec.loadout, rec.weapons);
    if (!rec.costVariants.length) delete rec.costVariants;
    checkDatasheet(rec, ctx, report);
    Object.defineProperty(rec, '_kw', { value: kwSet });
    Object.defineProperty(rec, '_ctx', { value: ctx });
    all.set(d.id, rec);
  }

  // ссылки Leader на инфолисты, которых нет в выгрузке, отбрасываются (в отчёте — как сломанные связи)
  for (const d of all.values()) d.leads = d.leads.filter((id) => all.has(id));

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
  const vocab = new Set([...all.values()].flatMap((d) => [...d.keywords, ...d.factionKeywords].map((k) => k.toUpperCase())));
  const dsNames = new Set([...all.values()].map((d) => d.name.toUpperCase()));
  const chapterDp = groupBy(T.Detachments_chapter_dp, 'detachment_id');
  const detachments = T.Detachments.map((d) => {
    const abil = (abilByDet.get(d.id) || []).map((a) => ({ id: a.id, name: htmlToText(a.name), text: htmlToText(a.description) }));
    const rules = parseDetachmentRules(abil.map((a) => a.text), vocab, dsNames);
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
    ...(rawIncomplete(e.description) ? { incomplete: rawIncomplete(e.description) } : {}),
  }));

  const allDetIds = new Set(T.Detachments.map((d) => d.id));
  for (const d of detachments) {
    const n = T.Stratagems.filter((st) => st.detachment_id === d.id).length;
    if (!n) report.info.push(`${d.faction}: детачмент «${d.name}» — 0 стратагем в выгрузке`);
  }

  // --- сборка по фракциям ---
  fs.mkdirSync(path.join(OUT, 'f'), { recursive: true });
  const index = [];
  for (const f of T.Factions) {
    const own = [...all.values()].filter((d) => d.faction === f.id);
    if (!own.some((d) => d.costs.length)) continue;
    const dets = detachments.filter((d) => d.faction === f.id);
    const detIds = new Set(dets.map((d) => d.id));
    const enh = enhancements.filter((e) => detIds.has(e.detachment));
    const ownIds = new Set(own.map((d) => d.id));

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
        allyUnits.push({ ...u, costs, group: 'ally:' + g.key, enhancements: g.key === 'corsairs' ? u.enhancements : [] });
        ownIds.add(u.id);
      }
    }
    // копии чужих юнитов внутри фракции (Brood Brothers у GC, Chaos Lord у CD…) — доступны только с детачментом
    const baseSource = (n) => n.replace(/^Legends:\s*/i, '').replace(/\s*\((Warhammer Legends|Forge World)\)$/i, '').trim();
    const ownGroup = new Map();
    for (const d of own) {
      if (baseSource(d.source) === f.name || !d.source) continue;
      const det = dets.find((x) => x.grants.some((g) => matchesUnit(d, { ...g, exclude: [] })));
      if (det) ownGroup.set(d.id, 'det:' + det.id);
    }
    // юниты других фракций, которые разрешают детачменты (Brood Brothers, Shadow Legion, Questor Forgepact…)
    const granted = [];
    for (const det of dets) {
      for (const g of det.grants) {
        const cand = [...all.values()].filter((d) => !ownIds.has(d.id) && d.costs.length && matchesUnit(d, g));
        if (!cand.length) continue;
        // берём юниты одной «родной» фракции (самой частой среди подходящих) и не дублируем уже доступные названия
        const cnt = new Map();
        for (const d of cand) cnt.set(d.faction, (cnt.get(d.faction) || 0) + 1);
        const home = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const have = new Set([...own, ...allyUnits, ...granted].map((d) => d.name.toUpperCase()));
        for (const d of cand) {
          if (d.faction !== home || have.has(d.name.toUpperCase())) continue;
          granted.push({ ...d, group: 'det:' + det.id });
          ownIds.add(d.id);
          have.add(d.name.toUpperCase());
        }
      }
    }

    // общие правила (Core/Faction), на которые ссылаются инфолисты этого файла
    const allDs = [...own.map((d) => ({ ...d, group: ownGroup.get(d.id) ?? 'own' })), ...granted, ...allyUnits];
    const rules = {};
    for (const d of allDs) for (const a of d.abilities) if (a.ref && !rules[a.ref]) rules[a.ref] = { name: a.name, text: abilityDefs.get(a.ref)?.text || '' };
    const armyRules = uniq(own.flatMap((d) => d.abilities.filter((a) => a.type === 'faction' && a.ref).map((a) => a.ref)));
    // стратагемы детачментов (для справки)
    // основные стратагемы 11-й ред. — те, на которые ссылаются юниты (старые 10-й ред. остались в выгрузке без ссылок)
    const isCore = (st) => !st.faction_id && /^Core/i.test(htmlToText(st.type)) && usedStrat.has(st.id);
    // стратагемы правил армии (у Aeldari «Army Rules» — ссылка на детачмент, которого нет в Detachments):
    // показываются как общие стратагемы фракции, без детачмента
    const isArmy = (st) => st.faction_id === f.id && !allDetIds.has(st.detachment_id) && /army rules/i.test(st.detachment);
    const stratagems = T.Stratagems.filter((st) => detIds.has(st.detachment_id) || isCore(st) || isArmy(st)).map((st) => ({
      id: st.id, detachment: isArmy(st) ? '' : st.detachment_id, name: htmlToText(st.name), cp: st.cp_cost, type: htmlToText(st.type),
      turn: st.turn, phase: st.phase, text: htmlToText(st.description),
      ...(isArmy(st) ? { army: true } : {}),
      ...(rawIncomplete(st.description) ? { incomplete: rawIncomplete(st.description) } : {}),
    }));

    const chapters = f.id === 'SM'
      ? uniq(own.flatMap((d) => d.factionKeywords).filter((k) => !['Adeptus Astartes', 'Imperium', 'Agents of the Imperium'].includes(k))).sort()
      : [];
    const data = {
      id: f.id,
      name: f.name,
      allegiance: allegiance[f.id],
      primaryKeyword: primaryKeyword(own),
      // юниты с этими ключевыми словами фракции допустимы без особых правил
      armyKeywords: ARMY_KEYWORDS[f.id] ?? [primaryKeyword(own)].filter(Boolean),
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
    // фракция без детачментов не может быть основной армией (Adeptus Titanicus — только союзник Titanic Support)
    if (!dets.length) {
      report.info.push(`${f.id}: нет детачментов — не показывается как армия (юниты доступны союзникам)`);
      continue;
    }
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
  // проверенные обновления поверх выгрузки (40k/curated.json → updates) — та же функция, что в repair-40k-data.mjs
  // обработчик whrules-faction (scripts/whrules-convert.mjs) использует движок клиента — импорт запускается через bun или node --import tsx
  const { WHRULES_APPLIERS } = await import('./whrules-convert.mjs');
  report.info.push(...repair40kData(OUT, curated, { appliers: WHRULES_APPLIERS }).lines);
  for (const d of all.values())
    for (const v of d.costVariants ?? []) if (!v.chapter) report.warnings.push(`${d.faction}: «${d.name}» (${d.id}) — дополнительная таблица цен без ордена (40k/curated.json → chapterCosts); применяется обычная цена`);
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 1) + '\n');
  console.log(`Готово: ${index.length} фракций, ${all.size} инфолистов, ${detachments.length} детачментов, ${enhancements.length} улучшений → ${OUT}`);
  console.log(`отчёт: ${report.errors.length} ошибок, ${report.warnings.length} предупреждений, ${report.info.length} заметок → ${path.relative(process.cwd(), REPORT)}`);
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
