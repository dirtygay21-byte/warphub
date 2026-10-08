import { uid } from '../engine/roster';
import { auxiliaryFit, computeAos, findUnit, leaderFit, regimentFit, regimentOf, type AosLookup, type Fit } from './engine';
import { AOS_RULES } from './rules';
import type { AosPointsLimit, AosRegiment, AosRoster, AosUnit, AosWarscroll, LoreKind } from './types';

/*
 * Операции над ростером AoS. Каждая операция, добавляющая юнит, сначала спрашивает движок (*Fit) —
 * незаконное состояние не создаётся. Возвращают новый объект ростера (иммутабельно) или ошибку с причиной.
 */

export type OpResult = { ok: true; roster: AosRoster; uid?: string } | { ok: false; reason: string };
const fail = (f: Fit): OpResult => ({ ok: false, reason: f.ok ? '' : f.reason });

export function newAosRoster(factionId: string, pointsLimit: AosPointsLimit = 2000, dataVersion: string | null = null): AosRoster {
  const now = Date.now();
  return {
    system: 'aos',
    id: uid(),
    name: 'Новый ростер',
    factionId,
    pointsLimit,
    formationId: null,
    regiments: [],
    auxiliaries: [],
    generalUid: null,
    ror: null,
    lores: { spell: null, prayer: null, manifestation: null },
    terrainId: null,
    showLegends: false,
    dataVersion,
    createdAt: now,
    updatedAt: now,
  };
}

export const touchAos = (r: AosRoster): AosRoster => ({ ...r, updatedAt: Date.now() });
const newUnit = (ws: AosWarscroll): AosUnit => ({ uid: uid(), warscrollId: ws.id, reinforced: false, enhancements: {} });

/** Генерал: если не выбран или его полка больше нет — первый WARMASTER-лидер, иначе первый лидер. */
export function ensureGeneral(r: AosRoster, L: AosLookup): AosRoster {
  if (r.regiments.some((g) => g.leader.uid === r.generalUid)) {
    const cur = L.ws.get(r.regiments.find((g) => g.leader.uid === r.generalUid)!.leader.warscrollId);
    const anyMaster = r.regiments.find((g) => L.ws.get(g.leader.warscrollId)?.warmaster);
    if (cur?.warmaster || !anyMaster) return r;
    return { ...r, generalUid: anyMaster.leader.uid };
  }
  const pick = r.regiments.find((g) => L.ws.get(g.leader.warscrollId)?.warmaster) ?? r.regiments[0];
  return { ...r, generalUid: pick?.leader.uid ?? null };
}

/** Новый полк во главе с героем. Обязательные юниты полка (Neave’s Companions и т. п.) добавляются сразу. */
export function addRegiment(r: AosRoster, ws: AosWarscroll, L: AosLookup): OpResult {
  const f = leaderFit(ws, r, L);
  if (!f.ok) return fail(f);
  const reg: AosRegiment = { uid: uid(), leader: newUnit(ws), units: [] };
  let next = ensureGeneral({ ...r, regiments: [...r.regiments, reg] }, L);
  for (const o of ws.options.filter((x) => x.required)) {
    if (o.ids.length !== 1) continue;
    const req = L.ws.get(o.ids[0]!);
    if (!req) continue;
    const res = addToRegiment(next, reg.uid, req, L);
    // без обязательного юнита полк незаконен — не создаём его вовсе
    if (!res.ok) return { ok: false, reason: `Нельзя добавить обязательный юнит «${req.name}»: ${res.reason}` };
    next = res.roster;
  }
  return { ok: true, roster: touchAos(next), uid: reg.leader.uid };
}

export function addToRegiment(r: AosRoster, regUid: string, ws: AosWarscroll, L: AosLookup): OpResult {
  const reg = r.regiments.find((g) => g.uid === regUid);
  if (!reg) return { ok: false, reason: 'Полк не найден.' };
  const f = regimentFit(reg, ws, r, L);
  if (!f.ok) return fail(f);
  const u = newUnit(ws);
  return { ok: true, roster: touchAos({ ...r, regiments: r.regiments.map((g) => (g.uid === regUid ? { ...g, units: [...g.units, u] } : g)) }), uid: u.uid };
}

export function addAuxiliary(r: AosRoster, ws: AosWarscroll, L: AosLookup): OpResult {
  const f = auxiliaryFit(ws, r, L);
  if (!f.ok) return fail(f);
  const u = newUnit(ws);
  return { ok: true, roster: touchAos({ ...r, auxiliaries: [...r.auxiliaries, u] }), uid: u.uid };
}

/** Новые ошибки, которые появятся после изменения (для предупреждения перед удалением и запрета переноса). */
export function newErrors(before: AosRoster, after: AosRoster, L: AosLookup): string[] {
  const was = new Set(computeAos(before, L).issues.filter((i) => i.level === 'error').map((i) => i.message));
  return computeAos(after, L)
    .issues.filter((i) => i.level === 'error' && !was.has(i.message))
    .map((i) => i.message);
}

