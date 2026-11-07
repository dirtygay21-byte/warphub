/**
 * Перевод WarpHub — русские тексты 40K, которых нет на wh-rules.ru (решение владельца 06.11.2026).
 *
 * Сначала — тексты wh-rules.ru как есть (scripts/whrules-ru.mjs); чего на сайте нет, переводит WarpHub:
 *   40k/ru-warphub/<id фракции>.json — переводы (схема warphub-ru-translation/1), ключи — id приложения (как в оверлее).
 * У каждого перевода — отпечаток английского текста (`en`): если английский текст поменялся (новый MFM, правка
 * данных), перевод не применяется и попадает в отчёт как устаревший. Текст wh-rules.ru всегда важнее перевода WarpHub:
 * появится на сайте — заменит перевод при следующем --apply.
 *
 *   node scripts/ru-warphub.mjs --gaps [ID…]   — английские исходники того, чего нет по-русски → 40k/ru-warphub/_source/<ID>.json
 *                                               (не в git; переводчик заполняет name/text и сохраняет как 40k/ru-warphub/<ID>.json);
 *   node scripts/ru-warphub.mjs --check [ID…]  — проверка переводов: числа, кубы, дистанции, ключевые слова ЗАГЛАВНЫМИ,
 *                                               отпечатки английского текста, неизвестные id;
 * применение — node scripts/whrules-ru.mjs --apply (оверлеи ru/ с пометкой src: "warphub").
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
export const WARPHUB_DIR = path.join(ROOT, '40k', 'ru-warphub');
const DATA = path.resolve(ROOT, '..', '..', 'backend', 'roster-data');

/** Отпечаток английского текста перевода (sha1, 10 знаков). */
export const enHash = (...parts) =>
  crypto
    .createHash('sha1')
    .update(parts.map((p) => (Array.isArray(p) ? p.join('\n') : String(p ?? ''))).join('\u0000'))
    .digest('hex')
    .slice(0, 10);

/** Поля инфолиста, которые переводятся целиком (у инфолистов, которых нет на сайте). */
export const DS_FIELDS = ['loadout', 'leaderNote', 'transport', 'damaged'];
/** Поля, которые переводятся и у инфолистов с сайта, если сайт их не даёт (07.11.2026: пояснение «Лидер», снаряжение). */
const DS_FIELDS_SITE = ['loadout', 'leaderNote'];

const dsField = (ds, k) => {
  const v = ds[k];
  if (v && typeof v === 'object' && !Array.isArray(v)) return v.text ?? '';
  return typeof v === 'string' ? v : '';
};
const dsOptions = (ds) =>
  (ds.options ?? [])
    .map((o) => (typeof o === 'string' ? o : o?.text ?? ''))
    .filter((t) => t && t.trim() && t.trim().toLowerCase() !== 'none');

/**
 * Что из английских текстов фракции не покрыто оверлеем wh-rules.ru (ru — результат matchFaction).
 * Возвращает исходники в форме файла перевода: { en (отпечаток), source: { name, text | items } }.
 */
