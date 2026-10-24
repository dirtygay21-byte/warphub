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

  // нажатие на поле: выбранный отряд встаёт центром в эту точку (не после перетаскивания)
  const onTap = (e: MouseEvent<SVGSVGElement>) => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    const p = sel && toBoard(e.clientX, e.clientY);
    if (!sel || !p) return;
    update(placeUnit(sel, clampToBoard(p)));
    haptic.select();
  };

  // перетаскивание: палец на базе — весь отряд; удержание без движения — одна модель
  const onDown = (e: PointerEvent, unit: TAUnit, modelId: string) => {
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
  const onMove = (e: PointerEvent) => {
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
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    window.clearTimeout(d.timer);
    if (d.moved) justDragged.current = true;
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
            {units.map((u, i) => (
              <UnitShapes key={u.uid} unit={u} n={i + 1} color={SIDE_COLOR[side]} active={u.uid === selected} single={single} outside={outside} onDown={onDown} />
            ))}
          </svg>
        </div>
      </div>

      <div className="border-t border-white/10 bg-app-elevated px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
        {sel ? (
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
  onDown,
}: {
  unit: TAUnit;
  n: number;
  color: string;
  active: boolean;
  single: string | null;
  outside: Set<string>;
  onDown: (e: PointerEvent, unit: TAUnit, modelId: string) => void;
}) {
  const bases = placedBases(unit);
  const c = unitCenter(unit);
  if (!c) return null;
  const [cx0, cy0] = disp(c);
  return (
    <g style={{ cursor: 'grab', touchAction: 'none' }} onClick={(e) => e.stopPropagation()}>
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
}: {
  unit: TAUnit;
  n: number;
  onFormation: (f: Formation) => void;
  onRotate: (deg: number) => void;
  onGap: (gap: number) => void;
  onBase: (profile: string, change: { pick?: number; customMm?: number | null }) => void;
  onRemove: () => void;
  onDone: () => void;
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
