import { AOS_RULES, auxiliarySurcharge, nextAuxiliarySurcharge } from './rules';
import type {
  AosEnhancement,
  AosEnhancementTable,
  AosEnhancementType,
  AosFactionData,
  AosFormation,
  AosLore,
  AosOption,
  AosRegiment,
  AosRor,
  AosRoster,
  AosUnit,
  AosWarscroll,
  LoreKind,
} from './types';

/*
 * Движок Age of Sigmar 4. Отдельный от 40K: своя структура армии (полки, вспомогательные юниты, полк славы),
 * свои ограничения. Всё, что можно запретить заранее, отдаётся интерфейсу как «нельзя, потому что …»
 * (функции *Fit), а computeAos перепроверяет готовый ростер целиком — для импорта, смены лимита и т. п.
 */

export type IssueLevel = 'error' | 'warning';
export interface AosIssue {
  level: IssueLevel;
  code: string;
  message: string;
  uids?: string[];
}

/** Результат проверки «можно ли»: ok или причина на русском. */
export type Fit = { ok: true } | { ok: false; reason: string };
const OK: Fit = { ok: true };
const no = (reason: string): Fit => ({ ok: false, reason });

export interface EnhancementRef {
  type: AosEnhancementType;
  table: AosEnhancementTable;
  item: AosEnhancement;
  /** слот армии: одна таблица — одно улучшение; таблица Scourge of Aqshy делит слот с обычной таблицей того же типа */
  slot: string;
}

export interface AosLookup {
  faction: AosFactionData;
  ws: Map<string, AosWarscroll>;
  /** id своих варскроллов фракции */
  own: Set<string>;
  ror: Map<string, AosRor>;
  enh: Map<string, EnhancementRef>;
  lore: Map<string, AosLore>;
  formation: Map<string, AosFormation>;
  /** ключевое слово фракции (для улучшений юнитам полков славы) */
  factionKeyword: string;
}

export function makeAosLookup(faction: AosFactionData): AosLookup {
  const ws = new Map<string, AosWarscroll>();
  for (const w of [...faction.universalManifestations, ...faction.rorUnits, ...faction.warscrolls]) ws.set(w.id, w);
  const enh = new Map<string, EnhancementRef>();
  for (const type of faction.enhancementTypes) {
    const shared = type.tables.some((t) => t.season === 'aqshy');
    for (const table of type.tables) for (const item of table.items) enh.set(item.id, { type, table, item, slot: shared ? 'type:' + type.key : 'table:' + table.id });
  }
  return {
    faction,
    ws,
    own: new Set(faction.warscrolls.map((w) => w.id)),
    ror: new Map(faction.rors.map((r) => [r.id, r])),
    enh,
    lore: new Map(faction.lores.map((l) => [l.id, l])),
    formation: new Map(faction.formations.map((f) => [f.id, f])),
    factionKeyword: faction.name.toUpperCase(),
  };
}

// ---------- обход ростера ----------

export interface Placed {
  unit: AosUnit;
  ws: AosWarscroll | undefined;
  /** полк, в котором стоит юнит; null — вспомогательный */
  regiment: AosRegiment | null;
  /** юнит — лидер своего полка */
  leader: boolean;
}

/** Все юниты армии (без полка славы): лидеры, юниты полков, вспомогательные. */
export function placedUnits(r: AosRoster, L: AosLookup): Placed[] {
  const out: Placed[] = [];
  for (const reg of r.regiments) {
    out.push({ unit: reg.leader, ws: L.ws.get(reg.leader.warscrollId), regiment: reg, leader: true });
    for (const u of reg.units) out.push({ unit: u, ws: L.ws.get(u.warscrollId), regiment: reg, leader: false });
  }
  for (const u of r.auxiliaries) out.push({ unit: u, ws: L.ws.get(u.warscrollId), regiment: null, leader: false });
  return out;
}

export function findUnit(r: AosRoster, uid: string): AosUnit | undefined {
  for (const reg of r.regiments) {
    if (reg.leader.uid === uid) return reg.leader;
    const u = reg.units.find((x) => x.uid === uid);
    if (u) return u;
  }
  return r.auxiliaries.find((x) => x.uid === uid);
}

export const regimentOf = (r: AosRoster, uid: string) => r.regiments.find((g) => g.leader.uid === uid || g.units.some((u) => u.uid === uid)) ?? null;

/** Варскроллы выбранного полка славы с количеством. */
export function rorUnitsOf(r: AosRoster, L: AosLookup): { ws: AosWarscroll; count: number; models: number; points: number | null }[] {
  if (!r.ror) return [];
  const ror = L.ror.get(r.ror.id);
  if (!ror) return [];
  return ror.units
    .filter((u) => !u.optional || r.ror!.picked.includes(u.id))
    .map((u) => ({ ws: L.ws.get(u.id)!, count: u.count, models: u.models, points: u.points }))
    .filter((x) => x.ws);
}

export function rorCost(r: AosRoster, L: AosLookup): number {
  if (!r.ror) return 0;
  const ror = L.ror.get(r.ror.id);
  if (!ror) return 0;
  if (!ror.built) return ror.cost ?? 0;
  return rorUnitsOf(r, L).reduce((s, u) => s + (u.points ?? 0), 0);
}

// ---------- цены ----------

