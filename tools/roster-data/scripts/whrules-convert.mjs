#!/usr/bin/env node
/**
 * Конвертер полного снимка wh-rules.ru (40k/whrules-<версия>-full.json) в формат данных приложения — Space Marines
 * (с орденами) и Imperial Agents. Задача SM-4: только расчёт, сравнение и отчёт («сухой прогон»). Данные приложения
 * (backend/roster-data) не меняются — запись появится отдельным шагом после утверждения.
 *
 *   node scripts/whrules-convert.mjs --out <файл.json>   — отчёт сухого прогона (сводка печатается в консоль)
 *
 * Источник один — собранный снимок wh-rules 981. Чего в нём нет, то не выдумывается и не берётся извне:
 *  - поле остаётся из текущих данных и помечается как «наследие, не проверено» (стоимость снаряжения, связи Leader
 *    на общие наборы ключевых слов, тексты основных правил), либо
 *  - остаётся пустым и попадает в отчёт как недоступное (текст правила Damaged, базы техники).
 * Каждое значение получает происхождение (provenance): whrules | derived | legacy | unavailable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDetachmentRules, parseLoadout } from './import-wahapedia.mjs';
import { loadSnapshot } from './updates-40k.mjs';
import { baseline40k } from './baseline-40k.mjs';
import { buildOptionRemap } from '../../../client/src/features/roster/engine/options-remap.ts';
import { FULL_FACTIONS, loadFull, loadRenames, mapSpaceMarines, newId, planSpaceMarines, slugify } from './whrules-map.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', '..', '..', 'backend', 'roster-data');

/** Фракции сайта → название ордена (ключевое слово фракции) для орденов; space-marines — сам кодекс. */
export const CHAPTER_OF = { 'black-templars': 'Black Templars', 'blood-angels': 'Blood Angels', 'dark-angels': 'Dark Angels', deathwatch: 'Deathwatch', 'space-wolves': 'Space Wolves' };
const SM_FAMILY = FULL_FACTIONS.filter((f) => f !== 'imperial-agents');
/** Пояснение для прежних детачментов/улучшений/стратагем (client: engine/source.ts → OUTDATED_RULE_NOTE). */
export const OUTDATED_RULE_TEXT = '* Нет в текущем источнике — сохранено для уже собранных ростеров, для новых недоступно.';

// ---------- текст ----------
/**
 * Разметка wh-rules → обычный текст приложения: «**[gloss:id:текст]**» и «[gloss:id:текст]» → «текст»,
 * «[core:Deep Strike]» → «Deep Strike», «**жирный**» → «жирный», заголовок «### X» → «X», маркер «▪» → «•».
 */
export function mdToText(s) {
  if (!s) return '';
  return String(s)
    .replace(/\[(?:gloss|core|rule|kw|ability):[^:\]]*:([^\]]*)\]/g, '$1')
    .replace(/\[(?:gloss|core|rule|kw|ability):([^\]]*)\]/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/▪/g, '•')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