/** Удаление юнита. Лидер удаляется вместе со своим полком. */
export function removeAosUnit(r: AosRoster, unitUid: string, L: AosLookup): AosRoster {
  const regiments = r.regiments.filter((g) => g.leader.uid !== unitUid).map((g) => ({ ...g, units: g.units.filter((u) => u.uid !== unitUid) }));
  return touchAos(ensureGeneral({ ...r, regiments, auxiliaries: r.auxiliaries.filter((u) => u.uid !== unitUid) }, L));
}

/** Перенос не-лидера в другой полк или во вспомогательные. */
export function moveAosUnit(r: AosRoster, unitUid: string, target: string | 'aux', L: AosLookup): OpResult {
  const u = findUnit(r, unitUid);
  const ws = u && L.ws.get(u.warscrollId);
  if (!u || !ws) return { ok: false, reason: 'Юнит не найден.' };
  if (r.regiments.some((g) => g.leader.uid === unitUid)) return { ok: false, reason: 'Лидер полка не переносится.' };
  const without: AosRoster = {
    ...r,
    regiments: r.regiments.map((g) => ({ ...g, units: g.units.filter((x) => x.uid !== unitUid) })),
    auxiliaries: r.auxiliaries.filter((x) => x.uid !== unitUid),
  };
  // проверки — на исходном ростере: юнит ещё стоит на месте и не считается дважды (ignoreUid)
  let next: AosRoster;
  if (target === 'aux') {
    const f = auxiliaryFit(ws, r, L, unitUid);
    if (!f.ok) return fail(f);
    next = { ...without, auxiliaries: [...without.auxiliaries, u] };
  } else {
    const reg = r.regiments.find((g) => g.uid === target);
    if (!reg) return { ok: false, reason: 'Полк не найден.' };
    const f = regimentFit(reg, ws, r, L, unitUid);
    if (!f.ok) return fail(f);
    next = { ...without, regiments: without.regiments.map((g) => (g.uid === target ? { ...g, units: [...g.units, u] } : g)) };
  }
  // перенос не должен ломать остальное: «только в полку с X», обязательные юниты, «1 на каждый»…
  const broken = newErrors(r, next, L);
  if (broken.length) return { ok: false, reason: broken[0]! };
  return { ok: true, roster: touchAos(next) };
}

export function updateAosUnit(r: AosRoster, unitUid: string, patch: Partial<Omit<AosUnit, 'uid' | 'warscrollId'>>): AosRoster {
  const upd = (u: AosUnit) => (u.uid === unitUid ? { ...u, ...patch } : u);
  return touchAos({
    ...r,
    regiments: r.regiments.map((g) => ({ ...g, leader: upd(g.leader), units: g.units.map(upd) })),
    auxiliaries: r.auxiliaries.map(upd),
  });
}

export function setEnhancement(r: AosRoster, unitUid: string, typeKey: string, itemId: string | null): AosRoster {
  const u = findUnit(r, unitUid);
  if (!u) return r;
  const enhancements = { ...u.enhancements };
  if (itemId) enhancements[typeKey] = itemId;
  else delete enhancements[typeKey];
  return updateAosUnit(r, unitUid, { enhancements });
}

export const setGeneral = (r: AosRoster, leaderUid: string): AosRoster => touchAos({ ...r, generalUid: leaderUid });
export const setLore = (r: AosRoster, kind: LoreKind, id: string | null): AosRoster => touchAos({ ...r, lores: { ...r.lores, [kind]: id } });

/** Копия юнита в тот же полк (или во вспомогательные). */
export function duplicateAosUnit(r: AosRoster, unitUid: string, L: AosLookup): OpResult {
  const u = findUnit(r, unitUid);
  const ws = u && L.ws.get(u.warscrollId);
  if (!u || !ws) return { ok: false, reason: 'Юнит не найден.' };
  const reg = regimentOf(r, unitUid);
  if (reg && reg.leader.uid === unitUid) return addRegiment(r, ws, L);
  return reg ? addToRegiment(r, reg.uid, ws, L) : addAuxiliary(r, ws, L);
}