export function unitBaseCost(u: AosUnit, ws: AosWarscroll | undefined): number {
  if (!ws || ws.cost == null) return 0;
  return ws.cost * (u.reinforced && ws.reinforceable ? AOS_RULES.reinforceMultiplier : 1);
}

export function unitEnhancementCost(u: AosUnit, L: AosLookup): number {
  return Object.values(u.enhancements).reduce((s, id) => s + (L.enh.get(id)?.item.points ?? 0), 0);
}

export const unitTotal = (u: AosUnit, L: AosLookup) => unitBaseCost(u, L.ws.get(u.warscrollId)) + unitEnhancementCost(u, L);

export interface AosPoints {
  units: number;
  enhancements: number;
  formation: number;
  lores: number;
  terrain: number;
  ror: number;
  auxiliary: number;
  total: number;
}

export function pointsOf(r: AosRoster, L: AosLookup): AosPoints {
  const placed = placedUnits(r, L);
  const units = placed.reduce((s, p) => s + unitBaseCost(p.unit, p.ws), 0);
  const enhancements = placed.reduce((s, p) => s + unitEnhancementCost(p.unit, L), 0);
  const formation = (r.formationId && L.formation.get(r.formationId)?.points) || 0;
  const lores = (Object.values(r.lores) as (string | null)[]).reduce((s, id) => s + ((id && L.lore.get(id)?.points) || 0), 0);
  const terrain = (r.terrainId && L.ws.get(r.terrainId)?.cost) || 0;
  const ror = rorCost(r, L);
  const auxiliary = auxiliarySurcharge(r.auxiliaries.length);
  return { units, enhancements, formation, lores, terrain, ror, auxiliary, total: units + enhancements + formation + lores + terrain + ror + auxiliary };
}

// ---------- доступность юнита вообще ----------

const listNames = (ids: string[], L: AosLookup) => [...new Set(ids.map((id) => L.ws.get(id)?.name).filter(Boolean))].join(', ');

/** Можно ли вообще взять этот варскролл в армию (без учёта полков). */
export function warscrollFit(ws: AosWarscroll, r: AosRoster, L: AosLookup): Fit {
  if (!L.own.has(ws.id)) return no('Юнит другой фракции — только в составе полка славы.');
  if (ws.kind !== 'unit') return no('Это не юнит.');
  if (ws.season === 'ghyran') return no('Профиль Scourge of Ghyran — сезон закончился.');
  if (ws.aorOnly) return no(`Только в Army of Renown «${ws.aorOnly}».`);
  if (ws.cost == null) return no('Нет очков в Battle Profiles — юнит не допущен в matched play.');
  if (ws.legends && !r.showLegends) return no('Warhammer Legends — включите показ Legends.');
  return OK;
}

/** Ограничения армии в целом: Unique, «нельзя вместе», «1 на каждый», версии Scourge of Aqshy. */
export function armyFit(ws: AosWarscroll, r: AosRoster, L: AosLookup, ignoreUid?: string): Fit {
  const others = placedUnits(r, L).filter((p) => p.unit.uid !== ignoreUid && p.ws);
  const rorWs = rorUnitsOf(r, L).map((x) => x.ws);
  if (ws.unique && others.some((p) => p.ws!.baseName === ws.baseName)) return no(`«${ws.baseName}» — UNIQUE, уже есть в армии.`);
  if (ws.unique && rorWs.some((w) => w.baseName === ws.baseName)) return no(`«${ws.baseName}» — UNIQUE, уже есть в полку славы.`);
  const rorClash = rorWs.find((w) => ws.exclusiveWithIds.includes(w.id) || w.exclusiveWithIds.includes(ws.id));
  if (rorClash) return no(`Нельзя вместе с «${rorClash.name}» из полка славы.`);
  const mix = others.find((p) => p.ws!.baseName === ws.baseName && (p.ws!.season === 'aqshy') !== (ws.season === 'aqshy'));
  if (mix) return no(`В армии уже «${mix.ws!.name}» — все копии юнита должны быть одной версии (обычной или Scourge of Aqshy).`);
  const clash = others.find((p) => ws.exclusiveWithIds.includes(p.ws!.id) || p.ws!.exclusiveWithIds.includes(ws.id));
  if (clash) return no(`Нельзя вместе с «${clash.ws!.name}».`);
  if (r.ror && ws.exclusiveWithRorIds.includes(r.ror.id)) return no(`Нельзя вместе с полком славы «${L.ror.get(r.ror.id)?.name}».`);
  if (ws.unique) {
    const lone = others.find((p) => p.ws!.noOtherUnique) ?? (rorWs.find((w) => w.noOtherUnique) ? { ws: rorWs.find((w) => w.noOtherUnique) } : null);
    if (lone) return no(`С «${lone.ws!.name}» нельзя брать другие UNIQUE юниты.`);
  }
  if (ws.noOtherUnique) {
    const u = others.find((p) => p.ws!.unique) ?? (rorWs.find((w) => w.unique) ? { ws: rorWs.find((w) => w.unique) } : null);
    if (u) return no(`«${ws.name}» нельзя брать вместе с другими UNIQUE юнитами (уже есть «${u.ws!.name}»).`);
  }
  if (ws.perUnitOf) {
    const base = others.filter((p) => ws.perUnitOf!.ids.includes(p.ws!.id)).length;
    const have = others.filter((p) => p.ws!.baseName === ws.baseName).length;
    if (have + 1 > base * ws.perUnitOf.per) return no(`Можно ${ws.perUnitOf.per} на каждый «${ws.perUnitOf.label}» в армии (сейчас их ${base}).`);
  }
  return OK;
}

