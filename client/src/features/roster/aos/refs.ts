import { isSeasonal, seasonActive } from './rules';
import { placedUnits, type AosLookup } from './engine';
import type { AosEnhancementTable, AosEnhancementType, AosLore, AosRoster, AosRule, AosWarscroll, LoreKind } from './types';
import { cleanRuleText } from '../text';

/*
 * Связи между правилами, которые в данных есть только в тексте:
 *   • значение каста/молитвы/команды («Spell 7», «Prayer 4», «Command 1»);
 *   • правило, которое ссылается на таблицу улучшений или лор по имени
 *     («Give that Hero 1 artefact of power from the ‘Inventions of the Sky-ports’ …»).
 * Интерфейс показывает их явно, а не прячет в тексте правила.
 */

// ---------- значения каста ----------

export type CastKind = 'spell' | 'prayer' | 'command' | 'other';
export interface CastInfo {
  kind: CastKind;
  /** число из значения; null — числа нет */
  n: number | null;
  /** «Каст», «Молитва», «Команда» или исходное слово («Fate») */
  label: string;
  /** то, что показывается крупно: «7+», «4+», «1 CP» */
  short: string;
}

/** «Spell 7» → каст 7+ (2D6), «Prayer 4» → молитва 4+ (D6), «Command 1» → 1 CP. */
export function castInfo(value: string | null | undefined): CastInfo | null {
  const v = cleanRuleText(value);
  if (!v) return null;
  const m = v.match(/^([A-Za-z][A-Za-z ]*?)\s*(\d+)\+?$/);
  if (!m) return { kind: 'other', n: null, label: v, short: v };
  const word = m[1]!.toLowerCase();
  const n = Number(m[2]);
  if (word === 'spell') return { kind: 'spell', n, label: 'Каст', short: `${n}+` };
  if (word === 'prayer') return { kind: 'prayer', n, label: 'Молитва', short: `${n}+` };
  if (word === 'command') return { kind: 'command', n, label: 'Команда', short: `${n} CP` };
  return { kind: 'other', n, label: m[1]!, short: String(n) };
}

/** Заклинание или молитва (то, что колдуют WIZARD/PRIEST). */
export const isCastable = (r: AosRule) => {
  const k = castInfo(r.value)?.kind;
  return k === 'spell' || k === 'prayer';
};

// ---------- ссылки на таблицы и лоры ----------

export interface TableRef {
  type: AosEnhancementType;
  table: AosEnhancementTable;
}
export interface RuleRefs {
  tables: TableRef[];
  lores: AosLore[];
}

const norm = (s: string) =>
  cleanRuleText(s)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ');

const EMPTY: RuleRefs = { tables: [], lores: [] };
const cache = new WeakMap<AosLookup, Map<string, RuleRefs>>();

/**
 * Таблицы улучшений и лоры фракции, которые названы в тексте правила.
 * Имя короче 6 букв не ищется (слишком легко совпасть случайно); закончившиеся сезоны не предлагаются.
 */
export function ruleRefs(text: string, L: AosLookup): RuleRefs {
  if (!text) return EMPTY;
  let byText = cache.get(L);
  if (!byText) cache.set(L, (byText = new Map()));
  const hit = byText.get(text);
  if (hit) return hit;
  const t = norm(text);
  const tables: TableRef[] = [];
  for (const type of L.faction.enhancementTypes)
    for (const table of type.tables) if (seasonActive(table.season) && table.name.length >= 6 && t.includes(norm(table.name))) tables.push({ type, table });
  const lores = L.faction.lores.filter((l) => !l.universal && seasonActive(l.season) && l.name.length >= 6 && t.includes(norm(l.name)));
  const out = tables.length || lores.length ? { tables, lores } : EMPTY;
  byText.set(text, out);
  return out;
}

export interface Grant {
  /** откуда правило: «Построение», «Боевые черты», имя юнита, «Полк славы …» */
  source: string;
  rule: AosRule;
  refs: RuleRefs;
}

