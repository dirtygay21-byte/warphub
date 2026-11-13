import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { haptic, pushOverlay, tg } from '../../telegram';
import {
  APPROX_DEFAULT_MM,
  APPROX_SHAPES,
  APPROX_SIZES,
  approxBase,
  approxOf,
  baseLabel,
  baseToZone,
  clampToBoard,
  closestPoints,
  FORMATIONS,
  fmtInches,
  modelBase,
  moveModel,
  moveUnit,
  nearestEnemy,
  nearestObjective,
  OBJECTIVE_RANGE,
  objectiveRadius,
  pickBase,
  placeUnit,
  placedBases,
  removeUnit,
  resolveRuler,
  rotateUnit,
  setProfileBase,
  snapEnd,
  touchTolerance,
  unitCenter,
  unitProfiles,
  unitToUnit,
  unitToZones,
  type ApproxShape,
  type BaseShape,
  type Formation,
  type Placed,
  type Pt,
  type RulerEnd,
  type ArmyKey,
  type Side,
  type TAArmy,
  type TAUnit,
} from '../../testarmy';
import { Button, IconButton, Segmented } from '../kit';
import { cx } from '../util';

const SIDE_COLOR: Record<Side, string> = { attacker: '#f87171', defender: '#60a5fa' };
const ACCENT = '#eaff44';
const OUTSIDE = '#ff3b3b';
const GAPS = [0, 0.5, 1, 2];
/** удержание без движения — двигать одну модель */
const LONG_PRESS_MS = 450;
/** сдвиг пальца (дюймы поля), после которого это перетаскивание, а не нажатие */
const DRAG_START = 0.15;
/** палец в пределах стольких пикселей экрана от базы — это касание базы (мелкие базы меньше пальца) */
const TOUCH_PX = 14;
/** сдвиг пальца (px), после которого нажатие на поле — это прокрутка, а не «поставить сюда» */
const TAP_SLOP = 8;
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const BoardDimensions = createContext<{ width: number; height: number; orientation: 'portrait' | 'landscape' }>({ width: 60, height: 44, orientation: 'portrait' });
const useDisp = () => {
  const { height, orientation } = useContext(BoardDimensions);
  return useCallback(([x, y]: Pt): Pt => (orientation === 'landscape' ? [x, y] : [height - y, x]), [height, orientation]);
};

/**
 * Армия на столе для Board — без привязки к игровой системе (40K / AoS, 30.10.2026): имя ростера, строка характеристик
 * отряда и карточка отряда даёт экран своей системы.
 */
export type BoardArmy = TAArmy & { name: string; stats: (u: TAUnit) => string | null; info: (u: TAUnit, onClose: () => void) => ReactNode };
/**
 * Поле: картинка (svg с тем же viewBox «-1.5 -1.5 47 63», поле повёрнуто как в BattleMap), цели, точки привязки линейки,
 * зоны деплоя / территории сторон (многоугольники в дюймах поля 60×44) и подпись правила целей.
 */
export type BoardField = {
  title: string;
  background: ReactNode;
  objectives: { x: number; y: number; role: string | null }[];
  snapPoints: Pt[];
  /** части зоны стороны (у 40K — одна, у территорий AoS бывает несколько) */
  zones: Partial<Record<Side, Pt[][]>>;
  objectiveNote: string;
  /** Размер поля в дюймах; по умолчанию 60×44 (40K/AoS), у Kill Team/Warcry — 30×22. */
  width?: number;
  height?: number;
  /** По умолчанию 3″ (40K/AoS); у Kill Team — 1″. */
  objectiveRange?: number;
  /** Официальные skirmish-карты показываются в landscape без поворота подписей. */
  orientation?: 'portrait' | 'landscape';
};

type Tool = 'move' | 'ruler' | 'units';
const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: 'move', icon: '✋', label: 'Двигать' },
  { id: 'ruler', icon: '📏', label: 'Линейка' },
  { id: 'units', icon: '⇔', label: 'Отряды' },
];

type Drag = { uid: string; modelId: string | null; start: Pt; orig: TAUnit; moved: boolean; timer: number | undefined; pointerId: number };
type View = { s: number; tx: number; ty: number };
/** жест по пустому полю: прокрутка одним пальцем, масштаб двумя; без сдвига — нажатие */
type Gesture = {
  pts: Map<number, { x: number; y: number }>;
  start: { x: number; y: number; t: number } | null;
  moved: boolean;
  pinch: { d0: number; m0: { x: number; y: number }; v0: View } | null;
  pan: { x: number; y: number; v0: View } | null;
};

/**
 * Стол Test Army (29.10.2026: поле — главное). Карта на весь экран; жесты обрабатывает приложение, а не браузер:
 * палец на базе — двигается модель или отряд (поле стоит на месте), палец на пустом поле — прокрутка, два пальца — масштаб,
 * короткое нажатие — «поставить сюда» / точка линейки. Инструменты — узкая колонка справа, отряды и настройки — выезжающая
 * панель справа (закрывается, когда нужно нажать на поле).
 */
/** Симулятор боя (S2, 08.11.2026): лист атаки отряда по цели; только 40K (передаёт TestArmyScreen). */
export type CombatRender = (a: { attacker: TAUnit; attackerArmy: BoardArmy; target: TAUnit; targetArmy: BoardArmy; distance: number | null }, onClose: () => void) => ReactNode;