/** Хватит ли очков на добавку. */
export function pointsFit(add: number, r: AosRoster, L: AosLookup): Fit {
  const total = pointsOf(r, L).total;
  if (add > 0 && total + add > r.pointsLimit) return no(`Не хватает очков: ${total} + ${add} > ${r.pointsLimit}.`);
  return OK;
}

/** Цена нового юнита: половина лимита и общий лимит. */
function costFit(ws: AosWarscroll, r: AosRoster, L: AosLookup, extra = 0): Fit {
  const share = shareFit(ws.cost ?? 0, r);
  if (!share.ok) return share;
  return pointsFit((ws.cost ?? 0) + extra, r, L);
}

/** Половина лимита на один юнит. */
export function shareFit(unitCost: number, r: AosRoster): Fit {
  const max = r.pointsLimit * AOS_RULES.maxShareOfOneUnit;
  if (unitCost > max) return no(`На один юнит — не больше половины лимита (${max} очков), а этот стоит ${unitCost}.`);
  return OK;
}

// ---------- полки ----------

export const regimentCap = (reg: AosRegiment, r: AosRoster) => (r.generalUid === reg.leader.uid ? AOS_RULES.generalRegimentSize : AOS_RULES.regimentSize);

/** Сколько мест полка занято (юниты с пометкой «не занимает место» не считаются). */
export function slotsUsed(reg: AosRegiment, L: AosLookup, ignoreUid?: string) {
  return reg.units.filter((u) => u.uid !== ignoreUid && !L.ws.get(u.warscrollId)?.freeSlot).length;
}

const optMax = (o: AosOption) => (o.q === 'any' ? Infinity : o.q === 'max1' ? 1 : Number(o.q.slice(3)) || 1);

/** Слоты, в которые может встать юнит полка: варианты лидера + «присоединяется к полку X». */
function slotCandidates(ws: AosWarscroll, leader: AosWarscroll): number[] {
  const c: number[] = [];
  leader.options.forEach((o, i) => o.ids.includes(ws.id) && c.push(i));
  // «может присоединиться к полку X» / «только в полку X», но в вариантах X юнита нет — особое разрешение
  if (!c.length && (ws.joinLeaderIds.includes(leader.id) || ws.onlyInIds.includes(leader.id))) c.push(-1);
  return c;
}

export interface RegimentMatch {
  /** все юниты распределены по вариантам с учётом лимитов */
  fits: boolean;
  /** обязательные варианты, которые не заполнены */
  missingRequired: AosOption[];
}

/** Распределение юнитов полка по вариантам лидера (перебор: в полку не больше 4–5 юнитов). */
export function matchRegiment(leader: AosWarscroll, units: AosWarscroll[]): RegimentMatch {
  const cands = units.map((w) => slotCandidates(w, leader));
  const caps = leader.options.map((o) => Math.min(optMax(o), units.length));
  const req = leader.options.map((o) => o.required);
  // перебор с запоминанием состояний (номер юнита + занятость вариантов): без экспоненты на подделанных ростерах
  const memo = new Map<string, number>();
  const used = leader.options.map(() => 0);
  /** минимальное число незаполненных обязательных вариантов; Infinity — юниты не распределяются */
  const go = (i: number): number => {
    if (i === units.length) return req.reduce((n, r, k) => n + (r && used[k] === 0 ? 1 : 0), 0);
    const key = i + '|' + used.join(',');
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let best = Infinity;
    for (const k of cands[i]!) {
      if (best === 0) break;
      if (k === -1) best = Math.min(best, go(i + 1));
      else if (used[k]! < caps[k]!) {
        used[k]!++;
        best = Math.min(best, go(i + 1));
        used[k]!--;
      }
    }
    memo.set(key, best);
    return best;
  };
  const best = go(0);
  if (best === Infinity) return { fits: false, missingRequired: leader.options.filter((o) => o.required) };
  if (best === 0) return { fits: true, missingRequired: [] };
  // восстановить, какие именно обязательные варианты пусты
  const missing: AosOption[] = [];
  const walk = (i: number): boolean => {
    if (i === units.length) {
      const m = leader.options.filter((o, k) => o.required && used[k] === 0);
      if (m.length !== best) return false;
      missing.push(...m);
      return true;
    }
    for (const k of cands[i]!) {
      if (k === -1) {
        if (go(i + 1) === best && walk(i + 1)) return true;
      } else if (used[k]! < caps[k]!) {
        used[k]!++;
        const ok = go(i + 1) === best && walk(i + 1);
        used[k]!--;
        if (ok) return true;
      }
    }
    return false;
  };
  walk(0);
  return { fits: true, missingRequired: missing };
}

const optionText = (o: AosOption) => `${o.q === 'any' ? 'Any' : o.q === 'max1' ? '0-1' : '0-' + o.q.slice(3)} ${o.label}${o.required ? ' (обязательно)' : ''}`;
export const optionsText = (leader: AosWarscroll) => leader.options.map(optionText).join(', ') || 'нет вариантов';

