/**
 * Test Army: состояние стола — армии (сейчас одна; место под армию соперника заложено — sides), отряды, модели.
 * Чистые функции без React: собрать отряды из ростера, поставить отряд построением, сдвинуть, повернуть.
 * Координаты — поле боя 60×44″ (x вдоль 60″), как в battlefield.json.
 */
import type { ComputedRoster } from '../engine/compute';
import { baseRadii, type BaseShape } from './bases';
import { formation, type Formation } from './formations';
import type { Placed, Pt } from './geometry';
import { unitModels } from './models';

/** База без размера в данных — размер задаёт игрок; до этого — 60 мм (стартовое значение, не правило). */
export const UNKNOWN_BASE_MM = 60;
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
  customMm: number | null;
  /** центр на столе; null — не выставлена */
  at: Pt | null;
};

export type TAUnit = {
  uid: string;
  name: string;
  /** персонажи, присоединённые к отряду (их модели — в начале списка models) */
  leaders: string[];
  datasheetIds: string[];
  points: number;
  models: TAModel[];
  formation: Formation;
  angle: number;
  gap: number;
  placed: boolean;
};

export type Side = 'attacker' | 'defender';

export type TAArmy = { side: Side; rosterId: string; units: TAUnit[] };

/** База модели для геометрии: из данных, свой размер или стартовые 60 мм. */
export function modelBase(m: TAModel): { shape: BaseShape; known: boolean } {
  const fromData = m.options[m.pick] ?? m.options[0];
  if (fromData) return { shape: fromData, known: true };
  return { shape: { kind: 'circle', d: m.customMm ?? UNKNOWN_BASE_MM }, known: m.customMm != null };
}

/** Отряды из ростера: присоединённые персонажи — вместе со своим отрядом. */
export function buildUnits(cr: ComputedRoster): TAUnit[] {
  const out: TAUnit[] = [];
  const attachedUids = new Set(cr.units.filter((c) => c.unit.attachedTo && cr.byUid.has(c.unit.attachedTo)).map((c) => c.unit.uid));
  for (const c of cr.units) {
    if (attachedUids.has(c.unit.uid) || !c.ds) continue;
    const leaders = c.attached.map((u) => cr.byUid.get(u.uid)).filter((x): x is NonNullable<typeof x> => !!x?.ds);
    const parts = [...leaders, c];
    let n = 0;
    const models: TAModel[] = parts.flatMap((p) =>
      unitModels(p.ds!, p.models).map((m) => ({
        id: `${c.unit.uid}.${n++}`,
        profile: m.profile,
        options: m.base.options,
        source: m.base.source,
        pick: 0,
        customMm: null,
        at: null,
      })),
    );
    out.push({
      uid: c.unit.uid,
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
    const { rx, ry } = baseRadii(modelBase(m).shape);
    return { x: m.at[0], y: m.at[1], rx, ry, angle: u.angle };
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
export const clampToBoard = ([x, y]: Pt): Pt => [Math.min(60, Math.max(0, x)), Math.min(44, Math.max(0, y))];