/**
 * Правила армии, которые дают улучшения или лоры по ссылке на таблицу: выбранное построение, боевые черты,
 * способности юнитов армии и полка славы. Порядок — как в армии; одинаковые правила не повторяются.
 */
export function grantsOf(r: AosRoster, L: AosLookup): Grant[] {
  const out: Grant[] = [];
  const seen = new Set<string>();
  const add = (source: string, rules: AosRule[]) => {
    for (const rule of rules) {
      const refs = ruleRefs(rule.text, L);
      if (!refs.tables.length && !refs.lores.length) continue;
      const key = source + '|' + rule.name;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source, rule, refs });
    }
  };
  const f = r.formationId ? L.formation.get(r.formationId) : null;
  if (f) add(`Построение «${f.name}»`, f.rules);
  add('Боевые черты', L.faction.battleTraits);
  const units = new Map<string, AosWarscroll>();
  for (const p of placedUnits(r, L)) if (p.ws) units.set(p.ws.id, p.ws);
  for (const ws of units.values()) add(ws.name, ws.abilities);
  if (r.ror) {
    const ror = L.ror.get(r.ror.id);
    if (ror) add(`Полк славы «${ror.name}»`, ror.abilities);
  }
  return out;
}

/** Таблицы, которые можно выбрать сейчас (без закончившихся сезонов), — для обзора улучшений армии. */
export function activeTables(type: AosEnhancementType): AosEnhancementTable[] {
  return type.tables.filter((t) => seasonActive(t.season)).sort((a, b) => Number(isSeasonal(a.season)) - Number(isSeasonal(b.season)));
}

// ---------- заклинания армии ----------

interface CasterGroup {
  ws: AosWarscroll;
  rules: AosRule[];
}

export interface SpellsSummary {
  lores: { kind: LoreKind; lore: AosLore }[];
  /** собственные заклинания и молитвы юнитов армии */
  own: CasterGroup[];
  wizards: AosWarscroll[];
  priests: AosWarscroll[];
  total: number;
}

/** Заклинания и молитвы армии. Лор манифестаций сюда не входит — у него свой блок (manifestationsOf). */
export function spellsOf(r: AosRoster, L: AosLookup): SpellsSummary {
  const lores = (['spell', 'prayer'] as LoreKind[])
    .map((kind) => ({ kind, lore: r.lores[kind] ? L.lore.get(r.lores[kind]!) : undefined }))
    .filter((x): x is { kind: LoreKind; lore: AosLore } => !!x.lore);
  const byWs = new Map<string, AosWarscroll>();
  for (const p of placedUnits(r, L)) if (p.ws) byWs.set(p.ws.id, p.ws);
  const scrolls = [...byWs.values()];
  const own = scrolls.map((ws) => ({ ws, rules: ws.abilities.filter(isCastable) })).filter((g) => g.rules.length > 0);
  const total = lores.reduce((s, x) => s + x.lore.items.length, 0) + own.reduce((s, g) => s + g.rules.length, 0);
  return { lores, own, wizards: scrolls.filter((w) => w.wizard), priests: scrolls.filter((w) => w.priest), total };
}

// ---------- манифестации ----------

/** Заклинание призыва и варскролл манифестации, которую оно призывает. */
export interface ManifestationEntry {
  /** «SUMMON DAIS ARCANUM» — значение каста, тайминг, текст призыва */
  spell: AosRule | null;
  /** варскролл манифестации; null — в данных не нашёлся (показывается предупреждение) */
  ws: AosWarscroll | null;
}

export interface ManifestationSummary {
  lore: AosLore;
  entries: ManifestationEntry[];
}

/** «SUMMON THE BURNING HEAD» и «The Burning Head» → «burninghead». */
const summonKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/^summon\s+/, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^the/, '');

/**
 * Выбранный лор манифестаций: каждое заклинание призыва в паре со своим варскроллом (lore.summons).
 * Пара ищется по имени («Summon X» ↔ «X»); что не нашло пары, остаётся отдельной записью — не теряется молча.
 */