export function Board(props: {
  armies: BoardArmy[];
  field: BoardField;
  onArmy: (key: ArmyKey, units: TAUnit[]) => void;
  onBack: () => void;
  combat?: CombatRender;
}) {
  const width = props.field.width ?? 60;
  const height = props.field.height ?? 44;
  const orientation = props.field.orientation ?? 'portrait';
  return (
    <BoardDimensions.Provider value={{ width, height, orientation }}>
      <BoardInner {...props} />
    </BoardDimensions.Provider>
  );
}

function BoardInner({
  armies,
  field,
  onArmy,
  onBack,
  combat,
}: {
  /** своя армия (me) и, если выбрана, армия соперника (foe) — за другую сторону */
  armies: BoardArmy[];
  field: BoardField;
  onArmy: (key: ArmyKey, units: TAUnit[]) => void;
  onBack: () => void;
  combat?: CombatRender;
}) {
  const { width, height, orientation } = useContext(BoardDimensions);
  const disp = useDisp();
  const undisp = ([dx, dy]: Pt): Pt => (orientation === 'landscape' ? [dx, dy] : [dy, height - dx]);
  const clamp = (p: Pt) => clampToBoard(p, width, height);
  const mapAspect = (height + 3) / (width + 3);
  const viewBox = orientation === 'landscape' ? `-1.5 -1.5 ${width + 3} ${height + 3}` : `-1.5 -1.5 ${height + 3} ${width + 3}`;
  const me = armies.find((a) => a.key === 'me')!;
  const foe = armies.find((a) => a.key === 'foe') ?? null;
  const side = me.side;
  // все отряды обеих армий; армия отряда и подпись: свои 1, 2…, соперника С1, С2…
  const units = useMemo(() => armies.flatMap((a) => a.units), [armies]);
  const armyOf = (uid: string): BoardArmy => armies.find((a) => a.units.some((u) => u.uid === uid)) ?? me;
  const label = (u: TAUnit) => {
    const a = armyOf(u.uid);
    const i = a.units.findIndex((x) => x.uid === u.uid) + 1;
    return a.key === 'foe' ? `С${i}` : String(i);
  };
  const [tab, setTab] = useState<ArmyKey>('me');
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [single, setSingle] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('move');
  const [ranges, setRanges] = useState(false);
  const [ruler, setRuler] = useState<{ a: RulerEnd | null; b: RulerEnd | null }>({ a: null, b: null });
  const [pair, setPair] = useState<string[]>([]);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  // атака: выбран атакующий отряд — следующее нажатие на отряд другой армии выбирает цель
  const [attackFrom, setAttackFrom] = useState<string | null>(null);
  const [attack, setAttack] = useState<{ from: string; to: string } | null>(null);
  const infoUnit = units.find((u) => u.uid === infoFor) ?? null;
  const endDrag = useRef<{ which: 'a' | 'b'; pointerId: number } | null>(null);
  const sel = units.find((u) => u.uid === selected) ?? null;
  const placedCount = me.units.filter((u) => u.placed).length;
  const foePlaced = foe ? foe.units.filter((u) => u.placed).length : 0;

  // ---------- масштаб и прокрутка (свои, без прокрутки браузера) ----------
  const [size, setSize] = useState({ w: 0, h: 0 });
  const view = useRef<View>({ s: 1, tx: 0, ty: 0 });
  const gesture = useRef<Gesture>({ pts: new Map(), start: null, moved: false, pinch: null, pan: null });
  // карта при масштабе 1 — вписана в экран
  const base = useMemo(() => {
    const w = Math.min(size.w, size.h * mapAspect);
    return { w, h: w / mapAspect };
  }, [size, mapAspect]);
  const apply = useCallback(
    (v: View) => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s));
      const cw = base.w * s;
      const ch = base.h * s;
      // карта не уезжает с экрана больше чем на треть
      const clamp = (t: number, c: number, vp: number) => Math.min(Math.max(t, Math.min(0, vp - c) - vp / 3), Math.max(0, vp - c) + vp / 3);
      const next = { s, tx: clamp(v.tx, cw, size.w), ty: clamp(v.ty, ch, size.h) };
      view.current = next;
      if (content.current) content.current.style.transform = `translate(${next.tx}px, ${next.ty}px) scale(${next.s})`;
    },
    [base, size],
  );
  const fit = useCallback(() => apply({ s: 1, tx: (size.w - base.w) / 2, ty: (size.h - base.h) / 2 }), [apply, size, base]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (size.w) fit();
  }, [size, fit]);
  // «Назад» Telegram сначала закрывает панель отрядов
  useEffect(() => (panel ? pushOverlay(() => setPanel(false)) : undefined), [panel]);
  // Telegram: свайп вниз по полю не должен сворачивать приложение (пока открыт стол)
  useEffect(() => {
    const was = tg?.isVerticalSwipesEnabled;
    tg?.disableVerticalSwipes?.();
    return () => {
      if (was !== false) tg?.enableVerticalSwipes?.();
    };
  }, []);
  const zoomBy = (k: number) => {
    const v = view.current;
    const cx0 = size.w / 2;
    const cy0 = size.h / 2;
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * k));
    apply({ s, tx: cx0 - ((cx0 - v.tx) / v.s) * s, ty: cy0 - ((cy0 - v.ty) / v.s) * s });
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = viewport.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const update = (u: TAUnit) => {
    const a = armyOf(u.uid);
    onArmy(a.key, a.units.map((x) => (x.uid === u.uid ? u : x)));
  };

  // экранная точка → точка поля (getScreenCTM учитывает масштаб и сдвиг)
  const toBoard = (clientX: number, clientY: number): Pt | null => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return undisp([p.x, p.y]);
  };
  // модели вне своей зоны деплоя (база не целиком в зоне) — подсветка
  // у каждой армии — своя зона
  const outside = useMemo(() => {
    const set = new Set<string>();
    for (const a of armies) {
      const z = field.zones[a.side];
      if (!z) continue;
      for (const u of a.units)
        placedBases(u).forEach((b, i) => {
          if (b && !z.some((p) => baseToZone(b, p).whollyInside)) set.add(u.models[i]!.id);
        });
    }
    return set;
  }, [armies, field]);

  // все базы на столе (для линейки и расстояний)
  const allBases = useMemo(() => {
    const out: { modelId: string; uid: string; base: Placed }[] = [];
    for (const u of units) placedBases(u).forEach((b, i) => b && out.push({ modelId: u.models[i]!.id, uid: u.uid, base: b }));
    return out;
  }, [units]);
  const baseOf = (id: string) => allBases.find((x) => x.modelId === id)?.base ?? null;
  // привязка линейки: центры целей и углы участков террейна
  const snapPoints = useMemo<Pt[]>(
    () => field.snapPoints,
    [field],
  );
  const rulerLine = ruler.a && ruler.b ? resolveRuler(ruler.a, ruler.b, baseOf) : null;
  const rulerA = ruler.a ? (ruler.a.kind === 'pt' ? ruler.a.at : (() => { const b = baseOf(ruler.a.modelId); return b ? ([b.x, b.y] as Pt) : null; })()) : null;
  const unitsOf = (uid: string) => allBases.filter((x) => x.uid === uid).map((x) => x.base);
  const pairLine = (() => {
    if (pair.length < 2) return null;
    const a = unitsOf(pair[0]!);
    const b = unitsOf(pair[1]!);
    if (!a.length || !b.length) return null;
    const r = unitToUnit(a, b);
    const [from, to] = closestPoints(a[r.i]!, b[r.j]!);
    return { from, to, d: r.d };
  })();
  // выбранный отряд: до ближайшей цели, до зон деплоя (своей армии и другой) и до ближайшего врага
  const selBases = sel ? unitsOf(sel.uid) : [];
  const selArmy = sel ? armyOf(sel.uid) : me;
  const ownZone = field.zones[selArmy.side] ?? null;
  const enemyZone = field.zones[selArmy.side === 'attacker' ? 'defender' : 'attacker'] ?? null;
  const enemyArmy = armies.find((a) => a.key !== selArmy.key);
  const info = selBases.length
    ? {
        objective: nearestObjective(selBases, field.objectives, field.objectiveRange ?? OBJECTIVE_RANGE),
        own: ownZone ? unitToZones(selBases, ownZone) : null,
        enemy: enemyZone ? unitToZones(selBases, enemyZone) : null,
        foe: enemyArmy ? nearestEnemy(selBases, allBases.filter((x) => enemyArmy.units.some((u) => u.uid === x.uid))) : null,
      }
    : null;

  // короткое нажатие на поле: линейка — точка; иначе выбранный отряд встаёт центром сюда
  const onTap = (clientX: number, clientY: number) => {
    const p = toBoard(clientX, clientY);
    if (!p) return;
    if (tool === 'ruler') {
      const end = snapEnd(clamp(p), allBases, snapPoints, Math.max(0.4, tolerance()));
      setRuler((r) => (!r.a || r.b ? { a: end, b: null } : { a: r.a, b: end }));
      haptic.select();
      return;
    }
    if (tool === 'units' || !sel) return;
    update(placeUnit(sel, clamp(p)));
    haptic.select();
  };

  // допуск касания базы в дюймах поля — постоянный в пикселях экрана при любом масштабе
  const tolerance = () => touchTolerance(TOUCH_PX, base.w * view.current.s);

  // палец на базе (или рядом, до TOUCH_PX): весь отряд; удержание без движения — одна модель. Поле в это время не двигается.
  const startModel = (e: PointerEvent, unit: TAUnit, modelId: string) => {
    if (attackFrom) {
      if (armyOf(unit.uid).key !== armyOf(attackFrom).key) {
        setAttack({ from: attackFrom, to: unit.uid });
        setAttackFrom(null);
        haptic.select();
      }
      return;
    }
    if (tool === 'units') {
      setPair((p) => (p.length >= 2 || p[0] === unit.uid ? [unit.uid] : [...p, unit.uid]));
      haptic.select();
      return;
    }
    const p = toBoard(e.clientX, e.clientY);
    if (!p) return;
    setSelected(unit.uid);
    const d: Drag = { uid: unit.uid, modelId: null, start: p, orig: unit, moved: false, timer: undefined, pointerId: e.pointerId };
    d.timer = window.setTimeout(() => {
      if (drag.current === d && !d.moved) {
        d.modelId = modelId;
        setSingle(modelId);
        haptic.select();
      }
    }, LONG_PRESS_MS);
    drag.current = d;
    viewport.current?.setPointerCapture(e.pointerId);
  };
  const onEndDown = (e: PointerEvent, which: 'a' | 'b') => {
    e.stopPropagation();
    endDrag.current = { which, pointerId: e.pointerId };
    viewport.current?.setPointerCapture(e.pointerId);
  };

  // нажатие: рядом с базой — модель/отряд (выбранный отряд первым); иначе поле: один палец — прокрутка (или нажатие,
  // если не сдвинулся), два — масштаб. Пока тянется модель, другие пальцы не учитываются.
  const onDown = (e: PointerEvent) => {
    if (drag.current) return;
    const g = gesture.current;
    if (g.pts.size === 0 && tool !== 'ruler') {
      const bp = toBoard(e.clientX, e.clientY);
      // выбран отряд, который ещё не на столе: нажатие рядом с чужими базами ставит его, а не хватает их (только точно по базе)
      const tol = sel && !sel.placed && tool === 'move' ? 0 : tolerance();
      const hit = bp ? pickBase(bp, allBases, tol, selected) : null;
      const unit = hit ? units.find((u) => u.uid === hit.uid) : undefined;
      if (hit && unit) {
        startModel(e, unit, hit.modelId);
        return;
      }
    }
    const p = local(e);
    g.pts.set(e.pointerId, p);
    viewport.current?.setPointerCapture(e.pointerId);
    if (g.pts.size === 1) {
      g.start = { x: p.x, y: p.y, t: e.timeStamp };
      g.moved = false;
      g.pan = { x: p.x, y: p.y, v0: { ...view.current } };
      g.pinch = null;
    } else if (g.pts.size === 2) {
      const [a, b] = [...g.pts.values()];
      g.pinch = { d0: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, m0: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }, v0: { ...view.current } };
      g.pan = null;
      g.moved = true;
    }
  };
  const onMove = (e: PointerEvent) => {
    const ed = endDrag.current;
    if (ed && e.pointerId === ed.pointerId) {
      const p = toBoard(e.clientX, e.clientY);
      if (p) setRuler((r) => ({ ...r, [ed.which]: snapEnd(clamp(p), allBases, snapPoints) }));
      return;
    }
    const d = drag.current;
    if (d && e.pointerId === d.pointerId) {
      const p = toBoard(e.clientX, e.clientY);
      if (!p) return;
      const dx = p[0] - d.start[0];
      const dy = p[1] - d.start[1];
      if (!d.moved && Math.hypot(dx, dy) < DRAG_START / view.current.s) return;
      if (!d.moved) window.clearTimeout(d.timer);
      d.moved = true;
      if (d.modelId) {
        const m = d.orig.models.find((x) => x.id === d.modelId);
        if (m?.at) update(moveModel(d.orig, d.modelId, clamp([m.at[0] + dx, m.at[1] + dy])));
      } else update(moveUnit(d.orig, dx, dy));
      return;
    }
    const g = gesture.current;
    if (!g.pts.has(e.pointerId)) return;
    const p = local(e);
    g.pts.set(e.pointerId, p);
    if (g.pinch && g.pts.size >= 2) {
      const [a, b] = [...g.pts.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const m = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const { v0, d0, m0 } = g.pinch;
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (v0.s * dist) / d0));
      // точка карты под пальцами остаётся под пальцами
      const cx0 = (m0.x - v0.tx) / v0.s;
      const cy0 = (m0.y - v0.ty) / v0.s;
      apply({ s, tx: m.x - cx0 * s, ty: m.y - cy0 * s });
      return;
    }
    if (g.pan) {
      const dx = p.x - g.pan.x;
      const dy = p.y - g.pan.y;
      if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      g.moved = true;
      apply({ ...g.pan.v0, tx: g.pan.v0.tx + dx, ty: g.pan.v0.ty + dy });
    }
  };
  const onUp = (e: PointerEvent) => {
    if (endDrag.current?.pointerId === e.pointerId) {
      endDrag.current = null;
      return;
    }
    const d = drag.current;
    if (d && e.pointerId === d.pointerId) {
      window.clearTimeout(d.timer);
      drag.current = null;
      setSingle(null);
      return;
    }
    const g = gesture.current;
    if (!g.pts.has(e.pointerId)) return;
    g.pts.delete(e.pointerId);
    const tap = e.type === 'pointerup' && !g.moved && g.start && e.timeStamp - g.start.t < 600 && g.pts.size === 0;
    if (g.pts.size === 0) {
      g.pinch = null;
      g.pan = null;
      g.start = null;
    } else if (g.pts.size === 1) {
      // убрали один палец из двух — продолжаем прокрутку оставшимся
      const [p] = [...g.pts.values()];
      g.pinch = null;
      g.pan = { x: p!.x, y: p!.y, v0: { ...view.current } };
    }
    if (tap) onTap(e.clientX, e.clientY);
  };

  const setFormation = (f: Formation) => {
    if (!sel) return;
    const c = unitCenter(sel);
    update(c ? placeUnit(sel, c, f) : { ...sel, formation: f });
  };
  const chooseTool = (t: Tool) => {
    haptic.select();
    setAttackFrom(null);
    setTool(t);
    setRuler({ a: null, b: null });
    setPair([]);
    setPanel(false);
  };

  // строка состояния поверх карты: что сейчас делать и результат измерения
  const attacker = attackFrom ? units.find((u) => u.uid === attackFrom) : null;
  const status: ReactNode = attacker ? (
    <>
      <b className="text-white">⚔ {label(attacker)}. {attacker.name}</b> · нажмите на отряд соперника ·{' '}
      <button type="button" className="pointer-events-auto font-semibold text-accent underline" onClick={() => setAttackFrom(null)}>
        отмена
      </button>
    </>
  ) :
    tool === 'ruler' ? (
      rulerLine ? (
        <>
          Линейка: <b className="text-white">{fmtInches(rulerLine.d)}</b> · концы можно тянуть · новое нажатие — новая линейка
        </>
      ) : ruler.a ? (
        'Нажмите вторую точку'
      ) : (
        'Нажмите первую точку — на поле или на базу (меряет от края)'
      )
    ) : tool === 'units' ? (
      pairLine ? (
        <>
          Отряды {label(units.find((u) => u.uid === pair[0])!)} ↔ {label(units.find((u) => u.uid === pair[1])!)}: <b className="text-white">{fmtInches(pairLine.d)}</b> · от края до края
        </>
      ) : pair.length === 1 ? (
        'Нажмите второй отряд'
      ) : (
        'Нажмите на базу первого отряда, затем второго'
      )
    ) : sel ? (
      <>
        <b className="text-white">
          {label(sel)}. {sel.name}
        </b>
        {info?.objective ? <> · до цели {fmtInches(info.objective.d)}{info.objective.inRange ? ' ✓' : ''}</> : null}
        {info?.foe ? <> · до врага {fmtInches(info.foe.d)}</> : null}
        {sel.placed ? ' · тяните базу' : ' · нажмите на поле, чтобы поставить'}
      </>
    ) : (
      <>
        На столе {placedCount} из {me.units.length}
        {foe && ` · соперник ${foePlaced} из ${foe.units.length}`}
        {outside.size > 0 && <span className="text-[#ff6b6b]"> · вне зоны: {outside.size}</span>} · «Отряды» справа
      </>
    );

  return (
    <div className="fixed inset-0 z-40 flex bg-app">
      {infoUnit && armyOf(infoUnit.uid).info(infoUnit, () => setInfoFor(null))}
      {attack && combat && (() => {
        const a = units.find((u) => u.uid === attack.from);
        const t = units.find((u) => u.uid === attack.to);
        if (!a || !t) return null;
        const ab = unitsOf(a.uid);
        const tb = unitsOf(t.uid);
        const distance = ab.length && tb.length ? unitToUnit(ab, tb).d : null;
        return combat({ attacker: a, attackerArmy: armyOf(a.uid), target: t, targetArmy: armyOf(t.uid), distance }, () => setAttack(null));
      })()}

      {/* поле: жесты — свои (touch-action: none), браузер ничего не прокручивает */}
      <div
        ref={viewport}
        className="relative min-w-0 flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div ref={content} className="absolute left-0 top-0 origin-top-left" style={{ width: base.w, height: base.h }}>
          {field.background}
          <svg ref={svg} viewBox={viewBox} className="absolute inset-0 h-full w-full">
            {ranges &&
              field.objectives.map((o, i) => {
                const [x, y] = disp([o.x, o.y]);
                return <circle key={i} cx={x} cy={y} r={objectiveRadius + (field.objectiveRange ?? OBJECTIVE_RANGE)} fill="#eaff44" fillOpacity={0.06} stroke="#eaff44" strokeOpacity={0.7} strokeWidth={0.1} strokeDasharray="0.5 0.35" pointerEvents="none" />;
              })}
            {units.map((u) => (
              <UnitShapes
                key={u.uid}
                unit={u}
                n={label(u)}
                color={SIDE_COLOR[armyOf(u.uid).side]}
                active={tool === 'units' ? pair.includes(u.uid) : u.uid === selected}
                single={single}
                outside={outside}
              />
            ))}
            {tool === 'move' && info?.objective && <Measure from={info.objective.from} to={info.objective.to} d={info.objective.d} color={info.objective.inRange ? '#4ade80' : ACCENT} dashed />}
            {tool === 'move' && info?.enemy && info.enemy.d > 0 && !info.foe && <Measure from={info.enemy.from} to={info.enemy.to} d={info.enemy.d} color={selArmy.side === 'attacker' ? SIDE_COLOR.defender : SIDE_COLOR.attacker} dashed />}
            {tool === 'move' && info?.foe && <Measure from={info.foe.from} to={info.foe.to} d={info.foe.d} color="#ffffff" dashed />}
            {tool === 'units' && pairLine && <Measure from={pairLine.from} to={pairLine.to} d={pairLine.d} color="#fff" />}
            {tool === 'ruler' && rulerLine && <Measure from={rulerLine.from} to={rulerLine.to} d={rulerLine.d} color="#fff" handles onHandle={onEndDown} />}
            {tool === 'ruler' && !rulerLine && rulerA && <circle cx={disp(rulerA)[0]} cy={disp(rulerA)[1]} r={0.35} fill="#fff" pointerEvents="none" />}
          </svg>
        </div>
        <p className="pointer-events-none absolute left-2 right-2 top-[max(0.5rem,env(safe-area-inset-top))] line-clamp-2 rounded-lg bg-black/75 px-2.5 py-1.5 text-[13px] leading-snug text-white/85">
          {status}
        </p>
        {!panel && !sel && tool === 'move' && placedCount < me.units.length && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => (haptic.select(), setPanel(true))}
            className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-[0_6px_20px_rgba(0,0,0,0.5)] active:opacity-80"
          >
            Выставить отряды · {placedCount}/{me.units.length}
          </button>
        )}
      </div>

      {/* колонка инструментов справа */}
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-l border-white/10 bg-app-elevated py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
        <RailButton icon="‹" label="Назад" onClick={onBack} />
        <RailButton icon="☰" label="Отряды" active={panel} onClick={() => (haptic.select(), setPanel((v) => !v))} />
        <span className="my-0.5 h-px w-8 bg-white/10" />
        {TOOLS.map((t) => (
          <RailButton key={t.id} icon={t.icon} label={t.label} active={tool === t.id} onClick={() => chooseTool(t.id)} />
        ))}
        <RailButton icon="◎" label={field.objectives.length ? `Цели ${field.objectiveRange ?? OBJECTIVE_RANGE}″` : 'Зоны 3″'} active={ranges} onClick={() => setRanges((v) => !v)} />
        {tool === 'ruler' && ruler.a && <RailButton icon="✕" label="Сброс" onClick={() => setRuler({ a: null, b: null })} />}
        <span className="flex-1" />
        <RailButton icon="+" label="Крупнее" onClick={() => zoomBy(1.4)} />
        <RailButton icon="−" label="Мельче" onClick={() => zoomBy(1 / 1.4)} />
        <RailButton icon="⤢" label="Всё поле" onClick={fit} />
      </nav>

      {/* выезжающая панель справа: отряды или выбранный отряд */}
      {panel && (
        <aside className="sheet-enter absolute bottom-0 right-14 z-10 flex flex-col border-white/10 bg-app-elevated shadow-[0_-12px_32px_rgba(0,0,0,0.5)] portrait:left-0 portrait:max-h-[58%] portrait:rounded-tl-2xl portrait:border-t landscape:top-0 landscape:w-[min(82vw,340px)] landscape:border-l">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-display truncate text-base font-semibold uppercase leading-none">Test Army</p>
              <p className="mt-0.5 truncate text-[12px] text-fg-3">
                {me.name} · {field.title} · {side === 'attacker' ? 'атакующий' : 'защитник'}
                {foe && ` · соперник: ${foe.name}`}
              </p>
            </div>
            <IconButton icon="close" label="Закрыть" onClick={() => setPanel(false)} className="size-10" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {sel ? (
              <UnitPanel
                unit={sel}
                n={label(sel)}
                onFormation={setFormation}
                onRotate={(deg) => update(rotateUnit(sel, (deg * Math.PI) / 180))}
                onGap={(gap) => {
                  const c = unitCenter(sel);
                  update(c ? placeUnit(sel, c, sel.formation, sel.angle, gap) : { ...sel, gap });
                }}
                onBase={(profile, change) => update(setProfileBase(sel, profile, change))}
                onRemove={() => update(removeUnit(sel))}
                onDone={() => setSelected(null)}
                info={info}
                side={selArmy.side}
                stats={selArmy.stats(sel)}
                onInfo={() => setInfoFor(sel.uid)}
                onPlace={() => (setTool('move'), setPanel(false))}
                onAttack={
                  combat && enemyArmy?.units.length
                    ? () => {
                        haptic.select();
                        setTool('move');
                        setAttackFrom(sel.uid);
                        setPanel(false);
                      }
                    : undefined
                }
              />
            ) : (
              <>
                {foe && (
                  <Segmented<ArmyKey>
                    className="mb-2"
                    value={tab}
                    onChange={setTab}
                    options={[
                      { value: 'me', label: `Моя армия · ${placedCount}/${me.units.length}` },
                      { value: 'foe', label: `Соперник · ${foePlaced}/${foe.units.length}` },
                    ]}
                  />
                )}
                <UnitList
                  units={(tab === 'foe' && foe ? foe : me).units}
                  label={label}
                  color={SIDE_COLOR[(tab === 'foe' && foe ? foe : me).side]}
                  onSelect={(uid) => (haptic.select(), setSelected(uid), setTool('move'))}
                />
              </>
            )}
            {ranges && <p className="mt-3 text-[12px] text-fg-3">Круги целей: {field.objectiveNote}</p>}
          </div>
        </aside>
      )}
    </div>
  );
}

