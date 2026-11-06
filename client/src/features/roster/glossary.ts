/**
 * Глоссарий правил 40K для всплывающих подсказок (01.11.2026): способности оружия ([BLAST], [RAPID FIRE 1]…),
 * основные способности юнитов (Deep Strike, Feel No Pain…), особые способности оружия фракций и термины правил.
 * Данные — backend/roster-data/glossary.json, собраны из снимка wh-rules.ru (tools/roster-data/scripts/whrules-glossary.mjs);
 * текст на русском, как на wh-rules.ru. В текстах: **жирный** и ссылки на термины [gloss:id:текст].
 * Загрузка — loadGlossary() в data.ts. Чистые функции (без React) — проверяются в tools/roster-data/tests/glossary.test.ts.
 */
export interface GlossaryAbility {
  /** номер раздела основных правил (24.05); null — без номера */
  num: string | null;
  /** как на карте правил: «[BLAST]», «Deep Strike» */
  name: string;
  type: 'weapon' | 'unit';
  text: string;
  example?: string;
  /** английский текст того же снимка wh-rules (переключатель RU/EN) */
  en?: { text: string; example?: string };
}
export interface Glossary {
  schema: 'warphub-glossary/1';
  source: { site: string; dataVersion: number; mfm: string | null; date: string; snapshot: string; fingerprint: string; language: string };
  abilities: Record<string, GlossaryAbility>;
  /** особые способности оружия фракций: варианты текста */
  weapon: Record<string, string[]>;
  /** английские варианты особых способностей оружия */
  weaponEn?: Record<string, string[]>;
  terms: Record<string, { term: string; text: string; textEn?: string }>;
}

/**
 * Глоссарий на выбранном языке WarpBuilder 40K (решение владельца 06.11.2026): en — английский текст того же снимка
 * wh-rules.ru; чего нет по-английски — остаётся русский. ru — без изменений.
 */
export function localizeGlossary(g: Glossary, lang: 'ru' | 'en'): Glossary {
  if (lang === 'ru') return g;
  return {
    ...g,
    abilities: Object.fromEntries(
      Object.entries(g.abilities).map(([k, a]) => [k, a.en ? { ...a, text: a.en.text, example: a.en.example } : a]),
    ),
    weapon: Object.fromEntries(Object.entries(g.weapon).map(([k, v]) => [k, g.weaponEn?.[k] ?? v])),
    terms: Object.fromEntries(Object.entries(g.terms).map(([id, t]) => [id, t.textEn ? { ...t, text: t.textEn } : t])),
  };
}

/** Строка способностей оружия из инфолиста («rapid fire 1, anti-infantry 4+») → отдельные способности. */
export const splitWeaponKeywords = (s: string | null | undefined): string[] =>
  (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Что показать для способности или ключевого слова. */
export type GlossaryHit =
  | { kind: 'ability'; key: string; ability: GlossaryAbility }
  | { kind: 'weapon'; key: string; texts: string[] }
  | { kind: 'term'; id: string; term: string; text: string };

const BOUNDARY = /^$|^[\s\-:+]/;

/**
 * Способность по названию из инфолиста: регистр не важен, параметры отбрасываются — «Anti-Infantry 4+» → [ANTI],
 * «Sustained Hits D3» → [SUSTAINED HITS], «Lethal Hits: non-Monster/Vehicle» → [LETHAL HITS], «Feel No Pain 5+» → Feel No Pain.
 * Берётся самое длинное совпадение (PSYCHIC ASSASSIN, а не PSYCHIC). null — нет в глоссарии.
 */
export function findAbility(g: Glossary, label: string): GlossaryHit | null {
  const s = label.replace(/^\[|\]$/g, '').trim().toUpperCase();
  let best: GlossaryHit | null = null;
  let bestLen = 0;
  const consider = (key: string, hit: () => GlossaryHit) => {
    if (key.length > bestLen && s.startsWith(key) && BOUNDARY.test(s.slice(key.length))) {
      best = hit();
      bestLen = key.length;
    }
  };
  for (const [key, ability] of Object.entries(g.abilities)) consider(key, () => ({ kind: 'ability', key, ability }));
  for (const [key, texts] of Object.entries(g.weapon)) consider(key, () => ({ kind: 'weapon', key, texts }));
  return best;
}

/** Ключевое слово юнита (INFANTRY, VEHICLE, FLY…), если оно есть среди терминов глоссария. */
export function findKeyword(g: Glossary, keyword: string): GlossaryHit | null {
  const k = keyword.trim().toUpperCase();
  for (const [id, t] of Object.entries(g.terms)) if (t.term.toUpperCase() === k) return { kind: 'term', id, term: t.term, text: t.text };
  return null;
}

export const termHit = (g: Glossary, id: string): GlossaryHit | null => {
  const t = g.terms[id];
  return t ? { kind: 'term', id, term: t.term, text: t.text } : null;
};

/** Кусок текста правила: обычный, **жирный**, __выделение__, ссылка на термин или на основную способность ([core:Deep Strike]). */
export type RichPart = { t: 'text'; s: string } | { t: 'bold'; s: string } | { t: 'em'; s: string } | { t: 'term'; s: string; id: string } | { t: 'core'; s: string };

const RICH = /\*\*\[gloss:([^:\]]+):([^\]]+)\]\*\*|\[gloss:([^:\]]+):([^\]]+)\]|\[core:([^\]]+)\]|\*\*([^*]+?)\*\*|__([^_\n]+?)__/g;

/**
 * Разметка wh-rules: «**[gloss:attack-dice:кубики атаки]**», «[gloss:id:текст]», «[core:Feel No Pain 5+]», «**[BLAST]**»,
 * «__не__» → куски для показа. Заголовки «### …» и маркеры ◈ ▪ остаются в тексте — их показывает RichText построчно.
 */
export function parseRich(text: string): RichPart[] {
  const out: RichPart[] = [];
  let last = 0;
  for (const m of text.matchAll(RICH)) {
    if (m.index! > last) out.push({ t: 'text', s: text.slice(last, m.index) });
    if (m[1]) out.push({ t: 'term', id: m[1], s: m[2]! });
    else if (m[3]) out.push({ t: 'term', id: m[3], s: m[4]! });
    else if (m[5]) out.push({ t: 'core', s: m[5] });
    else if (m[6]) out.push({ t: 'bold', s: m[6] });
    else out.push({ t: 'em', s: m[7]! });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', s: text.slice(last) });
  return out;
}