export function manifestationsOf(r: AosRoster, L: AosLookup): ManifestationSummary | null {
  const id = r.lores.manifestation;
  const lore = id ? L.lore.get(id) : undefined;
  if (!lore || lore.kind !== 'manifestation') return null;
  return { lore, entries: pairManifestations(lore, L) };
}

export function pairManifestations(lore: AosLore, L: AosLookup): ManifestationEntry[] {
  const scrolls = lore.summons.map((wid) => L.ws.get(wid)).filter((w): w is AosWarscroll => !!w);
  const free = new Map(scrolls.map((w) => [summonKey(w.name), w]));
  const entries: ManifestationEntry[] = lore.items.map((spell) => {
    const key = summonKey(spell.name);
    const ws = free.get(key) ?? null;
    if (ws) free.delete(key);
    return { spell, ws };
  });
  for (const ws of free.values()) entries.push({ spell: null, ws });
  // ссылка лора на варскролл, которого нет в данных
  for (const wid of lore.summons) if (!L.ws.get(wid)) entries.push({ spell: null, ws: null });
  return entries;
}

// ---------- террейн фракции: размещение ----------

export interface TerrainPlacementRule {
  rule: AosRule;
  /** откуда правило: «Боевая черта», «Построение: …», «Варскролл террейна» */
  from: string;
}

export interface TerrainPlacement {
  ws: AosWarscroll;
  /** правила фракции и самого варскролла о том, где и когда ставится этот террейн */
  rules: TerrainPlacementRule[];
  /** расстояния из этих правил: «more than 12" from all other friendly Nexuses of Grief» */
  measures: string[];
}

/** «Nexus of Grief» → совпадает и с «Nexuses of Grief»; «Awakened Wyldwood» — с «Awakened Wyldwoods». */
const nameRe = (name: string) =>
  new RegExp(
    '\\b' +
      name
        .split(/\s+/)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:e?s)?')
        .join('\\s+') +
      '\\b',
    'i',
  );
const SETS_UP = /\bset up\b|\bdeploy/i;
/** «more than 3" from all units, objectives and …» — до точки или скобки; «…, and more than 12" …» — отдельное расстояние. */
const MEASURE = /(?:wholly\s+)?(?:within|outside|more than)\s+\d+(?:\.\d+)?(?:"|”|″)[^.;:()\n]*/gi;
const NEXT_MEASURE = /,?\s+(?:and|or)\s+(?=(?:wholly\s+)?(?:within|outside|more than)\s+\d)|,\s+(?=(?:wholly\s+)?(?:within|outside|more than)\s+\d)/i;

/** Расстояния из текста правила, по одному условию (без повторов). */
export function measuresOf(text: string): string[] {
  const out = new Set<string>();
  for (const m of cleanRuleText(text).matchAll(MEASURE))
    for (const part of m[0].split(NEXT_MEASURE)) out.add(part.replace(/\s+/g, ' ').replace(/\s+(?:and|or)$/i, '').trim());
  return [...out];
}

/**
 * Как ставится террейн фракции: правила, которые его выставляют (боевые черты, построения),
 * и способности самого варскролла в фазе деплоя. Связь — по имени террейна в тексте правила.
 * Общие правила (Core Rules 10.1, батлпак) — в aos/terrain.ts.
 */
export function terrainPlacementOf(ws: AosWarscroll, L: AosLookup): TerrainPlacement {
  const re = nameRe(ws.name);
  const rules: TerrainPlacementRule[] = [];
  const take = (rule: AosRule, from: string) => {
    const text = cleanRuleText(rule.text);
    if (re.test(text) && SETS_UP.test(text)) rules.push({ rule, from });
  };
  for (const r of L.faction.battleTraits) take(r, 'Боевая черта фракции');
  for (const f of L.faction.formations) for (const r of f.rules) take(r, `Построение: ${f.name}`);
  for (const r of ws.abilities) if (/deployment phase/i.test(r.timing ?? '')) rules.push({ rule: r, from: 'Варскролл террейна' });
  const measures = [...new Set(rules.flatMap((r) => measuresOf(r.rule.text)))];
  return { ws, rules, measures };
}