function RailButton({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'flex min-h-11 w-[3.25rem] flex-col items-center justify-center rounded-lg py-1 text-[10.5px] font-semibold leading-tight',
        active ? 'bg-accent/20 text-accent' : 'text-fg-2 active:bg-white/10',
      )}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="mt-0.5 w-full truncate text-center">{label}</span>
    </button>
  );
}

/** Базы отряда на столе и номер отряда в центре; красная обводка — база не целиком в своей зоне деплоя. */
function UnitShapes({
  unit,
  n,
  color,
  active,
  single,
  outside,
}: {
  unit: TAUnit;
  n: string;
  color: string;
  active: boolean;
  single: string | null;
  outside: Set<string>;
}) {
  const disp = useDisp();
  const bases = placedBases(unit);
  const c = unitCenter(unit);
  if (!c) return null;
  const [cx0, cy0] = disp(c);
  return (
    <g style={{ cursor: 'grab' }}>
      {bases.map((b, i) => {
        if (!b) return null;
        const m = unit.models[i]!;
        const [x, y] = disp([b.x, b.y]);
        const known = modelBase(m).known;
        const out = outside.has(m.id);
        const common = {
          transform: `rotate(${(b.angle * 180) / Math.PI + 90} ${x} ${y})`,
          fill: color,
          fillOpacity: single === m.id ? 0.85 : active ? 0.55 : 0.35,
          stroke: out ? OUTSIDE : active ? ACCENT : color,
          strokeWidth: out || active ? 0.14 : 0.08,
          strokeDasharray: known ? undefined : '0.25 0.18',
        };
        // квадрат — примерный «след» техники без базы
        return b.rect ? (
          <rect key={m.id} x={x - b.rx} y={y - b.ry} width={2 * b.rx} height={2 * b.ry} rx={0.12} {...common} />
        ) : (
          <ellipse key={m.id} cx={x} cy={y} rx={b.rx} ry={b.ry} {...common} />
        );
      })}
      <text x={cx0} y={cy0 + 0.32} textAnchor="middle" fontSize={0.95} fontWeight={700} fill="#fff" pointerEvents="none" style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,0.7)" strokeWidth={0.18}>
        {n}
      </text>
    </g>
  );
}

