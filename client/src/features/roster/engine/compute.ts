import { tr, withLang, type EngineLang } from './lang';
import { ALLY_RULES, BATTLE_SIZES, LIMITS, sizeIndex } from './rules';
import type { CostBand, Datasheet, Detachment, DetachmentGrant, Enhancement, FactionData, Roster, RosterUnit, UnitMatcher } from './types';
import { droppedSummary } from './migrate';
import { dispositionsOf } from './source';
import { applyPicks, hasPicks, modelGroups, optionalRule, optionsOf, ruleCount, type LoadoutResult } from './wargear';

export type IssueLevel = 'error' | 'warning';
export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  unitUids?: string[];
}

export interface ComputedUnit {
  unit: RosterUnit;
  ds: Datasheet | undefined;
  /** порядковый номер копии этого инфолиста в ростере (1, 2, 3…) */
  copy: number;
  band: CostBand | undefined;
  base: number;
  extras: number;
  enhancement: Enhancement | undefined;
  enhancementCost: number;
  total: number;
  models: number;
  isBattleline: boolean;
  /** снаряжение: оружие → число моделей с ним */
  loadout: Record<string, number>;
  /** выбраны замены (снаряжение отличается от стандартного) */
  loadoutCustom: boolean;
  /** лимиты и максимумы вариантов снаряжения, найденные нарушения */
  loadoutInfo: LoadoutResult;
  /** платное снаряжение, посчитанное по выбранным заменам: название → штук */
  paidAuto: Record<string, number>;
  /** правило детачмента, по которому юнит попал в армию */
  grant: { detachment: Detachment; grant: DetachmentGrant } | null;
  /** присоединённые к этому юниту персонажи */
  attached: RosterUnit[];
}

export interface ComputedRoster {
  units: ComputedUnit[];
  byUid: Map<string, ComputedUnit>;
  points: number;
  pointsLimit: number;
  dp: number;
  dpLimit: number;
  enhancementsUsed: number;
  enhancementsLimit: number;
  detachments: Detachment[];
  dispositions: string[];
  chapter: string | null;
  issues: Issue[];
  errors: number;
  warnings: number;
}

export interface DataLookup {
  faction: FactionData;
  ds: Map<string, Datasheet>;
  det: Map<string, Detachment>;
  enh: Map<string, Enhancement>;
}

export function makeLookup(faction: FactionData): DataLookup {
  return {
    faction,
    ds: new Map(faction.datasheets.map((d) => [d.id, d])),
    det: new Map(faction.detachments.map((d) => [d.id, d])),
    enh: new Map(faction.enhancements.map((e) => [e.id, e])),
  };
}

/** Подходит ли инфолист под описание (названия / наборы ключевых слов / исключения). */
export function matchesUnit(ds: Datasheet, m: UnitMatcher, fuzzy = false): boolean {
  const kws = new Set([...ds.keywords, ...ds.factionKeywords].map((k) => k.toUpperCase()));
  const name = ds.name.toUpperCase();
  if (m.exclude.some((x) => kws.has(x) || kws.has(x + 'S') || name === x || name === x + 'S')) return false;
  if (m.names.includes(name) || m.keywords.some((set) => set.every((k) => kws.has(k)))) return true;
  if (!fuzzy) return false;
  // «Daemon Prince with Wings» ↔ «Daemon Prince of Chaos with Wings»: слова по порядку
  const words = name.split(/\s+/);
  const subseq = (n: string) => {
    let i = 0;
    for (const w of words) if (w === n.split(/\s+/)[i]) i++;
    return i === n.split(/\s+/).length;
  };
  return [...m.names, ...m.keywords.map((k) => k.join(' '))].some(subseq);
}

/**
 * Стандартное снаряжение юнита по инфолисту: «все модели», «один (сержант)», «остальные», «N моделей»,
 * строки для типов моделей («Every Nob» — только Nob), модели-добавки (+1 Invader ATV).
 */
