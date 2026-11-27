/**
 * Test Army: состояние стола — армии (сейчас одна; место под армию соперника заложено — sides), отряды, модели.
 * Чистые функции без React: собрать отряды из ростера, поставить отряд построением, сдвинуть, повернуть.
 * Координаты — поле боя 60×44″ (x вдоль 60″), как в battlefield.json.
 */
import type { ComputedRoster } from '../engine/compute';
import type { WarcryTerrainSetup } from '../skirmish/terrain';
import { APPROX_DEFAULT_MM, baseRadii, type BaseShape } from './bases';
import { formation, type Formation } from './formations';
import type { Placed, Pt } from './geometry';
import { unitModels } from './models';

/** База без размера в данных — форму и примерный размер задаёт игрок; до этого — круг 120 мм (стартовое значение, не правило). */
export const UNKNOWN_BASE_MM = APPROX_DEFAULT_MM;
export const DEFAULT_GAP = 0.5;
/** По умолчанию строй идёт поперёк поля (на экране — горизонтально). */
export const DEFAULT_ANGLE = Math.PI / 2;

export type TAModel = {
  id: string;
  profile: string;
  /** варианты базы из данных (пусто — размера нет) и исходная строка */
  options: BaseShape[];
  source: string;
  /** выбранный вариант (индекс в options) или свой размер, мм (для баз без размера) */
  pick: number;
  /** примерная база, выбранная игроком (форма и размер), — для моделей без размера в данных */
  custom?: BaseShape | null;
  /** устаревшее (до 29.10.2026): свой размер круглой базы, мм — читается из старых сохранений */
  customMm: number | null;
  /** центр на столе; null — не выставлена */
  at: Pt | null;
};

export type TAUnit = {
  uid: string;
  name: string;
  /** персонажи, присоединённые к отряду (их модели — в начале списка models) */
  leaders: string[];
  /** пометки отряда для экрана (AoS: «усилен», «полк славы») */
  tags?: string[];
  datasheetIds: string[];
  points: number;
  models: TAModel[];
  formation: Formation;
  angle: number;
  gap: number;
  placed: boolean;
};

export type Side = 'attacker' | 'defender';

/** Армия на столе: своя (me) или соперника (foe, 30.10.2026); ростер — свой по id или по коду (WH1.…). */
export type ArmyKey = 'me' | 'foe';
/** color — цвет армии на столе (27.11.2026, hex из ARMY_COLORS); нет — цвет стороны. */
export type TAArmy = { key: ArmyKey; side: Side; rosterId?: string; code?: string; units: TAUnit[]; color?: string };

/** Префикс id отрядов соперника: один и тот же ростер может стоять за обе стороны. */
export const FOE_PREFIX = 'foe:';
export const otherSide = (s: Side): Side => (s === 'attacker' ? 'defender' : 'attacker');

/** База модели для геометрии: из данных, свой размер или стартовые 60 мм. */
export function modelBase(m: TAModel): { shape: BaseShape; known: boolean } {
  const fromData = m.options[m.pick] ?? m.options[0];
  if (fromData) return { shape: fromData, known: true };
  if (m.custom) return { shape: m.custom, known: true };
  return { shape: { kind: 'circle', d: m.customMm ?? UNKNOWN_BASE_MM }, known: m.customMm != null };
}

/** Отряды из ростера: присоединённые персонажи — вместе со своим отрядом. prefix — к id отрядов (армия соперника). */
export function buildUnits(cr: ComputedRoster, prefix = ''): TAUnit[] {
  const out: TAUnit[] = [];
  const attachedUids = new Set(cr.units.filter((c) => c.unit.attachedTo && cr.byUid.has(c.unit.attachedTo)).map((c) => c.unit.uid));
  for (const c of cr.units) {
    if (attachedUids.has(c.unit.uid) || !c.ds) continue;
    const leaders = c.attached.map((u) => cr.byUid.get(u.uid)).filter((x): x is NonNullable<typeof x> => !!x?.ds);
    const parts = [...leaders, c];
    let n = 0;
    const models: TAModel[] = parts.flatMap((p) =>
      unitModels(p.ds!, p.models).map((m) => ({
        id: `${prefix}${c.unit.uid}.${n++}`,
        profile: m.profile,
        options: m.base.options,
        source: m.base.source,
        pick: 0,
        customMm: null,
        at: null,
      })),
    );
    out.push({
      uid: prefix + c.unit.uid,
      name: c.ds.name,
      leaders: leaders.map((l) => l.ds!.name),
      datasheetIds: parts.map((p) => p.ds!.id),
      points: parts.reduce((s, p) => s + p.total, 0),
      models,
      formation: 'tight',
      angle: DEFAULT_ANGLE,
      gap: DEFAULT_GAP,
      placed: false,
    });
  }
  return out;
}

/** Базы моделей на столе (для геометрии); у невыставленных — null. Овал повёрнут вдоль строя. */
export function placedBases(u: TAUnit): (Placed | null)[] {
  return u.models.map((m) => {
    if (!m.at) return null;
    const { rx, ry, rect } = baseRadii(modelBase(m).shape);
    return { x: m.at[0], y: m.at[1], rx, ry, angle: u.angle, ...(rect ? { rect } : {}) };
  });
}

/** Поставить (или перестроить) отряд построением с центром в center. */
export function placeUnit(u: TAUnit, center: Pt, kind: Formation = u.formation, angle = u.angle, gap = u.gap): TAUnit {
  const offs = formation(
    kind,
    u.models.map((m) => baseRadii(modelBase(m).shape)),
    gap,
    angle,
  );
  return {
    ...u,
    formation: kind,
    angle,
    gap,
    placed: true,
    models: u.models.map((m, i) => ({ ...m, at: [center[0] + offs[i]![0], center[1] + offs[i]![1]] })),
  };
}

