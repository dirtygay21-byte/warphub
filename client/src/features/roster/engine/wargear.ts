/**
 * Варианты снаряжения (Wargear Options) как правила, а не свободный текст.
 *
 * Wahapedia хранит варианты замены оружия фразами вроде
 *   «Any number of models can each have their Power Klaw replaced with 1 Killsaw.»
 *   «For every 10 models in this unit, 1 Boy model can have their Shoota replaced with 1 Big Shoota.»
 *   «The Nob can have their Rokkit Pistol replaced with 1 Smash Hammer.»
 * Здесь они разбираются в структуру: КТО может (лимит), ЧТО заменяется и НА ЧТО (варианты).
 * Снаряжение юнита = стандартное по инфолисту + выбранные игроком замены в пределах лимитов.
 * Фразы, которые разобрать не удалось, показываются текстом и в расчёт не входят — собрать
 * через них незаконный вариант нельзя.
 */
import type { Datasheet, LoadoutRule } from './types';

export interface Item {
  weapon: string;
  qty: number;
}

/** Тип моделей в отряде («1-2 Nob models» → Nob, от 1 до 2). */
export interface ModelGroup {
  name: string;
  min: number;
  max: number;
  count: number;
}

export type Limit =
  | { kind: 'fixed'; n: number } // «This model», «1 model», «Up to 2 models»
  | { kind: 'each' } // «Any number of models», «All models»
  | { kind: 'perN'; per: number; n: number }; // «For every 5 models in this unit, 1 model»

export interface ParsedOption {
  /** ключ выбора: номер фразы, для составных — «номер.подпункт» */
  key: string;
  index: number;
  text: string;
  /** тип моделей, к которому относится вариант (null — любые модели отряда) */
  group: string | null;
  limit: Limit;
  /** минимальный размер отряда («If this unit contains 10 models, …») */
  minModels: number;
  /** максимальный размер отряда («If this unit contains 9 or fewer models») */
  maxModels: number;
  /** что снимается с каждой модели (пусто — оружие добавляется) */
  from: Item[];
  /** вариант доступен, только если в отряде уже есть эти предметы («If this model is equipped with …») */
  requires: Item[];
  /** вариант недоступен, если в отряде есть эти предметы («If … is not equipped with …») */
  forbids: Item[];
  /** варианты замены («one of the following») */
  choices: Item[][];
  /** сколько предметов из списка может взять одна модель («up to two of the following») */
  perModel: number;
  /** один и тот же вариант нельзя взять дважды на модель («cannot take duplicates») */
  noDup: boolean;
  /** общий лимит с другими подпунктами («can do one of the following») */
  share: string | null;
}

export interface OptionsInfo {
  parsed: ParsedOption[];
  /** фразы, которые не удалось разобрать (номера в ds.options) */
  unparsed: number[];
  /** пояснения и сноски к вариантам (показываются текстом) */
  notes: number[];
}

// ---------- разбор текста ----------

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const toNum = (s: string): number | null => (/^\d+$/.test(s) ? +s : (NUM[s.toLowerCase()] ?? null));