export function collectGaps(faction, ru) {
  const gaps = { rules: {}, datasheets: {}, detachments: {}, stratagems: {}, enhancements: {} };
  const rule = (id) => {
    const r = faction.rules?.[id];
    if (!r?.text || ru.rules?.[id] || gaps.rules[id]) return;
    gaps.rules[id] = { en: enHash(r.name, r.text), source: { name: r.name, text: r.text } };
  };
  for (const id of faction.armyRules ?? []) rule(id);
  for (const ds of faction.datasheets) {
    const have = ru.datasheets?.[ds.id];
    const entry = {};
    for (const a of ds.abilities ?? []) {
      if (a.type === 'core') continue; // глоссарий (раздел 24)
      if (a.type === 'faction') {
        if (a.ref) rule(a.ref);
        continue;
      }
      if (!a.text?.trim() || have?.abilities?.[a.name]) continue;
      (entry.abilities ??= {})[a.name] = { en: enHash(a.name, a.text), source: { name: a.name, text: a.text } };
    }
    if (!have) {
      // инфолиста нет на сайте целиком: снаряжение, лидер, транспорт, повреждения, опции
      for (const k of DS_FIELDS) {
        const t = dsField(ds, k);
        if (t.trim()) entry[k] = { en: enHash(t), source: { text: t } };
      }
      const opts = dsOptions(ds);
      if (opts.length) entry.options = { en: enHash(opts), source: { items: opts } };
    } else {
      for (const k of DS_FIELDS_SITE) {
        const t = dsField(ds, k);
        if (t.trim() && !have[k]) entry[k] = { en: enHash(t), source: { text: t } };
      }
    }
    if (Object.keys(entry).length) gaps.datasheets[ds.id] = { name: ds.name, ...entry };
  }
  for (const d of faction.detachments ?? []) {
    const have = ru.detachments?.[d.id];
    const entry = {};
    if (!have?.name) entry.name = { en: enHash(d.name), source: { text: d.name } };
    for (const a of d.abilities ?? []) {
      if (!a.text?.trim() || have?.rules?.[a.id]) continue;
      (entry.rules ??= {})[a.id] = { en: enHash(a.name, a.text), source: { name: a.name, text: a.text } };
    }
    if (entry.rules || (!have && entry.name)) gaps.detachments[d.id] = { detachment: d.name, ...entry };
  }
  const detName = new Map((faction.detachments ?? []).map((d) => [d.id, d.name]));
  for (const s of faction.stratagems ?? []) {
    if (!s.detachment || ru.stratagems?.[s.id] || !s.text?.trim()) continue;
    gaps.stratagems[s.id] = { detachment: detName.get(s.detachment) ?? s.detachment, en: enHash(s.name, s.text), source: { name: s.name, text: s.text } };
  }
  for (const e of faction.enhancements ?? []) {
    if (ru.enhancements?.[e.id] || !e.text?.trim()) continue;
    gaps.enhancements[e.id] = { detachment: detName.get(e.detachment) ?? e.detachment, en: enHash(e.name, e.text), source: { name: e.name, text: e.text } };
  }
  return gaps;
}