/** Центр отряда (среднее выставленных моделей). */
export function unitCenter(u: TAUnit): Pt | null {
  const pts = u.models.map((m) => m.at).filter((p): p is Pt => !!p);
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/** Сдвинуть весь отряд. */
export function moveUnit(u: TAUnit, dx: number, dy: number): TAUnit {
  return { ...u, models: u.models.map((m) => (m.at ? { ...m, at: [m.at[0] + dx, m.at[1] + dy] } : m)) };
}

/** Сдвинуть одну модель. */
export function moveModel(u: TAUnit, id: string, to: Pt): TAUnit {
  return { ...u, models: u.models.map((m) => (m.id === id ? { ...m, at: to } : m)) };
}

/** Вернуть отряд в список (убрать со стола). */
export function removeUnit(u: TAUnit): TAUnit {
  return { ...u, placed: false, models: u.models.map((m) => ({ ...m, at: null })) };
}

/** Удержать точку на столе (центр базы не уходит за край). */
export const clampToBoard = ([x, y]: Pt, width = 60, height = 44): Pt => [Math.min(width, Math.max(0, x)), Math.min(height, Math.max(0, y))];

/** Повернуть выставленный отряд вокруг его центра (сохраняя ручные сдвиги моделей). */
export function rotateUnit(u: TAUnit, delta: number): TAUnit {
  const c = unitCenter(u);
  if (!c) return { ...u, angle: u.angle + delta };
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  return {
    ...u,
    angle: u.angle + delta,
    models: u.models.map((m) => {
      if (!m.at) return m;
      const dx = m.at[0] - c[0];
      const dy = m.at[1] - c[1];
      return { ...m, at: [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos] };
    }),
  };
}

/** База для всех моделей профиля: вариант из данных (pick) или свой размер (customMm, для баз без размера). */
export function setProfileBase(u: TAUnit, profile: string, change: { pick?: number; custom?: BaseShape | null; customMm?: number | null }): TAUnit {
  const models = u.models.map((m) => (m.profile === profile ? { ...m, ...change } : m));
  const next = { ...u, models };
  // размеры изменились — отряд перестраивается на том же месте, чтобы базы не налезали
  const c = unitCenter(u);
  return c ? placeUnit(next, c) : next;
}

/** Профили отряда для настройки баз: название, число моделей, варианты из данных, текущий выбор. */
export function unitProfiles(u: TAUnit): { profile: string; count: number; options: BaseShape[]; pick: number; custom: BaseShape | null; customMm: number | null; source: string }[] {
  const out = new Map<string, { profile: string; count: number; options: BaseShape[]; pick: number; custom: BaseShape | null; customMm: number | null; source: string }>();
  for (const m of u.models) {
    const e = out.get(m.profile);
    if (e) e.count++;
    else out.set(m.profile, { profile: m.profile, count: 1, options: m.options, pick: m.pick, custom: m.custom ?? null, customMm: m.customMm, source: m.source });
  }
  return [...out.values()];
}

/**
 * Сохранённая расстановка (на телефоне, по своему ростеру). v2 — армии (своя и соперника); v1 (до 30.10.2026) — только свои
 * отряды в units: читается как армия «me».
 */
export type TASave = { v: 2; rosterId: string; layoutId: string; side: Side; savedAt: string; armies: TAArmy[]; terrain?: WarcryTerrainSetup };

/**
 * Вернуть сохранённую расстановку на отряды из текущего ростера: позиции, построение, поворот, зазор и базы — там, где
 * отряд (uid) и модель (id и профиль) совпадают. Изменённый с тех пор ростер: новые отряды — не выставлены, удалённые — пропадают.
 */
export function restoreUnits(fresh: TAUnit[], saved: readonly TAUnit[]): TAUnit[] {
  const byUid = new Map(saved.map((u) => [u.uid, u]));
  return fresh.map((u) => {
    const s = byUid.get(u.uid);
    if (!s) return u;
    const byId = new Map(s.models.map((m) => [m.id, m]));
    const models = u.models.map((m) => {
      const o = byId.get(m.id);
      if (!o || o.profile !== m.profile) return m;
      return { ...m, at: o.at, pick: o.pick < m.options.length ? o.pick : 0, custom: o.custom ?? null, customMm: o.customMm ?? null };
    });
    const placed = models.some((m) => m.at);
    return { ...u, models, formation: s.formation, angle: s.angle, gap: s.gap, placed };
  });
}

/** Прочитать сохранение (повреждённое — null); старое v1 — как v2 со своей армией. */
export function parseSave(text: string | null): TASave | null {
  try {
    const v = JSON.parse(text ?? 'null') as (Omit<Partial<TASave>, 'v'> & { v?: number; units?: TAUnit[] }) | null;
    if (!v || typeof v.layoutId !== 'string' || typeof v.rosterId !== 'string' || (v.side !== 'attacker' && v.side !== 'defender')) return null;
    if (v.v === 1 && Array.isArray(v.units))
      return { v: 2, rosterId: v.rosterId, layoutId: v.layoutId, side: v.side, savedAt: v.savedAt ?? '', armies: [{ key: 'me', side: v.side, rosterId: v.rosterId, units: v.units }] };
    if (v.v === 2 && Array.isArray(v.armies) && v.armies.every((a) => a && (a.key === 'me' || a.key === 'foe') && Array.isArray(a.units)))
      return { v: 2, rosterId: v.rosterId, layoutId: v.layoutId, side: v.side, savedAt: v.savedAt ?? '', armies: v.armies, ...(v.terrain ? { terrain: v.terrain } : {}) };
    return null;
  } catch {
    return null;
  }
}