/** Список отрядов: номер, название, моделей, на столе ли. */
function UnitList({ units, label, color, onSelect }: { units: TAUnit[]; label: (u: TAUnit) => string; color: string; onSelect: (uid: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-[12px] text-fg-3">Выберите отряд, затем «Поставить на поле».</p>
      <ul className="space-y-1.5">
        {units.map((u) => (
          <li key={u.uid}>
            <button
              type="button"
              onClick={() => onSelect(u.uid)}
              className={cx('w-full rounded-xl border px-2.5 py-2 text-left', u.placed ? 'border-accent/40 bg-accent/[0.07]' : 'border-white/10 bg-white/[0.03] active:bg-white/10')}
            >
              <span className="flex items-center gap-2">
                <b className="grid size-7 shrink-0 place-items-center rounded-full border text-[13px]" style={{ color, borderColor: color }}>
                  {label(u)}
                </b>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-sm font-semibold leading-tight">{u.name}</span>
                  <span className="block text-[12px] text-fg-3">моделей: {u.models.length}</span>
                </span>
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', u.placed ? 'bg-accent/20 text-accent' : 'bg-white/10 text-fg-2')}>{u.placed ? 'на столе' : 'поставить'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Модель без размера базы в данных: форма (круг, квадрат, овал) и примерный размер — расстановка ориентировочная. */
function ApproxPicker({ source, value, onChange }: { source: string; value: BaseShape | null; onChange: (b: BaseShape) => void }) {
  const cur = value ? approxOf(value) : { shape: 'circle' as ApproxShape, mm: APPROX_DEFAULT_MM };
  return (
    <div className="mt-1 space-y-1.5">
      <p className="text-warn">
        В данных: «{source || 'нет данных'}» — выберите форму и примерный размер{value ? '' : ' (сейчас круг 120 мм)'}.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {APPROX_SHAPES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(approxBase(s.id, cur.mm))}
            className={cx('rounded-lg border px-2.5 py-1 font-semibold', value && cur.shape === s.id ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 bg-white/[0.04]')}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {APPROX_SIZES.map((mm) => (
          <button
            key={mm}
            type="button"
            onClick={() => onChange(approxBase(cur.shape, mm))}
            className={cx('rounded-lg border px-2 py-1 font-semibold', value && cur.mm === mm ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 bg-white/[0.04]')}
          >
            ~{mm} мм
          </button>
        ))}
      </div>
      {value && <p className="text-fg-3">Примерно: {baseLabel(value)}</p>}
    </div>
  );
}

/** Выбранный отряд: построение, поворот, зазор, базы (размер для баз без данных), убрать со стола. */
function UnitPanel({
  unit,
  n,
  onFormation,
  onRotate,
  onGap,
  onBase,
  onRemove,
  onDone,
  info,
  side,
  stats,
  onInfo,
  onPlace,
  onAttack,
}: {
  unit: TAUnit;
  n: string;
  onFormation: (f: Formation) => void;
  onRotate: (deg: number) => void;
  onGap: (gap: number) => void;
  onBase: (profile: string, change: { pick?: number; custom?: BaseShape | null }) => void;
  onRemove: () => void;
  onDone: () => void;
  info: {
    objective: { d: number; inRange: boolean } | null;
    own: { d: number } | null;
    enemy: { d: number } | null;
    foe: { d: number } | null;
  } | null;
  side: Side;
  /** «M 6″ · T 4 · …» первого профиля */
  stats: string | null;
  onInfo: () => void;
  /** закрыть панель и нажать на поле, чтобы поставить отряд */
  onPlace: () => void;
  /** «Атаковать» (симулятор боя, только 40K; нет армии соперника — кнопки нет) */
  onAttack?: () => void;
}) {
  const [bases, setBases] = useState(false);
  const profiles = useMemo(() => unitProfiles(unit), [unit]);
  const summary = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of unit.models) {
      const b = modelBase(x);
      const k = b.known ? baseLabel(b.shape) : `размер базы не указан (${x.source || 'нет данных'})`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m];
  }, [unit]);
  const unknown = profiles.some((p) => !p.options.length && !p.custom && p.customMm == null);
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {n}. {unit.name}
          </p>
          {unit.leaders.length > 0 && <p className="text-[12px] text-fg-3">с персонажами: {unit.leaders.join(', ')}</p>}
          {unit.tags?.length ? <p className="text-[12px] text-fg-3">{unit.tags.join(' · ')}</p> : null}
          <p className={cx('text-[12px]', unknown ? 'text-warn' : 'text-fg-3')}>{summary.map(([k, c]) => `${c} × ${k}`).join(' · ')}</p>
        </div>
        <IconButton icon="close" label="К списку отрядов" onClick={onDone} className="size-10" />
      </div>
      <button type="button" onClick={onInfo} className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-left text-xs active:bg-white/10">
        <span className="min-w-0 flex-1 truncate tabular-nums text-white/80">{stats ?? 'Характеристики'}</span>
        <span className="shrink-0 font-semibold text-accent">Характеристики ›</span>
      </button>
      <div className="flex gap-2">
        <Button variant={unit.placed && onAttack ? 'outline' : 'primary'} className="min-w-0 flex-1" onClick={onPlace}>
          {unit.placed ? 'Переставить' : 'Поставить на поле'}
        </Button>
        {onAttack && (
          <Button variant="primary" className="min-w-0 flex-1" onClick={onAttack}>
            ⚔ Атаковать
          </Button>
        )}
      </div>
      {info && (
        <div className="grid grid-cols-3 gap-1.5 text-center text-[12px]">
          <div className={cx('rounded-lg border px-1.5 py-1', info.objective?.inRange ? 'border-[#4ade80]/50 text-[#4ade80]' : 'border-white/10')}>
            <span className="block text-fg-3">до цели</span>
            <b className="text-sm">{info.objective ? fmtInches(info.objective.d) : '—'}</b>
            {info.objective?.inRange && <span className="block">в дальности</span>}
          </div>
          <div className="rounded-lg border border-white/10 px-1.5 py-1">
            <span className="block text-fg-3">до своей зоны</span>
            <b className="text-sm">{info.own ? (info.own.d ? fmtInches(info.own.d) : 'в зоне') : '—'}</b>
          </div>
          <div className="rounded-lg border border-white/10 px-1.5 py-1">
            <span className="block text-fg-3">до зоны {side === 'attacker' ? 'защитника' : 'атакующего'}</span>
            <b className="text-sm">{info.enemy ? (info.enemy.d ? fmtInches(info.enemy.d) : 'в зоне') : '—'}</b>
          </div>
          {info.foe && (
            <div className="col-span-3 rounded-lg border border-white/10 px-1.5 py-1">
              <span className="text-fg-3">до ближайшего врага (от края до края): </span>
              <b className="text-sm">{fmtInches(info.foe.d)}</b>
            </div>
          )}
        </div>
      )}
      <Segmented<Formation> value={unit.formation} onChange={onFormation} options={FORMATIONS.map((f) => ({ value: f.id, label: f.label }))} />
      {unit.placed && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-fg-3">Поворот:</span>
          {[-45, -15, 15, 45].map((d) => (
            <button key={d} type="button" onClick={() => onRotate(d)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 font-semibold active:bg-white/10">
              {d > 0 ? `↻ ${d}°` : `↺ ${-d}°`}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-fg-3">Зазор между базами:</span>
        {GAPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onGap(g)}
            className={cx('rounded-lg border px-2 py-1 font-semibold', unit.gap === g ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 bg-white/[0.04] active:bg-white/10')}
          >
            {g ? `${String(g).replace('.', ',')}″` : 'вплотную'}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setBases((v) => !v)} className={cx('text-xs font-semibold', unknown ? 'text-warn' : 'text-accent')}>
        {bases ? 'Скрыть базы' : unknown ? 'Указать форму и размер базы' : 'Базы моделей'}
      </button>
      {bases && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
          {profiles.map((p) => (
            <div key={p.profile} className="text-xs">
              <p className="font-semibold">
                {p.profile} <span className="font-normal text-fg-3">· моделей: {p.count}</span>
              </p>
              {p.options.length > 1 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {p.options.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onBase(p.profile, { pick: i })}
                      className={cx('rounded-lg border px-2 py-1 font-semibold', p.pick === i ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 bg-white/[0.04]')}
                    >
                      {baseLabel(o)}
                    </button>
                  ))}
                </div>
              )}
              {p.options.length === 1 && <p className="text-fg-3">{baseLabel(p.options[0]!)} (из данных)</p>}
              {!p.options.length && <ApproxPicker source={p.source} value={p.custom ?? (p.customMm ? { kind: 'circle', d: p.customMm } : null)} onChange={(custom) => onBase(p.profile, { custom })} />}
            </div>
          ))}
          <p className="text-[12px] text-fg-3">После смены базы отряд перестраивается на том же месте.</p>
        </div>
      )}
      {unit.placed && (
        <Button className="w-full" onClick={onRemove}>
          Убрать со стола
        </Button>
      )}
      <details className="text-[12px] text-fg-3">
        <summary className="cursor-pointer py-1 font-semibold text-fg-2">Как двигать</summary>
        Тяните базу — едет весь отряд; удерживайте базу полсекунды — двигается одна модель. Поле двигается пальцем по пустому месту, масштаб — двумя пальцами.
      </details>
    </div>
  );
}

/** Линия измерения с подписью (поле → экран); handles — концы можно тянуть. */
function Measure({
  from,
  to,
  d,
  color,
  dashed,
  handles,
  onHandle,
}: {
  from: Pt;
  to: Pt;
  d: number;
  color: string;
  dashed?: boolean;
  handles?: boolean;
  onHandle?: (e: PointerEvent, which: 'a' | 'b') => void;
}) {
  const disp = useDisp();
  const [x1, y1] = disp(from);
  const [x2, y2] = disp(to);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.14} strokeDasharray={dashed ? '0.45 0.3' : undefined} strokeLinecap="round" pointerEvents="none" />
      <text
        x={(x1 + x2) / 2}
        y={(y1 + y2) / 2 - 0.45}
        textAnchor="middle"
        fontSize={1.1}
        fontWeight={700}
        fill={color}
        stroke="rgba(0,0,0,0.85)"
        strokeWidth={0.22}
        style={{ paintOrder: 'stroke' }}
        pointerEvents="none"
      >
        {fmtInches(d)}
      </text>
      {handles &&
        ([
          ['a', x1, y1],
          ['b', x2, y2],
        ] as const).map(([w, x, y]) => (
          <circle key={w} cx={x} cy={y} r={0.55} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={0.1} style={{ touchAction: 'none', cursor: 'grab' }} onPointerDown={(e) => onHandle?.(e, w)} />
        ))}
    </g>
  );
}