/**
 * WARMASTER вне роли лидера: генералом обязан быть WARMASTER, который ведёт полк, —
 * поэтому в чужой полк или во вспомогательные он идёт, только если такой лидер-WARMASTER уже есть.
 */
function warmasterFit(ws: AosWarscroll, r: AosRoster, L: AosLookup): Fit {
  if (!ws.warmaster) return OK;
  if (r.regiments.some((g) => L.ws.get(g.leader.warscrollId)?.warmaster)) return OK;
  return no(`«${ws.name}» — WARMASTER и должен быть генералом: возьмите его лидером полка (или сначала другого WARMASTER-лидера).`);
}

/** Можно ли поставить юнит в полк. ignoreUid — юнит, который переставляется (не считается дважды). */
export function regimentFit(reg: AosRegiment, ws: AosWarscroll, r: AosRoster, L: AosLookup, ignoreUid?: string): Fit {
  const leader = L.ws.get(reg.leader.warscrollId);
  if (!leader) return no('Лидер полка не найден в данных.');
  const base = warscrollFit(ws, r, L);
  if (!base.ok) return base;
  if (ws.onlyInIds.length && !ws.onlyInIds.includes(leader.id)) return no(`Только в полку: ${listNames(ws.onlyInIds, L)}.`);
  const cands = slotCandidates(ws, leader);
  if (!cands.length)
    return no(ws.hero ? `Герой «${ws.name}» не может присоединиться к полку «${leader.name}».` : `Нет среди вариантов полка «${leader.name}»: ${optionsText(leader)}.`);
  const members = reg.units.filter((u) => u.uid !== ignoreUid);
  if (!ws.freeSlot && slotsUsed(reg, L, ignoreUid) >= regimentCap(reg, r))
    return no(`Полк заполнен: ${regimentCap(reg, r)} юнита${r.generalUid === reg.leader.uid ? ' (полк генерала)' : ' (у генерала — 4)'}.`);
  const after = [...members.map((u) => L.ws.get(u.warscrollId)).filter((w): w is AosWarscroll => !!w), ws];
  if (!matchRegiment(leader, after).fits) {
    const full = leader.options.filter((o, k) => cands.includes(k) && o.q !== 'any');
    return no(`Лимит варианта ${full.map((o) => `«${optionText(o)}»`).join(', ') || 'полка'} уже исчерпан.`);
  }
  if (ws.requiresInRegiment) {
    const q = ws.requiresInRegiment;
    if (!after.some((w) => q.ids.includes(w.id))) return no(`Сначала добавьте в полк: ${listNames(q.ids, L)}.`);
    if (after.filter((w) => q.noOtherIds.includes(w.id)).length > 1) return no(`В полку уже есть «${listNames(q.noOtherIds, L)}».`);
  }
  // «не больше N … в полку героя без KW» — проверяем и новый юнит, и ограничения уже стоящих
  for (const w of after) {
    const cap = w.regimentCap;
    if (!cap || leader.keywords.includes(cap.unlessLeader) || leader.factionKeywords.includes(cap.unlessLeader)) continue;
    const n = after.filter((x) => cap.ids.includes(x.id)).length;
    if (n > cap.max) return no(`Не больше ${cap.max} × ${cap.phrase} в полку героя без ${cap.unlessLeader}.`);
  }
  const wm = warmasterFit(ws, r, L);
  if (!wm.ok) return wm;
  const army = armyFit(ws, r, L, ignoreUid);
  if (!army.ok) return army;
  if (ignoreUid) {
    // перестановка из вспомогательных в полк: цена не растёт
    return OK;
  }
  return costFit(ws, r, L);
}

/** Может ли герой возглавить новый полк. */
export function leaderFit(ws: AosWarscroll, r: AosRoster, L: AosLookup): Fit {
  if (!ws.hero) return no('Полк возглавляет только HERO.');
  const base = warscrollFit(ws, r, L);
  if (!base.ok) return base;
  if (ws.onlyInIds.length) return no(`Этого героя можно взять только в полк: ${listNames(ws.onlyInIds, L)}.`);
  if (r.regiments.length >= AOS_RULES.maxRegiments) return no(`В армии уже ${AOS_RULES.maxRegiments} полков — это максимум.`);
  const army = armyFit(ws, r, L);
  if (!army.ok) return army;
  // новый WARMASTER сразу станет генералом
  const cur = r.regiments.find((g) => g.leader.uid === r.generalUid);
  if (ws.warmaster && cur && !L.ws.get(cur.leader.warscrollId)?.warmaster) {
    const old = oldGeneralFit(null, r, L);
    if (!old.ok) return no(`«${ws.name}» — WARMASTER и станет генералом. ${old.reason}`);
  }
  // обязательные юниты полка (Neave’s Companions и т. п.) входят в цену
  const required = ws.options.filter((o) => o.required && o.ids.length === 1).reduce((s, o) => s + (L.ws.get(o.ids[0]!)?.cost ?? 0), 0);
  return costFit(ws, r, L, required);
}