export function defaultLoadout(ds: Datasheet, unit: Pick<RosterUnit, 'addons'>, models: number): Record<string, number> {
  const out: Record<string, number> = {};
  const addonLabels = [...new Set(ds.costs.flatMap((b) => b.addons.map((a) => a.label)))];
  const addonCount = (subject: string) => {
    const s = subject.toLowerCase();
    for (const label of addonLabels) {
      const name = label.replace(/^\d+\s*/, '').toLowerCase();
      if (name && s.includes(name)) return unit.addons[label] ?? 0;
    }
    return null;
  };
  const groups = modelGroups(ds, models);
  for (const r of ds.defaultLoadout) {
    const n = ruleCount(r, ds.defaultLoadout, groups, models, addonCount);
    for (const it of r.items) out[it.weapon] = (out[it.weapon] ?? 0) + n * it.qty;
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

/** Снаряжение с выбранными заменами, лимиты и нарушения. */
export function unitLoadoutFull(ds: Datasheet, unit: RosterUnit, models: number): LoadoutResult {
  return applyPicks(ds, defaultLoadout(ds, unit, models), unit.picks ?? undefined, models);
}

/** Снаряжение юнита (оружие → число моделей с ним). */
export function unitLoadout(ds: Datasheet, unit: RosterUnit, models: number): Record<string, number> {
  return unitLoadoutFull(ds, unit, models).loadout;
}

const wkey = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/e?s$/, '');

/**
 * Сколько штук платного предмета (band.wargear) оплачивается — как в конструкторе ростеров wh-rules.ru: платится каждая
 * штука итогового снаряжения (стандартное − снятое заменами + выбранное); стандартные штуки — только если у инфолиста
 * paidDefaults (лазпушка Leman Russ, missile pod Crisis Fireknife), иначе платят только сверх стандартного (третья
 * multi-melta Gladiator Valiant BT). null — снаряжение предмета не видит (paidIsAuto): ручной счётчик.
 */
export function paidFromLoadout(ds: Datasheet, unit: RosterUnit, loadout: Record<string, number>, label: string, models: number): number | null {
  if (!paidIsAuto(ds, label)) return null;
  const k = wkey(label);
  const count = (lo: Record<string, number>) => Object.entries(lo).reduce((s, [w, q]) => s + (wkey(w) === k ? q : 0), 0);
  const free = ds.paidDefaults ? 0 : count(defaultLoadout(ds, unit, models));
  return Math.max(0, count(loadout) - free);
}

/** Виден ли платный предмет снаряжению: есть в разобранных вариантах или в стандартном снаряжении обязательной модели. */
export function paidIsAuto(ds: Datasheet, label: string): boolean {
  const k = wkey(label);
  if (optionsOf(ds).parsed.some((o) => [...o.from, ...o.choices.flat()].some((it) => wkey(it.weapon) === k))) return true;
  // в стандартном снаряжении — у обязательной модели (у необязательной, «0-1 Chapter Ancient», — ручной счётчик)
  return ds.defaultLoadout.some((r) => !optionalRule(ds, r) && r.items.some((it) => wkey(it.weapon) === k));
}

/**
 * Ручной счётчик платного предмета необязательной модели («0-1 Chapter Ancient» — Banner of Macragge): у кого он
 * и сколько штук возможно. null — предмет не из стандартного снаряжения необязательной модели.
 */
export function optionalWargear(ds: Datasheet, label: string): { subject: string; max: number } | null {
  const k = wkey(label);
  const groups = modelGroups(ds, 0);
  for (const r of ds.defaultLoadout) {
    const it = r.items.find((x) => wkey(x.weapon) === k);
    if (!it || !optionalRule(ds, r)) continue;
    const g = groups.find((x) => x.name.toLowerCase() === r.subject.toLowerCase().replace(/^(?:the|every|each)\s+/, '').replace(/\s+models?$/, '')) ?? null;
    return { subject: r.subject, max: (g?.max ?? 1) * it.qty };
  }
  return null;
}

/** Платное снаряжение юнита: по итоговому снаряжению или ручному счётчику. */
export function paidWargear(c: Pick<ComputedUnit, 'band' | 'paidAuto' | 'unit'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of c.band?.wargear ?? []) {
    const n = c.paidAuto[w.label] ?? c.unit.wargear[w.label] ?? 0;
    if (n > 0) out[w.label] = n;
  }
  return out;
}

/** Сколько копий инфолиста можно взять. */
export function copyLimit(ds: Datasheet, battleSize: Roster['battleSize'], battleline: boolean): number {
  if (ds.epicHero) return LIMITS.epicHero;
  const base = BATTLE_SIZES[battleSize].unitLimit;
  if (battleline) return base * LIMITS.battlelineMultiplier;
  if (ds.dedicatedTransport) return base * LIMITS.dedicatedTransportMultiplier;
  return base;
}

/**
 * Ключ лимита копий — название инфолиста. У одного названия бывает несколько инфолистов
 * (обычный Space Marines и версия Black Templars, Space Wolves): лимит «не больше N копий» общий.
 */
export const copyKey = (ds: Pick<Datasheet, 'name'>) => ds.name.trim().toUpperCase();

/** Таблица цен инфолиста для ордена армии: своя таблица ордена, если она известна, иначе обычная. */
export function costsFor(ds: Datasheet, chapter: string | null = null): CostBand[] {
  const v = chapter ? ds.costVariants?.find((x) => x.chapter === chapter) : undefined;
  return v?.costs ?? ds.costs;
}

export function bandFor(ds: Datasheet, copy: number, chapter: string | null = null): CostBand | undefined {
  const costs = costsFor(ds, chapter);
  return costs.find((b) => copy >= b.from && (b.to === null || copy <= b.to)) ?? costs[costs.length - 1];
}

/** Ключевые слова/названия, которым выбранные детачменты дают BATTLELINE. */
export function battlelineGrants(dets: Detachment[]): Set<string> {
  return new Set(dets.flatMap((d) => d.battleline.map((s) => s.toUpperCase())));
}

export function isBattleline(ds: Datasheet, grants: Set<string>): boolean {
  if (ds.battleline) return true;
  if (!grants.size) return false;
  const name = ds.name.toUpperCase();
  if (grants.has(name)) return true;
  // «WINDRIDERS units» ↔ инфолист «Windriders»; «ARMIGER models» ↔ ключевое слово ARMIGER
  return ds.keywords.some((k) => grants.has(k.toUpperCase())) || [...grants].some((g) => g.endsWith('S') && name === g.slice(0, -1));
}

