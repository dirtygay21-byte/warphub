import { useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { BfDeployment, BfLayout } from '../../data';
import type { Roster } from '../../engine/types';
import { haptic } from '../../telegram';
import {
  baseLabel,
  baseToZone,
  clampToBoard,
  FORMATIONS,
  modelBase,
  moveModel,
  moveUnit,
  placeUnit,
  placedBases,
  removeUnit,
  rotateUnit,
  setProfileBase,
  unitCenter,
  unitProfiles,
  fmtInches,
  nearestObjective,
  objectiveRadius,
  OBJECTIVE_RANGE,
  OBJECTIVE_RULE_SOURCE,
  resolveRuler,
  snapEnd,
  unitToUnit,
  unitToZone,
  closestPoints,
  type Placed,
  type RulerEnd,
  type Formation,
  type Pt,
  type Side,
  type TAUnit,
} from '../../testarmy';
import { BattleMap } from '../Battlefield';
import { Button, IconButton, Segmented } from '../kit';
import { cx } from '../util';

const ZOOMS = [1, 1.5, 2, 3];
const SIDE_COLOR: Record<Side, string> = { attacker: '#f87171', defender: '#60a5fa' };
const ACCENT = '#eaff44';
const OUTSIDE = '#ff3b3b';
const GAPS = [0, 0.5, 1, 2];
/** удержание без движения — двигать одну модель */
const LONG_PRESS_MS = 450;
/** сдвиг пальца (дюймы поля), после которого это перетаскивание, а не нажатие */
const DRAG_START = 0.15;

type Tool = 'move' | 'ruler' | 'units';
const TOOLS: { id: Tool; label: string }[] = [
  { id: 'move', label: 'Двигать' },
  { id: 'ruler', label: 'Линейка' },
  { id: 'units', label: 'Отряд ↔ отряд' },
];

type Drag = { uid: string; modelId: string | null; start: Pt; orig: TAUnit; moved: boolean; timer: number | undefined; pointerId: number };

/** Поле → экран (как в BattleMap): поворот на 90°, 44″ по ширине. */
const disp = ([x, y]: Pt): Pt => [44 - y, x];
/** Экран → поле. */
const undisp = ([dx, dy]: Pt): Pt => [dy, 44 - dx];

/**
 * Стол Test Army (этап 2): карта раскладки и слой моделей поверх (та же система координат viewBox), список отрядов снизу.
 * Выбрать отряд → построение → нажать на поле: отряд встаёт туда (или переезжает). Масштаб — кнопками, карта прокручивается.
 */
export function Board({
  roster,
  layout,
  dep,
  side,
  units,
  onUnits,
  onBack,
}: {
  roster: Roster;
  layout: BfLayout;
  dep: BfDeployment;
  side: Side;
  units: TAUnit[];
  onUnits: (u: TAUnit[]) => void;
  onBack: () => void;
}) {
  const [zoom, setZoom] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  const [single, setSingle] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('move');
  const [ranges, setRanges] = useState(false);
  const [ruler, setRuler] = useState<{ a: RulerEnd | null; b: RulerEnd | null }>({ a: null, b: null });
  const [pair, setPair] = useState<string[]>([]);
  const endDrag = useRef<{ which: 'a' | 'b'; pointerId: number } | null>(null);
  const sel = units.find((u) => u.uid === selected) ?? null;
  const placedCount = units.filter((u) => u.placed).length;

  const update = (u: TAUnit) => onUnits(units.map((x) => (x.uid === u.uid ? u : x)));

  // экранная точка → точка поля
  const toBoard = (clientX: number, clientY: number): Pt | null => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return undisp([p.x, p.y]);
  };

  // модели вне своей зоны деплоя (база не целиком в зоне) — подсветка
  const zone = dep.zones.find((z) => z.player === side)?.poly ?? null;
  const outside = useMemo(() => {
    const set = new Set<string>();
    if (!zone) return set;
    for (const u of units)
      placedBases(u).forEach((b, i) => {
        if (b && !baseToZone(b, zone).whollyInside) set.add(u.models[i]!.id);
      });
    return set;
  }, [units, zone]);

  // все базы на столе (для линейки и расстояний)
  const allBases = useMemo(() => {
    const out: { modelId: string; uid: string; base: Placed }[] = [];
    for (const u of units) placedBases(u).forEach((b, i) => b && out.push({ modelId: u.models[i]!.id, uid: u.uid, base: b }));
    return out;
  }, [units]);
  const baseOf = (id: string) => allBases.find((x) => x.modelId === id)?.base ?? null;
  // привязка линейки: центры целей и углы участков террейна
  const snapPoints = useMemo<Pt[]>(
    () => [...layout.objectives.map((o) => [o.x, o.y] as Pt), ...layout.pieces.filter((pc) => pc.kind === 'area').flatMap((pc) => pc.poly as Pt[])],
    [layout],
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
  // выбранный отряд: до ближайшей цели и до зон деплоя
  const selBases = sel ? unitsOf(sel.uid) : [];
  const enemyZone = dep.zones.find((z) => z.player !== side)?.poly ?? null;
  const info = selBases.length
    ? {
        objective: nearestObjective(selBases, layout.objectives),
        own: zone ? unitToZone(selBases, zone) : null,
        enemy: enemyZone ? unitToZone(selBases, enemyZone) : null,
      }
    : null;

  // нажатие на поле: линейка — конец; иначе выбранный отряд встаёт центром в эту точку (не после перетаскивания)
  const onTap = (e: MouseEvent<SVGSVGElement>) => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    if (tool === 'ruler') {
      const p = toBoard(e.clientX, e.clientY);
      if (!p) return;
      const end = snapEnd(clampToBoard(p), allBases, snapPoints);
      setRuler((r) => (!r.a || r.b ? { a: end, b: null } : { a: r.a, b: end }));
      haptic.select();
      return;
    }
    if (tool === 'units') return;
    const p = sel && toBoard(e.clientX, e.clientY);
    if (!sel || !p) return;
    update(placeUnit(sel, clampToBoard(p)));
    haptic.select();
  };

  // перетаскивание: палец на базе — весь отряд; удержание без движения — одна модель
  const onDown = (e: PointerEvent, unit: TAUnit, modelId: string) => {
    // линейка: нажатие на базу обрабатывает onTap (привязка к базе)
    if (tool === 'ruler') return;
    if (tool === 'units') {
      e.stopPropagation();
      setPair((p) => (p.length >= 2 || p[0] === unit.uid ? [unit.uid] : [...p, unit.uid]));
      haptic.select();
      return;
    }
    const p = toBoard(e.clientX, e.clientY);
    if (!p) return;
    e.stopPropagation();
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
    svg.current?.setPointerCapture(e.pointerId);
  };
  const onEndDown = (e: PointerEvent, which: 'a' | 'b') => {
    e.stopPropagation();
    // нажатие на конец линейки не ставит новую точку
    justDragged.current = true;
    endDrag.current = { which, pointerId: e.pointerId };
    svg.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const ed = endDrag.current;
    if (ed && e.pointerId === ed.pointerId) {
      const p = toBoard(e.clientX, e.clientY);
      if (p) setRuler((r) => ({ ...r, [ed.which]: snapEnd(clampToBoard(p), allBases, snapPoints) }));
      return;
    }
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const p = toBoard(e.clientX, e.clientY);
    if (!p) return;
    const dx = p[0] - d.start[0];
    const dy = p[1] - d.start[1];
    if (!d.moved && Math.hypot(dx, dy) < DRAG_START) return;
    if (!d.moved) window.clearTimeout(d.timer);
    d.moved = true;
    if (d.modelId) {
      const m = d.orig.models.find((x) => x.id === d.modelId);
      if (m?.at) update(moveModel(d.orig, d.modelId, clampToBoard([m.at[0] + dx, m.at[1] + dy])));
    } else update(moveUnit(d.orig, dx, dy));
  };
  const onUp = (e: PointerEvent) => {
    if (endDrag.current?.pointerId === e.pointerId) {
      endDrag.current = null;
      // флаг гасит только «клик» сразу после отпускания
      window.setTimeout(() => (justDragged.current = false), 0);
      return;
    }
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    window.clearTimeout(d.timer);
    if (d.moved) {
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 0);
    }
    drag.current = null;
    setSingle(null);
  };

  const setFormation = (f: Formation) => {
    if (!sel) return;
    const c = unitCenter(sel);
    update(c ? placeUnit(sel, c, f) : { ...sel, formation: f });
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-app">
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <IconButton icon="back" label="Назад" onClick={onBack} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-lg font-semibold uppercase leading-none">Test Army</p>
          <p className="truncate text-[11px] text-white/45">
            {roster.name} · {dep.nameRu} · {side === 'attacker' ? 'атакующий' : 'защитник'} · на столе {placedCount} из {units.length}
            {outside.size > 0 && <span className="text-[#ff6b6b]"> · вне зоны: {outside.size}</span>}
          </p>
        </div>
        <IconButton icon="minus" label="Мельче" onClick={() => setZoom((z) => Math.max(0, z - 1))} className="size-9" />
        <IconButton icon="plus" label="Крупнее" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} className="size-9" />
      </header>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-2">
        <div className="relative mx-auto" style={{ width: `${ZOOMS[zoom]! * 100}%`, maxWidth: zoom ? 'none' : 520 }}>
          <BattleMap layout={layout} dep={dep} guides="none" className="block w-full" />
          <svg
            ref={svg}
            viewBox="-1.5 -1.5 47 63"
            className={cx('absolute inset-0 h-full w-full select-none', sel && 'cursor-crosshair')}
            onClick={onTap}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {ranges &&
              layout.objectives.map((o, i) => {
                const [x, y] = disp([o.x, o.y]);
                return <circle key={i} cx={x} cy={y} r={objectiveRadius + OBJECTIVE_RANGE} fill="#eaff44" fillOpacity={0.06} stroke="#eaff44" strokeOpacity={0.7} strokeWidth={0.1} strokeDasharray="0.5 0.35" pointerEvents="none" />;
              })}
            {units.map((u, i) => (
              <UnitShapes
                key={u.uid}
                unit={u}
                n={i + 1}
                color={SIDE_COLOR[side]}
                active={tool === 'units' ? pair.includes(u.uid) : u.uid === selected}
                single={single}
                outside={outside}
                passThrough={tool === 'ruler'}
                onDown={onDown}
              />
            ))}
            {tool === 'move' && info?.objective && <Measure from={info.objective.from} to={info.objective.to} d={info.objective.d} color={info.objective.inRange ? '#4ade80' : ACCENT} dashed />}
            {tool === 'move' && info?.enemy && info.enemy.d > 0 && <Measure from={info.enemy.from} to={info.enemy.to} d={info.enemy.d} color={side === 'attacker' ? SIDE_COLOR.defender : SIDE_COLOR.attacker} dashed />}
            {tool === 'units' && pairLine && <Measure from={pairLine.from} to={pairLine.to} d={pairLine.d} color="#fff" />}
            {tool === 'ruler' && rulerLine && <Measure from={rulerLine.from} to={rulerLine.to} d={rulerLine.d} color="#fff" handles onHandle={onEndDown} />}
            {tool === 'ruler' && !rulerLine && rulerA && <circle cx={disp(rulerA)[0]} cy={disp(rulerA)[1]} r={0.35} fill="#fff" pointerEvents="none" />}
          </svg>
        </div>
      </div>

      <div className="border-t border-white/10 bg-app-elevated px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => (haptic.select(), setTool(t.id), setRuler({ a: null, b: null }), setPair([]))}
              className={cx('rounded-lg border px-2.5 py-1.5 text-xs font-semibold', tool === t.id ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 bg-white/[0.04] active:bg-white/10')}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRanges((v) => !v)}
            aria-pressed={ranges}
            className={cx('rounded-lg border px-2.5 py-1.5 text-xs font-semibold', ranges ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 bg-white/[0.04] active:bg-white/10')}
          >
            Дальность целей
          </button>
        </div>
        {ranges && <p className="mb-1.5 text-[10.5px] text-white/40">Круги: {OBJECTIVE_RULE_SOURCE}. Для целей в участке террейна правило другое; высота на карте не учитывается.</p>}
        {tool === 'ruler' ? (
          <div className="flex items-center gap-2 text-sm">
            <p className="min-w-0 flex-1 text-white/70">
              {rulerLine ? (
                <>
                  Расстояние: <b className="text-white">{fmtInches(rulerLine.d)}</b>
                  <span className="block text-[11px] text-white/45">Концы можно тянуть. У базы линейка меряет от её края. Новое нажатие — новая линейка.</span>
                </>
              ) : ruler.a ? (
                'Нажмите вторую точку.'
              ) : (
                'Нажмите первую точку: на поле, на базу (от края), рядом с целью или углом террейна — привяжется.'
              )}
            </p>
            {ruler.a && (
              <Button className="text-xs" onClick={() => setRuler({ a: null, b: null })}>
                Сброс
              </Button>
            )}
          </div>
        ) : tool === 'units' ? (
          <p className="text-sm text-white/70">
            {pairLine ? (
              <>
                Между отрядами {units.findIndex((u) => u.uid === pair[0]) + 1} и {units.findIndex((u) => u.uid === pair[1]) + 1}: <b className="text-white">{fmtInches(pairLine.d)}</b>
                <span className="block text-[11px] text-white/45">Между ближайшими базами, от края до края. Нажмите другой отряд — новая пара.</span>
              </>
            ) : pair.length === 1 ? (
              'Нажмите второй отряд.'
            ) : (
              'Нажмите на базу первого отряда, затем второго.'
            )}
          </p>
        ) : sel ? (
          <UnitPanel
            unit={sel}
            n={units.indexOf(sel) + 1}
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
            side={side}
          />
        ) : (
          <UnitTray units={units} onSelect={(uid) => (haptic.select(), setSelected(uid))} />
        )}
      </div>
    </div>
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
  passThrough,
  onDown,
}: {
  unit: TAUnit;
  n: number;
  color: string;
  active: boolean;
  single: string | null;
  outside: Set<string>;
  /** линейка: нажатие проходит к полю (привязка к базе там) */
  passThrough: boolean;
  onDown: (e: PointerEvent, unit: TAUnit, modelId: string) => void;
}) {
  const bases = placedBases(unit);
  const c = unitCenter(unit);
  if (!c) return null;
  const [cx0, cy0] = disp(c);
  return (
    <g style={passThrough ? undefined : { cursor: 'grab', touchAction: 'none' }} onClick={passThrough ? undefined : (e) => e.stopPropagation()}>
      {bases.map((b, i) => {
        if (!b) return null;
        const m = unit.models[i]!;
        const [x, y] = disp([b.x, b.y]);
        const known = modelBase(m).known;
        const out = outside.has(m.id);
        return (
          <ellipse
            key={m.id}
            cx={x}
            cy={y}
            rx={b.rx}
            ry={b.ry}
            transform={`rotate(${(b.angle * 180) / Math.PI + 90} ${x} ${y})`}
            fill={color}
            fillOpacity={single === m.id ? 0.85 : active ? 0.55 : 0.35}
            stroke={out ? OUTSIDE : active ? ACCENT : color}
            strokeWidth={out || active ? 0.14 : 0.08}
            strokeDasharray={known ? undefined : '0.25 0.18'}
            onPointerDown={(e) => onDown(e, unit, m.id)}
          />
        );
      })}
      <text x={cx0} y={cy0 + 0.32} textAnchor="middle" fontSize={0.95} fontWeight={700} fill="#fff" pointerEvents="none" style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,0.7)" strokeWidth={0.18}>
        {n}
      </text>
    </g>
  );
}

/** Список отрядов: номер, название, моделей, на столе ли. */
function UnitTray({ units, onSelect }: { units: TAUnit[]; onSelect: (uid: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] text-white/50">Выберите отряд, затем нажмите на поле — отряд встанет туда.</p>
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
        {units.map((u, i) => (
          <button
            key={u.uid}
            type="button"
            onClick={() => onSelect(u.uid)}
            className={cx('w-36 shrink-0 rounded-xl border px-2.5 py-2 text-left', u.placed ? 'border-accent/40 bg-accent/[0.07]' : 'border-white/10 bg-white/[0.03] active:bg-white/10')}
          >
            <span className="flex items-center gap-1.5 text-[11px] text-white/45">
              <b className="text-white">{i + 1}</b>
              {u.placed ? 'на столе' : 'не выставлен'}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-[13px] font-semibold leading-tight">{u.name}</span>
            <span className="block text-[11px] text-white/45">моделей: {u.models.length}</span>
          </button>
        ))}
      </div>
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
}: {
  unit: TAUnit;
  n: number;
  onFormation: (f: Formation) => void;
  onRotate: (deg: number) => void;
  onGap: (gap: number) => void;
  onBase: (profile: string, change: { pick?: number; customMm?: number | null }) => void;
  onRemove: () => void;
  onDone: () => void;
  info: {
    objective: { d: number; inRange: boolean } | null;
    own: { d: number } | null;
    enemy: { d: number } | null;
  } | null;
  side: Side;
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
  const unknown = profiles.some((p) => !p.options.length && p.customMm == null);
  return (
    <div className="max-h-[45dvh] space-y-2 overflow-y-auto">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {n}. {unit.name}
          </p>
          {unit.leaders.length > 0 && <p className="text-[11px] text-white/55">с персонажами: {unit.leaders.join(', ')}</p>}
          <p className={cx('text-[11px]', unknown ? 'text-warn' : 'text-white/45')}>{summary.map(([k, c]) => `${c} × ${k}`).join(' · ')}</p>
        </div>
        <IconButton icon="close" label="Готово" onClick={onDone} className="size-8" />
      </div>
      {info && (
        <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
          <div className={cx('rounded-lg border px-1.5 py-1', info.objective?.inRange ? 'border-[#4ade80]/50 text-[#4ade80]' : 'border-white/10')}>
            <span className="block text-white/45">до цели</span>
            <b className="text-sm">{info.objective ? fmtInches(info.objective.d) : '—'}</b>
            {info.objective?.inRange && <span className="block">в дальности</span>}
          </div>
          <div className="rounded-lg border border-white/10 px-1.5 py-1">
            <span className="block text-white/45">до своей зоны</span>
            <b className="text-sm">{info.own ? (info.own.d ? fmtInches(info.own.d) : 'в зоне') : '—'}</b>
          </div>
          <div className="rounded-lg border border-white/10 px-1.5 py-1">
            <span className="block text-white/45">до зоны {side === 'attacker' ? 'защитника' : 'атакующего'}</span>
            <b className="text-sm">{info.enemy ? (info.enemy.d ? fmtInches(info.enemy.d) : 'в зоне') : '—'}</b>
          </div>
        </div>
      )}
      <Segmented<Formation> value={unit.formation} onChange={onFormation} options={FORMATIONS.map((f) => ({ value: f.id, label: f.label }))} />
      {unit.placed && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-white/45">Поворот:</span>
          {[-45, -15, 15, 45].map((d) => (
            <button key={d} type="button" onClick={() => onRotate(d)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 font-semibold active:bg-white/10">
              {d > 0 ? `↻ ${d}°` : `↺ ${-d}°`}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-white/45">Зазор между базами:</span>
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
        {bases ? 'Скрыть базы' : unknown ? 'Указать размер базы' : 'Базы моделей'}
      </button>
      {bases && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
          {profiles.map((p) => (
            <div key={p.profile} className="text-xs">
              <p className="font-semibold">
                {p.profile} <span className="font-normal text-white/45">· моделей: {p.count}</span>
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
              {p.options.length === 1 && <p className="text-white/55">{baseLabel(p.options[0]!)} (из данных)</p>}
              {!p.options.length && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-warn">В данных: «{p.source || 'нет данных'}». Размер, мм:</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={300}
                    defaultValue={p.customMm ?? ''}
                    placeholder="60"
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      onBase(p.profile, { customMm: v >= 10 && v <= 300 ? v : null });
                    }}
                    className="w-20 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-white outline-none focus:border-accent"
                  />
                </div>
              )}
            </div>
          ))}
          <p className="text-[10.5px] text-white/40">После смены базы отряд перестраивается на том же месте.</p>
        </div>
      )}
      <p className="text-[11px] text-white/50">
        {unit.placed ? 'Тяните базу — едет весь отряд; удерживайте базу — двигается одна модель. Нажатие на поле — отряд переедет туда.' : 'Нажмите на поле — отряд встанет туда.'}
      </p>
      {unit.placed && (
        <Button className="w-full" onClick={onRemove}>
          Убрать со стола
        </Button>
      )}
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