/** Может ли юнит быть вспомогательным (вне полков). */
export function auxiliaryFit(ws: AosWarscroll, r: AosRoster, L: AosLookup, ignoreUid?: string): Fit {
  const base = warscrollFit(ws, r, L);
  if (!base.ok) return base;
  if (ws.onlyInIds.length) return no(`Только в полку: ${listNames(ws.onlyInIds, L)}.`);
  if (ws.requiresInRegiment) return no(ws.requiresInRegiment.text + '.');
  const wm = warmasterFit(ws, r, L);
  if (!wm.ok) return wm;
  const army = armyFit(ws, r, L, ignoreUid);
  if (!army.ok) return army;
  const surcharge = nextAuxiliarySurcharge(r.auxiliaries.filter((u) => u.uid !== ignoreUid).length);
  if (ignoreUid) return pointsFit(surcharge, r, L);
  return costFit(ws, r, L, surcharge);
}

// ---------- генерал ----------

export function generalFit(reg: AosRegiment, r: AosRoster, L: AosLookup): Fit {
  const ws = L.ws.get(reg.leader.warscrollId);
  if (!ws) return no('Нет данных юнита.');
  const masters = placedUnits(r, L).filter((p) => p.ws?.warmaster);
  if (masters.length && !ws.warmaster) return no(`В армии есть WARMASTER (${masters.map((p) => p.ws!.name).join(', ')}) — генералом должен быть он.`);
  if (slotsUsed(reg, L) > AOS_RULES.generalRegimentSize) return no('В полку больше 4 юнитов.');
  return oldGeneralFit(reg.uid, r, L);
}

/** Генерал меняется: полк прежнего генерала теряет 4-е место — в нём должно быть не больше 3 юнитов. */
function oldGeneralFit(newRegUid: string | null, r: AosRoster, L: AosLookup): Fit {
  const old = r.regiments.find((g) => g.leader.uid === r.generalUid);
  if (!old || old.uid === newRegUid || slotsUsed(old, L) <= AOS_RULES.regimentSize) return OK;
  return no(`В полку генерала «${L.ws.get(old.leader.warscrollId)?.name}» 4 юнита — у обычного полка их не больше 3. Сначала уберите или перенесите один.`);
}

// ---------- усиление ----------

export function reinforceFit(u: AosUnit, r: AosRoster, L: AosLookup): Fit {
  const ws = L.ws.get(u.warscrollId);
  if (!ws) return no('Нет данных юнита.');
  if (!ws.reinforceable) return no(ws.unique ? 'UNIQUE юнит нельзя усилить.' : ws.unitSize <= 1 ? 'Юнит из одной модели нельзя усилить.' : 'По Battle Profiles этот юнит нельзя усилить.');
  if (u.reinforced) return OK;
  const add = ws.cost ?? 0;
  const share = shareFit(add * AOS_RULES.reinforceMultiplier + unitEnhancementCost(u, L), r);
  if (!share.ok) return share;
  return pointsFit(add, r, L);
}

// ---------- улучшения ----------

const nameIs = (ws: AosWarscroll, names: string[]) => {
  const n = ws.baseName.toLowerCase();
  return names.some((x) => {
    const y = x.toLowerCase();
    return n === y || n === y.replace(/s$/, '') || n + 's' === y;
  });
};

export function eligibleFor(ws: AosWarscroll, table: AosEnhancementTable): boolean {
  const e = table.eligibility;
  const kw = new Set([...ws.keywords, ...ws.factionKeywords]);
  if (e.hero === true && !ws.hero) return false;
  if (e.hero === false && ws.hero) return false;
  if (e.all && !e.all.every((k) => kw.has(k))) return false;
  if (e.any && !e.any.some((k) => kw.has(k))) return false;
  if (e.not && e.not.some((k) => kw.has(k))) return false;
  if (e.names && !nameIs(ws, e.names)) return false;
  if (e.excludeNames && nameIs(ws, e.excludeNames)) return false;
  return true;
}

/** Кто и где уже взял улучшение этого слота. */
function slotHolder(slot: string, r: AosRoster, L: AosLookup, exceptUid: string): { unit: AosUnit; item: AosEnhancement } | null {
  for (const p of placedUnits(r, L)) {
    if (p.unit.uid === exceptUid) continue;
    for (const id of Object.values(p.unit.enhancements)) {
      const ref = L.enh.get(id);
      if (ref?.slot === slot) return { unit: p.unit, item: ref.item };
    }
  }
  return null;
}

/** Можно ли дать юниту это улучшение. */
export function enhancementFit(u: AosUnit, itemId: string, r: AosRoster, L: AosLookup): Fit {
  const ws = L.ws.get(u.warscrollId);
  const ref = L.enh.get(itemId);
  if (!ws || !ref) return no('Нет данных.');
  if (ws.unique) return no('UNIQUE юниту нельзя давать улучшения.');
  // Юниты полка славы в ростере — не AosUnit, улучшения им в этом конструкторе не выдаются (по правилам — только с ключевым словом фракции)
  if (!L.own.has(ws.id) && !ws.factionKeywords.includes(L.factionKeyword)) return no('Юниту полка славы без ключевого слова фракции улучшения нельзя.');
  if (!eligibleFor(ws, ref.table)) return no(`«${ref.table.name}» — только: ${ref.table.eligibility.text}.`);
  if (ref.item.points == null) return no('Нет очков в Battle Profiles.');
  const holder = slotHolder(ref.slot, r, L, u.uid);
  if (holder) {
    const hws = L.ws.get(holder.unit.warscrollId);
    return no(`Из таблицы «${ref.table.name}» уже выбрано «${holder.item.name}» (${hws?.name ?? 'юнит'}) — одно улучшение на таблицу.`);
  }
  const cur = u.enhancements[ref.type.key];
  const delta = ref.item.points - (cur ? L.enh.get(cur)?.item.points ?? 0 : 0);
  const share = shareFit(unitBaseCost(u, ws) + unitEnhancementCost(u, L) + delta, r);
  if (!share.ok) return share;
  return pointsFit(delta, r, L);
}