export function duplicateAosRoster(r: AosRoster): AosRoster {
  const now = Date.now();
  const map = new Map<string, string>();
  const cp = (u: AosUnit): AosUnit => {
    const n = uid();
    map.set(u.uid, n);
    return { ...u, uid: n, enhancements: { ...u.enhancements } };
  };
  const regiments = r.regiments.map((g) => ({ uid: uid(), leader: cp(g.leader), units: g.units.map(cp) }));
  return {
    ...r,
    id: uid(),
    name: (r.name + ' (копия)').slice(0, 80),
    regiments,
    auxiliaries: r.auxiliaries.map(cp),
    generalUid: r.generalUid ? map.get(r.generalUid) ?? null : null,
    ror: r.ror ? { ...r.ror, picked: [...r.ror.picked] } : null,
    lores: { ...r.lores },
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- код для переноса и проверка «чужих» данных ----------

export const AOS_CODE_PREFIX = 'AOS1.';

export function encodeAosRoster(r: AosRoster): string {
  const json = JSON.stringify({ v: 1, r });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return AOS_CODE_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeAosRoster(code: string, knownFactions?: string[]): AosRoster {
  let obj: unknown;
  try {
    if (!code.trim().startsWith(AOS_CODE_PREFIX)) throw new Error('prefix');
    const body = code.trim().slice(AOS_CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(body + '='.repeat((4 - (body.length % 4)) % 4));
    obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch {
    throw new Error('Неверный код ростера');
  }
  const r = sanitizeAosRoster((obj as { r?: unknown } | null)?.r);
  if (!r) throw new Error('Неверный код ростера');
  if (knownFactions && !knownFactions.includes(r.factionId)) throw new Error('Ростер для неизвестной фракции — обновите данные');
  return { ...r, id: uid(), createdAt: Date.now(), updatedAt: Date.now() };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, def = ''): string => (typeof v === 'string' ? v : def);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, def = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const ID = /^[\w:.-]{1,40}$/;
const MAX_REGIMENTS = 8;
const MAX_REGIMENT_UNITS = 8;
const MAX_AUXILIARIES = 40;

function unitOf(v: unknown, seen: Set<string>): AosUnit | null {
  if (!isObj(v) || typeof v.warscrollId !== 'string' || !ID.test(v.warscrollId)) return null;
  let u = str(v.uid);
  if (!u || seen.has(u)) u = uid();
  seen.add(u);
  const enh: Record<string, string> = {};
  if (isObj(v.enhancements)) for (const [k, id] of Object.entries(v.enhancements)) if (typeof id === 'string' && ID.test(id) && k.length <= 60) enh[k] = id;
  return { uid: u, warscrollId: v.warscrollId, reinforced: v.reinforced === true, enhancements: enh };
}

/**
 * Приводит «чужой» AoS-ростер (код, localStorage, CloudStorage) к ожидаемой форме. Форма — не законность:
 * законность после загрузки проверяет computeAos и показывает каждую ошибку.
 */
export function sanitizeAosRoster(raw: unknown): AosRoster | null {
  if (!isObj(raw) || raw.system !== 'aos' || typeof raw.factionId !== 'string' || !raw.factionId) return null;
  const seen = new Set<string>();
  // ограничения размера — защита от подделанного кода: лишнее всё равно незаконно, а перебор полка не должен «висеть»
  const regiments: AosRegiment[] = (Array.isArray(raw.regiments) ? raw.regiments : []).slice(0, MAX_REGIMENTS).filter(isObj).flatMap((g) => {
    const leader = unitOf(g.leader, seen);
    if (!leader) return [];
    const units = (Array.isArray(g.units) ? g.units : []).slice(0, MAX_REGIMENT_UNITS).map((u) => unitOf(u, seen)).filter((u): u is AosUnit => !!u);
    return [{ uid: str(g.uid) || uid(), leader, units }];
  });
  const auxiliaries = (Array.isArray(raw.auxiliaries) ? raw.auxiliaries : []).slice(0, MAX_AUXILIARIES).map((u) => unitOf(u, seen)).filter((u): u is AosUnit => !!u);
  const lores = isObj(raw.lores) ? raw.lores : {};
  const ror = isObj(raw.ror) && typeof raw.ror.id === 'string' ? { id: raw.ror.id, picked: Array.isArray(raw.ror.picked) ? raw.ror.picked.filter((x): x is string => typeof x === 'string') : [] } : null;
  const limit = AOS_RULES.pointsLimits.includes(raw.pointsLimit as AosPointsLimit) ? (raw.pointsLimit as AosPointsLimit) : 2000;
  const leaders = new Set(regiments.map((g) => g.leader.uid));
  const now = Date.now();
  const s = raw.summary;
  return {
    system: 'aos',
    id: str(raw.id) || uid(),
    name: str(raw.name).slice(0, 80) || 'Ростер',
    factionId: raw.factionId,
    pointsLimit: limit,
    formationId: strOrNull(raw.formationId),
    regiments,
    auxiliaries,
    generalUid: typeof raw.generalUid === 'string' && leaders.has(raw.generalUid) ? raw.generalUid : null,
    ror,
    lores: { spell: strOrNull(lores.spell), prayer: strOrNull(lores.prayer), manifestation: strOrNull(lores.manifestation) },
    terrainId: strOrNull(raw.terrainId),
    showLegends: raw.showLegends === true,
    dataVersion: strOrNull(raw.dataVersion),
    summary: isObj(s) ? { points: num(s.points), errors: num(s.errors), warnings: num(s.warnings) } : undefined,
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
  };
}