const norm = (s: string) =>
  s
    .replace(/[’‘`]/g, "'")
    .replace(/[ \t]+/g, ' ')
    .trim();
const key = (s: string) =>
  norm(s)
    .toLowerCase()
    .replace(/^(?:the|a|an|its|their|his|her)\s+/, '')
    .replace(/[.;:,]+$/, '');

/** «2 Rokkit Pistols» → { weapon: 'Rokkit Pistol', qty: 2 } с привязкой к названиям оружия инфолиста. */
function parseItem(raw: string, known: Map<string, string>): Item | null {
  let s = norm(raw)
    .replace(/^[•*\-–]\s*/, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\*+/g, '')
    .replace(/[.;,:]+$/, '')
    .trim();
  if (!s || /\b(?:following|different|either|instead)\b/i.test(s)) return null;
  let qty = 1;
  const m = s.match(/^(\d+|one|two|three|four|a|an)\s+(.+)$/i);
  if (m) {
    qty = toNum(m[1]!) ?? 1;
    s = m[2]!;
  }
  const k = key(s);
  const name = known.get(k) ?? known.get(k.replace(/es$/, '')) ?? known.get(k.replace(/s$/, '')) ?? null;
  return { weapon: name ?? s.replace(/^./, (c) => c.toUpperCase()), qty };
}

/** Список «X and Y» / «X, Y and Z» → предметы. */
function parseItems(raw: string, known: Map<string, string>): Item[] | null {
  const parts = norm(raw)
    .replace(/[.;]+$/, '')
    .split(/,\s*(?:and\s+)?|\s+and\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: Item[] = [];
  for (const p of parts) {
    const it = parseItem(p, known);
    if (!it) return null;
    out.push(it);
  }
  return out.length ? out : null;
}

/** Строки списка «• 1 X» (без сносок). */
const bullets = (lines: string[]) =>
  lines
    .flatMap((l) => l.split('•'))
    .map((l) => l.trim())
    .filter((l) => l && !/^\*/.test(l));

interface Choices {
  choices: Item[][];
  perModel: number;
  noDup: boolean;
}

/** Правая часть: «1 Killsaw», «one of the following: • …», «up to two of the following …», «1 X and one of the following: …». */
function parseChoices(head: string, rest: string[], known: Map<string, string>): Choices | null {
  let t = norm(head).replace(/^:\s*/, '');
  const list = (prefix: Item[]) => {
    const out: Item[][] = [];
    for (const l of bullets(rest)) {
      const items = parseItems(l, known);
      if (!items) return null;
      out.push([...prefix, ...items]);
    }
    return out.length ? out : null;
  };
  // «up to two of the following(, and can take duplicates):»
  let m = t.match(/^up to (\w+) of the following(.*)$/i);
  if (m) {
    const n = toNum(m[1]!);
    const c = list([]);
    return n && c ? { choices: c, perModel: n, noDup: !/can take duplicate/i.test(m[2]!), } : null;
  }
  // «up to 2 missile drones»
  m = t.match(/^up to (\w+)\s+(.+)$/i);
  if (m && !rest.length) {
    const n = toNum(m[1]!);
    const it = parseItem('1 ' + m[2]!, known);
    return n && it ? { choices: [[it]], perModel: n, noDup: false } : null;
  }
  // «1 axe of Khorne and one of the following:»
  m = t.match(/^(.+?)\s+and\s+(?:one|on|1) of the following\s*[:;]?\s*$/i);
  if (m) {
    const prefix = parseItems(m[1]!, known);
    const c = prefix && list(prefix);
    return c ? { choices: c, perModel: 1, noDup: false } : null;
  }
  // «one of the following (duplicates are not allowed)*:» / «on of the following;» / просто «:» и список
  m = t.match(/^(?:(?:one|on|1) of the following)?((?:\s*\([^)]*\)|\s*\*+)*)\s*[:;]*\s*(.*)$/i);
  if (m && (rest.length || /of the following/i.test(t))) {
    const noDup = /duplicates are not allowed|cannot take duplicate/i.test(m[1]!);
    const inline = m[2]!.trim();
    if (inline && /of the following/i.test(t)) {
      // «one of the following: 1 Kannon, 1 Supa-kannon»
      const out: Item[][] = [];
      for (const part of inline.replace(/\.$/, '').split(/,\s*(?:or\s+)?|\s+or\s+/i)) {
        const items = parseItems(part, known);
        if (!items) return null;
        out.push(items);
      }
      return { choices: out, perModel: 1, noDup };
    }
    if (!inline && rest.length) {
      const c = list([]);
      return c ? { choices: c, perModel: 1, noDup } : null;
    }
  }
  if (rest.length && bullets(rest).length) {
    // текст вида «… with: » уже срезан; иначе после фразы идёт список — неоднозначно
    t = t.replace(/:$/, '');
  }
  const items = parseItems(t, known);
  return items ? { choices: [items], perModel: 1, noDup: false } : null;
}

/** Одно и то же имя в единственном/множественном числе: Boy/Boyz, Legionary/Legionaries, Nob/Nobz. */
const sing = (s: string) => s.replace(/ies$/, 'y').replace(/(?<=[^s])z$/, '').replace(/es$/, 'e').replace(/s$/, '');
const sameName = (a: string, b: string) => a === b || sing(a) === sing(b);

/** «Кто»: возвращает лимит и тип моделей. */
function parseWho(raw: string, groups: string[]): { limit: Limit; group: string | null; minModels: number } {
  let s = norm(raw).replace(/,$/, '');
  let minModels = 0;
  const cond = s.match(/^if this unit contains (\d+) (?:or more )?models,?\s*(.+)$/i);
  if (cond) {
    minModels = +cond[1]!;
    s = cond[2]!;
  }
  // «… that is equipped with X» / «… equipped with X» — уточнение, лимит не меняет
  s = s.replace(/\s+(?:that|who|which)\s+(?:is|are)\s+equipped with .+$/i, '').replace(/\s+equipped with .+$/i, '');
  const lower = s.toLowerCase();
  const findGroup = (txt: string): string | null => {
    const t = txt.toLowerCase().replace(/\s+models?$/, '').replace(/'s?$/, '').trim();
    if (!t || t === 'model' || t === 'models') return null;
    for (const g of groups) {
      const gl = g.toLowerCase();
      if (sameName(t, gl)) return g;
    }
    return null;
  };
  const withGroup = (limit: Limit, txt: string) => ({ limit, group: findGroup(txt), minModels });

  if (/^(?:this (?:model|unit)|it)$/.test(lower)) return { limit: { kind: 'fixed', n: 1 }, group: null, minModels };
  let m = lower.match(/^(?:any numbers? of|all|each|every)\s+(?:of the\s+)?(.*?)\s*(?:models?)?(?:\s+in this unit)?$/);
  if (m) return withGroup({ kind: 'each' }, m[1]!);
  m = s.match(/^for every (\d+) (.*?) in (?:this|the) unit,?\s+(?:up to\s+)?(\d+|one|a|an|it|this unit)\s*(.*?)\s*(?:models?)?$/i);
  if (m) {
    const n = /^(it|this unit)$/i.test(m[3]!) ? 1 : (toNum(m[3]!) ?? 1);
    const counted = m[2]!.replace(/\s*models?$/i, '');
    return { limit: { kind: 'perN', per: +m[1]!, n }, group: findGroup(m[4] || counted), minModels };
  }
  m = s.match(/^(?:up to\s+)?(\d+|one|a|an)\s+(?:other\s+)?(.*?)\s*(?:models?)?(?:\s+in this unit)?$/i);
  if (m) return withGroup({ kind: 'fixed', n: toNum(m[1]!) ?? 1 }, m[2]!);
  m = s.match(/^the\s+(.+)$/i);
  if (m) return withGroup({ kind: 'fixed', n: 1 }, m[1]!);
  return withGroup({ kind: 'fixed', n: 1 }, s);
}

/** Одна фраза варианта (первая строка + строки списка после неё). */
function parseSentence(firstRaw: string, rest: string[], ctx: { key: string; index: number; text: string; groups: string[]; known: Map<string, string>; minModels?: number; maxModels?: number; perUnit?: number; share?: string | null }): ParsedOption | null {
  let first = norm(firstRaw).replace(/\*+$/, '').replace(/\.$/, '').trim();
  let requires: Item[] = [];
  let forbids: Item[] = [];
  const cond = first.match(/^if (?:this|the|that) (.+?)\s+(?:is|has been)\s+(not\s+)?equipped with (.+?),\s*(?:its|their|it)\s+(.+)$/i);
  if (cond) {
    const items = parseItems(cond[3]!, ctx.known);
    if (!items) return null;
    if (cond[2]) forbids = items;
    else requires = items;
    const subj = /^(?:model|unit)$/i.test(cond[1]!) ? 'This model' : 'The ' + cond[1];
    first = /^can\b/i.test(cond[4]!) ? `${subj} ${cond[4]}` : `${subj}'s ${cond[4]}`;
  }
  const patterns: { re: RegExp; add?: boolean; instance?: boolean; haveN?: boolean }[] = [
    { re: /^(.+?)\s+can\s+(?:each\s+)?have\s+(?:its|their|his|her)\s+(.+?)\s+replaced\s+(?:with\s+)?(.*)$/i },
    { re: /^(.+?)'s?\s+(.+?)\s+can\s+each\s+(?:be\s+)?replaced\s+(?:with\s+)?(.*)$/i, instance: true },
    { re: /^(.+?)'s?\s+(.+?)\s+can\s+(?:be\s+)?replaced?\s+(?:with\s+)?(.*)$/i },
    { re: /^(.+?)\s+can\s+(?:each\s+)?replace\s+(?:one of\s+)?(?:its|their|his|her)\s+(.+?)\s+with\s*(.*)$/i },
    { re: /^(.+?)\s+can\s+(?:each\s+)?be\s+equipped\s+(?:with\s+)?(.*)$/i, add: true },
    { re: /^(.+?)\s+can\s+have\s+((?:\d+|one|a|an)\s+.+)$/i, add: true },
  ];
  const isKnown = (raw: string) => (parseItems(raw, ctx.known) ?? []).every((it) => ctx.known.has(key(it.weapon)));
  for (const p of patterns) {
    let m = first.match(p.re);
    if (!m) continue;
    if (p.re.source.includes("'s?")) {
      // «The Acothyst's twin torturer's tools can be replaced …» — пробуем каждое «'s»
      const pre = m[1]! + "'s " + m[2]!;
      const cuts = [...pre.matchAll(/'s?\s+/g)].map((x) => [x.index!, x[0].length] as const);
      for (const [at, len] of cuts) {
        const who = pre.slice(0, at);
        const what = pre.slice(at + len);
        if (isKnown(what)) {
          m = Object.assign([m[0], who, what, m[3]], { index: 0, input: first }) as unknown as RegExpMatchArray;
          break;
        }
      }
    }
    const who = parseWho(m[1]!, ctx.groups);
    const from = p.add ? [] : parseItems(m[2]!, ctx.known);
    const ch = parseChoices(p.add ? m[2]! : m[3]!, rest, ctx.known);
    if (!from || !ch) return null;
    let limit = who.limit;
    // «For every 5 models in this unit: • 1 model's …» — подпункт получает лимит «на каждые 5»
    if (ctx.perUnit && limit.kind === 'fixed') limit = { kind: 'perN', per: ctx.perUnit, n: limit.n };
    // «This model's 2 autocannons can each be replaced» — каждая штука отдельно
    if (p.instance && limit.kind === 'fixed' && from.length === 1 && from[0]!.qty > 1) {
      limit = { kind: 'fixed', n: limit.n * from[0]!.qty };
      from[0] = { ...from[0]!, qty: 1 };
    }
    return {
      key: ctx.key,
      index: ctx.index,
      text: ctx.text,
      group: who.group,
      limit,
      minModels: Math.max(who.minModels, ctx.minModels ?? 0),
      maxModels: ctx.maxModels ?? Infinity,
      from,
      requires,
      forbids,
      choices: ch.choices,
      perModel: ch.perModel,
      noDup: ch.noDup,
      share: ctx.share ?? null,
    };
  }
  return null;
}

/** Разобрать одну запись вариантов (может дать несколько вариантов — подпункты). */
export function parseOption(text: string, index: number, groups: string[], known: Map<string, string>): ParsedOption[] | null | 'none' {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = norm(lines[0] ?? '').replace(/\*+$/, '');
  const rest = lines.slice(1);
  if (!first || /^none\.?$/i.test(first)) return 'none';
  // сноски и пояснения («* cannot be replaced», «X is equipped with: …») — не варианты
  if (/^\*/.test(first) || /cannot (?:be (?:replaced|equipped|selected)|take|select)|is equipped with:|are equipped with:|^this weapon/i.test(first)) return 'none';
  const ctx = { index, text, groups, known };

  // «If this unit contains 10 (or more / or fewer) models: • …» и «For every 5 models in this unit: • …»
  let m = first.match(/^(?:if this unit contains (\d+) (or more |or fewer )?models|for every (\d+) models in (?:this|the) unit)\s*:?$/i);
  if (m && rest.length) {
    const out: ParsedOption[] = [];
    const subs = bullets(rest);
    const sub = m[3]
      ? { perUnit: +m[3]! }
      : /fewer/i.test(m[2] ?? '')
        ? { maxModels: +m[1]! }
        : { minModels: +m[1]! };
    for (let k = 0; k < subs.length; k++) {
      const o = parseSentence(subs[k]!, [], { ...ctx, key: `${index}.${k}`, ...sub });
      if (!o) return null;
      out.push(o);
    }
    return out.length ? out : null;
  }
  // «The Sergeant can do one of the following: • Replace its X with Y. • Be equipped with Z.»
  m = first.match(/^(.+?)\s+can do one of the following\s*:?$/i);
  if (m && rest.length) {
    const who = m[1]!;
    const out: ParsedOption[] = [];
    const subs = bullets(rest);
    for (let k = 0; k < subs.length; k++) {
      const sub = subs[k]!.replace(/^./, (c) => c.toLowerCase());
      const o = parseSentence(`${who} can ${sub}`, [], { ...ctx, key: `${index}.${k}`, share: String(index) });
      if (!o) return null;
      out.push(o);
    }
    return out.length ? out : null;
  }
  const one = parseSentence(first, rest, { ...ctx, key: String(index) });
  return one ? [one] : null;
}

// ---------- состав отряда ----------

/** Типы моделей и их число при выбранном размере отряда. */
export function modelGroups(ds: Pick<Datasheet, 'composition' | 'stats'>, models: number): ModelGroup[] {
  // варианты состава разделены строкой «OR»; в строке может быть «1 X and 9 Y» или «1 X, 2 Y and 3 Z»
  const alts: { name: string; min: number; max: number }[][] = [[]];
  for (const line0 of ds.composition) {
    const line = norm(line0.split('\n')[0]!).replace(/:.*$/, '');
    if (/^or$/i.test(line)) {
      alts.push([]);
      continue;
    }
    if (/maximum/i.test(line)) continue;
    const parts = line.split(/,\s*|\s+and\s+(?=\d)/i);
    for (const part of parts) {
      const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?\s+(.+?)(?:\s+models?)?(?:\s+–.*)?$/i);
      if (m) alts[alts.length - 1]!.push({ name: m[3]!.replace(/\s*\(.*\)$/, ''), min: +m[1]!, max: +(m[2] ?? m[1]!) });
    }
  }
  const options = alts.filter((a) => a.length);
  const fits = (a: { min: number; max: number }[]) => {
    const lo = a.reduce((s, g) => s + g.min, 0);
    const hi = a.reduce((s, g) => s + g.max, 0);
    return models >= lo && models <= hi;
  };
  const raw = options.find(fits) ?? options[options.length - 1] ?? [];
  const sumMin = raw.reduce((s, g) => s + g.min, 0);
  const sumMax = raw.reduce((s, g) => s + g.max, 0);
  const t = sumMax > sumMin ? Math.min(1, Math.max(0, (models - sumMin) / (sumMax - sumMin))) : 0;
  const out = raw.map((g) => ({ ...g, count: Math.round(g.min + t * (g.max - g.min)) }));
  // поправка округления: разница — самой большой группе
  const diff = models - out.reduce((s, g) => s + g.count, 0);
  if (diff && out.length) {
    const big = out.reduce((a, b) => (b.max - b.min > a.max - a.min ? b : a));
    big.count = Math.max(big.min, Math.min(big.max, big.count + diff));
  }
  return out;
}

/** Названия оружия инфолиста (ключ — в нижнем регистре). */
function knownWeapons(ds: Pick<Datasheet, 'weapons' | 'defaultLoadout'>): Map<string, string> {
  const known = new Map<string, string>();
  for (const w of ds.weapons) known.set(key(w.name), w.name);
  for (const r of ds.defaultLoadout) for (const it of r.items) if (!known.has(key(it.weapon))) known.set(key(it.weapon), it.weapon);
  return known;
}

const cache = new WeakMap<object, OptionsInfo>();

/** Все варианты снаряжения инфолиста (с кешем). */
export function optionsOf(ds: Datasheet): OptionsInfo {
  const hit = cache.get(ds);
  if (hit) return hit;
  const groups = modelGroups(ds, 0).map((g) => g.name);
  const known = knownWeapons(ds);
  const parsed: ParsedOption[] = [];
  const unparsed: number[] = [];
  const notes: number[] = [];
  ds.options.forEach((o, i) => {
    const r = parseOption(o.text, i, groups, known);
    if (r === 'none') {
      if (!/^none\.?$/i.test(o.text.trim())) notes.push(i);
      return;
    }
    if (r) parsed.push(...r);
    else unparsed.push(i);
  });
  const info = { parsed, unparsed, notes };
  cache.set(ds, info);
  return info;
}

// ---------- стандартное снаряжение и замены ----------

/** К какому типу моделей относится строка стандартного снаряжения («Every Nob» → Nob). */
function ruleGroup(r: LoadoutRule, groups: ModelGroup[]): ModelGroup | null {
  const s = norm(r.subject).toLowerCase().replace(/^(?:every|each|the|this|one|1)\s+/, '').replace(/\s+models?$/, '');
  for (const g of groups) if (sameName(s, g.name.toLowerCase())) return g;
  return null;
}

/** Сколько моделей получает строку стандартного снаряжения. */
export function ruleCount(r: LoadoutRule, rules: LoadoutRule[], groups: ModelGroup[], models: number, addonCount: (subject: string) => number | null): number {
  const add = addonCount(r.subject);
  if (add !== null) return add;
  const g = ruleGroup(r, groups);
  if (g && groups.length > 1 && (r.who === 'rest' || r.who === 'all')) return g.count;
  if (r.who === 'all') return models;
  if (r.who === 'one') return models > 0 ? 1 : 0;
  if (typeof r.who === 'number') return Math.min(r.who, models);
  // «остальные»: все, кроме тех, у кого своя строка
  const taken = rules.filter((x) => x !== r && addonCount(x.subject) === null).reduce((s, x) => {
    const xg = ruleGroup(x, groups);
    if (x.who === 'one') return s + 1;
    if (typeof x.who === 'number') return s + x.who;
    if (xg && groups.length > 1) return s + xg.count;
    return s;
  }, 0);
  return Math.max(0, models - taken);
}

/** Лимит варианта при текущем составе. */
export function optionLimit(o: ParsedOption, groups: ModelGroup[], models: number): number {
  if (models < o.minModels || models > o.maxModels) return 0;
  const size = o.group ? (groups.find((g) => g.name === o.group)?.count ?? 0) : models;
  if (o.limit.kind === 'each') return size;
  if (o.limit.kind === 'fixed') return Math.min(o.limit.n, size || models);
  return Math.min(size || models, Math.floor(models / o.limit.per) * o.limit.n);
}

/** Выбор игрока: номер варианта → сколько моделей взяли каждый вариант замены. */
export type Picks = Record<string, number[]>;

export interface LoadoutResult {
  loadout: Record<string, number>;
  /** выбор, который нарушает лимиты или снимает оружие, которого нет */
  problems: string[];
  /** сколько можно поставить на каждый вариант (для счётчиков в интерфейсе) */
  max: Record<string, number[]>;
  limits: Record<string, number>;
}

const kv = (s: string) => s.toLowerCase();

/** Снаряжение = стандартное + замены; проверка лимитов и наличия заменяемого оружия. */
export function applyPicks(ds: Datasheet, base: Record<string, number>, picks: Picks | undefined, models: number): LoadoutResult {
  const info = optionsOf(ds);
  const groups = modelGroups(ds, models);
  const problems: string[] = [];
  const pool = new Map<string, { name: string; n: number }>();
  for (const [w, n] of Object.entries(base)) pool.set(kv(w), { name: w, n });
  const have = (w: string) => pool.get(kv(w))?.n ?? 0;
  const take = (w: string, n: number) => {
    const p = pool.get(kv(w));
    if (!p || p.n < n) return false;
    p.n -= n;
    return true;
  };
  const give = (w: string, n: number) => {
    const p = pool.get(kv(w));
    if (p) p.n += n;
    else pool.set(kv(w), { name: w, n });
  };
  const countsOf = (o: ParsedOption) => (picks?.[o.key] ?? []).map((n) => (n > 0 ? Math.floor(n) : 0));
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

  // лимиты: моделей на вариант, предметов на вариант (× perModel), общий лимит подпунктов
  const limits: Record<string, number> = {};
  for (const o of info.parsed) limits[o.key] = optionLimit(o, groups, models);
  const shareLimit = new Map<string, number>();
  const shareUsed = new Map<string, number>();
  for (const o of info.parsed) {
    if (!o.share) continue;
    shareLimit.set(o.share, Math.min(shareLimit.get(o.share) ?? Infinity, limits[o.key]!));
    shareUsed.set(o.share, (shareUsed.get(o.share) ?? 0) + sum(countsOf(o)));
  }

  for (const o of info.parsed) {
    const counts = countsOf(o);
    const total = sum(counts);
    if (!total) continue;
    const name = shortText(o);
    if (o.requires.some((r) => have(r.weapon) < 1)) problems.push(`«${name}»: нужно ${o.requires.map((r) => r.weapon).join(' + ')}`);
    if (o.forbids.some((r) => have(r.weapon) > 0)) problems.push(`«${name}»: нельзя вместе с ${o.forbids.map((r) => r.weapon).join(' + ')}`);
    const cap = limits[o.key]! * o.perModel;
    if (total > cap) problems.push(`«${name}»: выбрано ${total}, можно не больше ${cap}`);
    if (o.noDup && counts.some((n) => n > limits[o.key]!)) problems.push(`«${name}»: один и тот же вариант — не больше ${limits[o.key]}`);
    counts.forEach((n, ci) => {
      const choice = o.choices[ci];
      if (!n || !choice) return;
      for (const f of o.from) if (!take(f.weapon, f.qty * n)) problems.push(`«${name}»: в отряде нет ${f.qty * n}× ${f.weapon} для замены`);
      for (const it of choice) give(it.weapon, it.qty * n);
    });
  }
  for (const [sh, used] of shareUsed) if (used > shareLimit.get(sh)!) problems.push(`Можно выбрать только один из взаимоисключающих вариантов (выбрано ${used})`);

  // максимум для каждого счётчика (с учётом остальных выборов)
  const max: Record<string, number[]> = {};
  for (const o of info.parsed) {
    const counts = countsOf(o);
    const lim = limits[o.key]!;
    max[o.key] = o.choices.map((_, ci) => {
      const mine = counts[ci] ?? 0;
      const others = sum(counts) - mine;
      let m = lim * o.perModel - others;
      if (o.noDup) m = Math.min(m, lim);
      if (o.share) m = Math.min(m, mine + shareLimit.get(o.share)! - shareUsed.get(o.share)!);
      if ((o.requires.some((r) => have(r.weapon) < 1) || o.forbids.some((r) => have(r.weapon) > 0)) && !mine) m = 0;
      for (const f of o.from) m = Math.min(m, mine + Math.floor(have(f.weapon) / f.qty));
      return Math.max(0, m);
    });
  }

  const loadout: Record<string, number> = {};
  for (const p of pool.values()) if (p.n > 0) loadout[p.name] = p.n;
  return { loadout, problems, max, limits };
}

/** Короткое описание варианта: «Power Klaw → Killsaw». */
export function shortText(o: ParsedOption): string {
  const f = o.from.map((i) => (i.qty > 1 ? `${i.qty}× ` : '') + i.weapon).join(' + ');
  const to = o.choices.map((c) => c.map((i) => (i.qty > 1 ? `${i.qty}× ` : '') + i.weapon).join(' + ')).join(' / ');
  return f ? `${f} → ${to}` : `+ ${to}`;
}

/** Подпись «кто»: «любая модель», «1 на каждые 10 моделей», «Nob». */
export function whoText(o: ParsedOption): string {
  const g = o.group ? ` (${o.group})` : '';
  if (o.share) return 'один из вариантов' + g;
  if (o.limit.kind === 'each') return `любое число моделей${g}`;
  if (o.limit.kind === 'perN') return `${o.limit.n} на каждые ${o.limit.per} моделей${g}`;
  return (o.limit.n === 1 ? '1 модель' : `до ${o.limit.n} моделей`) + g + (o.minModels ? `, если в отряде ${o.minModels}+` : '');
}

/** Есть ли хоть одна замена. */
export const hasPicks = (picks: Picks | undefined) => !!picks && Object.values(picks).some((c) => c.some((n) => n > 0));