// ---------- лоры, построение, террейн, полк славы ----------

export const loresOf = (kind: LoreKind, L: AosLookup) => L.faction.lores.filter((l) => l.kind === kind && l.season !== 'ghyran');

export function loreFit(lore: AosLore, r: AosRoster, L: AosLookup): Fit {
  if (lore.points == null) return no('Нет очков в Battle Profiles.');
  const cur = r.lores[lore.kind];
  const delta = lore.points - ((cur && L.lore.get(cur)?.points) || 0);
  return pointsFit(delta, r, L);
}

export function formationFit(f: AosFormation, r: AosRoster, L: AosLookup): Fit {
  if (f.points == null) return no('Нет очков в Battle Profiles.');
  const delta = f.points - ((r.formationId && L.formation.get(r.formationId)?.points) || 0);
  return pointsFit(delta, r, L);
}

export const terrainOf = (L: AosLookup) => L.faction.warscrolls.filter((w) => w.kind === 'terrain');

export function terrainFit(w: AosWarscroll, r: AosRoster, L: AosLookup): Fit {
  if (w.cost == null) return no('Нет очков в Battle Profiles.');
  if (w.legends && !r.showLegends) return no('Warhammer Legends.');
  const delta = w.cost - ((r.terrainId && L.ws.get(r.terrainId)?.cost) || 0);
  return pointsFit(delta, r, L);
}

/** Цена полка славы при выборе (у собираемого — по выбранным юнитам). */
export function rorPrice(ror: AosRor, picked: string[]): number {
  if (!ror.built) return ror.cost ?? 0;
  return ror.units.filter((u) => !u.optional || picked.includes(u.id)).reduce((s, u) => s + (u.points ?? 0), 0);
}

export function rorFit(ror: AosRor, r: AosRoster, L: AosLookup, picked: string[] = []): Fit {
  if (!ror.allowed.includes(L.faction.id)) return no('Этот полк славы нельзя взять в эту фракцию.');
  if (!ror.built && ror.cost == null) return no('Нет очков в Battle Profiles.');
  if (ror.built && !ror.units.some((u) => u.optional && picked.includes(u.id))) return no('Отметьте хотя бы один юнит полка (нажмите на название).');
  const own = placedUnits(r, L).filter((p) => p.ws);
  for (const u of ror.units.filter((x) => !x.optional || picked.includes(x.id))) {
    const w = L.ws.get(u.id);
    if (!w) return no('В данных нет юнита полка.');
    if (w.unique && own.some((p) => p.ws!.baseName === w.baseName)) return no(`«${w.baseName}» — UNIQUE, уже есть в армии.`);
    if (own.some((p) => p.ws!.exclusiveWithRorIds.includes(ror.id))) return no(`Нельзя вместе с «${own.find((p) => p.ws!.exclusiveWithRorIds.includes(ror.id))!.ws!.name}».`);
    const clash = own.find((p) => w.exclusiveWithIds.includes(p.ws!.id) || p.ws!.exclusiveWithIds.includes(w.id));
    if (clash) return no(`«${w.name}» нельзя вместе с «${clash.ws!.name}».`);
    if (w.unique && own.some((p) => p.ws!.noOtherUnique)) return no(`С «${own.find((p) => p.ws!.noOtherUnique)!.ws!.name}» нельзя брать другие UNIQUE юниты.`);
    if (w.noOtherUnique && own.some((p) => p.ws!.unique)) return no(`«${w.name}» нельзя брать вместе с другими UNIQUE юнитами.`);
  }
  const delta = rorPrice(ror, picked) - rorCost(r, L);
  return pointsFit(delta, r, L);
}

// ---------- полная проверка ----------

export interface AosComputed {
  points: AosPoints;
  drops: number;
  issues: AosIssue[];
  errors: number;
  warnings: number;
  /** юнит → его ошибки (для подсветки карточек) */
  byUid: Map<string, AosIssue[]>;
  general: AosRegiment | null;
}

