import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { haptic, pushOverlay, tg } from '../../telegram';
import {
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
  unitToUnit,
  unitToZones,
  type Formation,
  type Placed,
  type Pt,
  type RulerEnd,
  type ArmyKey,
  type Side,
  type TAArmy,
  type TAUnit,
  armyColor,
  checkMove,
  clampShift,
  diceSum,
  moved,
  rollDice,
  startMove,
  unitGap,
  type ActiveMove,
  type SimActionDef,
  type SimContext,
  type SimRules,
  targetRule,
  type ShootProfile,
  type ShotContext,
  type UnitFlags,
  autoDeploy,
  coherency,
  DEFAULT_ANGLE,
} from '../../testarmy';
import { ActionPanel, ChargePanel, MovePanel, PhaseBar } from './GamePanel';
import { ArmyBar, Banner, type BannerSpec } from './BoardHud';
import { BottomBar, FormTab, MoreMenu, PlaceTab, ProfileTab, QuickBar, UnitCard, UnitsSheet, type CardTab, type UnitsFilter, type UnitsRow } from './BoardSheets';

const ACCENT = '#eaff44';
const OUTSIDE = '#ff3b3b';
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
export type BoardArmy = TAArmy & {
  name: string;
  stats: (u: TAUnit) => string | null;
  info: (u: TAUnit, onClose: () => void) => ReactNode;
  /** симулятор (этап 2): характеристика M каждой модели (″) и Ld отряда; нет — действия с M недоступны */
  sim?: {
    moves: (u: TAUnit) => (number | null)[];
    leadership: (u: TAUnit) => number | null;
    /** Kill Team: APL */
    apl?: (u: TAUnit) => number | null;
    /** дальность оружия (″) для проверки цели без симулятора атаки: min — минимальная дальность (Warcry) */
    ranges?: (u: TAUnit) => { name: string; min?: number; max: number }[];
    /** 40K: оружие и исключения отряда для стрельбы (shooting40k.ts) */
    shooting?: (u: TAUnit) => ShootProfile | null;
  };
};
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
 * короткое нажатие — «поставить сюда» / точка линейки. Вариант A (27.11.2026): нижняя панель (Отряды · Линейка · Игра · Ещё),
 * лист «Отряды», карточка выбранного отряда (Действия / Строй / Профиль) и быстрая панель (строй, по одной, поворот).
 */
/** Симулятор боя (S2, 08.11.2026): лист атаки отряда по цели; только 40K (передаёт TestArmyScreen). */
export type CombatRender = (
  a: { attacker: TAUnit; attackerArmy: BoardArmy; target: TAUnit; targetArmy: BoardArmy; distance: number | null; onBanner: (b: Omit<BannerSpec, 'id'>) => void; melee?: boolean; shot?: ShotContext },
  onClose: () => void,
) => ReactNode;