// «**» без пары — сноска варианта снаряжения (как в текущих данных), не разметка
const hasMd = (s) => /\[(gloss|core|rule|kw|ability):|\*\*[^*\n]+\*\*|^#{1,6}\s|▪/m.test(s ?? '');

// ---------- цены ----------
const ORD = (s) => +String(s).match(/\d+/)[0];
/** «1st-2nd» → {from:1,to:2}; «3rd+» → {from:3,to:null}; «1st» → {from:1,to:1}; без пометки — {1,null}. */
export function tierOf(note) {
  const t = (note ?? '').match(/(\d+)(?:st|nd|rd|th)(?:\s*-\s*(\d+)(?:st|nd|rd|th))?(\+)?/);
  if (!t) return { from: 1, to: null };
  return { from: ORD(t[1]), to: t[2] ? ORD(t[2]) : t[3] ? null : ORD(t[1]) };
}
const ALLIED = /Agents of the Imperium \(allied\)/i;
/** Надпись размера: «N models» или состав из пометки («1 Sword Brother, 4 Neophytes, 5 Initiates»). */
function sizeLabel(p) {
  const rest = (p.note ?? '').replace(ALLIED, '').replace(/\(?\d+(?:st|nd|rd|th)(?:\s*-\s*\d+(?:st|nd|rd|th))?\+?\)?/g, '').replace(/^[\s,]+|[\s,]+$/g, '').trim();
  if (rest) return rest;
  return p.models === 1 ? '1 model' : `${p.models} models`;
}
/** Очки сайта → полосы цен приложения. allied — цены союзника (Agents of the Imperium). */
export function costsOf(points, { allied = false } = {}) {
  const bands = [];
  for (const p of points.filter((x) => ALLIED.test(x.note ?? '') === allied)) {
    const t = tierOf(p.note);
    let b = bands.find((x) => x.from === t.from && x.to === t.to);
    if (!b) bands.push((b = { from: t.from, to: t.to, options: [], addons: [], wargear: [] }));
    const label = sizeLabel(p);
    if (!b.options.some((o) => o.label === label)) b.options.push({ label, models: p.models, cost: p.points });
  }
  return bands.sort((a, b) => a.from - b.from);
}

// ---------- оружие ----------
const statSkill = (v) => (v === '-' || v === '–' || v == null || v === '' ? 'N/A' : String(v).replace(/\+$/, ''));
const keywordsOf = (tags) => (tags ?? []).map((t) => t.toLowerCase()).join(', ');
/** Оружие сайта (профили «Название – режим») → оружие приложения с профилями. */
export function weaponsOf(site) {
  const out = [];
  const add = (w, type) => {
    const full = w.name.trim();
    const base = full.split(/\s+[–-]\s+/)[0].trim();
    const profile = {
      name: full, type, range: type === 'Melee' ? 'Melee' : String(w.range ?? '').replace(/"$/, ''),
      A: String(w.a ?? ''), skill: statSkill(type === 'Melee' ? w.ws : w.bs), S: String(w.s ?? ''), AP: String(w.ap ?? ''), D: String(w.d ?? ''),
      keywords: keywordsOf(w.tags),
    };
    const same = out.find((x) => x.name.toLowerCase() === (full === base ? full : base).toLowerCase() && x.profiles[0].type === type);
    if (same) {
      if (!same.profiles.some((p) => p.name === profile.name)) same.profiles.push(profile);
    } else out.push({ name: full === base ? full : base, profiles: [profile] });
  };
  for (const w of site.ranged ?? []) add(w, 'Ranged');
  for (const w of site.melee ?? []) add(w, 'Melee');
  return out;
}

// ---------- способности ----------
const splitList = (s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
/** «Deadly Demise D3» → {name:'Deadly Demise', param:'D3'}; «Scouts 6"» → {Scouts, 6"}. */
export function coreParts(s) {
  const m = s.match(/^(.*?)(?:\s+((?:\d+D\d+(?:\+\d+)?|D\d+(?:\+\d+)?|\d+[+"″]?))\s*)?$/);
  return { name: m[1].trim(), param: (m[2] ?? '').trim() };
}

/**
 * Правила армии из снимка: «Combat Doctrines» (вступление и доктрины) и разделы «### …» после доктрин
 * (Transhuman Strategist, Librarius, Curse of the Wulfen…). Одинаковые разделы разных фракций — одно правило,
 * разные тексты — отдельные id по фракции. Возвращает { rules: {id:{name,text,factions}}, byFaction: {f: {name:id}} }.
 */
export function armyRulesOf(full, factions = FULL_FACTIONS) {
  const DOCTRINES = /^(Assault|Devastator|Tactical) Doctrine$/;
  const texts = {}; // name → Map(text → [factions])
  for (const f of factions) {
    const r = full.factions[f].armyRule;
    if (!r) continue;
    const parts = r.body.split(/\n(?=### )/);
    let main = parts[0];
    const extra = [];
    for (const p of parts.slice(1)) {
      const name = p.split('\n')[0].replace(/^###\s+/, '').trim();
      if (DOCTRINES.test(name)) main += '\n' + p;
      else extra.push({ name, text: p.split('\n').slice(1).join('\n') });
    }
    for (const x of [{ name: r.name, text: main }, ...extra]) {
      const m = (texts[x.name] ??= new Map());
      const t = mdToText(x.text);
      m.set(t, [...(m.get(t) ?? []), f]);
    }
  }
  const rules = {};
  const byFaction = {};
  for (const [name, m] of Object.entries(texts)) {
    const variants = [...m.entries()];
    for (const [text, factions] of variants) {
      const id = variants.length === 1 ? `whr:rule:${slugify(name)}` : `whr:rule:${factions[0]}:${slugify(name)}`;
      rules[id] = { name, text, factions };
      for (const f of factions) (byFaction[f] ??= {})[name] = id;
    }
  }
  return { rules, byFaction };
}

// ---------- ограничения по ключевым словам (улучшения, стратагемы) ----------
/**
 * Требование по ключевым словам из текста цели/ограничения: «One friendly unengaged ADEPTUS ASTARTES INFANTRY unit…»,
 * «That ADEPTUS ASTARTES MOUNTED/SPEEDER unit», «ADEPTUS ASTARTES INFANTRY/MOUNTED model only»,
 * «… VEHICLE unit (excluding DEDICATED TRANSPORT/FLY/WALKER units)». Ключевые слова — ПРОПИСНЫЕ перед «unit/model»;
 * «/» — альтернативы. Возвращает { any: [[kw…]…], exclude: [kw…], unit: «unit only» } или null (разобрать не удалось).
 */
export function keywordReq(text, vocab) {
  const t = (text ?? '').replace(/\s+/g, ' ');
  let m = t.match(/((?:\b[A-Z][A-Z0-9’'\-]*(?:\/[A-Z][A-Z0-9’'\-]*)*\s+)+)(units?|models?)\b/);
  // «That ADEPTUS ASTARTES INFANTRY.» (без «unit»)
  m ??= t.match(/^That ((?:[A-Z][A-Z0-9’'\-]*(?:\/[A-Z][A-Z0-9’'\-]*)*\s*)+)()\.\s*$/);
  if (!m) {
    // «Callidus Assassin models only» — название инфолиста обычным регистром
    const n = t.match(/^([A-Z][\w’'\- ]+?) (units?|models?) only/);
    return n && vocab.has(n[1].toUpperCase()) ? { any: [[n[1].toUpperCase()]], exclude: [], unit: /^unit/.test(n[2]) } : null;
  }
  const tokens = m[1].trim().split(/\s+/);
  // слова → ключевые слова словаря (самые длинные совпадения); «A/B» — альтернативы
  const seq = [];
  for (let i = 0; i < tokens.length; ) {
    let j = tokens.length;
    const ok = (a, b) => tokens.slice(a, b).join(' ').split('/').every((x) => vocab.has(x));
    while (j > i && !ok(i, j)) j--;
    if (j === i) {
      // вся фраза — одно название, записанное слитно/раздельно иначе («LANDSPEEDER VENGEANCE» = «LAND SPEEDER VENGEANCE»):
      // только если без пробелов и дефисов она совпадает ровно с одной записью словаря
      const compact = (s) => s.replace(/[\s\-‑]/g, '');
      const phrase = tokens.join(' ');
      const hits = /\//.test(phrase) ? [] : [...vocab].filter((v) => compact(v) === compact(phrase));
      if (hits.length !== 1 || hits[0] === phrase) return null;
      const ex = t.slice(m.index).match(/\(excluding ([A-Z0-9’'\-\/ ]+?) (?:units?|models?)\)/);
      return { any: [[hits[0]]], exclude: ex ? ex[1].split('/').map((x) => x.trim()).filter((x) => vocab.has(x)) : [], unit: /^unit/.test(m[2]), spelling: { from: phrase, to: hits[0] } };
    }
    seq.push(tokens.slice(i, j).join(' ').split('/'));
    i = j;
  }
  const any = [];
  const build = (k, acc) => (k === seq.length ? any.push(acc) : seq[k].forEach((c) => build(k + 1, [...acc, c])));
  build(0, []);
  const ex = t.slice(m.index).match(/\(excluding ([A-Z0-9’'\-\/ ]+?) (?:units?|models?)\)/);
  const exclude = ex ? ex[1].split('/').map((x) => x.trim()).filter((x) => vocab.has(x)) : [];
  return { any, exclude, unit: /^unit/.test(m[2]) };
}
const fits = (ds, req) => !req || (req.any.some((set) => set.every((k) => ds._kw.has(k))) && !req.exclude.some((k) => ds._kw.has(k)));

/** Ограничение улучшения: первое предложение «… only.» (или весь текст, если такого нет). */
export const enhRestriction = (e) => e.restriction || e.text.split(/\.\s/)[0];

/**
 * Может ли инфолист взять улучшение (решение владельца):
 * - Upgrade («(Upgrade)» в снимке) — юниты-НЕ персонажи с ключевыми словами ограничения (и без исключённых); так же
 *   работает движок: Upgrade нельзя дать персонажу (upg-char), не больше LIMITS.upgradeTargets юнитов (upg-count);
 * - обычное улучшение — только персонажи с ключевыми словами ограничения; «… unit only» круг не расширяет;
 * - ограничение не разобрано — никому. Название, записанное слитно иначе («LANDSPEEDER VENGEANCE»), сопоставляется
 *   только при единственном совпадении без пробелов и дефисов (keywordReq.spelling, в отчёте).
 */
export function enhancementFits(e, d, vocab) {
  const req = keywordReq(enhRestriction(e), vocab);
  if (!req) return false;
  const kw = d._kw ?? new Set([...d.keywords, ...d.factionKeywords, d.name].map((k) => k.toUpperCase()));
  const ok = req.any.some((set) => set.every((k) => kw.has(k))) && !req.exclude.some((k) => kw.has(k));
  return ok && (e.upgrade ? !d.character : d.character);
}

/**
 * Разбор ограничений улучшений для отчёта: explicit — «… model(s) only» с понятными ключевыми словами (персонажи)
 * или Upgrade с понятными ключевыми словами (не персонажи);
 * ambiguous — обычное улучшение «… unit only» (не-персонажи не допускаются, но подошли бы при расширенном прочтении);
 * unmatched — ограничение не разобрано (улучшение никому не назначается).
 */
export function enhancementEligibility(F, vocab) {
  const own = F.datasheets.filter((d) => d.group === 'own');
  const kw = (d) => d._kw ?? new Set([...d.keywords, ...d.factionKeywords, d.name].map((k) => k.toUpperCase()));
  const fitsAny = (d, req) => req.any.some((set) => set.every((k) => kw(d).has(k))) && !req.exclude.some((k) => kw(d).has(k));
  const out = { explicit: [], ambiguous: [], unmatched: [] };
  for (const e of F.enhancements.filter((x) => !x.outdated)) {
    const text = enhRestriction(e);
    const req = keywordReq(text, vocab);
    const det = F.detachments.find((d) => d.id === e.detachment)?.name ?? e.detachment;
    const eligible = own.filter((d) => d.enhancements.includes(e.id)).map((d) => d.name);
    const row = { id: e.id, name: e.name, detachment: det, restriction: text, eligible: eligible.length, upgrade: !!e.upgrade, ...(req?.spelling ? { spelling: req.spelling } : {}) };
    if (!req) out.unmatched.push({ ...row, behaviour: 'никому не назначается' });
    else if (e.upgrade) out.explicit.push({ ...row, behaviour: 'Upgrade: юниты-не персонажи с этими ключевыми словами (до 3 юнитов)', eligibleNames: eligible });
    else if (req.unit) {
      const wouldAdd = own.filter((d) => !d.character && fitsAny(d, req)).map((d) => d.name);
      out.ambiguous.push({ ...row, behaviour: 'только персонажи с этими ключевыми словами', notAllowedNonCharacters: wouldAdd });
    } else out.explicit.push(row);
  }
  return out;
}

/**
 * Варианты снаряжения. Сноска «* …», которую сайт пишет последней строкой варианта, — отдельная запись-сноска
 * (star: true) в конце списка, как в выгрузке Wahapedia: движок (wargear.ts, pairAllowed) читает сноски отдельно.
 */
export function optionsOfSite(list) {
  const isNote = (l) => /^\s*\*(?!\*)/.test(l);
  const opts = [];
  const notes = [];
  for (const t of list) {
    const [first, ...rest] = t.split('\n');
    opts.push({ star: isNote(t), text: mdToText([first, ...rest.filter((l) => !isNote(l))].join('\n')) });
    for (const l of rest.filter(isNote)) notes.push({ star: true, text: mdToText(l.trim()) });
  }
  return [...opts, ...notes];
}

// ---------- конвертация ----------
const ROLE_TYPES = ['Infantry', 'Mounted', 'Beast', 'Monster', 'Vehicle', 'Fortification'];
function roleOf(kw) {
  const type = ROLE_TYPES.find((t) => kw.includes(t)) ?? '';
  if (kw.includes('Epic Hero')) return `${type} Epic Hero`.trim();
  if (kw.includes('Character')) return `${type} Character`.trim();
  if (kw.includes('Battleline')) return 'Battleline';
  if (kw.includes('Dedicated Transport')) return 'Dedicated Transports';
  if (kw.includes('Aircraft')) return 'Aircraft';
  if (kw.includes('Transport')) return 'Transport';
  if (kw.includes('Walker')) return 'Walker';
  return type || 'Other';
}
const whrLink = (f) => `https://wh-rules.ru/ru/factions/${f}/datasheets`;

/**
 * Конвертация. Возвращает { sm, aoi, prov, legacy, unavailable, unresolved } — данные в памяти, ничего не пишет.
 * current: { SM, AoI } — текущие данные (для сохранения id, наследуемых полей и пометок).
 */
/**
 * Общая часть конвертации полного снимка для любой фракции (задача P1-T4b): инфолист, Leader, детачменты с улучшениями
 * и стратагемами, привязки, прежние (устаревшие) записи. Space Marines (convertSpaceMarines) и одна фракция
 * (convertFaction) собирают свои файлы из этих частей.
 *  full — полный снимок; olds — текущие данные затрагиваемых файлов (id, наследуемые поля, словарь правил);
 *  ourIdOf — Map «<фракция сайта>|<slug>» → наш id (сопоставление); armyFactions — фракции сайта для правил армии;
 *  factionOf(f) — id нашей фракции для записей фракции сайта f; sourceOf(f) — подпись источника («Space Marines»).
 */
export function makeConverter({ full, olds, ourIdOf, armyFactions, factionOf, sourceOf }) {
  const prov = {}; // id → { поле: 'whrules' | 'derived' | 'legacy' | 'unavailable' }
  const legacy = []; // { id, name, field, value, why }
  const unavailable = []; // { id, name, field, why }
  const unresolved = [];
  const P = (id, field, kind) => ((prov[id] ??= {})[field] = kind);
  const ourById = new Map(olds.flatMap((fd) => fd.datasheets).map((d) => [d.id, d]));
  const idOf = (f, slug) => ourIdOf.get(`${f}|${slug}`) ?? newId(f, slug);
  const ruleSet = armyRulesOf(full, armyFactions);
  // общие правила (Core и прочие) — словарь текущих данных по названию
  const dict = new Map();
  for (const fd of olds) for (const [id, r] of Object.entries(fd.rules)) if (!dict.has(r.name)) dict.set(r.name, id);

  const convertDs = (f, site, group) => {
    const id = idOf(f, site.id);
    const old = ourById.get(id);
    const chapter = CHAPTER_OF[f] ?? null;
    const kw = [...site.keywords];
    const fk = [...site.factionKeywords];
    const weapons = weaponsOf(site);
    const loadout = mdToText(site.loadout);
    const core = splitList(site.core).map(coreParts);
    const abilities = [];
    for (const c of core) {
      const ref = dict.get(c.name);
      abilities.push({ type: 'core', name: c.name, param: c.param, text: '', ...(ref ? { ref } : {}) });
      if (!ref && c.name !== 'Damaged') unavailable.push({ id, name: site.name, field: `abilities.core.${c.name}`, why: 'текста основного правила нет в снимке' });
    }
    for (const n of splitList(site.faction)) {
      const ref = ruleSet.byFaction[f]?.[n] ?? dict.get(n);
      abilities.push({ type: 'faction', name: n, param: '', text: '', ...(ref ? { ref } : {}) });
      if (!ruleSet.byFaction[f]?.[n]) {
        if (ref) legacy.push({ id, name: site.name, field: `abilities.faction.${n}`, value: ref, why: 'текста правила армии нет в снимке — оставлен текст текущих данных' });
        else unavailable.push({ id, name: site.name, field: `abilities.faction.${n}`, why: 'текста правила армии нет в снимке' });
      }
    }
    for (const a of site.abilities ?? []) abilities.push({ type: 'datasheet', name: a.name, param: '', text: mdToText(a.text) });
    for (const s of site.abilitySets ?? [])
      abilities.push({ type: 'datasheet', name: s.name, param: '', text: (s.options ?? []).map((o) => `${o.name}\n${mdToText(o.text)}`).join('\n\n') });
    for (const a of [...(site.rules ?? []), ...(site.specialAbilities ?? [])]) abilities.push({ type: 'datasheet', name: a.name, param: '', text: mdToText(a.text) });
    for (const a of site.wargearAbilities ?? []) abilities.push({ type: 'wargear', name: a.name, param: '', text: mdToText(a.text) });
    const dmg = core.find((c) => c.name === 'Damaged');
    let damaged = null;
    if (site.damaged) damaged = { w: site.damaged.note.replace(/\s*wounds? remaining/i, ''), text: mdToText(site.damaged.text) };
    else if (dmg) {
      damaged = { w: `1-${dmg.param}`, text: '' };
      unavailable.push({ id, name: site.name, field: 'damaged.text', why: 'текста правила Damaged нет в снимке (есть только «Damaged N»)' });
    }
    const allied = group === 'ally:agents';
    const costs = costsOf(site.points, { allied });
    if (allied && !costs.length) costs.push(...costsOf(site.points));
    // стоимость снаряжения и добавок: в снимке нет — текущие значения остаются как наследие, не проверены
    const oldExtras = old ? old.costs.flatMap((b) => [...b.wargear.map((w) => ['wargear', w]), ...b.addons.map((a) => ['addons', a])]) : [];
    if (oldExtras.length) {
      const seen = new Set();
      // предмет должен упоминаться в инфолисте снимка (варианты, снаряжение, состав); иначе добавка устарела и убирается
      // (Outrider Squad «1 Invader ATV»: в снимке ATV — отдельный инфолист Invader ATVs)
      const siteText = [...(site.options ?? []), site.loadout ?? '', ...(site.composition ?? [])].map(mdToText).join(' ').toLowerCase();
      const inSite = (label) => {
        const core = label.replace(/^\d+\s*/, '').toLowerCase();
        return siteText.includes(core) || siteText.includes(core.replace(/s$/, ''));
      };
      for (const [kind, it] of oldExtras) {
        const k = kind + '|' + it.label;
        if (seen.has(k)) continue;
        seen.add(k);
        if (!inSite(it.label)) {
          unavailable.push({ id, name: site.name, field: `costs.${kind}.${it.label}`, why: 'предмета нет в инфолисте снимка — прежняя добавка/снаряжение убраны' });
          continue;
        }
        for (const b of costs) b[kind].push({ ...it, unverified: true });
        legacy.push({ id, name: site.name, field: `costs.${kind}`, value: `${it.label} +${it.cost}`, why: 'стоимости снаряжения/добавок нет в снимке — текущее значение оставлено, не проверено' });
      }
      P(id, 'costs.wargear', 'legacy');
    }
    const baseSize = site.baseSize && !/^(hull|none|custom)$/i.test(site.baseSize) ? site.baseSize : '';
    const stats = site.profiles.map((p, i) => {
      let base = baseSize;
      if (!base) {
        const ob = old?.stats.find((s) => s.name.toLowerCase() === p.name.toLowerCase())?.base ?? old?.stats[i]?.base ?? '';
        if (ob) {
          base = ob;
          legacy.push({ id, name: site.name, field: `stats.${p.name}.base`, value: ob, why: `база в снимке «${site.baseSize ?? 'нет'}» — оставлено текущее значение` });
        } else unavailable.push({ id, name: site.name, field: `stats.${p.name}.base`, why: `база в снимке «${site.baseSize ?? 'нет'}»` });
      }
      return { name: p.name, M: p.m, T: p.t, Sv: p.sv, inv: (p.inv ?? '').replace(/\+$/, ''), W: p.w, Ld: p.ld, OC: p.oc, base };
    });
    const rec = {
      id, name: site.name, faction: factionOf(f), role: old?.role && old.name === site.name ? old.role : roleOf(kw),
      keywords: kw, factionKeywords: fk,
      support: core.some((c) => c.name === 'Support'),
      legends: !!site.legends, forgeWorld: !!old?.forgeWorld,
      source: sourceOf(f) + (site.legends ? ' (Warhammer Legends)' : ''),
      link: whrLink(f),
      character: kw.includes('Character'), epicHero: kw.includes('Epic Hero'), battleline: kw.includes('Battleline'),
      dedicatedTransport: kw.includes('Dedicated Transport'), titanic: kw.includes('Titanic'),
      costs,
      leads: [], leaderNote: '', leaderExtra: false,
      composition: (site.composition ?? []).map(mdToText),
      stats, loadout, transport: mdToText(site.transport),
      damaged, invulnNote: '',
      abilities, weapons,
      defaultLoadout: parseLoadout(loadout, weapons),
      options: optionsOfSite(site.options ?? []),
      stratagems: [], detachmentAbilities: [], enhancements: [],
      group,
    };
    Object.defineProperty(rec, '_site', { value: { f, slug: site.id, leader: site.leader } });
    // ключевые слова для сопоставлений; название инфолиста — тоже (цели вида «DARNATH LYSANDER unit»)
    Object.defineProperty(rec, '_kw', { value: new Set([...kw, ...fk, site.name].map((k) => k.toUpperCase())) });
    for (const k of ['stats', 'weapons', 'abilities', 'composition', 'loadout', 'options', 'keywords', 'costs.options']) P(id, k, 'whrules');
    for (const k of ['defaultLoadout', 'role', 'character', 'epicHero', 'battleline', 'dedicatedTransport', 'support']) P(id, k, 'derived');
    return rec;
  };

  // --- Leader: названия → id (свой орден → кодекс → оставшиеся записи без покрытия) ---
  const resolveLeads = (list, pool) => {
    for (const d of list) {
      const L = d._site.leader;
      if (!L) continue;
      const ch = CHAPTER_OF[d._site.f];
      const ids = [];
      const notFound = [];
      for (const n of L.units) {
        const cands = pool.filter((x) => x.name.toLowerCase() === n.toLowerCase());
        const pick = cands.find((x) => ch && x.factionKeywords.includes(ch)) ?? cands.find((x) => !Object.values(CHAPTER_OF).some((c) => x.factionKeywords.includes(c))) ?? cands[0];
        if (pick) ids.push(pick.id);
        else notFound.push(n);
      }
      d.leads = [...new Set(ids)];
      P(d.id, 'leads', 'whrules');
      if (notFound.length) {
        const old = ourById.get(d.id);
        const keep = (old?.leads ?? []).filter((x) => !d.leads.includes(x) && (pool.some((p) => p.id === x)));
        d.leaderNote = `${mdToText(L.text)} ${L.units.join(', ')}.`;
        if (keep.length) {
          d.leads.push(...keep);
          legacy.push({ id: d.id, name: d.name, field: 'leads', value: `${keep.length} id`, why: `цели «${notFound.join(', ')}» нет в снимке как инфолиста — оставлены текущие связи` });
        } else unresolved.push({ where: `${d.name} (${d.id}).leads`, value: notFound.join(', '), why: 'цель не найдена ни в снимке, ни среди оставшихся записей' });
      }
    }
  };
  // --- детачменты, улучшения, стратагемы ---
  const buildDets = (factions, fid, allDs, oldFaction) => {
    const vocab = new Set(allDs.flatMap((d) => [...d._kw]));
    const names = new Set(allDs.map((d) => d.name.toUpperCase()));
    const oldDetBy = new Map(oldFaction.detachments.map((d) => [slugify(d.name), d]));
    const dets = [];
    const enhs = [];
    const strats = [];
    for (const f of factions) {
      for (const s of full.factions[f].detachments) {
        const old = oldDetBy.get(slugify(s.name));
        const id = old?.id ?? `whr:${f}:det:${s.id}`;
        const rule = { id: `${id}:rule`, name: s.rule.name, text: mdToText(s.rule.body) };
        const parsed = parseDetachmentRules([rule.text], vocab, names);
        const fds = s.forceDispositions ?? [];
        dets.push({
          id, faction: fid, name: s.name, type: '', dp: s.dp,
          forceDisposition: fds[0] ?? null, forceDispositions: fds, chapterDp: {},
          ...parsed,
          tag: s.unique ?? parsed.tag,
          chapter: s.chapter ?? CHAPTER_OF[f] ?? parsed.chapter,
          abilities: [rule],
        });
        // сопоставление с прежними улучшениями — по названию без пометок в скобках («No Escape (Aura)» = «No Escape»)
        const bare = (n) => slugify(n.replace(/\s*\([^)]*\)/g, ''));
        const oldEnh = new Map(oldFaction.enhancements.filter((e) => old && e.detachment === old.id).map((e) => [bare(e.name), e]));
        for (const e of s.enhancements ?? []) {
          const text = mdToText(e.body);
          // «(Upgrade)» в названии сайта — признак улучшения-апгрейда (поле upgrade), в названии не остаётся
          const upgrade = /\s*\(Upgrade\)\s*$/i.test(e.name);
          const name = e.name.replace(/\s*\(Upgrade\)\s*$/i, '');
          const oe = oldEnh.get(bare(name));
          const first = text.split(/\.\s/)[0];
          enhs.push({ id: oe?.id ?? `${id}:enh:${slugify(name)}`, faction: fid, name, cost: e.points, detachment: id, upgrade, restriction: /only\b/i.test(first) ? first.replace(/\.?$/, '.') : '', text });
        }
        const oldSt = new Map(oldFaction.stratagems.filter((x) => old && x.detachment === old.id).map((x) => [slugify(x.name), x]));
        for (const st of s.stratagems ?? []) {
          const when = mdToText(st.when);
          const phases = [...new Set([...when.matchAll(/\b(Command|Movement|Shooting|Charge|Fight)\b(?= phase| or)/g)].map((m) => m[1]))];
          const text = [['WHEN', st.when], ['TARGET', st.target], ['EFFECT', st.effect], ['RESTRICTIONS', st.restrictions]]
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${mdToText(v)}`)
            .join('\n\n');
          strats.push({
            id: oldSt.get(slugify(st.name))?.id ?? `${id}:strat:${slugify(st.name)}`,
            detachment: id, name: st.name.toUpperCase(), cp: String(st.cp).replace(/CP$/i, ''), type: mdToText(st.sublabel),
            turn: { your: 'Your turn', opponent: 'Opponent’s turn', either: 'Either player’s turn' }[st.turn] ?? st.turn,
            phase: /^any phase/i.test(when) || !phases.length ? 'Any phase' : `${phases.join(' or ')} phase`,
            text,
          });
        }
      }
    }
    return { dets, enhs, strats, vocab };
  };
  // привязки к инфолистам: стратагемы и улучшения — по ключевым словам цели («… model only», «One friendly X unit»),
  // правила детачментов — все детачменты фракции; основные стратагемы — как в текущих данных
  const link = (list, B, oldFaction) => {
    const core = oldFaction.stratagems.filter((s) => !s.detachment).map((s) => s.id);
    for (const d of list) {
      d.enhancements = B.enhs.filter((e) => enhancementFits(e, d, B.vocab)).map((e) => e.id);
      d.stratagems = [...core, ...B.strats.filter((s) => fits(d, keywordReq((s.text.split('TARGET: ')[1] ?? '').split('\n')[0], B.vocab))).map((s) => s.id)];
      d.detachmentAbilities = B.dets.map((x) => x.abilities[0].id);
      P(d.id, 'stratagems', 'derived');
      P(d.id, 'enhancements', 'derived');
    }
  };
  // --- прежние детачменты, улучшения и стратагемы, которых нет в снимке (решение владельца): сохраняются как
  // устаревшие — у открытых ростеров работают, для новых недоступны (client: engine/source.ts, compute.ts) ---
  const legacyContent = (oldFaction, B) => {
    const newDetNames = new Set(B.dets.map((d) => slugify(d.name)));
    const keyOf = (x, detName) => slugify(x.name) + '|' + slugify(detName);
    const detName = (id) => oldFaction.detachments.find((d) => d.id === id)?.name ?? B.dets.find((d) => d.id === id)?.name ?? '';
    const newEnh = new Set(B.enhs.map((e) => keyOf(e, detName(e.detachment))));
    const newStr = new Set(B.strats.map((x) => keyOf(x, detName(x.detachment))));
    const dets = oldFaction.detachments.filter((d) => !newDetNames.has(slugify(d.name))).map((d) => ({ ...d, outdated: OUTDATED_RULE_TEXT }));
    const reused = new Set(B.enhs.map((e) => e.id));
    const enhs = oldFaction.enhancements.filter((e) => !reused.has(e.id) && !newEnh.has(keyOf(e, detName(e.detachment)))).map((e) => ({ ...e, outdated: OUTDATED_RULE_TEXT }));
    const strats = oldFaction.stratagems.filter((x) => x.detachment && !newStr.has(keyOf(x, detName(x.detachment)))).map((x) => ({ ...x, outdated: OUTDATED_RULE_TEXT }));
    return { dets, enhs, strats, ids: { det: new Set(dets.flatMap((d) => d.abilities.map((a) => a.id))), enh: new Set(enhs.map((e) => e.id)), strat: new Set(strats.map((x) => x.id)) } };
  };
  // списки инфолистов: к новым записям добавляются прежние устаревшие, на которые инфолист уже ссылался —
  // так юнит в старом ростере сохраняет своё улучшение и стратагемы устаревшего детачмента
  const keepLegacyLinks = (list, lg) => {
    for (const d of list) {
      const old = ourById.get(d.id);
      if (!old) continue;
      d.enhancements = [...new Set([...d.enhancements, ...old.enhancements.filter((x) => lg.ids.enh.has(x))])];
      d.stratagems = [...new Set([...d.stratagems, ...old.stratagems.filter((x) => lg.ids.strat.has(x))])];
      d.detachmentAbilities = [...new Set([...d.detachmentAbilities, ...old.detachmentAbilities.filter((x) => lg.ids.det.has(x))])];
    }
  };
  return { prov, legacy, unavailable, unresolved, P, ourById, ruleSet, convertDs, resolveLeads, buildDets, link, legacyContent, keepLegacyLinks };
}

export function convertSpaceMarines({ full, map, plan, current }) {
  const { SM, AoI } = current;
  const src = { site: full.source.site, dataVersion: full.source.dataVersion, mfm: full.source.mfm, date: full.source.date };
  const ourIdOf = new Map([...map.matched, ...map.renamed].map((x) => [`${x.site.faction}|${x.site.id}`, x.ours.id]));
  for (const x of map.agents.matched) ourIdOf.set(`imperial-agents|${x.site.id}`, x.ours.id);
  const K = makeConverter({
    full,
    olds: [SM, AoI],
    ourIdOf,
    armyFactions: FULL_FACTIONS,
    factionOf: (f) => (f === 'imperial-agents' ? 'AoI' : 'SM'),
    sourceOf: (f) => CHAPTER_OF[f] ?? (f === 'imperial-agents' ? 'Imperial Agents' : 'Space Marines'),
  });
  const { prov, legacy, unavailable, unresolved, P, ourById, ruleSet, convertDs, resolveLeads, buildDets, link, legacyContent, keepLegacyLinks } = K;

  // --- Space Marines: кодекс + ордена (общие инфолисты не дублируются: sharedUnitIds) ---
  const smDs = [];
  for (const f of SM_FAMILY) for (const s of full.factions[f].datasheets) smDs.push(convertDs(f, s, 'own'));
  // цены ордена для общих инфолистов (pointsOverrides)
  for (const f of SM_FAMILY) {
    for (const [slug, pts] of Object.entries(full.factions[f].pointsOverrides ?? {})) {
      const ds = smDs.find((d) => d._site.f === 'space-marines' && d._site.slug === slug);
      if (!ds) {
        unresolved.push({ where: `${f}.pointsOverrides`, value: slug, why: 'общий инфолист не найден' });
        continue;
      }
      (ds.costVariants ??= []).push({ chapter: CHAPTER_OF[f], costs: costsOf(pts) });
      P(ds.id, 'costVariants', 'whrules');
    }
  }
  // Imperial Agents
  const aoiDs = full.factions['imperial-agents'].datasheets.map((s) => convertDs('imperial-agents', s, 'own'));

  const retainedOutdated = plan.outdated.map((o) => ourById.get(o.id)).filter(Boolean);
  resolveLeads(smDs, [...smDs, ...retainedOutdated]);
  resolveLeads(aoiDs, aoiDs);

  const smB = buildDets(SM_FAMILY, 'SM', [...smDs, ...retainedOutdated.map((d) => Object.defineProperty({ ...d }, '_kw', { value: new Set([...d.keywords, ...d.factionKeywords, d.name].map((k) => k.toUpperCase())) }))], SM);
  const aoiB = buildDets(['imperial-agents'], 'AoI', aoiDs, AoI);

  link(smDs, smB, SM);
  link(aoiDs, aoiB, AoI);

  const smLegacy = legacyContent(SM, smB);
  const aoiLegacy = legacyContent(AoI, aoiB);
  keepLegacyLinks(smDs, smLegacy);
  keepLegacyLinks(aoiDs, aoiLegacy);

  // --- правила армии ---
  const smRuleIds = new Set(SM_FAMILY.flatMap((f) => Object.values(ruleSet.byFaction[f] ?? {})));
  const aoiRuleIds = new Set(Object.values(ruleSet.byFaction['imperial-agents'] ?? {}));
  const rulesFor = (list, ruleIds) => {
    const rules = {};
    for (const id of ruleIds) rules[id] = { name: ruleSet.rules[id].name, text: ruleSet.rules[id].text };
    for (const d of list) for (const a of d.abilities) if (a.ref && !rules[a.ref]) rules[a.ref] = (SM.rules[a.ref] ?? AoI.rules[a.ref]);
    return rules;
  };

  // --- сборка SM.json: свои (кодекс + ордена) + оставшиеся без покрытия (пометка «*») + союзники ---
  const outdatedIds = new Set(plan.outdated.map((o) => o.id));
  const retained = SM.datasheets.filter((d) => d.group === 'own' && outdatedIds.has(d.id)).map((d) => ({ ...d, outdated: plan.outdatedNote }));
  // записи без покрытия: остальное не меняется; связи переводятся на новые id (Leader — по таблице замен, стратагемы,
  // улучшения и правила детачментов — по новым детачментам, иначе они указывали бы на удалённые записи)
  const smIdsNew = new Set([...smDs, ...retained].map((d) => d.id));
  for (const d of retained) {
    P(d.id, '*', 'legacy');
    d.leads = [...new Set(d.leads.map((x) => plan.migrations.datasheets[x]?.to ?? x).filter((x) => smIdsNew.has(x)))];
    Object.defineProperty(d, '_kw', { value: new Set([...d.keywords, ...d.factionKeywords, d.name].map((k) => k.toUpperCase())) });
  }
  link(retained, smB, SM);
  keepLegacyLinks(retained, smLegacy);
  // Imperial Agents: копии в SM — те же инфолисты, группа ally:agents, цены союзника, без улучшений
  // стратагемы союзника в армии Space Marines — только основные (детачменты Imperial Agents в ней не берутся)
  const smCore = new Set(SM.stratagems.filter((s) => !s.detachment).map((s) => s.id));
  const aoiAlly = aoiDs.map((d) => {
    const allied = costsOf(full.factions['imperial-agents'].datasheets.find((s) => s.id === d._site.slug).points, { allied: true });
    return { ...d, group: 'ally:agents', costs: allied.length ? allied : d.costs, enhancements: [], stratagems: d.stratagems.filter((x) => smCore.has(x)) };
  });
  const otherAllies = SM.datasheets.filter((d) => d.group.startsWith('ally:') && d.group !== 'ally:agents');
  const smRulesList = [...smDs, ...retained, ...aoiAlly];
  const sm = {
    ...SM,
    chapters: [...new Set([...full.factions['space-marines'].chapters, ...Object.values(CHAPTER_OF)])].sort(),
    armyRules: [...smRuleIds, ...(ruleSet.byFaction['imperial-agents'] ? Object.values(ruleSet.byFaction['imperial-agents']) : [])],
    rules: rulesFor(smRulesList, new Set([...smRuleIds, ...aoiRuleIds])),
    datasheets: [...smDs, ...retained, ...aoiAlly, ...otherAllies],
    detachments: [...smB.dets, ...smLegacy.dets],
    stratagems: [...SM.stratagems.filter((s) => !s.detachment), ...smB.strats, ...smLegacy.strats],
    enhancements: [...smB.enhs, ...smLegacy.enhs],
    migrations: plan.migrations,
    source: src,
  };
  for (const d of otherAllies) for (const a of d.abilities) if (a.ref && !sm.rules[a.ref]) sm.rules[a.ref] = SM.rules[a.ref];
  const aoi = {
    ...AoI,
    armyRules: [...aoiRuleIds],
    rules: rulesFor(aoiDs, aoiRuleIds),
    datasheets: [...aoiDs, ...AoI.datasheets.filter((d) => d.group !== 'own')],
    detachments: [...aoiB.dets, ...aoiLegacy.dets],
    stratagems: [...AoI.stratagems.filter((s) => !s.detachment), ...aoiB.strats, ...aoiLegacy.strats],
    enhancements: [...aoiB.enhs, ...aoiLegacy.enhs],
    source: src,
  };
  for (const d of aoi.datasheets) for (const a of d.abilities) if (a.ref && !aoi.rules[a.ref]) aoi.rules[a.ref] = AoI.rules[a.ref] ?? SM.rules[a.ref];
  // инфолисты с тем же id, но изменёнными вариантами снаряжения: перевод сохранённых выборов по смыслу (не по номеру)
  sm.migrations = { ...plan.migrations, options: optionRemaps(sm.datasheets, SM.datasheets) };
  aoi.migrations = { source: plan.migrations.source, datasheets: {}, detachments: {}, enhancements: {}, options: optionRemaps(aoi.datasheets, AoI.datasheets) };
  // данные, заданные в curated (ордена Space Marines и т.п.), здесь не участвуют
  return { sm, aoi, aoiCopy: aoiAlly, prov, legacy, unavailable, unresolved, legacyRules: { sm: smLegacy, aoi: aoiLegacy }, vocab: { sm: smB.vocab, aoi: aoiB.vocab } };
}

/**
 * Конвертация одной фракции сайта в файл армии (P1-T4: Adeptus Custodes). full — полный снимок с фракцией slug,
 * army — текущие данные армии, map — mapFaction, plan — planFaction. Ничего не пишет. Свои инфолисты, детачменты,
 * улучшения, стратагемы и правила армии — из снимка; союзники и копии по детачментам (group ≠ "own") — как были;
 * прежние детачменты/улучшения/стратагемы, которых нет в снимке, остаются устаревшими (как у Space Marines).
 * Цены и платное снаряжение здесь — из снимка и наследия, окончательные значения ставит обновление whrules-points.
 * Возвращает { file, optionsNew, prov, legacy, unavailable, unresolved, legacyRules, vocab }: optionsNew — таблицы
 * перевода выборов снаряжения своих инфолистов (как их объединить с migrations файла — решается при применении).
 */
export function convertFaction({ full, slug, army, map, plan }) {
  const site = full.factions[slug];
  if (!site) throw new Error(`convertFaction: в снимке нет ${slug}`);
  const src = { site: full.source.site, dataVersion: full.source.dataVersion, mfm: full.source.mfm, date: full.source.date };
  const ourIdOf = new Map([...map.matched, ...map.renamed].map((x) => [`${slug}|${x.site.id}`, x.ours.id]));
  const ownOld = army.datasheets.filter((d) => d.group === 'own' && d.faction === army.id);
  const K = makeConverter({ full, olds: [army], ourIdOf, armyFactions: [slug], factionOf: () => army.id, sourceOf: () => site.name ?? army.name });
  const ds = site.datasheets.map((s) => K.convertDs(slug, s, 'own'));
  const outdatedIds = new Set(plan.outdated.map((o) => o.id));
  const retained = ownOld.filter((d) => outdatedIds.has(d.id)).map((d) => {
    const r = { ...d, outdated: plan.outdatedNote };
    Object.defineProperty(r, '_kw', { value: new Set([...d.keywords, ...d.factionKeywords, d.name].map((k) => k.toUpperCase())) });
    K.P(d.id, '*', 'legacy');
    return r;
  });
  K.resolveLeads(ds, [...ds, ...retained]);
  const B = K.buildDets([slug], army.id, [...ds, ...retained], army);
  K.link(ds, B, army);
  K.link(retained, B, army);
  const lg = K.legacyContent(army, B);
  K.keepLegacyLinks(ds, lg);
  K.keepLegacyLinks(retained, lg);
  const ruleIds = new Set(Object.values(K.ruleSet.byFaction[slug] ?? {}));
  const rules = {};
  for (const id of ruleIds) rules[id] = { name: K.ruleSet.rules[id].name, text: K.ruleSet.rules[id].text };
  const others = army.datasheets.filter((d) => !(d.group === 'own' && d.faction === army.id));
  for (const d of [...ds, ...retained, ...others]) for (const a of d.abilities) if (a.ref && !rules[a.ref]) rules[a.ref] = army.rules[a.ref];
  const file = {
    ...army,
    armyRules: [...ruleIds],
    rules,
    datasheets: [...ds, ...retained, ...others],
    detachments: [...B.dets, ...lg.dets],
    stratagems: [...army.stratagems.filter((s) => !s.detachment), ...B.strats, ...lg.strats],
    enhancements: [...B.enhs, ...lg.enhs],
    source: src,
  };
  const optionsNew = optionRemaps(ds, ownOld);
  return { file, optionsNew, prov: K.prov, legacy: K.legacy, unavailable: K.unavailable, unresolved: K.unresolved, legacyRules: lg, vocab: B.vocab };
}

/** Свойства-помощники конвертера (_site, _kw) не сериализуются; копия без них — как будет записано в файл. */
const plain = (x) => JSON.parse(JSON.stringify(x));

// ---------- изменившиеся варианты снаряжения ----------
export const OPTIONS_NOTE = 'Варианты снаряжения инфолиста изменились в обновлении данных (wh-rules.ru, версия 981).';
/** Таблицы перевода выборов (DataMigrations.options) для записей с тем же id и изменёнными вариантами. */
export function optionRemaps(newList, oldList) {
  const O = new Map(oldList.map((d) => [d.id, d]));
  const out = {};
  for (const d of newList) {
    const o = O.get(d.id);
    if (!o) continue;
    const r = buildOptionRemap(plain(o), plain(d), OPTIONS_NOTE);
    if (r) out[d.id] = r;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

// ---------- сравнение ----------
const norm = (v) => JSON.stringify(v ?? null);
const FIELDS = ['name', 'keywords', 'factionKeywords', 'legends', 'support', 'character', 'epicHero', 'battleline', 'dedicatedTransport', 'costs', 'costVariants', 'leads', 'composition', 'stats', 'loadout', 'transport', 'damaged', 'abilities', 'weapons', 'defaultLoadout', 'options', 'stratagems', 'enhancements', 'outdated'];
/** Сравнение инфолистов по полям: { added, removed, changed: [{id,name,fields:{f:{from,to}}}], unchanged, byField }. */
export function diffDatasheets(oldList, newList, { full = false } = {}) {
  const O = new Map(oldList.map((d) => [d.id, d]));
  const N = new Map(newList.map((d) => [d.id, d]));
  const out = { added: [], removed: [], changed: [], unchanged: 0, byField: {} };
  for (const [id, n] of N) {
    const o = O.get(id);
    if (!o) {
      out.added.push({ id, name: n.name, legends: n.legends });
      continue;
    }
    const fields = {};
    for (const f of FIELDS) if (norm(o[f]) !== norm(n[f])) fields[f] = full ? { from: o[f] ?? null, to: n[f] ?? null } : summarize(f, o[f], n[f]);
    if (Object.keys(fields).length) {
      out.changed.push({ id, name: n.name, fields });
      for (const f of Object.keys(fields)) out.byField[f] = (out.byField[f] ?? 0) + 1;
    } else out.unchanged++;
  }
  for (const [id, o] of O) if (!N.has(id)) out.removed.push({ id, name: o.name, legends: o.legends });
  return out;
}
function summarize(f, a, b) {
  if (f === 'stats') return { from: (a ?? []).map((s) => `${s.name}: M${s.M} T${s.T} Sv${s.Sv}${s.inv ? '/' + s.inv + '++' : ''} W${s.W} Ld${s.Ld} OC${s.OC}`), to: (b ?? []).map((s) => `${s.name}: M${s.M} T${s.T} Sv${s.Sv}${s.inv ? '/' + s.inv + '++' : ''} W${s.W} Ld${s.Ld} OC${s.OC}`) };
  if (f === 'costs') return { from: (a ?? []).map(bandText), to: (b ?? []).map(bandText) };
  if (f === 'weapons') return { from: (a ?? []).flatMap((w) => w.profiles.map((p) => `${p.name} ${p.range} A${p.A} ${p.skill} S${p.S} AP${p.AP} D${p.D}${p.keywords ? ' [' + p.keywords + ']' : ''}`)), to: (b ?? []).flatMap((w) => w.profiles.map((p) => `${p.name} ${p.range} A${p.A} ${p.skill} S${p.S} AP${p.AP} D${p.D}${p.keywords ? ' [' + p.keywords + ']' : ''}`)) };
  if (f === 'abilities') return { from: (a ?? []).map((x) => `${x.type}:${x.name}${x.param ? ' ' + x.param : ''}`), to: (b ?? []).map((x) => `${x.type}:${x.name}${x.param ? ' ' + x.param : ''}`) };
  if (f === 'stratagems' || f === 'enhancements' || f === 'leads') return { from: (a ?? []).length, to: (b ?? []).length };
  if (f === 'options') return { from: (a ?? []).length + ' вариантов', to: (b ?? []).length + ' вариантов' };
  if (f === 'defaultLoadout') return { from: (a ?? []).length + ' правил', to: (b ?? []).length + ' правил' };
  return { from: a ?? null, to: b ?? null };
}
const bandText = (b) => `${b.from}${b.to === null ? '+' : b.to === b.from ? '' : '-' + b.to}: ` + b.options.map((o) => `${o.label}=${o.cost}`).join(', ') + (b.wargear.length ? ' | снаряжение: ' + b.wargear.map((w) => `${w.label}+${w.cost}`).join(', ') : '') + (b.addons.length ? ' | добавки: ' + b.addons.map((w) => `${w.label}+${w.cost}`).join(', ') : '');

/** Сравнение детачментов/улучшений/стратагем/правил армии по названию. */
export function diffNamed(oldList, newList, key = (x) => slugify(x.name)) {
  const O = new Map(oldList.map((x) => [key(x), x]));
  const N = new Map(newList.map((x) => [key(x), x]));
  return {
    kept: [...N.keys()].filter((k) => O.has(k)).map((k) => ({ name: N.get(k).name, id: N.get(k).id, sameId: N.get(k).id === O.get(k).id })),
    added: [...N.keys()].filter((k) => !O.has(k)).map((k) => ({ name: N.get(k).name, id: N.get(k).id })),
    removed: [...O.keys()].filter((k) => !N.has(k)).map((k) => ({ name: O.get(k).name, id: O.get(k).id })),
  };
}

// ---------- проверки ----------
/** Проверки целостности сконвертированных данных. Возвращает [{ check, ok, details }]. */
export function validateConversion({ sm, aoi, plan, others, full }) {
  const checks = [];
  const C = (check, ok, details = []) => checks.push({ check, ok, details: details.slice(0, 40), count: details.length });
  for (const [label, F] of [['SM', sm], ['AoI', aoi]]) {
    const ids = F.datasheets.map((d) => d.id);
    C(`${label}: id инфолистов уникальны`, new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i));
    const own = F.datasheets.filter((d) => d.group === 'own');
    const nameKey = (d) => `${d.name.toUpperCase()}|${d.factionKeywords.filter((k) => Object.values(CHAPTER_OF).includes(k)).join(',')}|${d.legends}`;
    const nk = own.map(nameKey);
    C(`${label}: нет повторов инфолистов (название + орден + Legends)`, new Set(nk).size === nk.length, nk.filter((x, i) => nk.indexOf(x) !== i));
    const all = new Set(ids);
    C(`${label}: связи Leader указывают на существующие инфолисты`, F.datasheets.every((d) => d.leads.every((x) => all.has(x))), F.datasheets.flatMap((d) => d.leads.filter((x) => !all.has(x)).map((x) => `${d.name}→${x}`)));
    const dets = new Set(F.detachments.map((d) => d.id));
    C(`${label}: id детачментов уникальны`, dets.size === F.detachments.length);
    C(`${label}: улучшения и стратагемы ссылаются на существующие детачменты`, [...F.enhancements, ...F.stratagems.filter((s) => s.detachment)].every((x) => dets.has(x.detachment)));
    const eids = F.enhancements.map((e) => e.id);
    const sids = F.stratagems.map((e) => e.id);
    C(`${label}: id улучшений и стратагем уникальны`, new Set(eids).size === eids.length && new Set(sids).size === sids.length, [...eids.filter((x, i) => eids.indexOf(x) !== i), ...sids.filter((x, i) => sids.indexOf(x) !== i)]);
    const allS = new Set(sids);
    const allE = new Set(eids);
    // копии юнитов других фракций (Freeblades, Titanicus…) этой задачей не конвертируются — их списки как в текущих данных
    const conv = F.datasheets.filter((d) => d.group === 'own' || d.group === 'ally:agents');
    const dangling = conv.flatMap((d) => [...d.stratagems.filter((x) => !allS.has(x)), ...d.enhancements.filter((x) => !allE.has(x))].map((x) => `${d.name}: ${x}`));
    C(`${label}: списки стратагем и улучшений обновлённых инфолистов ссылаются на существующие`, !dangling.length, dangling);
    C(`${label}: ссылки способностей на правила существуют`, F.datasheets.every((d) => d.abilities.every((a) => !a.ref || F.rules[a.ref])), F.datasheets.flatMap((d) => d.abilities.filter((a) => a.ref && !F.rules[a.ref]).map((a) => `${d.name}: ${a.name}`)));
    C(`${label}: правила армии есть в словаре`, F.armyRules.every((x) => F.rules[x]));
    const md = [];
    for (const d of own) for (const t of [d.loadout, d.transport, ...d.composition, ...d.options.map((o) => o.text), ...d.abilities.map((a) => a.text)]) if (hasMd(t)) md.push(d.name);
    for (const x of [...F.stratagems, ...F.enhancements, ...F.detachments.flatMap((d) => d.abilities), ...Object.values(F.rules)]) if (hasMd(x?.text)) md.push(x.name);
    C(`${label}: в текстах не осталось разметки wh-rules`, !md.length, [...new Set(md)]);
    const noCost = own.filter((d) => !d.costs.length).map((d) => d.name);
    C(`${label}: у каждого своего инфолиста есть цена`, !noCost.length, noCost);
    const fdMissing = F.detachments.filter((d) => !d.forceDispositions?.length && !d.forceDisposition).map((d) => d.name);
    C(`${label}: у каждого детачмента есть Force Disposition`, !fdMissing.length, fdMissing);
  }
  // замены id: источник исчез из данных, цель есть
  const smIds = new Set(sm.datasheets.map((d) => d.id));
  const bad = Object.entries(plan.migrations.datasheets).filter(([from, m]) => smIds.has(from) || !smIds.has(m.to)).map(([f, m]) => `${f}→${m.to}`);
  C('замены id: прежний id убран из данных, новый есть', !bad.length, bad);
  // покрытие: каждый инфолист снимка ровно один раз; пометка «*» — только у записей без покрытия
  const siteCount = SM_FAMILY.reduce((n, f) => n + full.factions[f].datasheets.length, 0);
  const conv = sm.datasheets.filter((d) => d.group === 'own' && !d.outdated);
  C(`покрытие: ${siteCount} инфолистов снимка (Space Marines и ордена) → ровно столько обновлённых записей`, conv.length === siteCount, [String(conv.length)]);
  const marked = sm.datasheets.filter((d) => d.outdated).map((d) => d.id);
  const expect = plan.outdated.map((o) => o.id);
  C('пометка «*»: ровно у записей без покрытия источником', norm(marked.slice().sort()) === norm(expect.slice().sort()));
  // копии Imperial Agents в других фракциях
  const aoiOwn = new Map(aoi.datasheets.filter((d) => d.group === 'own').map((d) => [d.id, d]));
  const copies = [];
  for (const fd of others) for (const d of fd.datasheets) if (d.group === 'ally:agents' && !aoiOwn.has(d.id)) copies.push(`${fd.id}:${d.id} ${d.name}`);
  C('копии Imperial Agents (ally:agents) в 8 фракциях: у каждой есть обновлённый оригинал', !copies.length, copies);
  const smCopies = sm.datasheets.filter((d) => d.group === 'ally:agents');
  C('копии Imperial Agents в SM совпадают с обновлёнными оригиналами (кроме группы, цены союзника и улучшений)', smCopies.every((c) => { const o = aoiOwn.get(c.id); return o && norm({ ...o, group: c.group, costs: c.costs, enhancements: [], stratagems: c.stratagems }) === norm(c); }));
  return checks;
}

// ---------- файлы данных после обновления (в памяти) и проверка границ ----------
const COPY_GROUP = 'ally:agents';
/**
 * Содержимое файлов после обновления: SM.json и AoI.json целиком из конвертера; в остальных фракциях меняются только
 * копии Imperial Agents (группа ally:agents) и, при необходимости, добавляются правила, на которые они ссылаются.
 * index.json получает только запись updates (так её пишет apply40kUpdates).
 */
export function buildFiles(conv, current, full) {
  const files = { 'SM.json': plain(conv.sm), 'AoI.json': plain(conv.aoi) };
  const aoiOwn = new Map(conv.aoi.datasheets.filter((d) => d.group === 'own').map((d) => [d.id, d]));
  const copyFiles = [];
  for (const fd of current.others) {
    if (!fd.datasheets.some((d) => d.group === COPY_GROUP)) continue;
    const core = new Set(fd.stratagems.filter((x) => !x.detachment).map((x) => x.id));
    const copyIn = conv.sm.datasheets.filter((d) => d.group === COPY_GROUP);
    const next = plain(fd);
    next.datasheets = fd.datasheets.map((d) => {
      if (d.group !== COPY_GROUP) return d;
      const src = copyIn.find((c) => c.id === d.id) ?? aoiOwn.get(d.id);
      return src ? plain({ ...src, faction: src.faction, group: COPY_GROUP, enhancements: [], stratagems: src.stratagems.filter((x) => core.has(x)) }) : d;
    });
    for (const d of next.datasheets) if (d.group === COPY_GROUP) for (const a of d.abilities) if (a.ref && !next.rules[a.ref]) next.rules[a.ref] = conv.aoi.rules[a.ref] ?? conv.sm.rules[a.ref];
    // сохранённые выборы снаряжения у копий Imperial Agents — так же, как у оригиналов (только варианты, без замен id)
    const opts = optionRemaps(next.datasheets.filter((d) => d.group === COPY_GROUP), fd.datasheets.filter((d) => d.group === COPY_GROUP));
    if (Object.keys(opts).length) {
      if (fd.migrations) throw new Error(`${fd.id}: в файле уже есть migrations — объединение не предусмотрено`);
      next.migrations = { source: conv.sm.migrations.source, datasheets: {}, detachments: {}, enhancements: {}, options: opts };
    }
    files[`${fd.id}.json`] = next;
    copyFiles.push(fd.id);
  }
  const updateEntry = {
    id: `whrules-${full.source.dataVersion}-space-marines`,
    kind: 'whrules-faction',
    scope: ['SM', 'AoI'],
    note: `Space Marines (с орденами) и Imperial Agents из wh-rules.ru ${full.source.dataVersion}; копии Imperial Agents в ${copyFiles.join(', ')}`,
    source: { site: full.source.site, dataVersion: full.source.dataVersion, mfm: full.source.mfm, date: full.source.date, snapshot: `whrules-${full.source.dataVersion}-full.json`, fingerprint: full.fingerprint },
  };
  return { files, copyFiles, updateEntry };
}

/** Что изменится в каждом файле; вне Space Marines / Imperial Agents допускаются только копии ally:agents и их правила. */
/**
 * expect (необязательно): { aoi } — обновлённые Imperial Agents; тогда для 7 фракций с копиями дополнительно проверяется,
 * что каждая изменённая копия совпадает с обновлённым оригиналом (кроме группы, цены союзника, улучшений, стратагем),
 * migrations.options — ровно копии с изменёнными вариантами и те же таблицы, что у оригинала, правила только добавлены
 * и используются копиями, порядок и состав инфолистов прежний.
 */
export function scopeCheck(current, built, expect = null) {
  const byFile = {};
  const violations = [];
  const all = [['SM.json', current.SM], ['AoI.json', current.AoI], ...current.others.map((f) => [`${f.id}.json`, f])];
  for (const [file, before] of all) {
    const after = built.files[file] ?? before;
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => norm(before[k]) !== norm(after[k]));
    if (!keys.length) {
      byFile[file] = 'без изменений';
      continue;
    }
    if (file === 'SM.json' || file === 'AoI.json') {
      byFile[file] = `изменяется: ${keys.join(', ')}`;
      continue;
    }
    const ds = (f) => new Map(f.datasheets.map((d) => [d.id, d]));
    const B = ds(before);
    const A = ds(after);
    const changedDs = [...A.keys()].filter((id) => norm(A.get(id)) !== norm(B.get(id)));
    const badDs = changedDs.filter((id) => A.get(id).group !== COPY_GROUP);
    const addedRules = Object.keys(after.rules).filter((k) => !before.rules[k]);
    const changedRules = Object.keys(before.rules).filter((k) => norm(before.rules[k]) !== norm(after.rules[k]));
    // migrations: допускается только перевод выборов снаряжения копий Imperial Agents
    const migOk = !keys.includes('migrations') || (!before.migrations && Object.values(after.migrations.datasheets).length === 0 && Object.values(after.migrations.detachments).length === 0 && Object.values(after.migrations.enhancements).length === 0 && Object.keys(after.migrations.options ?? {}).every((id) => A.get(id)?.group === COPY_GROUP));
    const otherKeys = keys.filter((k) => k !== 'datasheets' && k !== 'rules' && !(k === 'migrations' && migOk));
    const extra = [];
    if (norm(before.datasheets.map((d) => d.id)) !== norm(after.datasheets.map((d) => d.id))) extra.push('состав или порядок инфолистов изменён');
    const optIds = Object.keys(after.migrations?.options ?? {});
    if (expect) {
      const aoiOwn = new Map(expect.aoi.datasheets.filter((d) => d.group === 'own').map((d) => [d.id, d]));
      for (const id of changedDs.filter((x) => A.get(x).group === COPY_GROUP)) {
        const o = aoiOwn.get(id);
        const a = A.get(id);
        if (!o || norm({ ...plain(o), group: a.group, costs: a.costs, enhancements: [], stratagems: a.stratagems }) !== norm(a)) extra.push(`${id}: копия не совпадает с обновлённым оригиналом`);
        if (o && norm(a.costs) !== norm(plain(o).costs) && !a.costs.every((b) => b.options.length)) extra.push(`${id}: цена союзника пуста`);
        const coreB = new Set(before.stratagems.filter((x) => !x.detachment).map((x) => x.id));
        if (a.stratagems.some((x) => !coreB.has(x))) extra.push(`${id}: стратагемы не из основных этой фракции`);
      }
      const wantOpt = after.datasheets.filter((d) => d.group === COPY_GROUP && B.has(d.id) && norm(B.get(d.id).options.map((o) => o.text)) !== norm(d.options.map((o) => o.text))).map((d) => d.id).sort();
      if (norm(optIds.slice().sort()) !== norm(wantOpt)) extra.push(`migrations.options: ${optIds.length} записей, ожидалось ${wantOpt.length}`);
      for (const id of optIds) if (norm(after.migrations.options[id]) !== norm(expect.aoi.migrations?.options?.[id])) extra.push(`${id}: таблица вариантов отличается от оригинала Imperial Agents`);
      const usedRefs = new Set(after.datasheets.filter((d) => d.group === COPY_GROUP).flatMap((d) => d.abilities.map((x) => x.ref).filter(Boolean)));
      for (const k of addedRules) if (!usedRefs.has(k)) extra.push(`правило ${k} добавлено, но копиями не используется`);
    }
    if (badDs.length || changedRules.length || otherKeys.length || extra.length || [...B.keys()].some((id) => !A.has(id))) violations.push({ file, badDs, changedRules, otherKeys, extra });
    const optN = Object.keys(after.migrations?.options ?? {}).length;
    byFile[file] = `копии Imperial Agents: ${changedDs.length}${addedRules.length ? `; добавлены правила: ${addedRules.map((k) => after.rules[k].name).join(', ')}` : ''}${optN ? `; migrations.options: ${optN}` : ''}`;
  }
  return { byFile, violations };
}

// ---------- сухой прогон ----------
/** Снимки обновления wh-rules 981 (tools/roster-data/40k/). */
export const SNAP = { full: 'whrules-981-full.json', points: 'whrules-981.json', renames: 'whrules-981-renames.json' };

/**
 * Конвертация и все проверки по данным фракций в памяти (SM, AoI, остальные). Ничего не пишет.
 * Возвращает { full, map, plan, conv, built, scope, checks, enhElig }.
 */
export function runConversion({ SM, AoI, others, full = loadFull(SNAP.full) }) {
  const map = mapSpaceMarines(loadSnapshot(SNAP.points), loadRenames(SNAP.renames), SM, AoI, others);
  const plan = planSpaceMarines(map, full, SM);
  const conv = convertSpaceMarines({ full, map, plan, current: { SM, AoI } });
  const built = buildFiles(conv, { SM, AoI, others }, full);
  const scope = scopeCheck({ SM, AoI, others }, built, { aoi: conv.aoi });
  const checks = validateConversion({ sm: conv.sm, aoi: conv.aoi, plan, others: others.filter((f) => f.id !== 'SM'), full });
  checks.push({ check: 'границы: вне Space Marines и Imperial Agents меняются только копии ally:agents (и их правила)', ok: !scope.violations.length, details: scope.violations.map((v) => JSON.stringify(v)), count: scope.violations.length });
  // копии в других фракциях совпадают с обновлёнными оригиналами
  const aoiOwnM = new Map(conv.aoi.datasheets.filter((d) => d.group === 'own').map((d) => [d.id, d]));
  const badCopy = Object.entries(built.files).filter(([f]) => f !== 'SM.json' && f !== 'AoI.json').flatMap(([f, fd]) => fd.datasheets.filter((d) => d.group === 'ally:agents').filter((d) => { const o = aoiOwnM.get(d.id); return !o || norm({ ...plain(o), group: d.group, costs: d.costs, enhancements: [], stratagems: d.stratagems }) !== norm(d); }).map((d) => `${f}:${d.id}`));
  checks.push({ check: `копии Imperial Agents в ${built.copyFiles.join(', ')} совпадают с обновлёнными оригиналами`, ok: !badCopy.length, details: badCopy, count: badCopy.length });
  const enhElig = { sm: enhancementEligibility(conv.sm, conv.vocab.sm), aoi: enhancementEligibility(conv.aoi, conv.vocab.aoi) };
  // улучшения текущего источника: обычные — только персонажам, Upgrade — только не персонажам (как проверяет движок)
  const badEnh = [];
  for (const F of [conv.sm, conv.aoi]) {
    const E = new Map(F.enhancements.filter((e) => !e.outdated).map((e) => [e.id, e]));
    for (const d of F.datasheets.filter((x) => x.group === 'own'))
      for (const x of d.enhancements) {
        const e = E.get(x);
        if (e && (e.upgrade ? d.character : !d.character)) badEnh.push(`${d.name}: ${e.name}${e.upgrade ? ' (Upgrade)' : ''}`);
      }
  }
  checks.push({ check: 'улучшения текущего источника: обычные — только персонажам, Upgrade — только не персонажам', ok: !badEnh.length, details: badEnh, count: badEnh.length });
  return { full, map, plan, conv, built, scope, checks, enhElig };
}

/**
 * Обработчик обновления curated.updates kind «whrules-faction» (scripts/updates-40k.mjs → apply40kUpdates):
 * Space Marines (с орденами) и Imperial Agents из полного снимка wh-rules.ru, копии Imperial Agents в других фракциях.
 * Применяется к данным импорта Wahapedia (files — в памяти). Если данные уже обновлены этим снимком — ничего не делает
 * (повторный repair-40k-data не меняет файлы). Любая проваленная проверка — исключение, файлы не меняются.
 */
export function applyWhrulesFaction(files, full, u) {
  const SM = files['SM.json'];
  const AoI = files['AoI.json'];
  if (!SM || !AoI) throw new Error('whrules-faction: нет SM.json или AoI.json');
  const done = (F) => String(F.source?.dataVersion) === String(full.source.dataVersion) && String(F.migrations?.source ?? '').startsWith(`wh-rules ${full.source.dataVersion} `);
  if (done(SM) && done(AoI)) return { changed: 0, lines: [`Space Marines и Imperial Agents уже на wh-rules ${full.source.dataVersion}`] };
  if (done(SM) || done(AoI)) throw new Error('whrules-faction: обновлена только часть файлов (SM/AoI) — восстановите данные импорта');
  const others = Object.keys(files).filter((f) => f !== 'SM.json' && f !== 'AoI.json').sort().map((f) => files[f]);
  const r = runConversion({ SM: structuredClone(SM), AoI: structuredClone(AoI), others: others.map((f) => structuredClone(f)), full });
  const failed = r.checks.filter((c) => !c.ok);
  if (failed.length) throw new Error(`whrules-faction: проверки не пройдены — ${failed.map((c) => c.check).join('; ')}`);
  const e = r.built.updateEntry;
  if (u.id !== e.id || norm(u.scope) !== norm(e.scope) || u.note !== e.note) throw new Error(`whrules-faction: id/scope/note в curated не совпадают с обновлением (${e.id}; ${e.note})`);
  let changed = 0;
  const changedFiles = [];
  for (const [f, data] of Object.entries(r.built.files)) {
    if (norm(files[f]) === norm(data)) continue;
    files[f] = data;
    changed++;
    changedFiles.push(f);
  }
  return { changed, lines: [`обновлены: ${changedFiles.join(', ')}`, `проверки: ${r.checks.length} — все пройдены`] };
}
applyWhrulesFaction.load = (file, dir) => loadFull(file, dir);
/** Обработчики обновлений этого модуля — передаются в repair40kData (import-wahapedia.mjs, repair-40k-data.mjs). */
export const WHRULES_APPLIERS = { 'whrules-faction': applyWhrulesFaction };

/**
 * Сухой прогон. По умолчанию — данные из dir; files — { "<id>.json": данные } (например, данные до обновления
 * из истории git — scripts/baseline-40k.mjs).
 */
export function dryRun({ dir = DATA, files = null } = {}) {
  const load = (f) => (files ? structuredClone(files[f]) : JSON.parse(fs.readFileSync(path.join(dir, 'f', f), 'utf8')));
  const names = files ? Object.keys(files) : fs.readdirSync(path.join(dir, 'f'));
  const SM = load('SM.json');
  const AoI = load('AoI.json');
  const others = names.filter((f) => f.endsWith('.json') && f !== 'SM.json' && f !== 'AoI.json').sort().map(load);
  const { full, plan, conv, built, scope, checks, enhElig } = runConversion({ SM, AoI, others });
  const own = (F) => F.datasheets.filter((d) => d.group === 'own');
  const ds = diffDatasheets(own(SM), own(conv.sm));
  const dsAoi = diffDatasheets(own(AoI), own(conv.aoi));
  const copies = others.filter((f) => f.datasheets.some((d) => d.group === 'ally:agents')).map((f) => f.id);
  return {
    source: conv.sm.source,
    summary: {
      spaceMarines: { datasheetsBefore: own(SM).length, datasheetsAfter: own(conv.sm).length, updated: ds.changed.length, unchangedAfterConversion: ds.unchanged, added: ds.added.length, removedByMigration: ds.removed.length, outdatedMarked: plan.outdated.length },
      imperialAgents: { datasheets: own(conv.aoi).length, updated: dsAoi.changed.length, unchanged: dsAoi.unchanged, added: dsAoi.added.length, removed: dsAoi.removed.length, copiesIn: copies },
      fieldsChanged: ds.byField,
      fieldsChangedAoi: dsAoi.byField,
      legacyValues: conv.legacy.length,
      unavailable: conv.unavailable.length,
      unresolved: conv.unresolved.length,
      checksFailed: checks.filter((c) => !c.ok).length,
    },
    ids: { kept: plan.keep, new: plan.newIds, migrations: plan.migrations },
    datasheets: { added: ds.added, removedByMigration: ds.removed, outdated: plan.outdated, changed: ds.changed },
    imperialAgents: dsAoi,
    detachments: diffNamed(SM.detachments, conv.sm.detachments.filter((d) => !d.outdated)),
    enhancements: diffNamed(SM.enhancements, conv.sm.enhancements.filter((e) => !e.outdated), (x) => slugify(x.name) + '|' + slugify((SM.detachments.find((d) => d.id === x.detachment) ?? conv.sm.detachments.find((d) => d.id === x.detachment))?.name ?? '')),
    stratagems: diffNamed(SM.stratagems.filter((s) => s.detachment), conv.sm.stratagems.filter((s) => s.detachment && !s.outdated), (x) => slugify(x.name) + '|' + slugify((SM.detachments.find((d) => d.id === x.detachment) ?? conv.sm.detachments.find((d) => d.id === x.detachment))?.name ?? '')),
    armyRules: { before: SM.armyRules.map((id) => SM.rules[id]?.name ?? id), after: conv.sm.armyRules.map((id) => conv.sm.rules[id]?.name ?? id) },
    imperialAgentsDetachments: diffNamed(AoI.detachments, conv.aoi.detachments.filter((d) => !d.outdated)),
    outdatedRules: {
      sm: { detachments: conv.legacyRules.sm.dets.map((d) => ({ id: d.id, name: d.name })), enhancements: conv.legacyRules.sm.enhs.map((e) => ({ id: e.id, name: e.name, detachment: SM.detachments.find((d) => d.id === e.detachment)?.name ?? e.detachment })), stratagems: conv.legacyRules.sm.strats.map((x) => ({ id: x.id, name: x.name, detachment: SM.detachments.find((d) => d.id === x.detachment)?.name ?? x.detachment })) },
      aoi: { detachments: conv.legacyRules.aoi.dets.map((d) => ({ id: d.id, name: d.name })), enhancements: conv.legacyRules.aoi.enhs.map((e) => ({ id: e.id, name: e.name, detachment: AoI.detachments.find((d) => d.id === e.detachment)?.name ?? e.detachment })), stratagems: conv.legacyRules.aoi.strats.map((x) => ({ id: x.id, name: x.name, detachment: AoI.detachments.find((d) => d.id === x.detachment)?.name ?? x.detachment })) },
    },
    enhancementEligibility: enhElig,
    unverifiedPrices: [...conv.sm.datasheets, ...conv.aoi.datasheets].filter((d) => d.group === 'own').flatMap((d) => [...new Set(d.costs.flatMap((b) => [...b.wargear, ...b.addons]).filter((w) => w.unverified).map((w) => `${w.label} +${w.cost}`))].map((x) => ({ id: d.id, name: d.name, faction: d.faction, item: x }))),
    scope: { files: scope.byFile, indexUpdate: built.updateEntry, credit: 'Space Marines, Imperial Agents: «wh-rules.ru · версия 981 · 14.10.2026»; остальные фракции — без изменений' },
    legacy: conv.legacy,
    unavailable: conv.unavailable,
    unresolved: conv.unresolved,
    checks,
    _data: conv,
    _files: built,
  };
}

function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  // данные в backend/roster-data уже обновлены — сухой прогон считается от данных до обновления (история git)
  const base = baseline40k();
  const r = base ? dryRun({ files: base.files }) : dryRun();
  const { _data, _files, ...report } = r;
  if (at >= 0) fs.writeFileSync(args[at + 1], JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify(report.summary, null, 1));
  for (const c of report.checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.check}${c.ok ? '' : ' — ' + c.details.slice(0, 5).join('; ')}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