export function computeAos(r: AosRoster, L: AosLookup): AosComputed {
  const issues: AosIssue[] = [];
  const err = (code: string, message: string, uids?: string[]) => issues.push({ level: 'error', code, message, uids });
  const warn = (code: string, message: string, uids?: string[]) => issues.push({ level: 'warning', code, message, uids });
  const placed = placedUnits(r, L);
  const points = pointsOf(r, L);

  // очки
  if (points.total > r.pointsLimit) err('points', `Превышен лимит: ${points.total} из ${r.pointsLimit} очков.`);
  for (const p of placed) {
    const c = unitTotal(p.unit, L);
    if (c > r.pointsLimit * AOS_RULES.maxShareOfOneUnit) err('share', `«${p.ws?.name}» стоит ${c} — больше половины лимита (${r.pointsLimit * AOS_RULES.maxShareOfOneUnit}).`, [p.unit.uid]);
  }

  // данные юнитов
  for (const p of placed) {
    if (!p.ws) {
      err('missing', `Юнит ${p.unit.warscrollId} не найден в данных — удалите его.`, [p.unit.uid]);
      continue;
    }
    const f = warscrollFit(p.ws, { ...r, showLegends: true }, L);
    if (!f.ok) err('unit', `«${p.ws.name}»: ${f.reason}`, [p.unit.uid]);
    if (p.ws.legends) warn('legends', `«${p.ws.name}» — Warhammer Legends, в matched play не допускается.`, [p.unit.uid]);
    if (p.unit.reinforced && !p.ws.reinforceable) err('reinforce', `«${p.ws.name}» нельзя усилить.`, [p.unit.uid]);
  }

  // полки
  if (r.regiments.length < AOS_RULES.minRegiments) err('no-regiment', 'Нужен хотя бы 1 полк: добавьте героя-лидера.');
  if (r.regiments.length > AOS_RULES.maxRegiments) err('regiments', `Полков ${r.regiments.length} — максимум ${AOS_RULES.maxRegiments}.`);
  for (const reg of r.regiments) {
    const leader = L.ws.get(reg.leader.warscrollId);
    if (!leader) continue;
    if (!leader.hero) err('leader', `«${leader.name}» не HERO и не может вести полк.`, [reg.leader.uid]);
    if (leader.onlyInIds.length) err('leader', `«${leader.name}» можно взять только в полк: ${listNames(leader.onlyInIds, L)}.`, [reg.leader.uid]);
    const cap = regimentCap(reg, r);
    const used = slotsUsed(reg, L);
    if (used > cap) err('regiment-size', `Полк «${leader.name}»: ${used} юнита, можно ${cap}${cap === 3 ? ' (4 — только у генерала)' : ''}.`, [reg.leader.uid]);
    const ws = reg.units.map((u) => L.ws.get(u.warscrollId)).filter((w): w is AosWarscroll => !!w);
    const m = matchRegiment(leader, ws);
    if (!m.fits) err('regiment-options', `Полк «${leader.name}»: состав не подходит под варианты (${optionsText(leader)}).`, [reg.leader.uid, ...reg.units.map((u) => u.uid)]);
    else for (const o of m.missingRequired) err('regiment-required', `Полк «${leader.name}»: обязательно — ${o.label}.`, [reg.leader.uid]);
    for (const u of reg.units) {
      const w = L.ws.get(u.warscrollId);
      if (!w) continue;
      if (w.onlyInIds.length && !w.onlyInIds.includes(leader.id)) err('only-in', `«${w.name}» — только в полку: ${listNames(w.onlyInIds, L)}.`, [u.uid]);
      if (w.requiresInRegiment) {
        const q = w.requiresInRegiment;
        if (!ws.some((x) => q.ids.includes(x.id)) || ws.filter((x) => q.noOtherIds.includes(x.id)).length > 1) err('requires', `«${w.name}»: ${q.text}.`, [u.uid]);
      }
      const capRule = w.regimentCap;
      if (capRule && !leader.keywords.includes(capRule.unlessLeader) && !leader.factionKeywords.includes(capRule.unlessLeader)) {
        const n = ws.filter((x) => capRule.ids.includes(x.id)).length;
        if (n > capRule.max) err('regiment-cap', `Полк «${leader.name}»: не больше ${capRule.max} × ${capRule.phrase} (лидер без ${capRule.unlessLeader}).`, [u.uid]);
      }
    }
  }
  for (const u of r.auxiliaries) {
    const w = L.ws.get(u.warscrollId);
    if (w?.onlyInIds.length) err('only-in', `«${w.name}» — только в полку: ${listNames(w.onlyInIds, L)}.`, [u.uid]);
    if (w?.requiresInRegiment) err('requires', `«${w.name}»: ${w.requiresInRegiment.text}.`, [u.uid]);
  }

  // армия: unique, версии, исключения, «1 на каждый»
  const seen = new Map<string, Placed[]>();
  for (const p of placed) if (p.ws) seen.set(p.ws.baseName, [...(seen.get(p.ws.baseName) ?? []), p]);
  for (const [name, list] of seen) {
    const w = list[0]!.ws!;
    if (w.unique && list.length > 1) err('unique', `«${name}» — UNIQUE, в армии ${list.length} копии.`, list.map((p) => p.unit.uid));
    if (new Set(list.map((p) => p.ws!.season === 'aqshy')).size > 1) err('season', `«${name}»: все копии должны быть одной версии (обычной или Scourge of Aqshy).`, list.map((p) => p.unit.uid));
    if (w.perUnitOf) {
      const base = placed.filter((p) => p.ws && w.perUnitOf!.ids.includes(p.ws.id)).length;
      if (list.length > base * w.perUnitOf.per) err('per-unit', `«${name}»: ${w.perUnitOf.per} на каждый «${w.perUnitOf.label}» — сейчас ${list.length} при ${base}.`, list.map((p) => p.unit.uid));
    }
  }
  const rorWs = rorUnitsOf(r, L).map((x) => x.ws);
  const allWs = [...placed.filter((p) => p.ws).map((p) => p.ws!), ...rorWs];
  for (const p of placed) {
    if (!p.ws) continue;
    for (const id of p.ws.exclusiveWithIds) if (allWs.some((w) => w.id === id)) err('exclusive', `«${p.ws.name}» нельзя вместе с «${L.ws.get(id)?.name}».`, [p.unit.uid]);
    if (r.ror && p.ws.exclusiveWithRorIds.includes(r.ror.id)) err('exclusive', `«${p.ws.name}» нельзя вместе с полком славы «${L.ror.get(r.ror.id)?.name}».`, [p.unit.uid]);
  }
  const lone = allWs.find((w) => w.noOtherUnique);
  if (lone && allWs.some((w) => w.unique && w.baseName !== lone.baseName)) err('no-other-unique', `С «${lone.name}» нельзя брать другие UNIQUE юниты.`);
  for (const [name, list] of seen) {
    const w = list[0]!.ws!;
    if (w.unique && rorWs.some((x) => x.baseName === name)) err('unique', `«${name}» — UNIQUE: есть и в армии, и в полку славы.`, list.map((p) => p.unit.uid));
  }

  // генерал
  let general: AosRegiment | null = null;
  if (r.regiments.length) {
    general = r.regiments.find((g) => g.leader.uid === r.generalUid) ?? null;
    if (!general) err('general', 'Выберите генерала — героя, который ведёт полк.');
    else {
      const f = generalFit(general, r, L);
      if (!f.ok) err('general', f.reason, [general.leader.uid]);
    }
  }

  // улучшения
  const slots = new Map<string, { uid: string; name: string }[]>();
  const items = new Map<string, string[]>();
  for (const p of placed) {
    for (const [key, id] of Object.entries(p.unit.enhancements)) {
      const ref = L.enh.get(id);
      if (!ref || !p.ws) {
        err('enh-missing', `Улучшение ${id} не найдено в данных.`, [p.unit.uid]);
        continue;
      }
      if (ref.type.key !== key) err('enh-type', `«${ref.item.name}» записано не в свой тип.`, [p.unit.uid]);
      if (p.ws.unique) err('enh-unique', `«${p.ws.name}» — UNIQUE, улучшения нельзя.`, [p.unit.uid]);
      if (!eligibleFor(p.ws, ref.table)) err('enh-eligible', `«${ref.item.name}» — только: ${ref.table.eligibility.text}.`, [p.unit.uid]);
      if (ref.item.points == null) err('enh-points', `«${ref.item.name}» — нет очков в Battle Profiles.`, [p.unit.uid]);
      slots.set(ref.slot, [...(slots.get(ref.slot) ?? []), { uid: p.unit.uid, name: ref.item.name }]);
      items.set(id, [...(items.get(id) ?? []), p.unit.uid]);
    }
  }
  for (const [, list] of slots) if (list.length > 1) err('enh-slot', `Одно улучшение на таблицу: выбрано ${list.map((x) => `«${x.name}»`).join(', ')}.`, list.map((x) => x.uid));
  for (const [id, uids] of items) if (uids.length > 1) err('enh-dup', `«${L.enh.get(id)?.item.name}» выбрано ${uids.length} раза.`, uids);

  // построение, лоры, террейн, полк славы
  const formations = L.faction.formations;
  if (r.formationId && !L.formation.get(r.formationId)) err('formation', 'Выбранное боевое построение не найдено в данных.');
  else if (!r.formationId && formations.length) err('formation', 'Выберите боевое построение.');
  if (r.formationId && L.formation.get(r.formationId)?.points == null && L.formation.get(r.formationId)) err('formation', 'У построения нет очков в Battle Profiles.');
  for (const kind of ['spell', 'prayer', 'manifestation'] as LoreKind[]) {
    const id = r.lores[kind];
    if (!id) continue;
    const lore = L.lore.get(id);
    if (!lore || lore.kind !== kind) err('lore', 'Лора не найдена в данных.');
    else if (lore.points == null) err('lore', `«${lore.name}» — нет очков в Battle Profiles.`);
    else if (lore.season === 'ghyran') err('lore', `«${lore.name}» — сезон Scourge of Ghyran закончился.`);
  }
  if (r.terrainId) {
    const t = L.ws.get(r.terrainId);
    if (!t || t.kind !== 'terrain' || !L.own.has(t.id)) err('terrain', 'Террейн фракции не найден в данных.');
    else if (t.cost == null) err('terrain', `«${t.name}» — нет очков в Battle Profiles.`);
    else if (t.legends) warn('legends', `«${t.name}» — Warhammer Legends, в matched play не допускается.`);
  }
  if (r.ror) {
    const ror = L.ror.get(r.ror.id);
    if (!ror) err('ror', 'Полк славы не найден в данных.');
    else {
      if (!ror.allowed.includes(L.faction.id)) err('ror', `«${ror.name}» нельзя взять в ${L.faction.name}.`);
      if (ror.built && !ror.units.some((u) => u.optional && r.ror!.picked.includes(u.id))) err('ror', `«${ror.name}»: выберите хотя бы один юнит полка.`);
      if (!ror.built && ror.cost == null) err('ror', `«${ror.name}» — нет очков в Battle Profiles.`);
    }
  }
  if (L.faction.rulesNotice) warn('stale-rules', L.faction.rulesNotice);

  const byUid = new Map<string, AosIssue[]>();
  for (const i of issues) for (const u of i.uids ?? []) byUid.set(u, [...(byUid.get(u) ?? []), i]);
  return {
    points,
    drops: r.regiments.length + r.auxiliaries.length + (r.ror ? 1 : 0),
    issues,
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warning').length,
    byUid,
    general,
  };
}
