import { ALLY_RULES, BATTLE_SIZES, LIMITS, grantedPointsCap, sizeIndex } from './rules';
import type { CostBand, Datasheet, Detachment, Enhancement, FactionData, Roster, RosterUnit } from './types';

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
  loadoutCustom: boolean;
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

/**
 * Снаряжение юнита. Если игрок не менял вручную — считается по правилам стандартного снаряжения:
 * «все модели», «один (сержант)», «остальные», «N моделей», модели-добавки (+1 Invader ATV).
 */
export function unitLoadout(ds: Datasheet, unit: RosterUnit, models: number): Record<string, number> {
  if (unit.weapons) return { ...unit.weapons };
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
  const ones = ds.defaultLoadout.filter((r) => r.who === 'one' && addonCount(r.subject) === null).length;
  const fixed = ds.defaultLoadout.reduce((s, r) => s + (typeof r.who === 'number' ? r.who : 0), 0);
  for (const r of ds.defaultLoadout) {
    const add = addonCount(r.subject);
    let n: number;
    if (add !== null) n = add;
    else if (r.who === 'all') n = models;
    else if (r.who === 'one') n = models > 0 ? 1 : 0;
    else if (r.who === 'rest') n = Math.max(0, models - ones - fixed);
    else n = Math.min(r.who, models);
    for (const it of r.items) out[it.weapon] = (out[it.weapon] ?? 0) + n * it.qty;
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
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

export function bandFor(ds: Datasheet, copy: number): CostBand | undefined {
  return ds.costs.find((b) => copy >= b.from && (b.to === null || copy <= b.to)) ?? ds.costs[ds.costs.length - 1];
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

export function computeRoster(roster: Roster, L: DataLookup): ComputedRoster {
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
  const copies = new Map<string, number>();
  const units: ComputedUnit[] = roster.units.map((unit) => {
    const ds = L.ds.get(unit.datasheetId);
    const copy = (copies.get(unit.datasheetId) ?? 0) + 1;
    copies.set(unit.datasheetId, copy);
    const band = ds ? bandFor(ds, copy) : undefined;
    const opt = band?.options.find((o) => o.label === unit.size) ?? band?.options[0];
    let extras = 0;
    for (const a of band?.addons ?? []) extras += (unit.addons[a.label] ?? 0) * a.cost;
    for (const w of band?.wargear ?? []) extras += (unit.wargear[w.label] ?? 0) * w.cost;
    const enhancement = unit.enhancementId ? L.enh.get(unit.enhancementId) : undefined;
    const enhancementCost = enhancement?.cost ?? 0;
    const base = opt?.cost ?? 0;
    const loadout = ds ? unitLoadout(ds, unit, opt?.models ?? 0) : {};
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
      loadout,
      loadoutCustom: !!unit.weapons,
      attached: [],
    };
  });
  const byUid = new Map(units.map((c) => [c.unit.uid, c]));
  for (const c of units) {
    if (c.unit.attachedTo) byUid.get(c.unit.attachedTo)?.attached.push(c.unit);
  }
  const points = units.reduce((s, c) => s + c.total, 0);

  // ---------- очки ----------
  if (points > size.points) err('points', `Превышен лимит очков: ${fmt(points)} из ${fmt(size.points)}.`);

  // ---------- детачменты ----------
  const dpOf = (d: Detachment) => (chapter && d.chapterDp[chapter] != null ? d.chapterDp[chapter] : d.dp);
  const dp = detachments.reduce((s, d) => s + dpOf(d), 0);
  if (!detachments.length) err('no-detachment', 'Выберите хотя бы один детачмент.');
  if (dp > size.dp) {
    const singleOk = size.singleOverBudget !== null && detachments.length === 1 && dp <= size.singleOverBudget;
    if (!singleOk) {
      err('dp', `Детачменты стоят ${dp} DP, а в ${size.label} доступно ${size.dp} DP` + (size.singleOverBudget ? ` (или один детачмент за ${size.singleOverBudget} DP).` : '.'));
    }
  }
  const tags = new Map<string, string[]>();
  for (const d of detachments) if (d.tag) tags.set(d.tag, [...(tags.get(d.tag) ?? []), d.name]);
  for (const [tag, names] of tags) if (names.length > 1) err('det-tag', `Детачменты ${names.join(', ')} имеют одинаковый тег ${tag} — их нельзя брать вместе.`);
  if (detChapters.size > 1) err('det-chapter', `Детачменты требуют разных орденов: ${[...detChapters].join(', ')}.`);

  const dispositions = [...new Set(detachments.map((d) => d.forceDisposition).filter((x): x is string => !!x))];
  if (detachments.length) {
    if (!roster.forceDisposition) err('fd-missing', 'Выберите Force Disposition.');
    else if (!dispositions.includes(roster.forceDisposition))
      err('fd', `Force Disposition «${roster.forceDisposition}» не даёт ни один из выбранных детачментов.`);
  }

  // ---------- орден ----------
  if (chapters.length) {
    const allowed = chapter ? new Set([chapter]) : new Set<string>();
    if (unitChapters.size > 1 || (chapter && [...unitChapters].some((c) => !allowed.has(c)))) {
      const bad = units.filter((c) => c.ds && c.ds.group === 'own' && unitChapter(c.ds, chapters) && unitChapter(c.ds, chapters) !== chapter);
      err('chapter', `В армии могут быть юниты только одного ордена${chapter ? ` (${chapter})` : ''}.`, bad.map((c) => c.unit.uid));
    }
  }

  // ---------- доступность юнитов ----------
  const detGrantKw = new Set(detachments.flatMap((d) => d.grants.map((g) => g.toUpperCase())));
  const primary = L.faction.primaryKeyword?.toUpperCase();
  const grantedPoints = new Map<string, number>();
  for (const c of units) {
    const { ds, unit } = c;
    if (!ds) {
      err('missing', `Инфолист ${unit.datasheetId} не найден в данных (возможно, удалён в обновлении).`, [unit.uid]);
      continue;
    }
    if (!ds.costs.length) err('no-cost', `У «${ds.name}» нет стоимости в данных.`, [unit.uid]);
    if (ds.legends) warn('legends', `«${ds.name}» — Warhammer Legends, обычно не допускается на турнирах.`, [unit.uid]);
    if (c.band && !c.band.options.some((o) => o.label === unit.size)) err('size', `«${ds.name}»: выберите размер отряда.`, [unit.uid]);
    if (c.loadoutCustom) {
      const cap = c.models + Object.values(unit.addons).reduce((x, n) => x + n, 0);
      const over = Object.entries(c.loadout).filter(([, n]) => n > cap);
      if (over.length) warn('loadout', `«${ds.name}»: ${over.map(([w, n]) => `${w} ×${n}`).join(', ')} — больше, чем моделей в отряде (${cap}).`, [unit.uid]);
    }

    if (ds.group.startsWith('det:')) {
      const detId = ds.group.slice(4);
      if (!roster.detachmentIds.includes(detId)) {
        const name = L.det.get(detId)?.name ?? 'детачмент';
        err('det-unit', `«${ds.name}» можно взять только с детачментом ${name}.`, [unit.uid]);
      }
      grantedPoints.set('det', (grantedPoints.get('det') ?? 0) + c.total);
    } else if (ds.group === 'own' && primary && !ds.factionKeywords.some((k) => k.toUpperCase() === primary)) {
      const ok = ds.factionKeywords.some((k) => detGrantKw.has(k.toUpperCase()));
      if (!ok) warn('faction-kw', `У «${ds.name}» нет ключевого слова ${L.faction.primaryKeyword} — нужен детачмент, который разрешает такие юниты.`, [unit.uid]);
      else grantedPoints.set('det', (grantedPoints.get('det') ?? 0) + c.total);
    }
  }
  const granted = grantedPoints.get('det') ?? 0;
  if (granted) {
    const cap = grantedPointsCap(roster.factionId, roster.battleSize, detachments.map((d) => d.name));
    if (granted > cap) warn('granted-cap', `Юниты, разрешённые детачментом, стоят ${fmt(granted)} очков — обычно лимит ${fmt(cap)}. Проверьте текст детачмента.`);
  }

  // ---------- лимиты копий ----------
  for (const [id, n] of copies) {
    const ds = L.ds.get(id);
    if (!ds) continue;
    const bl = units.find((c) => c.unit.datasheetId === id)?.isBattleline ?? false;
    const limit = copyLimit(ds, roster.battleSize, bl);
    if (n > limit) {
      const uids = units.filter((c) => c.unit.datasheetId === id).map((c) => c.unit.uid);
      err('copies', `«${ds.name}»: ${n} шт., максимум ${limit}${ds.epicHero ? ' (Epic Hero)' : ''}.`, uids);
    }
  }

  // ---------- улучшения ----------
  const enhUse = new Map<string, ComputedUnit[]>();
  for (const c of units) {
    if (!c.enhancement) continue;
    enhUse.set(c.enhancement.id, [...(enhUse.get(c.enhancement.id) ?? []), c]);
    const e = c.enhancement;
    const name = c.ds?.name ?? '?';
    if (!roster.detachmentIds.includes(e.detachment)) err('enh-det', `Улучшение «${e.name}» из невыбранного детачмента.`, [c.unit.uid]);
    if (c.ds?.epicHero) err('enh-epic', `«${name}» — Epic Hero и не может получить улучшение.`, [c.unit.uid]);
    if (c.ds?.group.startsWith('ally:')) err('enh-ally', `Союзный юнит «${name}» не может получить улучшение.`, [c.unit.uid]);
    if (c.ds && c.ds.enhancements.length && !c.ds.enhancements.includes(e.id)) err('enh-elig', `«${name}» не может взять «${e.name}».`, [c.unit.uid]);
    if (e.upgrade && c.ds?.character) err('upg-char', `Upgrade «${e.name}» нельзя дать персонажу (${name}).`, [c.unit.uid]);
  }
  for (const [, list] of enhUse) {
    const e = list[0].enhancement!;
    if (e.upgrade) {
      if (list.length > LIMITS.upgradeTargets) err('upg-count', `Upgrade «${e.name}»: ${list.length} юнитов, максимум ${LIMITS.upgradeTargets}.`, list.map((c) => c.unit.uid));
    } else if (list.length > 1) err('enh-dup', `Улучшение «${e.name}» взято ${list.length} раза — можно только один.`, list.map((c) => c.unit.uid));
  }
  const enhancementsUsed = enhUse.size;
  if (enhancementsUsed > size.enhancements) err('enh-cap', `Улучшений: ${enhancementsUsed}, максимум ${size.enhancements} для ${size.label}.`);

  // ---------- Warlord ----------
  const wl = roster.warlordUid ? byUid.get(roster.warlordUid) : undefined;
  if (!wl) {
    if (units.some((c) => c.ds?.character)) err('warlord', 'Назначьте Warlord.');
    else if (units.length) err('warlord', 'В армии нет персонажа, которого можно назначить Warlord.');
  } else {
    if (!wl.ds?.character) err('warlord-char', 'Warlord должен быть персонажем (CHARACTER).', [wl.unit.uid]);
    if (wl.ds?.group.startsWith('ally:')) err('warlord-ally', 'Союзный юнит не может быть Warlord.', [wl.unit.uid]);
  }

  // ---------- Leader / Support ----------
  for (const c of units) {
    const { ds, unit } = c;
    if (!ds) continue;
    if (unit.attachedTo) {
      const bg = byUid.get(unit.attachedTo);
      if (!bg || !bg.ds) err('attach-missing', `«${ds.name}» присоединён к удалённому юниту.`, [unit.uid]);
      else {
        if (!ds.leads.includes(bg.ds.id)) err('attach-pair', `«${ds.name}» не может присоединиться к «${bg.ds.name}».`, [unit.uid, bg.unit.uid]);
        if (bg.unit.attachedTo) err('attach-chain', `«${bg.ds.name}» сам присоединён к другому юниту.`, [unit.uid]);
      }
    } else if (ds.support) {
      err('support', `«${ds.name}» — SUPPORT: он обязан быть присоединён к телохранителям.`, [unit.uid]);
    }
    if (c.attached.length) {
      const leaders = c.attached.map((u) => byUid.get(u.uid)!).filter((x) => x.ds && !x.ds.support);
      const supports = c.attached.map((u) => byUid.get(u.uid)!).filter((x) => x.ds?.support);
      const uids = [unit.uid, ...c.attached.map((u) => u.uid)];
      if (supports.length > 1) err('attach-support', `К «${ds.name}» присоединено ${supports.length} SUPPORT — можно один.`, uids);
      if (leaders.length > 1) {
        const exc = leaders.filter((x) => x.ds?.leaderExtra).length;
        if (leaders.length - exc > 1 || leaders.length > 2)
          err('attach-leader', `К «${ds.name}» присоединено ${leaders.length} LEADER — можно один.`, uids);
        else warn('attach-extra', `К «${ds.name}» присоединены два LEADER по исключению из инфолиста — проверьте условие.`, uids);
      }
    }
  }

  // ---------- союзники ----------
  const si = sizeIndex(roster.battleSize);
  const allyUnits = (key: string) => units.filter((c) => c.ds?.group === `ally:${key}`);
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
      if (list.length > lim) err('agents', `Assigned Agents: ${label}-юнитов ${list.length}, максимум ${lim} для ${size.label}.`, list.map((c) => c.unit.uid));
    }
    const tr = agents.filter((c) => c.ds?.dedicatedTransport);
    if (tr.length) warn('agents-transport', 'Транспорт Agents of the Imperium должен начинать бой с пассажирами, иначе считается уничтоженным.', tr.map((c) => c.unit.uid));
  }
  for (const key of ['freeblades', 'dreadblades']) {
    const list = allyUnits(key);
    if (!list.length) continue;
    const big = list.filter((c) => c.ds?.titanic).length;
    const small = list.length - big;
    if ((big && small) || big > ALLY_RULES.knights.titanic || small > ALLY_RULES.knights.small) {
      err(key, `${key === 'freeblades' ? 'Freeblades' : 'Dreadblades'}: можно 1 TITANIC рыцаря или до ${ALLY_RULES.knights.small} малых, не вместе.`, list.map((c) => c.unit.uid));
    }
  }
  const titans = allyUnits('titanicus');
  if (titans.length > ALLY_RULES.titanicus) err('titanicus', `Titanic Support: можно только ${ALLY_RULES.titanicus} модель ADEPTUS TITANICUS.`, titans.map((c) => c.unit.uid));
  const daemons = allyUnits('daemons');
  if (daemons.length) {
    const pts = daemons.reduce((s, c) => s + c.total, 0);
    const cap = ALLY_RULES.daemonsPoints[si];
    if (pts > cap) err('daemons-pts', `Daemonic Pact: демоны стоят ${fmt(pts)} очков, максимум ${fmt(cap)} для ${size.label}.`, daemons.map((c) => c.unit.uid));
    for (const god of ALLY_RULES.daemonGods) {
      const list = daemons.filter((c) => hasKw(c, god));
      const bl = list.filter((c) => c.isBattleline).length;
      if (list.length - bl > bl) err('daemons-ratio', `Daemonic Pact: не-BATTLELINE юнитов ${god} (${list.length - bl}) больше, чем BATTLELINE (${bl}).`, list.map((c) => c.unit.uid));
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
export function availableDetachments(L: DataLookup, chapter: string | null): Detachment[] {
  return L.faction.detachments.filter((d) => !d.chapter || !chapter || d.chapter === chapter);
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