export function readTranslation(id) {
  const file = path.join(WARPHUB_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (t.schema !== 'warphub-ru-translation/1') throw new Error(`${id}: схема ${t.schema}`);
  return t;
}

/**
 * Добавить перевод WarpHub в оверлей ru (результат matchFaction) — только туда, где нет текста wh-rules.ru, и только
 * если английский текст не менялся. Тексты помечаются src: "warphub" (поля инфолиста — списком warphub).
 */
export function mergeWarphub(faction, ru, t) {
  const stats = { applied: 0, stale: [], unknown: [] };
  if (!t) return stats;
  const gaps = collectGaps(faction, ru);
  const take = (gap, tr, where) => {
    if (!gap) return void stats.unknown.push(where);
    if (gap.en !== tr.en) return void stats.stale.push(where);
    stats.applied++;
    return true;
  };
  // by: "wh-rules" — текст сайта для того же английского текста (память переводов) — показывается как текст сайта
  const text = (tr) => ({ ...(tr.name ? { name: tr.name } : {}), text: tr.text, ...(tr.by === 'wh-rules' ? {} : { src: 'warphub' }) });
  for (const [id, tr] of Object.entries(t.rules ?? {})) if (take(gaps.rules[id], tr, `rule ${id}`)) (ru.rules ??= {})[id] = text(tr);
  for (const [dsId, d] of Object.entries(t.datasheets ?? {})) {
    const gap = gaps.datasheets[dsId];
    for (const [name, tr] of Object.entries(d.abilities ?? {}))
      if (take(gap?.abilities?.[name], tr, `ability ${dsId}/${name}`)) (((ru.datasheets ??= {})[dsId] ??= {}).abilities ??= {})[name] = text(tr);
    for (const k of [...DS_FIELDS, 'options']) {
      if (!d[k]) continue;
      if (!take(gap?.[k], d[k], `${k} ${dsId}`)) continue;
      const entry = ((ru.datasheets ??= {})[dsId] ??= {});
      entry[k] = k === 'options' ? d[k].items : d[k].text;
      if (d[k].by !== 'wh-rules') (entry.warphub ??= []).push(k);
    }
  }
  for (const [detId, d] of Object.entries(t.detachments ?? {})) {
    const gap = gaps.detachments[detId];
    if (d.name && take(gap?.name, d.name, `detachment name ${detId}`)) {
      const det = ((ru.detachments ??= {})[detId] ??= {});
      det.name = d.name.text;
      if (d.name.by !== 'wh-rules') det.nameSrc = 'warphub';
    }
    for (const [aid, tr] of Object.entries(d.rules ?? {}))
      if (take(gap?.rules?.[aid], tr, `detachment rule ${detId}/${aid}`)) (((ru.detachments ??= {})[detId] ??= {}).rules ??= {})[aid] = text(tr);
  }
  for (const [id, tr] of Object.entries(t.stratagems ?? {})) if (take(gaps.stratagems[id], tr, `stratagem ${id}`)) (ru.stratagems ??= {})[id] = text(tr);
  for (const [id, tr] of Object.entries(t.enhancements ?? {})) if (take(gaps.enhancements[id], tr, `enhancement ${id}`)) (ru.enhancements ??= {})[id] = text(tr);
  return stats;
}

// ---------------------------------------------------------------- проверки перевода

/** Числа, кубы и дистанции текста: «3"», «D6», «2D3+1», «4+», «-1», «50%». */
export const numbersOf = (s) =>
  (String(s ?? '').match(/\d*D\d+(?:\+\d+)?|\d+(?:\.\d+)?(?:["”″]|\+|%)?/gi) ?? [])
    .map((x) => x.toUpperCase().replace(/[”″]/g, '"'))
    .sort();
/** Ключевые слова ЗАГЛАВНЫМИ (латиница, от 3 букв), как пишутся в правилах: INFANTRY, ADEPTUS ASTARTES. */
/** Подписи разделов стратагем (на сайте — КОГДА / ЦЕЛЬ / ЭФФЕКТ / ОГРАНИЧЕНИЯ) — не ключевые слова. */
const SECTION_LABELS = new Set(['WHEN', 'TARGET', 'EFFECT', 'RESTRICTIONS', 'RESTRICTION']);
export const keywordsOf = (s) =>
  [
    ...new Set(
      (String(s ?? '').match(/\b[A-Z][A-Z'’-]*[A-Z](?:\s+[A-Z][A-Z'’-]*[A-Z])*\b/g) ?? [])
        .map((k) => k.split(/\s+/).filter((w) => !SECTION_LABELS.has(w)).join(' '))
        .filter((k) => k.replace(/[^A-Z]/g, '').length >= 3),
    ),
  ].sort();

/** Проблемы одного перевода (пустой список — порядок). */
export function checkEntry(source, tr) {
  const problems = [];
  const en = source.text ?? (source.items ?? []).join('\n');
  const ruText = tr.text ?? (tr.items ?? []).join('\n');
  if (!ruText?.trim()) return ['пустой перевод'];
  if (source.name && !tr.name?.trim()) problems.push('нет названия');
  const a = numbersOf(en).join(' ');
  const b = numbersOf(ruText).join(' ');
  if (a !== b) problems.push(`числа: «${a}» ≠ «${b}»`);
  const lost = keywordsOf(en).filter((k) => !ruText.includes(k));
  if (lost.length) problems.push(`нет ключевых слов: ${lost.join(', ')}`);
  if (!/[а-яё]/i.test(ruText)) problems.push('нет русского текста');
  return problems;
}

function forEachEntry(t, fn) {
  for (const [id, x] of Object.entries(t.rules ?? {})) fn(`rule ${id}`, x, ['rules', id]);
  for (const [dsId, d] of Object.entries(t.datasheets ?? {})) {
    for (const [n, x] of Object.entries(d.abilities ?? {})) fn(`ability ${dsId}/${n}`, x, ['datasheets', dsId, 'abilities', n]);
    for (const k of [...DS_FIELDS, 'options']) if (d[k]) fn(`${k} ${dsId}`, d[k], ['datasheets', dsId, k]);
  }
  for (const [detId, d] of Object.entries(t.detachments ?? {})) {
    if (d.name) fn(`detachment name ${detId}`, d.name, ['detachments', detId, 'name']);
    for (const [aid, x] of Object.entries(d.rules ?? {})) fn(`detachment rule ${detId}/${aid}`, x, ['detachments', detId, 'rules', aid]);
  }
  for (const [id, x] of Object.entries(t.stratagems ?? {})) fn(`stratagem ${id}`, x, ['stratagems', id]);
  for (const [id, x] of Object.entries(t.enhancements ?? {})) fn(`enhancement ${id}`, x, ['enhancements', id]);
}
const at = (o, p) => p.reduce((v, k) => v?.[k], o);

/**
 * Названия правил, способностей, стратагем, улучшений, детачментов фракции и основных способностей (раздел 24) —
 * в тексте перевода они остаются по-английски (решение владельца 07.11.2026; перевод — в скобках после названия).
 */
export function gameNamesOf(faction) {
  const names = new Set();
  try {
    const g = JSON.parse(fs.readFileSync(path.join(DATA, 'glossary.json'), 'utf8'));
    for (const a of Object.values(g.abilities)) if (!a.name.startsWith('[')) names.add(a.name);
  } catch {
    // без глоссария — только названия фракции
  }
  for (const r of Object.values(faction.rules ?? {})) names.add(r.name);
  for (const ds of faction.datasheets ?? []) for (const a of ds.abilities ?? []) names.add(a.name);
  for (const x of [...(faction.stratagems ?? []), ...(faction.enhancements ?? [])]) names.add(x.name);
  for (const d of faction.detachments ?? []) {
    names.add(d.name);
    for (const a of d.abilities ?? []) names.add(a.name);
  }
  // заголовки, а не названия правил
  const GENERIC = new Set(['restrictions', 'designer’s note', "designer's note", 'designers note']);
  return [...names].filter((n) => n && n.length >= 4 && n !== n.toUpperCase() && !GENERIC.has(n.toLowerCase()));
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Названия из английского текста, которых нет по-английски в переводе (регистр не важен: ANATHEMA PSYKANA = Anathema Psykana). */
export function lostNames(names, enText, ruText, ownName) {
  const ru = String(ruText ?? '').toLowerCase();
  return names.filter((n) => n !== ownName && new RegExp(`(?<![A-Za-z])${escapeRe(n)}(?![A-Za-z])`).test(enText ?? '') && !ru.includes(n.toLowerCase()));
}

/** Проверка файла перевода против текущих английских исходников. */
export function checkTranslation(faction, ru, t) {
  const gaps = collectGaps(faction, ru);
  const names = gameNamesOf(faction);
  const out = [];
  forEachEntry(t, (where, tr, p) => {
    const gap = at(gaps, p);
    if (!gap) return out.push({ where, problems: ['нет такого текста среди пробелов (уже есть на wh-rules.ru или неверный id)'] });
    if (gap.en !== tr.en) return out.push({ where, problems: ['английский текст изменился — перевод устарел'] });
    // текст сайта (память переводов wh-rules.ru) — как на сайте; проверяется только наличие текста
    const problems = tr.by === 'wh-rules' ? (tr.text?.trim() || tr.items?.length ? [] : ['пустой перевод']) : checkEntry(gap.source, tr);
    // название детачмента — само переводимое название (показывается «English (Русское)»)
    if (tr.by !== 'wh-rules' && tr.text && !where.startsWith('detachment name')) {
      const lost = lostNames(names, gap.source.text, tr.text, gap.source.name ?? gap.source.text);
      if (lost.length) problems.push(`названия не по-английски: ${lost.join(', ')}`);
    }
    if (problems.length) out.push({ where, problems });
  });
  return out;
}



/**
 * Память переводов: английский текст → русский текст wh-rules.ru (по сопоставлениям сайта всех фракций; ru — результат
 * matchFaction, без переводов WarpHub). Для одинакового английского текста берётся самый частый русский вариант.
 */
export function buildMemory(pairs) {
  const tm = new Map();
  for (const { faction, ru } of pairs) {
    const add = (name, text, r) => {
      if (!text?.trim() || !r?.text) return;
      const key = `${name ?? ''}\u0000${text.trim()}`;
      const variants = tm.get(key) ?? new Map();
      const v = JSON.stringify({ ...(r.name ? { name: r.name } : {}), text: r.text });
      variants.set(v, (variants.get(v) ?? 0) + 1);
      tm.set(key, variants);
    };
    for (const ds of faction.datasheets) for (const a of ds.abilities ?? []) add(a.name, a.text, ru.datasheets?.[ds.id]?.abilities?.[a.name]);
    for (const x of faction.stratagems ?? []) add(x.name, x.text, ru.stratagems?.[x.id]);
    for (const x of faction.enhancements ?? []) add(x.name, x.text, ru.enhancements?.[x.id]);
    for (const d of faction.detachments ?? []) for (const a of d.abilities ?? []) add(a.name, a.text, ru.detachments?.[d.id]?.rules?.[a.id]);
    for (const [id, r] of Object.entries(faction.rules ?? {})) add(r.name, r.text, ru.rules?.[id]);
  }
  const best = new Map();
  for (const [k, variants] of tm) best.set(k, JSON.parse([...variants].sort((a, b) => b[1] - a[1])[0][0]));
  return best;
}

/** Перевод из памяти для исходника { name, text }; null — нет точного совпадения английского текста. */
export const recall = (tm, source) => (source?.text ? tm.get(`${source.name ?? ''}\u0000${source.text.trim()}`) ?? null : null);

export { forEachEntry, DATA };
