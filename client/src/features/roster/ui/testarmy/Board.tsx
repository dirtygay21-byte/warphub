import { useMemo, useRef, useState, type MouseEvent } from 'react';
import type { BfDeployment, BfLayout } from '../../data';
import type { Roster } from '../../engine/types';
import { haptic } from '../../telegram';
import {
  baseLabel,
  clampToBoard,
  FORMATIONS,
  modelBase,
  placeUnit,
  placedBases,
  removeUnit,
  unitCenter,
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
  const sel = units.find((u) => u.uid === selected) ?? null;
  const placedCount = units.filter((u) => u.placed).length;

  const update = (u: TAUnit) => onUnits(units.map((x) => (x.uid === u.uid ? u : x)));

  // нажатие на поле: выбранный отряд встаёт центром в эту точку
  const onTap = (e: MouseEvent<SVGSVGElement>) => {
    if (!sel || !svg.current) return;
    const ctm = svg.current.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    update(placeUnit(sel, clampToBoard(undisp([p.x, p.y]))));
    haptic.select();
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
          </p>
        </div>
        <IconButton icon="minus" label="Мельче" onClick={() => setZoom((z) => Math.max(0, z - 1))} className="size-9" />
        <IconButton icon="plus" label="Крупнее" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} className="size-9" />
      </header>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-2">
        <div className="relative mx-auto" style={{ width: `${ZOOMS[zoom]! * 100}%`, maxWidth: zoom ? 'none' : 520 }}>
          <BattleMap layout={layout} dep={dep} guides="none" className="block w-full" />
          <svg ref={svg} viewBox="-1.5 -1.5 47 63" className={cx('absolute inset-0 h-full w-full', sel && 'cursor-crosshair')} onClick={onTap}>
            {units.map((u, i) => (
              <UnitShapes key={u.uid} unit={u} n={i + 1} color={SIDE_COLOR[side]} active={u.uid === selected} onSelect={() => setSelected(u.uid)} />
            ))}
          </svg>
        </div>
      </div>

      <div className="border-t border-white/10 bg-app-elevated px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
        {sel ? (
          <UnitPanel unit={sel} n={units.indexOf(sel) + 1} onFormation={setFormation} onRemove={() => update(removeUnit(sel))} onDone={() => setSelected(null)} />
        ) : (
          <UnitTray units={units} onSelect={(uid) => (haptic.select(), setSelected(uid))} />
        )}
      </div>
    </div>
  );
}

/** Базы отряда на столе и номер отряда в центре. */
function UnitShapes({ unit, n, color, active, onSelect }: { unit: TAUnit; n: number; color: string; active: boolean; onSelect: () => void }) {
  const bases = placedBases(unit);
  const c = unitCenter(unit);
  if (!c) return null;
  const [cx0, cy0] = disp(c);
  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      style={{ cursor: 'pointer' }}
    >
      {bases.map((b, i) => {
        if (!b) return null;
        const [x, y] = disp([b.x, b.y]);
        const known = modelBase(unit.models[i]!).known;
        return (
          <ellipse
            key={unit.models[i]!.id}
            cx={x}
            cy={y}
            rx={b.rx}
            ry={b.ry}
            transform={`rotate(${(b.angle * 180) / Math.PI + 90} ${x} ${y})`}
            fill={color}
            fillOpacity={active ? 0.55 : 0.35}
            stroke={active ? ACCENT : color}
            strokeWidth={active ? 0.14 : 0.08}
            strokeDasharray={known ? undefined : '0.25 0.18'}
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

/** Выбранный отряд: построение, базы, убрать со стола. */
function UnitPanel({ unit, n, onFormation, onRemove, onDone }: { unit: TAUnit; n: number; onFormation: (f: Formation) => void; onRemove: () => void; onDone: () => void }) {
  const bases = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of unit.models) {
      const b = modelBase(x);
      const k = b.known ? baseLabel(b.shape) : `размер базы не указан (${x.source || 'нет данных'})`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m];
  }, [unit]);
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {n}. {unit.name}
          </p>
          {unit.leaders.length > 0 && <p className="text-[11px] text-white/55">с персонажами: {unit.leaders.join(', ')}</p>}
          <p className="text-[11px] text-white/45">
            {bases.map(([k, c]) => `${c} × ${k}`).join(' · ')}
          </p>
        </div>
        <IconButton icon="close" label="Готово" onClick={onDone} className="size-8" />
      </div>
      <Segmented<Formation> value={unit.formation} onChange={onFormation} options={FORMATIONS.map((f) => ({ value: f.id, label: f.label }))} />
      <p className="text-[11px] text-white/50">{unit.placed ? 'Нажмите на поле — отряд переедет туда.' : 'Нажмите на поле — отряд встанет туда.'}</p>
      {unit.placed && (
        <Button className="w-full" onClick={onRemove}>
          Убрать со стола
        </Button>
      )}
    </div>
  );
}