export function Board(props: {
  armies: BoardArmy[];
  field: BoardField;
  onArmy: (key: ArmyKey, units: TAUnit[]) => void;
  onBack: () => void;
  combat?: CombatRender;
  /** выбор цвета армии (27.11.2026); нет — цвет не меняется */
  onArmyColor?: (key: ArmyKey, hex: string) => void;
  /** правила симулятора фаз (этап 2); нет — только свободный режим */
  rules?: SimRules;
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
  onArmyColor,
  rules,
}: {
  /** своя армия (me) и, если выбрана, армия соперника (foe) — за другую сторону */
  armies: BoardArmy[];
  field: BoardField;
  onArmy: (key: ArmyKey, units: TAUnit[]) => void;
  onBack: () => void;
  combat?: CombatRender;
  onArmyColor?: (key: ArmyKey, hex: string) => void;
  rules?: SimRules;
}) {
  const { width, height, orientation } = useContext(BoardDimensions);
  const disp = useDisp();
  const undisp = ([dx, dy]: Pt): Pt => (orientation === 'landscape' ? [dx, dy] : [dy, height - dx]);
  const clamp = (p: Pt) => clampToBoard(p, width, height);
  const mapAspect = (height + 3) / (width + 3);
  const viewBox = orientation === 'landscape' ? `-1.5 -1.5 ${width + 3} ${height + 3}` : `-1.5 -1.5 ${height + 3} ${width + 3}`;
  const me = armies.find((a) => a.key === 'me')!;
  const foe = armies.find((a) => a.key === 'foe') ?? null;
  // все отряды обеих армий; армия отряда и подпись: свои 1, 2…, соперника С1, С2…
  const units = useMemo(() => armies.flatMap((a) => a.units), [armies]);
  const armyOf = (uid: string): BoardArmy => armies.find((a) => a.units.some((u) => u.uid === uid)) ?? me;
  const label = (u: TAUnit) => {
    const a = armyOf(u.uid);
    const i = a.units.findIndex((x) => x.uid === u.uid) + 1;
    return a.key === 'foe' ? `С${i}` : String(i);
  };
  // цвет армии: свой выбор или цвет стороны; у двух армий одного цвета — разные (look.ts)
  const colorOfArmy = (a: BoardArmy) => armyColor(a, armies.find((x) => x.key !== a.key) ?? null);
  const colorOf = (uid: string) => colorOfArmy(armyOf(uid));
  const [banner, setBanner] = useState<BannerSpec | null>(null);
  // id — новый баннер того же текста тоже показывается заново
  const showBanner = useCallback((b: Omit<BannerSpec, 'id'>) => setBanner((prev) => ({ ...b, id: (prev?.id ?? 0) + 1 + Math.random() })), []);
  const hideBanner = useCallback(() => setBanner(null), []);
  const [unitsArmy, setUnitsArmy] = useState<ArmyKey>('me');
  const [selected, setSelected] = useState<string | null>(null);
  // вариант A: открытый лист (Отряды / Ещё), карточка отряда и её вкладка, «модели по одной»
  const [sheet, setSheet] = useState<'units' | 'more' | null>(null);
  const [filter, setFilter] = useState<UnitsFilter>('all');
  const [cardOpen, setCardOpen] = useState(false);
  const [cardTab, setCardTab] = useState<CardTab>('act');
  const [perModel, setPerModel] = useState(false);
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
  const [attack, setAttack] = useState<{ from: string; to: string; melee?: boolean; shot?: ShotContext } | null>(null);
  // ---------- симулятор фаз (этап 2, 27.11.2026) ----------
  const [game, setGame] = useState(false);
  const [turn, setTurn] = useState<{ army: ArmyKey; phase: number; round: number; first: ArmyKey; flags: Record<string, UnitFlags> }>({ army: 'me', phase: 0, round: 1, first: 'me', flags: {} });
  const [active, setActiveState] = useState<ActiveMove | null>(null);
  // зеркало для обработчиков жеста: манёвр, начатый первым касанием, ограничивает уже следующий кадр перетаскивания
  const activeRef = useRef<ActiveMove | null>(null);
  const setActive = (am: ActiveMove | null) => {
    activeRef.current = am;
    setActiveState(am);
  };
  const [charging, setCharging] = useState<{ uid: string; targets: string[] } | null>(null);
  const [attackKind, setAttackKind] = useState<'shoot' | 'fight' | null>(null);
  const [history, setHistory] = useState<{ units: Partial<Record<ArmyKey, TAUnit[]>>; flags: Record<string, UnitFlags> }[]>([]);
  const infoUnit = units.find((u) => u.uid === infoFor) ?? null;
  const endDrag = useRef<{ which: 'a' | 'b'; pointerId: number } | null>(null);
  const sel = units.find((u) => u.uid === selected) ?? null;
  /** Выбрать отряд: новая карточка — свёрнута (в режиме «Игра» — открыта на «Действиях»). */
  const selectUnit = (uid: string | null) => {
    if (uid !== selected) {
      setCardOpen(game && !!uid);
      setCardTab('act');
    }
    setSelected(uid);
  };
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
  // «Назад» Telegram сначала закрывает лист и карточку отряда
  useEffect(() => (sheet ? pushOverlay(() => setSheet(null)) : undefined), [sheet]);
  useEffect(() => (cardOpen ? pushOverlay(() => setCardOpen(false)) : undefined), [cardOpen]);
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

  // ---------- симулятор фаз: состояние хода, действия, манёвры ----------
  const phase = rules?.phases[turn.phase] ?? null;
  const flagsOf = (uid: string): UnitFlags => turn.flags[uid] ?? {};
  const setFlags = (uid: string, patch: UnitFlags) => setTurn((t) => ({ ...t, flags: { ...t.flags, [uid]: { ...t.flags[uid], ...patch } } }));
  const snapshot = () => setHistory((h) => [...h.slice(-30), { units: Object.fromEntries(armies.map((a) => [a.key, a.units])), flags: turn.flags }]);
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    haptic.select();
    for (const a of armies) {
      const u = last.units[a.key];
      if (u) onArmy(a.key, u);
    }
    setTurn((t) => ({ ...t, flags: last.flags }));
    setHistory((h) => h.slice(0, -1));
    setActive(null);
    setCharging(null);
  };
  const enemiesOf = (uid: string) => {
    const mine = armyOf(uid).key;
    return units.filter((u) => armyOf(u.uid).key !== mine && u.placed).map((u) => ({ uid: u.uid, name: u.name, bases: unitsOf(u.uid) }));
  };
  const ctxFor = (u: TAUnit): SimContext => {
    const a = armyOf(u.uid);
    const bases = unitsOf(u.uid);
    const gaps = enemiesOf(u.uid).map((e) => unitGap(bases, e.bases)).filter((d): d is number => d != null);
    const nearest = gaps.length ? Math.min(...gaps) : null;
    const moves = (a.sim?.moves(u) ?? []).filter((x): x is number => x != null);
    return {
      phase: phase?.id ?? '',
      active: !!phase && (a.key === turn.army || !!rules?.bothArmies?.includes(phase.id)),
      placed: u.placed,
      flags: flagsOf(u.uid),
      engaged: nearest != null && nearest <= (rules?.engagement ?? 0) + 1e-6,
      nearestEnemy: nearest,
      move: moves.length ? Math.min(...moves) : null,
      leadership: a.sim?.leadership(u) ?? null,
      apl: a.sim?.apl?.(u) ?? null,
      shooting: a.sim?.shooting?.(u) ?? null,
      objective: bases.length && field.objectives.length ? nearestObjective(bases, field.objectives, field.objectiveRange ?? OBJECTIVE_RANGE)?.d ?? null : null,
    };
  };
  // активации (Kill Team, Warcry): бюджет AP / действий, одна активация за раз, игроки по очереди
  const inActivation = !!rules?.activation && phase?.id === rules.activation.phase;
  const activating = inActivation ? Object.entries(turn.flags).find(([, f]) => (f.spent ?? 0) > 0 && !f.expended)?.[0] ?? null : null;
  const budgetOf = (u: TAUnit) => (rules?.activation ? rules.activation.budget(ctxFor(u)) : 0);
  const actionsFor = (u: TAUnit): SimActionDef[] => {
    if (!rules) return [];
    const list = rules.actions(ctxFor(u));
    if (!inActivation) return list;
    const left = budgetOf(u) - (flagsOf(u.uid).spent ?? 0);
    const other = activating && activating !== u.uid ? units.find((x) => x.uid === activating) : null;
    return list.map((a) => (a.blocked ? a : other ? { ...a, blocked: `сейчас активация: ${other.name}` } : (a.ap ?? 1) > left ? { ...a, blocked: `не хватает ${rules.activation!.unit} (осталось ${left})` } : a));
  };
  /** Конец активации: оперативник/боец израсходован, активирует другой игрок. wait — Warcry Wait первым действием. */
  const endActivation = (uid: string, wait = false) => {
    setTurn((t) => ({
      ...t,
      army: foe ? (armyOf(uid).key === 'me' ? 'foe' : 'me') : t.army,
      flags: { ...t.flags, [uid]: { ...t.flags[uid], spent: 0, did: [], expended: !wait, waiting: wait } },
    }));
  };
  /** Действие выполнено: отметка + расход AP / действия (в фазе активаций). */
  const complete = (uid: string, a: SimActionDef, patch: UnitFlags = {}) => {
    const f = flagsOf(uid);
    const markPatch: UnitFlags = a.mark === 'moved' ? { moved: a.id as UnitFlags['moved'] } : a.mark ? { [a.mark]: true } : {};
    if (!inActivation) {
      setFlags(uid, { ...markPatch, ...patch });
      return;
    }
    const u = units.find((x) => x.uid === uid);
    const spent = (f.spent ?? 0) + (a.ap ?? 1);
    const budget = u ? budgetOf(u) : 2;
    setFlags(uid, { ...markPatch, ...patch, spent, did: [...(f.did ?? []), a.id], waiting: false });
    if (spent >= budget) endActivation(uid);
  };
  const cancelSim = () => {
    if (active) {
      update(active.before);
      setHistory((h) => h.slice(0, -1));
    }
    setActive(null);
    setCharging(null);
    setAttackFrom(null);
    setAttackKind(null);
  };
  const goPhase = (i: number) => {
    cancelSim();
    haptic.select();
    setTurn((t) => ({ ...t, phase: i }));
  };
  const nextPhase = () => {
    if (!rules) return;
    cancelSim();
    haptic.select();
    setTurn((t) => {
      if (t.phase < rules.phases.length - 1) return { ...t, phase: t.phase + 1 };
      // конец хода: ход другой армии; новый раунд — когда снова ходит первая армия. Боевой шок остаётся до проверки.
      const flags = Object.fromEntries(Object.entries(t.flags).filter(([, f]) => f.shocked).map(([k]) => [k, { shocked: true }]));
      // активации (Kill Team, Warcry): обе армии действуют в одном раунде — следующий раунд, все снова готовы
      if (rules.activation) return { ...t, army: t.first, phase: 0, round: t.round + 1, flags };
      const army: ArmyKey = foe ? (t.army === 'me' ? 'foe' : 'me') : t.army;
      return { ...t, army, phase: 0, round: army === t.first ? t.round + 1 : t.round, flags };
    });
  };
  const doAction = (u: TAUnit, a: SimActionDef) => {
    haptic.select();
    const army = armyOf(u.uid);
    const color = colorOfArmy(army);
    if (a.kind === 'wait') {
      snapshot();
      const f = flagsOf(u.uid);
      if ((f.spent ?? 0) === 0 && !f.waiting) {
        setFlags(u.uid, { did: [] });
        endActivation(u.uid, true);
        showBanner({ kicker: army.name, title: 'Wait', sub: `${u.name} · активировать ещё раз позже (1 действие)`, color, tone: 'event' });
      } else {
        endActivation(u.uid);
        showBanner({ kicker: army.name, title: 'Активация окончена', sub: u.name, color, tone: 'event' });
      }
      return;
    }
    if (a.kind === 'toggle') {
      snapshot();
      setFlags(u.uid, { ruleAllows: !flagsOf(u.uid).ruleAllows });
      return;
    }
    if (a.kind === 'stationary') {
      snapshot();
      complete(u.uid, a);
      showBanner({ kicker: army.name, title: 'На месте', sub: `${u.name} · Remain stationary`, color, tone: 'event' });
      return;
    }
    if (a.kind === 'test') {
      const ld = army.sim?.leadership(u);
      if (ld == null) return;
      const r = rollDice(2);
      const ok = diceSum(r) >= ld;
      snapshot();
      setFlags(u.uid, { shocked: !ok });
      showBanner({ kicker: u.name, title: ok ? 'Выдержал!' : 'Боевой шок!', sub: `2D6 = ${diceSum(r)} · нужно ${ld}+`, color, tone: ok ? 'good' : 'bad', dice: r });
      return;
    }
    if (a.kind === 'move') {
      const roll = a.distance?.dice ? rollDice(a.distance.dice) : undefined;
      const am = beginMove(u, a, roll);
      if (!am) return;
      if (a.mortalD3) {
        const d3 = Math.ceil(rollDice(1)[0]! / 2);
        showBanner({ kicker: u.name, title: `${a.label}: ${d3} ран`, sub: `D3 смертельных ран (mortal damage) — снимите вручную`, color, tone: 'bad' });
      } else if (roll) showBanner({ kicker: u.name, title: `${a.label}: +${diceSum(roll)}″`, sub: `до ${Math.max(...Object.values(am.max)).toString().replace('.', ',')}″`, color, tone: 'event', dice: roll });
      return;
    }
    if (a.kind === 'charge') {
      setCharging({ uid: u.uid, targets: [] });
      return;
    }
    // стрельба / бой: следующее нажатие на вражеский отряд — цель (лист атаки)
    setAttackKind(a.kind === 'fight' ? 'fight' : 'shoot');
    setAttackFrom(u.uid);
  };
  /** Начать манёвр: снимок для «Отменить», зона дистанции, ограничение перетаскивания. */
  const beginMove = (u: TAUnit, a: SimActionDef, roll?: number[]): ActiveMove | null => {
    const am0 = startMove(u, a, armyOf(u.uid).sim?.moves(u) ?? [], roll);
    if (!am0) return null;
    // враги в бою с отрядом в начале манёвра — для «остаться в бою» (40K 12.03, 12.08)
    const ub = unitsOf(u.uid);
    const am: ActiveMove = { ...am0, startEngaged: enemiesOf(u.uid).filter((e) => (unitGap(ub, e.bases) ?? Infinity) <= (rules?.engagement ?? 0) + 1e-6).map((e) => e.uid) };
    snapshot();
    setActive(am);
    setSelected(u.uid);
    return am;
  };
  /** Манёвр по умолчанию для выбранного отряда (без броска): Normal Move / Reposition / Move / сближение — первый доступный. */
  const defaultMove = (u: TAUnit): SimActionDef | null => (game && rules && phase ? actionsFor(u).find((a) => a.kind === 'move' && !a.blocked && !a.distance?.dice) ?? null : null);
  /** Зона манёвра для показа: идущий манёвр или (до первого касания) манёвр по умолчанию выбранного отряда. */
  const zoneMove: ActiveMove | null = (() => {
    if (!game) return null;
    if (active) return active;
    if (!sel?.placed || charging || attackFrom) return null;
    const def = defaultMove(sel);
    return def ? startMove(sel, def, armyOf(sel.uid).sim?.moves(sel) ?? []) : null;
  })();
  const rollCharge = () => {
    if (!charging || !rules) return;
    const u = units.find((x) => x.uid === charging.uid);
    if (!u || !charging.targets.length) return;
    const army = armyOf(u.uid);
    const color = colorOfArmy(army);
    const def = rules.actions(ctxFor(u)).find((a) => a.kind === 'charge');
    if (!def) return;
    const r = rollDice(2);
    const d = diceSum(r);
    const ub = unitsOf(u.uid);
    // самая дальняя цель: от края до края минус радиус связывания
    const need = Math.max(...charging.targets.map((t) => (unitGap(ub, unitsOf(t)) ?? 99) - rules.engagement));
    snapshot();
    setFlags(u.uid, { charged: true });
    setCharging(null);
    if (d < need) {
      showBanner({ kicker: u.name, title: 'Не долетел!', sub: `2D6 = ${d}″ · нужно ${Math.max(0, Math.ceil(need * 10) / 10).toString().replace('.', ',')}″ — нападение не удалось`, color, tone: 'bad', dice: r });
      return;
    }
    const am = startMove(u, def, army.sim?.moves(u) ?? [], r);
    if (!am) return;
    setActive({ ...am, targets: charging.targets });
    showBanner({ kicker: u.name, title: `Нападение: ${d}″`, sub: 'двигайте отряд к целям', color, tone: 'event', dice: r });
  };
  const activeUnit = active ? units.find((u) => u.uid === active.uid) ?? null : null;
  const activeProblems = active && rules && activeUnit
    ? checkMove(active, rules, unitsOf(active.uid), enemiesOf(active.uid), field.objectives.length && unitsOf(active.uid).length ? nearestObjective(unitsOf(active.uid), field.objectives, field.objectiveRange ?? OBJECTIVE_RANGE) : null)
    : [];
  // сколько прошла модель отряда в этом ходу (40K [HEAVY]: не больше 3″)
  const movedDist = () => (active && activeUnit ? Math.max(0, ...activeUnit.models.map((m) => moved(active, m.id, m.at))) : 0);
  const finishMove = () => {
    if (!active || !activeUnit) return;
    const army = armyOf(activeUnit.uid);
    const color = colorOfArmy(army);
    const a = active.action;
    if (activeProblems.length) {
      if (!a.failable) return;
      // нападение не удалось: отряд остаётся на исходной позиции
      update(active.before);
      setActive(null);
      complete(activeUnit.uid, a);
      showBanner({ kicker: activeUnit.name, title: 'Нападение не удалось', sub: activeProblems[0], color, tone: 'bad' });
      return;
    }
    complete(activeUnit.uid, a, { dist: Math.max(flagsOf(activeUnit.uid).dist ?? 0, movedDist()) });
    setActive(null);
    haptic.ok();
    if (a.chargeTargets || a.failable) showBanner({ kicker: army.name, title: 'Нападение удалось!', sub: `${activeUnit.name} · Fights First до конца хода`, color, tone: 'good' });
  };
  const moveProgress = (() => {
    if (!active || !activeUnit) return '';
    let worst = 0;
    let limit = 0;
    for (const m of activeUnit.models) {
      const mx = active.max[m.id];
      if (mx == null) continue;
      const d = moved(active, m.id, m.at);
      if (d / (mx || 1) >= worst / (limit || 1)) {
        worst = d;
        limit = mx;
      }
    }
    return `пройдено ${fmtInches(worst)} из ${fmtInches(limit)} · тяните отряд или (удержанием) модель`;
  })();

  // короткое нажатие на поле: линейка — точка; иначе выбранный отряд встаёт центром сюда
  const onTap = (clientX: number, clientY: number) => {
    if (sheet) {
      setSheet(null);
      return;
    }
    const p = toBoard(clientX, clientY);
    if (!p) return;
    if (tool === 'ruler') {
      const end = snapEnd(clamp(p), allBases, snapPoints, Math.max(0.4, tolerance()));
      setRuler((r) => (!r.a || r.b ? { a: end, b: null } : { a: r.a, b: end }));
      haptic.select();
      return;
    }
    if (tool === 'units' || !sel) return;
    if (game && sel.placed) {
      // режим фаз: нажатие двигает отряд к точке, но не дальше его дистанции (выставленный отряд не «телепортируется»)
      let am = activeRef.current;
      if (am && am.uid !== sel.uid) return;
      if (!am) {
        const def = defaultMove(sel);
        am = def ? beginMove(sel, def) : null;
      }
      if (!am) return;
      const placedNow = sel.models.filter((m) => m.at);
      if (!placedNow.length) return;
      const cx0 = placedNow.reduce((t, m) => t + m.at![0], 0) / placedNow.length;
      const cy0 = placedNow.reduce((t, m) => t + m.at![1], 0) / placedNow.length;
      const from: Record<string, Pt> = {};
      for (const m of placedNow) from[m.id] = m.at!;
      const [tx, ty] = clamp(p);
      const k = clampShift(am, from, Object.keys(from), tx - cx0, ty - cy0);
      update(moveUnit(sel, (tx - cx0) * k, (ty - cy0) * k));
      haptic.select();
      return;
    }
    if (!sel.placed) {
      const a = armyOf(sel.uid);
      showBanner({ kicker: a.name, title: sel.name, sub: `на столе · моделей: ${sel.models.length}`, color: colorOfArmy(a), tone: 'event' });
    }
    update(placeUnit(sel, clamp(p)));
    haptic.select();
  };

  // допуск касания базы в дюймах поля — постоянный в пикселях экрана при любом масштабе
  const tolerance = () => touchTolerance(TOUCH_PX, base.w * view.current.s);

  // палец на базе (или рядом, до TOUCH_PX): весь отряд; удержание без движения — одна модель. Поле в это время не двигается.
  const startModel = (e: PointerEvent, unit: TAUnit, modelId: string) => {
    if (charging) {
      // нападение: нажатие на вражеский отряд в пределах 12″ — цель (ещё раз — снять)
      if (armyOf(unit.uid).key !== armyOf(charging.uid).key) {
        const d = unitGap(unitsOf(charging.uid), unitsOf(unit.uid));
        if (d != null && d <= 12) {
          haptic.select();
          setCharging((c) => c && { ...c, targets: c.targets.includes(unit.uid) ? c.targets.filter((x) => x !== unit.uid) : [...c.targets, unit.uid] });
        } else showBanner({ title: 'Дальше 12″', sub: `${unit.name}: ${d != null ? fmtInches(d) : 'не на столе'} — не цель нападения`, tone: 'bad' });
      }
      return;
    }
    if (attackFrom) {
      if (armyOf(unit.uid).key !== armyOf(attackFrom).key) {
        const from = units.find((u) => u.uid === attackFrom);
        const melee = attackKind === 'fight';
        // 40K (есть профиль стрельбы): кого можно выбрать целью и какая стрельба (04.02, 10.04–10.06, 17.03)
        let shot: ShotContext | undefined;
        const prof = from ? armyOf(from.uid).sim?.shooting?.(from) : undefined;
        if (from && prof !== undefined) {
          const er = rules?.engagement ?? 2;
          const eng = (a: string, b: string) => (unitGap(unitsOf(a), unitsOf(b)) ?? Infinity) <= er + 1e-6;
          const tProf = armyOf(unit.uid).sim?.shooting?.(unit) ?? null;
          const attackerEngaged = enemiesOf(from.uid).some((e) => eng(from.uid, e.uid));
          const engagedWithAttacker = eng(from.uid, unit.uid);
          const targetEngagedWithMine = armyOf(from.uid).units.some((x) => x.uid !== from.uid && x.placed && eng(x.uid, unit.uid));
          const why = melee ? null : targetRule({ attackerEngaged, attackerMV: !!prof?.monsterVehicle, engagedWithAttacker, targetEngagedWithMine, targetMV: !!tProf?.monsterVehicle });
          if (why) {
            showBanner({ kicker: `${from.name} → ${unit.name}`, title: 'Нельзя выбрать цель', sub: why, color: colorOf(from.uid), tone: 'bad' });
            return;
          }
          const f = flagsOf(from.uid);
          const advanced = f.moved === 'advance' && !prof?.afterAdvance.shoot && !f.ruleAllows;
          shot = {
            mode: attackerEngaged ? 'close' : advanced ? 'assault' : 'normal',
            attackerMV: !!prof?.monsterVehicle,
            engagedWithAttacker,
            engagedMV: !engagedWithAttacker && targetEngagedWithMine && !!tProf?.monsterVehicle,
            ...(game ? { heavy: !attackerEngaged && (f.dist ?? 0) <= 3 + 1e-6, charged: !!f.charged } : {}),
            ...(f.moved === 'advance' && !advanced ? { ruleNote: prof?.afterAdvance.shoot ?? 'правило армии' } : {}),
          };
        }
        if (from) showBanner({ kicker: melee ? 'Бой' : game ? 'Стрельба' : 'Атака', title: from.name, sub: `→ ${unit.name}`, color: colorOf(from.uid), tone: 'event' });
        if (game && from && rules) {
          snapshot();
          const def = actionsFor(from).find((x) => x.kind === (melee ? 'fight' : 'shoot'));
          if (def) complete(from.uid, def);
          else setFlags(from.uid, melee ? { fought: true } : { shot: true });
        }
        if (!combat && from) {
          // без симулятора атаки (AoS, Kill Team, Warcry): проверка дистанции до цели
          const d = unitGap(unitsOf(from.uid), unitsOf(unit.uid));
          const er = rules?.engagement ?? 1;
          const ranges = armyOf(from.uid).sim?.ranges?.(from) ?? [];
          const inRange = ranges.filter((r) => d != null && d <= r.max + 1e-6 && (r.min == null || d >= r.min));
          const ok = d != null && (melee ? d <= er + 1e-6 : ranges.length ? inRange.length > 0 : true);
          showBanner({
            kicker: `${from.name} → ${unit.name}`,
            title: d == null ? 'Нет на столе' : ok ? (melee ? 'В бою' : 'Цель в дальности') : melee ? 'Не в бою' : 'Вне дальности',
            sub: d == null ? '' : `${fmtInches(d)}${melee ? ` · нужно не дальше ${er}″` : inRange.length ? ` · ${inRange.map((r) => r.name).join(', ')}` : ranges.length ? ` · дальность до ${Math.max(...ranges.map((r) => r.max))}″` : ''} · атаку бросайте вручную`,
            color: colorOf(from.uid),
            tone: ok ? 'good' : 'bad',
          });
          setAttackKind(null);
          setAttackFrom(null);
          return;
        }
        setAttack({ from: attackFrom, to: unit.uid, melee, shot });
        setAttackKind(null);
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
    selectUnit(unit.uid);
    // режим фаз: двигать можно только отряд, который совершает манёвр; первое касание выбранного отряда
    // начинает манёвр по умолчанию (Normal Move / Reposition / Move), если другого нет
    if (game) {
      const cur = activeRef.current;
      if (!(cur && cur.uid === unit.uid)) {
        const def = !cur && unit.uid === selected ? defaultMove(unit) : null;
        if (!def || !beginMove(unit, def)) {
          haptic.select();
          return;
        }
      }
    }
    // «Модели по одной»: палец сразу двигает одну модель, без удержания
    const d: Drag = { uid: unit.uid, modelId: perModel ? modelId : null, start: p, orig: unit, moved: false, timer: undefined, pointerId: e.pointerId };
    if (perModel) setSingle(modelId);
    else d.timer = window.setTimeout(() => {
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
      // манёвр симулятора: сдвиг урезается до максимальной дистанции каждой модели (от начала манёвра)
      const from: Record<string, Pt> = {};
      for (const m of d.orig.models) if (m.at) from[m.id] = m.at;
      const am = activeRef.current;
      const k = game && am && am.uid === d.orig.uid ? clampShift(am, from, d.modelId ? [d.modelId] : Object.keys(from), dx, dy) : 1;
      if (d.modelId) {
        const m = d.orig.models.find((x) => x.id === d.modelId);
        if (m?.at) update(moveModel(d.orig, d.modelId, clamp([m.at[0] + dx * k, m.at[1] + dy * k])));
      } else update(moveUnit(d.orig, dx * k, dy * k));
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

  // «Вне стола»: выбрать отряд — следующее нажатие на поле ставит его
  const pickOffTable = (uid: string) => {
    haptic.select();
    selectUnit(uid);
    setCardOpen(false);
    setTool('move');
    setAttackFrom(null);
    setSheet(null);
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
    setSheet(null);
  };

  // строка состояния поверх карты: что сейчас делать и результат измерения
  const attacker = attackFrom ? units.find((u) => u.uid === attackFrom) : null;
  const gameStatus: ReactNode = !game || !phase ? null : active && activeUnit ? (
    <>
      <b className="text-white">{active.action.label}</b> · {moveProgress}
    </>
  ) : charging ? (
    <>
      <b className="text-white">Нападение</b> · нажмите на вражеские отряды в пределах 12″ (выбрано {charging.targets.length}), затем «Бросить 2D6»
    </>
  ) : attacker ? null : (
    <>
      <b className="text-white">{phase.label}</b> · ход: {(armies.find((a) => a.key === turn.army) ?? me).name} · нажмите на отряд — его действия в этой фазе
    </>
  );
  const status: ReactNode = gameStatus ?? (attacker ? (
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
        {outside.size > 0 && <span className="text-[#ff6b6b]"> · вне зоны: {outside.size}</span>} · «Отряды» внизу
      </>
    ));

  // ---------- вариант A: карточка отряда, строй, лист «Отряды» ----------
  const cohRule = rules?.coherency ?? null;
  const cohOf = (u: TAUnit) => (u.placed && cohRule && u.models.length > 1 ? coherency(placedBases(u), cohRule) : null);
  const selCoh = sel ? cohOf(sel) : null;
  const selOutside = !!sel?.placed && sel.models.some((m) => outside.has(m.id));
  // красная обводка: вне зоны деплоя и (у выбранного отряда) вне строя
  const flagged = !selCoh || selCoh.ok || !sel ? outside : new Set([...outside, ...selCoh.bad.map((i) => sel.models[i]!.id)]);
  const cohText = (c: ReturnType<typeof coherency> | null) =>
    !c || !cohRule ? null : c.ok ? `✓ строй цел (${fmtInches(cohRule.range)})` : `✗ вне строя: ${c.bad.length === 1 ? 'модель' : 'модели'} ${c.bad.map((i) => i + 1).join(', ')} — нужно ${fmtInches(cohRule.range)}${cohRule.all ? `, до каждой ${fmtInches(cohRule.all)}` : ''}${cohRule.twoFrom && sel && sel.models.length >= cohRule.twoFrom ? ', от 2 моделей' : ''}`;
  const selZoneText = sel?.placed && !game && ownZone ? (selOutside ? '✗ вне зоны деплоя' : '✓ в зоне деплоя') : null;
  const statusLine = [selZoneText, cohText(selCoh)].filter(Boolean) as string[];
  const statusBad = selOutside || (selCoh ? !selCoh.ok : false);
  const angleDeg = sel ? Math.round(((((sel.angle - DEFAULT_ANGLE) * 180) / Math.PI) % 360 + 360) % 360) : 0;
  const rotate = (deg: number) => {
    if (!sel) return;
    haptic.select();
    update(rotateUnit(sel, (deg * Math.PI) / 180));
  };
  // «Показать на поле»: отряд в центре экрана, масштаб не меньше 2
  const centerOn = (pt: Pt) => {
    const [vx, vy] = disp(pt);
    const vbW = (orientation === 'landscape' ? width : height) + 3;
    const vbH = (orientation === 'landscape' ? height : width) + 3;
    const px = ((vx + 1.5) / vbW) * base.w;
    const py = ((vy + 1.5) / vbH) * base.h;
    const s = Math.max(view.current.s, 2);
    apply({ s, tx: size.w / 2 - px * s, ty: size.h / 2 - py * s });
  };
  const placeAll = (a: BoardArmy) => {
    const zone = field.zones[a.side];
    if (!zone?.length) return;
    haptic.select();
    const r = autoDeploy(a.units, zone, allBases.map((x) => x.base), width, height);
    onArmy(a.key, r.units);
    setSheet(null);
    showBanner({
      kicker: a.name,
      title: r.failed.length ? `Поставлено: ${r.placed.length}` : 'Все в зоне',
      sub: r.failed.length ? `не поместились: ${r.failed.length} — поставьте вручную` : `отрядов: ${r.placed.length}`,
      color: colorOfArmy(a),
      tone: r.failed.length ? 'bad' : 'good',
    });
  };
  const rowsOf = (a: BoardArmy): UnitsRow[] =>
    a.units.map((u) => {
      const m0 = u.models[0];
      const b = m0 ? modelBase(m0) : null;
      const out = u.placed && u.models.some((m) => outside.has(m.id));
      const c = cohOf(u);
      const where = !u.placed ? 'вне стола' : out ? 'вне зоны деплоя' : field.zones[a.side] ? 'в зоне ✓' : 'на столе';
      return {
        uid: u.uid,
        n: label(u),
        name: u.name,
        placed: u.placed,
        sub: `${u.models.length} мод. · ${b?.known ? `база ${baseLabel(b.shape)}` : 'база не указана'} · ${where}${c && !c.ok ? ' · строй разорван' : ''}`,
        warn: out || (c ? !c.ok : false),
      };
    });
  const listArmy = (unitsArmy === 'foe' && foe) || me;
  const offMe = me.units.filter((u) => !u.placed).length;
  const offAll = offMe + (foe ? foe.units.filter((u) => !u.placed).length : 0);
  const cardVisible = !!sel && tool === 'move' && !active && !charging && !attackFrom && sheet !== 'units';
  const openUnits = (f: UnitsFilter = 'all') => {
    haptic.select();
    setFilter(f);
    if (f === 'off' && !offMe && foe) setUnitsArmy('foe');
    setSheet((v) => (v === 'units' ? null : 'units'));
  };
  const toggleGame = () => {
    haptic.select();
    cancelSim();
    setTool('move');
    setSheet(null);
    setCardOpen(!game && !!selected);
    setCardTab('act');
    setGame((v) => !v);
  };
  const cardBody = !sel ? null : cardTab === 'form' ? (
    <FormTab
      unit={sel}
      angle={angleDeg}
      perModel={perModel}
      coherencyNote={cohRule && sel.models.length > 1 ? `Строй: ${cohRule.source}` : null}
      onFormation={setFormation}
      onRotate={rotate}
      onBase={(profile, change) => update(setProfileBase(sel, profile, change))}
      onPerModel={() => (haptic.select(), setPerModel((v) => !v))}
      onRemove={() => (update(removeUnit(sel)), setCardOpen(false))}
    />
  ) : cardTab === 'prof' ? (
    <ProfileTab unit={sel} stats={selArmy.stats(sel)} onInfo={() => setInfoFor(sel.uid)} />
  ) : game && rules && phase ? (
    <ActionPanel
      embedded
      title={`${label(sel)}. ${sel.name}`}
      sub=""
      color={colorOf(sel.uid)}
      actions={actionsFor(sel)}
      onAction={(a) => doAction(sel, a)}
      budget={inActivation && rules.activation ? { left: budgetOf(sel) - (flagsOf(sel.uid).spent ?? 0), of: budgetOf(sel), unit: rules.activation.unit } : undefined}
      order={rules.system === 'kt' && inActivation ? flagsOf(sel.uid).order ?? 'conceal' : undefined}
      onOrder={(o) => setFlags(sel.uid, { order: o })}
      onEnd={activating === sel.uid ? () => (snapshot(), endActivation(sel.uid)) : undefined}
      onClose={() => selectUnit(null)}
    />
  ) : (
    <PlaceTab
      placed={sel.placed}
      side={selArmy.side}
      info={info}
      onPlace={() => setCardOpen(false)}
      onAttack={
        combat && enemyArmy?.units.length
          ? () => {
              haptic.select();
              setTool('move');
              setAttackFrom(sel.uid);
              setCardOpen(false);
            }
          : undefined
      }
    />
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-app pt-[env(safe-area-inset-top)]">
      {infoUnit && armyOf(infoUnit.uid).info(infoUnit, () => setInfoFor(null))}
      {attack && combat && (() => {
        const a = units.find((u) => u.uid === attack.from);
        const t = units.find((u) => u.uid === attack.to);
        if (!a || !t) return null;
        const ab = unitsOf(a.uid);
        const tb = unitsOf(t.uid);
        const distance = ab.length && tb.length ? unitToUnit(ab, tb).d : null;
        return combat({ attacker: a, attackerArmy: armyOf(a.uid), target: t, targetArmy: armyOf(t.uid), distance, onBanner: showBanner, melee: attack.melee, shot: attack.shot }, () => setAttack(null));
      })()}

      <div className="flex items-stretch bg-[#0b0d12]">
        <button type="button" aria-label="Назад" onClick={onBack} className="my-1.5 ml-2 grid w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-xl text-white">
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <ArmyBar
            armies={armies.map((a) => ({ key: a.key, name: a.name, color: colorOfArmy(a), placed: a.units.filter((u) => u.placed).length, total: a.units.length }))}
            onColor={onArmyColor ? (key, hex) => onArmyColor(key as ArmyKey, hex) : undefined}
          />
        </div>
      </div>
      {game && rules && phase && (
        <PhaseBar
          phases={rules.phases}
          phase={turn.phase}
          round={turn.round}
          army={(armies.find((a) => a.key === turn.army) ?? me).name}
          color={colorOfArmy(armies.find((a) => a.key === turn.army) ?? me)}
          onPhase={goPhase}
          onNext={nextPhase}
          onSwitchArmy={foe ? () => (cancelSim(), setTurn((t) => ({ ...t, army: t.army === 'me' ? 'foe' : 'me', phase: 0, flags: {} }))) : undefined}
          onUndo={undo}
          canUndo={history.length > 0 && !active}
        />
      )}
      <div className="relative min-h-0 flex-1">
      {/* поле: жесты — свои (touch-action: none), браузер ничего не прокручивает */}
      <div
        ref={viewport}
        className="absolute inset-0 touch-none select-none overflow-hidden"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div ref={content} className="absolute left-0 top-0 origin-top-left" style={{ width: base.w, height: base.h }}>
          {field.background}
          <svg ref={svg} viewBox={viewBox} className="absolute inset-0 h-full w-full">
            {armies.map((a) =>
              (field.zones[a.side] ?? []).map((poly, i) => (
                <polygon
                  key={`${a.key}${i}`}
                  points={poly.map((pt) => disp(pt).join(',')).join(' ')}
                  fill={colorOfArmy(a)}
                  fillOpacity={0.16}
                  stroke={colorOfArmy(a)}
                  strokeOpacity={0.85}
                  strokeWidth={0.14}
                  pointerEvents="none"
                />
              )),
            )}
            {ranges &&
              field.objectives.map((o, i) => {
                const [x, y] = disp([o.x, o.y]);
                return <circle key={i} cx={x} cy={y} r={objectiveRadius + (field.objectiveRange ?? OBJECTIVE_RANGE)} fill="#eaff44" fillOpacity={0.06} stroke="#eaff44" strokeOpacity={0.7} strokeWidth={0.1} strokeDasharray="0.5 0.35" pointerEvents="none" />;
              })}
            {game && (active?.action.endUnengaged || active?.action.chargeTargets || charging) && rules &&
              enemiesOf(active?.uid ?? charging!.uid).flatMap((e) =>
                e.bases.map((b, i) => {
                  const [x, y] = disp([b.x, b.y]);
                  return <ellipse key={`${e.uid}${i}`} cx={x} cy={y} rx={b.rx + rules.engagement} ry={b.ry + rules.engagement} transform={`rotate(${(b.angle * 180) / Math.PI + 90} ${x} ${y})`} fill="#ff3b3b" fillOpacity={0.05} stroke="#ff3b3b" strokeOpacity={0.45} strokeWidth={0.06} strokeDasharray="0.3 0.25" pointerEvents="none" />;
                }),
              )}
            {zoneMove && (() => {
              // одна зона дистанции: объединение досягаемости моделей (центр модели + её максимум + радиус базы), без колец по моделям
              const zu = units.find((u) => u.uid === zoneMove.uid);
              if (!zu) return null;
              const col = colorOf(zu.uid);
              const circles = zu.models.flatMap((m) => {
                const st = zoneMove.start[m.id];
                const mx = zoneMove.max[m.id];
                if (!st || mx == null) return [];
                const b = placedBases({ ...zu, models: [{ ...m, at: st }] })[0];
                const [x, y] = disp(st);
                return [{ id: m.id, x, y, r: mx + (b ? Math.max(b.rx, b.ry) : 0) }];
              });
              if (!circles.length) return null;
              const maxD = Math.max(...Object.values(zoneMove.max));
              const top = circles.reduce((t, c) => (c.y - c.r < t.y - t.r ? c : t));
              const mask = `zone-${zu.uid.replace(/[^a-z0-9]/gi, '')}`;
              return (
                <g pointerEvents="none">
                  <defs>
                    <mask id={mask}>
                      <rect x={-100} y={-100} width={400} height={400} fill="#fff" />
                      {circles.map((c) => <circle key={c.id} cx={c.x} cy={c.y} r={c.r} fill="#000" />)}
                    </mask>
                  </defs>
                  <g opacity={0.16}>{circles.map((c) => <circle key={c.id} cx={c.x} cy={c.y} r={c.r} fill={col} />)}</g>
                  <g mask={`url(#${mask})`}>{circles.map((c) => <circle key={c.id} cx={c.x} cy={c.y} r={c.r + 0.14} fill={col} />)}</g>
                  <g transform={`translate(${top.x} ${top.y - top.r - 0.35})`}>
                    <rect x={-1.4} y={-0.95} width={2.8} height={1.15} rx={0.3} fill={col} />
                    <text y={-0.08} textAnchor="middle" fontSize={0.85} fontWeight={800} fill="#fff">
                      {fmtInches(maxD)}
                    </text>
                  </g>
                </g>
              );
            })()}
            {units.map((u) => (
              <UnitShapes
                key={u.uid}
                unit={u}
                n={label(u)}
                color={colorOf(u.uid)}
                active={tool === 'units' ? pair.includes(u.uid) : u.uid === selected || !!charging?.targets.includes(u.uid) || u.uid === active?.uid}
                plate={u.uid === selected || u.uid === attackFrom ? armyOf(u.uid).name : null}
                single={single}
                outside={flagged}
              />
            ))}
            {tool === 'move' && info?.objective && <Measure from={info.objective.from} to={info.objective.to} d={info.objective.d} color={info.objective.inRange ? '#4ade80' : ACCENT} dashed />}
            {tool === 'move' && info?.enemy && info.enemy.d > 0 && !info.foe && <Measure from={info.enemy.from} to={info.enemy.to} d={info.enemy.d} color={enemyArmy ? colorOfArmy(enemyArmy) : '#fff'} dashed />}
            {tool === 'move' && info?.foe && <Measure from={info.foe.from} to={info.foe.to} d={info.foe.d} color="#ffffff" dashed />}
            {tool === 'units' && pairLine && <Measure from={pairLine.from} to={pairLine.to} d={pairLine.d} color="#fff" />}
            {tool === 'ruler' && rulerLine && <Measure from={rulerLine.from} to={rulerLine.to} d={rulerLine.d} color="#fff" handles onHandle={onEndDown} />}
            {tool === 'ruler' && !rulerLine && rulerA && <circle cx={disp(rulerA)[0]} cy={disp(rulerA)[1]} r={0.35} fill="#fff" pointerEvents="none" />}
          </svg>
        </div>
        <Banner banner={banner} onDone={hideBanner} />
        {game && rules && active && activeUnit ? (
          <MovePanel
            title={`${activeUnit.name} · ${active.action.label}`}
            color={colorOf(activeUnit.uid)}
            progress={moveProgress}
            roll={active.roll}
            problems={activeProblems}
            targets={active.targets?.map((t) => units.find((u) => u.uid === t)?.name ?? t).join(', ')}
            onDone={finishMove}
            onCancel={cancelSim}
            failLabel={active.action.failable ? 'Нападение не удалось' : undefined}
          />
        ) : game && rules && charging ? (
          <ChargePanel
            color={colorOf(charging.uid)}
            targets={charging.targets.map((t) => units.find((u) => u.uid === t)?.name ?? t)}
            onRoll={rollCharge}
            onCancel={cancelSim}
          />
        ) : null}
        <p className="pointer-events-none absolute left-2 right-2 top-2 line-clamp-2 rounded-lg bg-black/75 px-2.5 py-1.5 text-[13px] leading-snug text-white/85">
          {status}
        </p>
      </div>

      {/* карточка выбранного отряда: строка строя и быстрые кнопки — внутри неё, поле не закрыто (27.11.2026) */}
      {cardVisible && sel && (
        <div className="absolute inset-x-0 bottom-0 z-10">
          <UnitCard
            n={label(sel)}
            name={sel.name}
            sub={
              game
                ? `${selArmy.name}${flagsOf(sel.uid).shocked ? ' · под боевым шоком' : ''}${selArmy.stats(sel) ? ` · ${selArmy.stats(sel)}` : ''}`
                : statusLine.length
                  ? statusLine.join(' · ')
                  : `${selArmy.name} · ${sel.placed ? (perModel ? 'тяните модель' : 'тяните отряд или нажмите, куда поставить') : 'нажмите на поле, чтобы поставить'}`
            }
            subTone={!game && statusLine.length ? (statusBad ? 'bad' : 'good') : undefined}
            color={colorOf(sel.uid)}
            open={cardOpen}
            tab={cardTab}
            onTab={(t) => (haptic.select(), setCardTab(t))}
            onToggle={() => setCardOpen((v) => !v)}
            onClose={() => selectUnit(null)}
            tools={
              !game && sel.placed ? (
                <QuickBar
                  formation={FORMATIONS.find((f) => f.id === sel.formation)?.label ?? 'Строй'}
                  perModel={perModel}
                  onFormation={() => (setCardTab('form'), setCardOpen(true))}
                  onPerModel={() => (haptic.select(), setPerModel((v) => !v))}
                  onRotate={rotate}
                />
              ) : undefined
            }
          >
            {cardBody}
          </UnitCard>
        </div>
      )}
      {!cardVisible && !sheet && offAll > 0 && tool === 'move' && !active && !charging && (
        <button type="button" onClick={() => openUnits('off')} className="absolute bottom-2 right-2 z-10 h-10 rounded-xl bg-[#0b0d12]/90 px-3 text-[13px] font-bold text-[#f5c542] shadow-[0_6px_16px_rgba(0,0,0,0.45)]">
          Вне стола: {offAll} ›
        </button>
      )}
      {sheet === 'units' && (
        <UnitsSheet
          armies={armies.map((a) => ({ key: a.key, name: a.name, color: colorOfArmy(a) }))}
          army={listArmy.key}
          onArmy={(k) => (haptic.select(), setUnitsArmy(k as ArmyKey))}
          filter={filter}
          onFilter={setFilter}
          rows={rowsOf(listArmy)}
          color={colorOfArmy(listArmy)}
          onPlace={pickOffTable}
          onShow={(uid) => {
            const u = units.find((x) => x.uid === uid);
            const c = u ? unitCenter(u) : null;
            pickOffTable(uid);
            if (c) centerOn(c);
          }}
          onCard={(uid) => {
            pickOffTable(uid);
            setCardTab('prof');
            setCardOpen(true);
          }}
          onPlaceAll={field.zones[listArmy.side]?.length && listArmy.units.some((u) => !u.placed) ? () => placeAll(listArmy) : undefined}
          onDistance={() => chooseTool('units')}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'more' && (
        <MoreMenu
          ranges={ranges}
          rangesLabel={field.objectives.length ? `Цели ${field.objectiveRange ?? OBJECTIVE_RANGE}″` : 'Зоны 3″'}
          note={`Круги целей: ${field.objectiveNote}`}
          distance={tool === 'units'}
          onRanges={() => setRanges((v) => !v)}
          onDistance={() => chooseTool(tool === 'units' ? 'move' : 'units')}
          onZoomIn={() => zoomBy(1.4)}
          onZoomOut={() => zoomBy(1 / 1.4)}
          onFit={fit}
        />
      )}
      </div>
      <BottomBar
        off={offAll}
        ruler={tool === 'ruler'}
        game={game}
        hasGame={!!rules}
        more={sheet === 'more'}
        onUnits={() => openUnits()}
        onRuler={() => chooseTool(tool === 'ruler' ? 'move' : 'ruler')}
        onGame={toggleGame}
        onMore={() => (haptic.select(), setSheet((v) => (v === 'more' ? null : 'more')))}
      />
    </div>
  );
}

/**
 * Базы отряда на столе и номер отряда в центре (жетон цвета армии); красная обводка — база не целиком в своей зоне деплоя.
 * Выбранный отряд (plate — название армии): кольцо подсветки и табличка «название отряда / армия», как в battle report.
 */
function UnitShapes({
  unit,
  n,
  color,
  active,
  single,
  outside,
  plate,
}: {
  unit: TAUnit;
  n: string;
  color: string;
  active: boolean;
  single: string | null;
  outside: Set<string>;
  plate?: string | null;
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
      {plate && (() => {
        // кольцо вокруг всех баз отряда
        const pts = bases.flatMap((b) => (b ? [{ p: disp([b.x, b.y]), r: Math.max(b.rx, b.ry) }] : []));
        const ring = Math.max(1, ...pts.map(({ p, r }) => Math.hypot(p[0] - cx0, p[1] - cy0) + r)) + 0.5;
        const name = unit.name.length > 28 ? `${unit.name.slice(0, 27)}…` : unit.name;
        const w = Math.max(name.length * 0.52, plate.length * 0.36) + 1.4;
        const top = cy0 - ring - 2.6;
        const y = top < -1 ? cy0 + ring + 0.4 : top;
        return (
          <g pointerEvents="none">
            <circle cx={cx0} cy={cy0} r={ring} fill="none" stroke="#f5c542" strokeWidth={0.18} strokeDasharray="0.6 0.35" />
            <rect x={cx0 - w / 2} y={y} width={w} height={2.2} rx={0.3} fill="rgba(8,10,14,0.92)" stroke={color} strokeWidth={0.12} />
            <rect x={cx0 - w / 2} y={y} width={w} height={0.22} fill={color} />
            <text x={cx0} y={y + 1.15} textAnchor="middle" fontSize={0.95} fontWeight={800} fill="#fff" style={{ textTransform: 'uppercase' }}>
              {name}
            </text>
            <text x={cx0} y={y + 1.9} textAnchor="middle" fontSize={0.6} fontWeight={700} fill={color} style={{ textTransform: 'uppercase' }}>
              {plate}
            </text>
          </g>
        );
      })()}
      <circle cx={cx0} cy={cy0} r={0.62} fill={color} stroke="#fff" strokeWidth={0.1} pointerEvents="none" />
      <text x={cx0} y={cy0 + 0.27} textAnchor="middle" fontSize={n.length > 2 ? 0.6 : 0.78} fontWeight={800} fill="#fff" pointerEvents="none">
        {n}
      </text>
    </g>
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
