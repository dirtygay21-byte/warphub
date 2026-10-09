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

export function spellsOf(r: AosRoster, L: AosLookup): SpellsSummary {
  const lores = (['spell', 'prayer', 'manifestation'] as LoreKind[])
    .map((kind) => ({ kind, lore: r.lores[kind] ? L.lore.get(r.lores[kind]!) : undefined }))
    .filter((x): x is { kind: LoreKind; lore: AosLore } => !!x.lore);
  const byWs = new Map<string, AosWarscroll>();
  for (const p of placedUnits(r, L)) if (p.ws) byWs.set(p.ws.id, p.ws);
  const scrolls = [...byWs.values()];
  const own = scrolls.map((ws) => ({ ws, rules: ws.abilities.filter(isCastable) })).filter((g) => g.rules.length > 0);
  const total = lores.reduce((s, x) => s + x.lore.items.length, 0) + own.reduce((s, g) => s + g.rules.length, 0);
  return { lores, own, wizards: scrolls.filter((w) => w.wizard), priests: scrolls.filter((w) => w.priest), total };
}