export function unitChapter(ds: Datasheet, chapters: string[]): string | null {
  return ds.factionKeywords.find((k) => chapters.includes(k)) ?? null;
}

const fmt = (n: number) => n.toLocaleString('ru-RU');

/** Итоги ростера; lang — язык сообщений проверки (переключатель RU/EN 40K). */
export function computeRoster(roster: Roster, L: DataLookup, lang: EngineLang = 'ru'): ComputedRoster {
  return withLang(lang, () => computeRosterIn(roster, L));
}

function computeRosterIn(roster: Roster, L: DataLookup): ComputedRoster {
  const size = BATTLE_SIZES[roster.battleSize];
  const issues: Issue[] = [];
  const err = (code: string, message: string, unitUids?: string[]) => issues.push({ level: 'error', code, message, unitUids });
  const warn = (code: string, message: string, unitUids?: string[]) => issues.push({ level: 'warning', code, message, unitUids });

  const detachments = roster.detachmentIds.map((id) => L.det.get(id)).filter((d): d is Detachment => !!d);
  const blGrants = battlelineGrants(detachments);

  // ---------- орден (Space Marines) ----------
  const chapters = L.faction.chapters;
  const unitChapters = new Set<string>();
  for (const u of roster.units) {
    const ds = L.ds.get(u.datasheetId);
    const ch = ds && ds.group === 'own' ? unitChapter(ds, chapters) : null;
    if (ch) unitChapters.add(ch);
  }
  const detChapters = new Set(detachments.map((d) => d.chapter).filter((c): c is string => !!c));
  const chapter = roster.chapter ?? [...detChapters][0] ?? [...unitChapters][0] ?? null;

  // ---------- юниты и стоимость ----------
  // копии считаются по названию (copyKey): одноимённые инфолисты разных версий делят лимит и ступени цены
  const copies = new Map<string, number>();
  const units: ComputedUnit[] = roster.units.map((unit) => {
    const ds = L.ds.get(unit.datasheetId);
    const key = ds ? copyKey(ds) : unit.datasheetId;
    const copy = (copies.get(key) ?? 0) + 1;
    copies.set(key, copy);
    const band = ds ? bandFor(ds, copy, chapter) : undefined;
    const opt = band?.options.find((o) => o.label === unit.size) ?? band?.options[0];
    let extras = 0;
    for (const a of band?.addons ?? []) extras += (unit.addons[a.label] ?? 0) * a.cost;
    const loadoutInfo: LoadoutResult = ds ? unitLoadoutFull(ds, unit, opt?.models ?? 0) : { loadout: {}, problems: [], max: {}, limits: {} };
    // платное снаряжение: по итоговому снаряжению (paidFromLoadout), иначе — по ручному счётчику
    const paidAuto: Record<string, number> = {};
    for (const w of band?.wargear ?? []) {
      const auto = ds ? paidFromLoadout(ds, unit, loadoutInfo.loadout, w.label, opt?.models ?? 0) : null;
      if (auto !== null) paidAuto[w.label] = auto;
      extras += (auto ?? unit.wargear[w.label] ?? 0) * w.cost;
    }
    const enhancement = unit.enhancementId ? L.enh.get(unit.enhancementId) : undefined;
    const enhancementCost = enhancement?.cost ?? 0;
    const base = opt?.cost ?? 0;
    return {
      unit,
      ds,
      copy,
      band,
      base,
      extras,
      enhancement,
      enhancementCost,
      total: base + extras + enhancementCost,
      models: opt?.models ?? 0,
      isBattleline: ds ? isBattleline(ds, blGrants) : false,
      loadout: loadoutInfo.loadout,
      loadoutCustom: hasPicks(unit.picks ?? undefined),
      loadoutInfo,
      paidAuto,
      grant: null,
      attached: [],
    };
  });
  const byUid = new Map(units.map((c) => [c.unit.uid, c]));
  for (const c of units) {
    if (c.unit.attachedTo) byUid.get(c.unit.attachedTo)?.attached.push(c.unit);
  }
  const points = units.reduce((s, c) => s + c.total, 0);

  // ---------- очки ----------
  if (points > size.points) err('points', tr(`Превышен лимит очков: ${fmt(points)} из ${fmt(size.points)}.`, `Points limit exceeded: ${fmt(points)} of ${fmt(size.points)}.`));

  // ---------- детачменты ----------
  const dpOf = (d: Detachment) => (chapter && d.chapterDp[chapter] != null ? d.chapterDp[chapter] : d.dp);
  const dp = detachments.reduce((s, d) => s + dpOf(d), 0);
  if (!detachments.length) err('no-detachment', tr('Выберите хотя бы один детачмент.', 'Choose at least one Detachment.'));
  if (dp > size.dp) {
    const singleOk = size.singleOverBudget !== null && detachments.length === 1 && dp <= size.singleOverBudget;
    if (!singleOk) {
      err('dp', tr(`Детачменты стоят ${dp} DP, а в ${size.label} доступно ${size.dp} DP` + (size.singleOverBudget ? ` (или один детачмент за ${size.singleOverBudget} DP).` : '.'), `Detachments cost ${dp} DP, but ${size.label} allows ${size.dp} DP` + (size.singleOverBudget ? ` (or one Detachment of up to ${size.singleOverBudget} DP).` : '.')));
    }
  }
  const tags = new Map<string, string[]>();
  for (const d of detachments) if (d.tag) tags.set(d.tag, [...(tags.get(d.tag) ?? []), d.name]);
  for (const [tag, names] of tags) if (names.length > 1) err('det-tag', tr(`Детачменты ${names.join(', ')} имеют одинаковый тег ${tag} — их нельзя брать вместе.`, `Detachments ${names.join(', ')} share the tag ${tag} and cannot be taken together.`));
  if (detChapters.size > 1) err('det-chapter', tr(`Детачменты требуют разных орденов: ${[...detChapters].join(', ')}.`, `Detachments require different Chapters: ${[...detChapters].join(', ')}.`));

  for (const id of roster.detachmentIds)
    if (!L.det.has(id)) err('det-missing', tr(`Детачмент ${id} не найден в данных (возможно, удалён в обновлении) — выберите детачмент заново.`, `Detachment ${id} was not found in the data (possibly removed in an update) — choose it again.`));
  for (const d of detachments)
    if (d.outdated) warn('det-outdated', tr(`Детачмент «${d.name}» устарел: ${d.outdated.replace(/^\*\s*/, '')} Выберите действующий детачмент.`, `Detachment “${d.name}” is outdated (not in the current source). Choose a current Detachment.`));
  for (const n of roster.migrationNotes ?? [])
    warn('migrated-' + n.kind, tr(`${n.kind === 'detachment' ? 'Детачмент' : 'Улучшение'} заменён при обновлении данных: ${n.note}`, `${n.kind === 'detachment' ? 'Detachment' : 'Enhancement'} replaced in a data update.`));
  const dispositions = [...new Set(detachments.flatMap(dispositionsOf))];
  if (detachments.length) {
    if (!roster.forceDisposition) err('fd-missing', tr('Выберите Force Disposition.', 'Choose a Force Disposition.'));
    else if (!dispositions.includes(roster.forceDisposition))
      err('fd', tr(`Force Disposition «${roster.forceDisposition}» не даёт ни один из выбранных детачментов.`, `None of the selected Detachments grants the Force Disposition “${roster.forceDisposition}”.`));
  }

  // ---------- орден ----------
  if (chapters.length) {
    const allowed = chapter ? new Set([chapter]) : new Set<string>();
    if (unitChapters.size > 1 || (chapter && [...unitChapters].some((c) => !allowed.has(c)))) {
      const bad = units.filter((c) => c.ds && c.ds.group === 'own' && unitChapter(c.ds, chapters) && unitChapter(c.ds, chapters) !== chapter);
      err('chapter', tr(`В армии могут быть юниты только одного ордена${chapter ? ` (${chapter})` : ''}.`, `The army can only include units from one Chapter${chapter ? ` (${chapter})` : ''}.`), bad.map((c) => c.unit.uid));
    }
  }

  // ---------- доступность юнитов ----------
  const armyKw = new Set(L.faction.armyKeywords.map((k) => k.toUpperCase()));
  const disabledRules = new Set(detachments.map((d) => d.disablesArmyRule).filter((x): x is string => !!x));
  const findGrant = (ds: Datasheet, only?: string) => {
    for (const d of detachments) {
      if (only && d.id !== only) continue;
      for (const g of d.grants) if (matchesUnit(ds, { ...g, exclude: [] })) return { detachment: d, grant: g };
    }
    return null;
  };
  for (const c of units) {
    const { ds, unit } = c;
    if (!ds) {
      err('missing', tr(`Инфолист ${unit.datasheetId} не найден в данных (возможно, удалён в обновлении).`, `Datasheet ${unit.datasheetId} was not found in the data (possibly removed in an update).`), [unit.uid]);
      continue;
    }
    if (unit.migration) {
      const lost = droppedSummary(unit.migration.dropped);
      warn(
        'migrated',
        unit.migration.reason === 'options' || unit.migration.reason === 'size'
          ? tr(`«${ds.name}»: ${unit.migration.note}` + (lost.length ? ` Отложено — проверьте и выберите заново: ${lost.join(', ')}.` : ''), `“${ds.name}”: the datasheet changed in a data update.` + (lost.length ? ` Set aside — check and choose again: ${lost.join(', ')}.` : ''))
          : tr(`«${ds.name}» (прежде ${unit.migration.from}): ${unit.migration.note}` + (lost.length ? ` Не перенесено — выберите заново: ${lost.join(', ')}.` : ''), `“${ds.name}” (formerly ${unit.migration.from}) was replaced in a data update.` + (lost.length ? ` Not carried over — choose again: ${lost.join(', ')}.` : '')),
        [unit.uid],
      );
    }
    if (!ds.costs.length) err('no-cost', tr(`У «${ds.name}» нет стоимости в данных.`, `“${ds.name}” has no points cost in the data.`), [unit.uid]);
    if (ds.legends) warn('legends', tr(`«${ds.name}» — Warhammer Legends, обычно не допускается на турнирах.`, `“${ds.name}” is Warhammer Legends and is usually not allowed at tournaments.`), [unit.uid]);
    if (c.band && !c.band.options.some((o) => o.label === unit.size)) err('size', tr(`«${ds.name}»: выберите размер отряда.`, `“${ds.name}”: choose the unit size.`), [unit.uid]);
    for (const p of c.loadoutInfo.problems) err('loadout', tr(`«${ds.name}»: ${p}.`, `“${ds.name}”: ${p}.`), [unit.uid]);
    // ручной счётчик, сохранённый до автоматического подсчёта: теперь в цене количество из снаряжения
    for (const [label, n] of Object.entries(c.paidAuto))
      if ((unit.wargear[label] ?? 0) > 0 && unit.wargear[label] !== n)
        warn('wargear-auto', tr(`«${ds.name}»: ${label} теперь считается по снаряжению (${n} шт.), а не по ручному счётчику (${unit.wargear[label]} шт.) — проверьте замены в «Снаряжении».`, `“${ds.name}”: ${label} is now counted from the wargear (${n}), not the manual counter (${unit.wargear[label]}) — check the swaps in Wargear.`), [unit.uid]);
    if (unit.weapons && !unit.picks) warn('loadout-legacy', tr(`«${ds.name}»: снаряжение было задано вручную в старой версии — оно не проверено. Откройте «Снаряжение» и нажмите «Вернуть стандартное», затем выберите замены заново.`, `“${ds.name}”: the wargear was set manually in an old version and is not validated. Open Wargear, tap “Reset to default” and choose the swaps again.`), [unit.uid]);

    if (ds.group.startsWith('det:')) {
      const detId = ds.group.slice(4);
      if (!roster.detachmentIds.includes(detId)) {
        err('det-unit', tr(`«${ds.name}» можно взять только с детачментом ${L.det.get(detId)?.name ?? '?'}.`, `“${ds.name}” can only be taken with the ${L.det.get(detId)?.name ?? '?'} Detachment.`), [unit.uid]);
      } else c.grant = findGrant(ds, detId) ?? findGrant(ds);
    } else if (ds.group.startsWith('ally:')) {
      c.grant = findGrant(ds);
      const ally = L.faction.allies.find((a) => 'ally:' + a.key === ds.group);
      if (!c.grant && ally && disabledRules.has(ally.name)) err('ally-disabled', tr(`С выбранным детачментом нельзя использовать правило ${ally.name} («${ds.name}»).`, `The ${ally.name} rule cannot be used with the selected Detachment (“${ds.name}”).`), [unit.uid]);
    } else if (armyKw.size && !ds.factionKeywords.some((k) => armyKw.has(k.toUpperCase()))) {
      c.grant = findGrant(ds);
      if (!c.grant) warn('faction-kw', tr(`У «${ds.name}» нет ключевого слова ${L.faction.armyKeywords.join(' / ')} — нужен детачмент, который разрешает такие юниты.`, `“${ds.name}” does not have the ${L.faction.armyKeywords.join(' / ')} keyword — a Detachment that allows such units is required.`), [unit.uid]);
    }
    if (c.grant && c.grant.grant.exclude.length && !matchesUnit(ds, c.grant.grant)) {
      err('grant-excluded', tr(`«${ds.name}» нельзя взять по правилу детачмента ${c.grant.detachment.name}.`, `“${ds.name}” cannot be taken through the ${c.grant.detachment.name} Detachment rule.`), [unit.uid]);
    }
  }
  // лимиты очков и прочие условия правил детачментов
  const si0 = sizeIndex(roster.battleSize);
  for (const d of detachments) {
    for (const g of d.grants) {
      const list = units.filter((c) => c.grant?.grant === g);
      if (g.caps && list.length) {
        const pts = list.reduce((x, c) => x + c.total, 0);
        if (pts > g.caps[si0]) err('grant-cap', tr(`${d.name}: разрешённые детачментом юниты стоят ${fmt(pts)} очков, максимум ${fmt(g.caps[si0])}.`, `${d.name}: units allowed by the Detachment cost ${fmt(pts)} points, maximum ${fmt(g.caps[si0])}.`), list.map((c) => c.unit.uid));
      }
    }
    if (d.forbid) {
      const bad = units.filter((c) => c.ds && !c.grant && matchesUnit(c.ds, d.forbid!, true));
      if (bad.length) err('det-forbid', tr(`${d.name}: эти юниты нельзя брать с детачментом — ${bad.map((c) => c.ds!.name).join(', ')}.`, `${d.name}: these units cannot be taken with the Detachment — ${bad.map((c) => c.ds!.name).join(', ')}.`), bad.map((c) => c.unit.uid));
    }
    for (const rq of d.requires) {
      const list = units.filter((c) => c.ds && matchesUnit(c.ds, rq.matcher));
      const what = [...rq.matcher.names, ...rq.matcher.keywords.map((k) => k.join(' '))].join(' / ');
      if (list.length < rq.min) err('det-requires', tr(`${d.name}: нужно не меньше ${rq.min} — ${what} (сейчас ${list.length}).`, `${d.name}: at least ${rq.min} required — ${what} (currently ${list.length}).`));
      if (rq.warlord && roster.warlordUid && !list.some((c) => c.unit.uid === roster.warlordUid)) err('det-warlord', tr(`${d.name}: Warlord должен быть одним из: ${what}.`, `${d.name}: the Warlord must be one of: ${what}.`));
    }
  }

  // ---------- лимиты копий ----------
  for (const [key, n] of copies) {
    const same = units.filter((c) => c.ds && copyKey(c.ds) === key);
    const ds = same[0]?.ds;
    if (!ds) continue;
    const bl = same.some((c) => c.isBattleline);
    // самый строгий лимит среди версий (Epic Hero у одной из них — 1 на все)
    let limit = Math.min(...same.map((c) => copyLimit(c.ds!, roster.battleSize, bl)));
    for (const d of detachments) if (d.limitOverride?.names.includes(ds.name.toUpperCase())) limit = Math.max(limit, d.limitOverride.max);
    if (n > limit) {
      const uids = same.map((c) => c.unit.uid);
      err('copies', tr(`«${ds.name}»: ${n} шт., максимум ${limit}${ds.epicHero ? ' (Epic Hero)' : ''}.`, `“${ds.name}”: ${n} taken, maximum ${limit}${ds.epicHero ? ' (Epic Hero)' : ''}.`), uids);
    }
  }

  // ---------- улучшения ----------
  const enhUse = new Map<string, ComputedUnit[]>();
  for (const c of units) {
    if (c.unit.enhancementId && !c.enhancement)
      err('enh-missing', tr(`«${c.ds?.name ?? '?'}»: улучшение ${c.unit.enhancementId} не найдено в данных (возможно, удалено в обновлении) — выберите заново.`, `“${c.ds?.name ?? '?'}”: Enhancement ${c.unit.enhancementId} was not found in the data (possibly removed in an update) — choose it again.`), [c.unit.uid]);
    if (!c.enhancement) continue;
    if (c.enhancement.outdated) warn('enh-outdated', tr(`Улучшение «${c.enhancement.name}» устарело (нет в текущем источнике) — выберите действующее.`, `Enhancement “${c.enhancement.name}” is outdated (not in the current source) — choose a current one.`), [c.unit.uid]);
    enhUse.set(c.enhancement.id, [...(enhUse.get(c.enhancement.id) ?? []), c]);
    const e = c.enhancement;
    const name = c.ds?.name ?? '?';
    if (!roster.detachmentIds.includes(e.detachment)) err('enh-det', tr(`Улучшение «${e.name}» из невыбранного детачмента.`, `Enhancement “${e.name}” is from a Detachment that is not selected.`), [c.unit.uid]);
    if (c.ds?.epicHero) err('enh-epic', tr(`«${name}» — Epic Hero и не может получить улучшение.`, `“${name}” is an Epic Hero and cannot take an Enhancement.`), [c.unit.uid]);
    if (c.ds?.group.startsWith('ally:') && !c.grant) err('enh-ally', tr(`Союзный юнит «${name}» не может получить улучшение.`, `Allied unit “${name}” cannot take an Enhancement.`), [c.unit.uid]);
    if (c.ds && c.ds.enhancements.length && !c.ds.enhancements.includes(e.id)) err('enh-elig', tr(`«${name}» не может взять «${e.name}».`, `“${name}” cannot take “${e.name}”.`), [c.unit.uid]);
    if (e.upgrade && c.ds?.character) err('upg-char', tr(`Upgrade «${e.name}» нельзя дать персонажу (${name}).`, `Upgrade “${e.name}” cannot be given to a Character (${name}).`), [c.unit.uid]);
  }
  for (const [, list] of enhUse) {
    const e = list[0].enhancement!;
    if (e.upgrade) {
      if (list.length > LIMITS.upgradeTargets) err('upg-count', tr(`Upgrade «${e.name}»: ${list.length} юнитов, максимум ${LIMITS.upgradeTargets}.`, `Upgrade “${e.name}”: ${list.length} units, maximum ${LIMITS.upgradeTargets}.`), list.map((c) => c.unit.uid));
    } else if (list.length > 1) err('enh-dup', tr(`Улучшение «${e.name}» взято ${list.length} раза — можно только один.`, `Enhancement “${e.name}” is taken ${list.length} times — only once is allowed.`), list.map((c) => c.unit.uid));
  }
  const enhancementsUsed = enhUse.size;
  if (enhancementsUsed > size.enhancements) err('enh-cap', tr(`Улучшений: ${enhancementsUsed}, максимум ${size.enhancements} для ${size.label}.`, `Enhancements: ${enhancementsUsed}, maximum ${size.enhancements} for ${size.label}.`));

  // ---------- Warlord ----------
  const wl = roster.warlordUid ? byUid.get(roster.warlordUid) : undefined;
  if (!wl) {
    if (units.some((c) => c.ds?.character)) err('warlord', tr('Назначьте Warlord.', 'Choose a Warlord.'));
    else if (units.length) err('warlord', tr('В армии нет персонажа, которого можно назначить Warlord.', 'The army has no Character that can be the Warlord.'));
  } else {
    if (!wl.ds?.character) err('warlord-char', tr('Warlord должен быть персонажем (CHARACTER).', 'The Warlord must be a CHARACTER.'), [wl.unit.uid]);
    if (wl.ds?.group.startsWith('ally:') && !wl.grant) err('warlord-ally', tr('Союзный юнит не может быть Warlord.', 'An allied unit cannot be the Warlord.'), [wl.unit.uid]);
    const kw = new Set([...(wl.ds?.keywords ?? []), ...(wl.ds?.factionKeywords ?? [])].map((k) => k.toUpperCase()));
    if (wl.grant?.grant.noWarlord && kw.has(wl.grant.grant.noWarlord)) err('warlord-grant', tr(`${wl.grant.detachment.name}: модель ${wl.grant.grant.noWarlord} не может быть Warlord.`, `${wl.grant.detachment.name}: a ${wl.grant.grant.noWarlord} model cannot be the Warlord.`), [wl.unit.uid]);
  }
  for (const d of detachments)
    for (const g of d.grants)
      if (g.warlordMust && wl) {
        const kw = new Set([...(wl.ds?.keywords ?? []), ...(wl.ds?.factionKeywords ?? [])].map((k) => k.toUpperCase()));
        // юнит, попавший в армию по этому же правилу, не считается моделью армии (копии Brood Brothers несут ключевое слово GC)
        if (!kw.has(g.warlordMust) || wl.grant?.grant === g) err('warlord-must', tr(`${d.name}: Warlord должен быть моделью ${g.warlordMust}.`, `${d.name}: the Warlord must be a ${g.warlordMust} model.`), [wl.unit.uid]);
      }

  // ---------- Leader / Support ----------
  for (const c of units) {
    const { ds, unit } = c;
    if (!ds) continue;
    if (unit.attachedTo) {
      const bg = byUid.get(unit.attachedTo);
      if (!bg || !bg.ds) err('attach-missing', tr(`«${ds.name}» присоединён к удалённому юниту.`, `“${ds.name}” is attached to a removed unit.`), [unit.uid]);
      else {
        if (!ds.leads.includes(bg.ds.id)) err('attach-pair', tr(`«${ds.name}» не может присоединиться к «${bg.ds.name}».`, `“${ds.name}” cannot be attached to “${bg.ds.name}”.`), [unit.uid, bg.unit.uid]);
        if (bg.unit.attachedTo) err('attach-chain', tr(`«${bg.ds.name}» сам присоединён к другому юниту.`, `“${bg.ds.name}” is itself attached to another unit.`), [unit.uid]);
      }
    } else if (ds.support) {
      err('support', tr(`«${ds.name}» — SUPPORT: он обязан быть присоединён к телохранителям.`, `“${ds.name}” is SUPPORT: it must be attached to a Bodyguard unit.`), [unit.uid]);
    }
    if (c.attached.length) {
      const leaders = c.attached.map((u) => byUid.get(u.uid)!).filter((x) => x.ds && !x.ds.support);
      const supports = c.attached.map((u) => byUid.get(u.uid)!).filter((x) => x.ds?.support);
      const uids = [unit.uid, ...c.attached.map((u) => u.uid)];
      if (supports.length > 1) err('attach-support', tr(`К «${ds.name}» присоединено ${supports.length} SUPPORT — можно один.`, `${supports.length} SUPPORT units are attached to “${ds.name}” — only one is allowed.`), uids);
      if (leaders.length > 1) {
        const exc = leaders.filter((x) => x.ds?.leaderExtra).length;
        if (leaders.length - exc > 1 || leaders.length > 2)
          err('attach-leader', tr(`К «${ds.name}» присоединено ${leaders.length} LEADER — можно один.`, `${leaders.length} LEADER units are attached to “${ds.name}” — only one is allowed.`), uids);
        else warn('attach-extra', tr(`К «${ds.name}» присоединены два LEADER по исключению из инфолиста — проверьте условие.`, `Two LEADER units are attached to “${ds.name}” under a datasheet exception — check the condition.`), uids);
      }
    }
  }

  // ---------- союзники ----------
  const si = sizeIndex(roster.battleSize);
  const allyUnits = (key: string) => units.filter((c) => c.ds?.group === `ally:${key}` && !c.grant);
  const hasKw = (c: ComputedUnit, k: string) => !!c.ds?.keywords.some((x) => x.toUpperCase() === k);
  const agents = allyUnits('agents');
  if (agents.length) {
    const A = ALLY_RULES.agents;
    const groups: [string, string, number][] = [
      ['RETINUE', 'Retinue', A.retinue[si]],
      ['CHARACTER', 'Character', A.character[si]],
      ['REQUISITIONED', 'Requisitioned', A.requisitioned[si]],
    ];
    for (const [kw, label, lim] of groups) {
      const list = agents.filter((c) => hasKw(c, kw));
      if (list.length > lim) err('agents', tr(`Assigned Agents: ${label}-юнитов ${list.length}, максимум ${lim} для ${size.label}.`, `Assigned Agents: ${list.length} ${label} units, maximum ${lim} for ${size.label}.`), list.map((c) => c.unit.uid));
    }
    const transports = agents.filter((c) => c.ds?.dedicatedTransport);
    if (transports.length) warn('agents-transport', tr('Транспорт Agents of the Imperium должен начинать бой с пассажирами, иначе считается уничтоженным.', 'An Agents of the Imperium transport must start the battle with passengers, otherwise it counts as destroyed.'), transports.map((c) => c.unit.uid));
  }
  for (const key of ['freeblades', 'dreadblades']) {
    const list = allyUnits(key);
    if (!list.length) continue;
    const big = list.filter((c) => c.ds?.titanic).length;
    const small = list.length - big;
    if ((big && small) || big > ALLY_RULES.knights.titanic || small > ALLY_RULES.knights.small) {
      err(key, tr(`${key === 'freeblades' ? 'Freeblades' : 'Dreadblades'}: можно 1 TITANIC рыцаря или до ${ALLY_RULES.knights.small} малых, не вместе.`, `${key === 'freeblades' ? 'Freeblades' : 'Dreadblades'}: 1 TITANIC Knight or up to ${ALLY_RULES.knights.small} smaller ones, not both.`), list.map((c) => c.unit.uid));
    }
  }
  const corsairs = allyUnits('corsairs');
  if (corsairs.length) {
    const pts = corsairs.reduce((s, c) => s + c.total, 0);
    const cap = ALLY_RULES.corsairsPoints[si];
    if (pts > cap) err('corsairs-pts', tr(`Corsairs and Travelling Players: ${fmt(pts)} очков, максимум ${fmt(cap)} для ${size.label}.`, `Corsairs and Travelling Players: ${fmt(pts)} points, maximum ${fmt(cap)} for ${size.label}.`), corsairs.map((c) => c.unit.uid));
  }
  const titans = allyUnits('titanicus');
  if (titans.length > ALLY_RULES.titanicus) err('titanicus', tr(`Titanic Support: можно только ${ALLY_RULES.titanicus} модель ADEPTUS TITANICUS.`, `Titanic Support: only ${ALLY_RULES.titanicus} ADEPTUS TITANICUS model is allowed.`), titans.map((c) => c.unit.uid));
  const daemons = allyUnits('daemons');
  if (daemons.length) {
    const pts = daemons.reduce((s, c) => s + c.total, 0);
    const cap = ALLY_RULES.daemonsPoints[si];
    if (pts > cap) err('daemons-pts', tr(`Daemonic Pact: демоны стоят ${fmt(pts)} очков, максимум ${fmt(cap)} для ${size.label}.`, `Daemonic Pact: daemons cost ${fmt(pts)} points, maximum ${fmt(cap)} for ${size.label}.`), daemons.map((c) => c.unit.uid));
    for (const god of ALLY_RULES.daemonGods) {
      const list = daemons.filter((c) => hasKw(c, god));
      const bl = list.filter((c) => c.isBattleline).length;
      if (list.length - bl > bl) err('daemons-ratio', tr(`Daemonic Pact: не-BATTLELINE юнитов ${god} (${list.length - bl}) больше, чем BATTLELINE (${bl}).`, `Daemonic Pact: more non-BATTLELINE ${god} units (${list.length - bl}) than BATTLELINE (${bl}).`), list.map((c) => c.unit.uid));
    }
  }

  return {
    units,
    byUid,
    points,
    pointsLimit: size.points,
    dp,
    dpLimit: size.dp,
    enhancementsUsed,
    enhancementsLimit: size.enhancements,
    detachments,
    dispositions,
    chapter,
    issues,
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warning').length,
  };
}

/** Детачменты, доступные ростеру (учитывая орден Space Marines). */
/** chosen — id устаревших детачментов, которые ростер может выбрать (уже выбранные и запомненные, migrate.legacyIds). */
export function availableDetachments(L: DataLookup, chapter: string | null, chosen: string[] = []): Detachment[] {
  // устаревшие детачменты (нет в текущем источнике) — только если уже выбраны в ростере
  return L.faction.detachments.filter((d) => (!d.chapter || !chapter || d.chapter === chapter) && (!d.outdated || chosen.includes(d.id)));
}

/** Можно ли персонажа `leader` присоединить к юниту `bodyguard`. */
export function canAttach(leader: Datasheet, bodyguard: Datasheet): boolean {
  return leader.leads.includes(bodyguard.id);
}

export function roleGroup(c: { ds?: Datasheet; isBattleline: boolean }): 'characters' | 'battleline' | 'transports' | 'allies' | 'other' {
  const ds = c.ds;
  if (!ds) return 'other';
  if (ds.group.startsWith('ally:')) return 'allies';
  if (ds.character) return 'characters';
  if (c.isBattleline) return 'battleline';
  if (ds.dedicatedTransport) return 'transports';
  return 'other';
}
