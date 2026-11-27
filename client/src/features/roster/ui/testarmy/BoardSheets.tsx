import { useMemo, type ReactNode } from 'react';
import {
  APPROX_DEFAULT_MM,
  APPROX_SHAPES,
  APPROX_SIZES,
  approxBase,
  approxOf,
  baseLabel,
  FORMATIONS,
  fmtInches,
  modelBase,
  unitProfiles,
  type ApproxShape,
  type BaseShape,
  type Formation,
  type Side,
  type TAUnit,
} from '../../testarmy';
import { Icon } from '../kit';
import { cx } from '../util';

/**
 * Test Army, вариант A (27.11.2026): нижняя панель, «Ещё», лист «Отряды», карточка отряда (Действия / Строй / Профиль)
 * и быстрая панель над картой. Только оформление — состояние и правила в Board.
 */

export type CardTab = 'act' | 'form' | 'prof';
export type UnitsFilter = 'all' | 'off' | 'on';

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** Нижняя панель: Отряды · Линейка · Игра · Ещё. */
export function BottomBar({ off, ruler, game, hasGame, more, onUnits, onRuler, onGame, onMore }: { off: number; ruler: boolean; game: boolean; hasGame: boolean; more: boolean; onUnits: () => void; onRuler: () => void; onGame: () => void; onMore: () => void }) {
  const item = (icon: string, label: string, active: boolean, onClick: () => void, badge?: number) => (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx('relative flex min-h-12 flex-1 flex-col items-center justify-center rounded-xl text-[11.5px] font-semibold', active ? 'bg-accent/20 text-accent' : 'text-fg-2 active:bg-white/10')}
    >
      <Icon name={icon} className="size-5" />
      <span className="mt-0.5">{label}</span>
      {badge ? <span className="absolute right-[18%] top-1 min-w-4 rounded-full bg-[#f5c542] px-1 text-[10px] font-bold leading-4 text-[#0b0d12]">{badge}</span> : null}
    </button>
  );
  return (
    <nav className="flex shrink-0 gap-1 border-t border-white/10 bg-app-elevated px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      {item('list', 'Отряды', false, onUnits, off)}
      {item('ruler', 'Линейка', ruler, onRuler)}
      {hasGame && item('play', game ? 'Игра ✓' : 'Игра', game, onGame)}
      {item('more', 'Ещё', more, onMore)}
    </nav>
  );
}

/** «Ещё»: зоны целей, расстояние между отрядами, масштаб. */
export function MoreMenu({ ranges, rangesLabel, note, distance, onRanges, onDistance, onZoomIn, onZoomOut, onFit }: { ranges: boolean; rangesLabel: string; note: string; distance: boolean; onRanges: () => void; onDistance: () => void; onZoomIn: () => void; onZoomOut: () => void; onFit: () => void }) {
  const row = (label: ReactNode, onClick: () => void, on?: boolean) => (
    <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white/[0.05] px-3 text-left text-[14px] active:bg-white/10">
      <span>{label}</span>
      {on != null && <span className={cx('h-5 w-9 rounded-full p-0.5', on ? 'bg-accent' : 'bg-white/15')}><span className={cx('block size-4 rounded-full bg-white transition-transform', on && 'translate-x-4')} /></span>}
    </button>
  );
  return (
    <div className="sheet-enter absolute bottom-2 right-2 z-20 w-[min(88vw,300px)] space-y-1.5 rounded-2xl bg-app-elevated p-2 shadow-[0_12px_32px_rgba(0,0,0,0.6)]" onPointerDown={stop}>
      <p className="px-1 text-[12px] uppercase tracking-wider text-fg-3">Ещё</p>
      {row(rangesLabel, onRanges, ranges)}
      {ranges && <p className="px-1 text-[12px] text-fg-3">{note}</p>}
      {row('Расстояние между отрядами ↔', onDistance, distance)}
      <div className="grid grid-cols-3 gap-1.5">
        {row('Крупнее', onZoomIn)}
        {row('Мельче', onZoomOut)}
        {row('Всё поле', onFit)}
      </div>
    </div>
  );
}

export type UnitsRow = { uid: string; n: string; name: string; placed: boolean; sub: string; warn?: boolean };

/** Лист «Отряды» (U1): армия, фильтр, карточки отрядов с быстрыми действиями. */
export function UnitsSheet({
  armies,
  army,
  onArmy,
  filter,
  onFilter,
  rows,
  color,
  onPlace,
  onShow,
  onCard,
  onPlaceAll,
  onDistance,
  onClose,
}: {
  armies: { key: string; name: string; color: string }[];
  army: string;
  onArmy: (key: string) => void;
  filter: UnitsFilter;
  onFilter: (f: UnitsFilter) => void;
  rows: UnitsRow[];
  color: string;
  onPlace: (uid: string) => void;
  onShow: (uid: string) => void;
  onCard: (uid: string) => void;
  onPlaceAll?: () => void;
  onDistance: () => void;
  onClose: () => void;
}) {
  const off = rows.filter((r) => !r.placed).length;
  const shown = rows.filter((r) => (filter === 'off' ? !r.placed : filter === 'on' ? r.placed : true));
  const chip = (f: UnitsFilter, label: string, cls?: string) => (
    <button type="button" onClick={() => onFilter(f)} className={cx('h-8 rounded-full px-3 text-[12.5px] font-semibold', filter === f ? 'bg-white text-[#0b0d12]' : cx('bg-white/10', cls ?? 'text-fg-2'))}>
      {label}
    </button>
  );
  return (
    <aside className="sheet-enter absolute inset-x-0 bottom-0 z-20 flex max-h-[78%] flex-col rounded-t-[20px] bg-app-elevated px-3.5 pb-3 pt-2 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]" onPointerDown={stop}>
      <span className="mb-1.5 h-1 w-10 self-center rounded-full bg-white/20" />
      <div className="flex items-center gap-2">
        <p className="font-display flex-1 text-xl font-semibold uppercase">Отряды</p>
        <button type="button" aria-label="Закрыть" onClick={onClose} className="grid size-11 place-items-center rounded-xl bg-white/10 text-fg-2">
          ✕
        </button>
      </div>
      {armies.length > 1 && (
        <div className="mt-2 flex gap-1.5">
          {armies.map((a) => (
            <button key={a.key} type="button" onClick={() => onArmy(a.key)} className={cx('flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[13.5px] font-semibold', army === a.key ? 'text-white' : 'bg-white/[0.06] text-fg-2')} style={army === a.key ? { background: a.color } : undefined}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: army === a.key ? '#fff' : a.color }} />
              <span className="truncate">{a.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chip('all', `Все ${rows.length}`)}
        {chip('off', `Вне стола ${off}`, 'text-[#f5c542]')}
        {chip('on', `На столе ${rows.length - off}`)}
      </div>
      <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain">
        {shown.map((r) => (
          <li key={r.uid} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.05] py-2 pl-3 pr-2" style={!r.placed ? { boxShadow: 'inset 3px 0 0 #f5c542' } : r.warn ? { boxShadow: 'inset 3px 0 0 #F87171' } : undefined}>
            <span className={cx('grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-extrabold', r.placed ? 'text-white' : 'border-2 border-dashed')} style={r.placed ? { background: color } : { borderColor: color, color }}>
              {r.n}
            </span>
            <button type="button" onClick={() => onCard(r.uid)} className="min-w-0 flex-1 text-left">
              <span className="line-clamp-2 block text-[14.5px] font-bold leading-tight">{r.name}</span>
              <span className={cx('block text-[11.5px]', r.warn ? 'text-[#F87171]' : 'text-fg-3')}>{r.sub}</span>
            </button>
            {r.placed ? (
              <>
                <button type="button" aria-label="Показать на поле" onClick={() => onShow(r.uid)} className="grid h-10 w-11 place-items-center rounded-xl bg-white/10">
                  <Icon name="target" className="size-[18px]" />
                </button>
                <button type="button" aria-label="Карточка отряда" onClick={() => onCard(r.uid)} className="grid h-10 w-11 place-items-center rounded-xl bg-white/10 text-base">
                  ›
                </button>
              </>
            ) : (
              <button type="button" onClick={() => onPlace(r.uid)} className="h-10 rounded-xl bg-[#f5c542] px-3 text-[13px] font-bold text-[#0b0d12]">
                Поставить
              </button>
            )}
          </li>
        ))}
        {!shown.length && <li className="py-4 text-center text-[13px] text-fg-3">Нет отрядов</li>}
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button type="button" disabled={!onPlaceAll} onClick={onPlaceAll} className="h-11 rounded-xl bg-white/10 text-[13.5px] disabled:opacity-40">
          Поставить всех в зону
        </button>
        <button type="button" onClick={onDistance} className="h-11 rounded-xl bg-white/10 text-[13.5px]">
          Расстояние ↔
        </button>
      </div>
    </aside>
  );
}

/** Быстрые кнопки выбранного отряда (U2) — строка в свёрнутой карточке: строй, «По одной», поворот. */
export function QuickBar({ formation, perModel, onFormation, onPerModel, onRotate }: { formation: string; perModel: boolean; onFormation: () => void; onPerModel: () => void; onRotate: (deg: number) => void }) {
  const btn = 'h-10 rounded-[10px] bg-white/10 px-2.5 text-[13px] text-white';
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <button type="button" onClick={onFormation} className={cx(btn, 'min-w-0 flex-1 truncate')}>
        {formation} ▾
      </button>
      <button type="button" aria-pressed={perModel} onClick={onPerModel} className={cx(btn, 'min-w-0 flex-1 truncate', perModel && '!bg-accent font-bold !text-[#0b0d12]')}>
        По одной
      </button>
      <button type="button" aria-label="Повернуть влево" onClick={() => onRotate(-15)} className={cx(btn, 'w-12 shrink-0 px-0 text-lg')}>
        ↺
      </button>
      <button type="button" aria-label="Повернуть вправо" onClick={() => onRotate(15)} className={cx(btn, 'w-12 shrink-0 px-0 text-lg')}>
        ↻
      </button>
    </div>
  );
}

/** Карточка отряда: свёрнута — строка с названием; развёрнута — вкладки Действия / Строй / Профиль. */
export function UnitCard({
  n,
  name,
  sub,
  color,
  open,
  tab,
  onTab,
  onToggle,
  onClose,
  tools,
  subTone,
  children,
}: {
  n: string;
  name: string;
  sub: string;
  /** зелёная / красная подпись (зона деплоя, строй) */
  subTone?: 'good' | 'bad';
  /** быстрые кнопки свёрнутой карточки */
  tools?: ReactNode;
  color: string;
  open: boolean;
  tab: CardTab;
  onTab: (t: CardTab) => void;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className={cx('sheet-enter flex flex-col bg-app-elevated', open ? 'max-h-[62vh] rounded-t-[20px] px-3.5 pb-3 pt-2' : 'm-2 rounded-2xl px-3 py-2.5')} style={{ boxShadow: open ? `0 -2px 0 ${color}, 0 -10px 30px rgba(0,0,0,0.5)` : `0 0 0 2px ${color}` }} onPointerDown={stop}>
      {open && <button type="button" aria-label="Свернуть карточку" onClick={onToggle} className="mb-1.5 h-1.5 w-10 self-center rounded-full bg-white/20" />}
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-extrabold text-white" style={{ background: color }}>
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-[16px] font-semibold uppercase leading-tight">{name}</p>
          <p className={cx('truncate text-[11.5px]', subTone === 'bad' ? 'font-bold text-[#F87171]' : subTone === 'good' ? 'font-bold text-[#6fe0a0]' : 'text-fg-3')}>{sub}</p>
        </div>
        {!open && (
          <button type="button" onClick={onToggle} className="h-10 shrink-0 rounded-[10px] bg-white/10 px-3 text-[13px]">
            Карточка ▴
          </button>
        )}
        <button type="button" aria-label="Закрыть" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-fg-2">
          ✕
        </button>
      </div>
      {!open && tools}
      {open && (
        <>
          <div className="mt-2 flex gap-1 rounded-xl bg-[#0b0d12] p-[3px]">
            {(
              [
                ['act', 'Действия'],
                ['form', 'Строй'],
                ['prof', 'Профиль'],
              ] as const
            ).map(([t, label]) => (
              <button key={t} type="button" onClick={() => onTab(t)} className={cx('h-9 flex-1 rounded-[9px] text-[13.5px]', tab === t ? 'bg-white font-bold text-[#0b0d12]' : 'font-semibold text-fg-2')}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </>
      )}
    </div>
  );
}

const label = 'mb-1.5 text-[12px] uppercase tracking-wider text-fg-3';

/** Картинка построения (как на плитке макета U3). */
function FormationIcon({ kind }: { kind: Formation }) {
  const pts: [number, number][] = kind === 'line' ? [[3, 10], [10, 10], [17, 10], [24, 10], [31, 10]] : kind === 'arc' ? [[4, 15], [9, 7], [17, 4], [25, 7], [30, 15]] : [[7, 5], [17, 5], [27, 5], [12, 15], [22, 15]];
  return (
    <svg width="34" height="20" viewBox="0 0 34 20" aria-hidden>
      <g fill="currentColor">{pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={kind === 'tight' ? 4 : 3} />)}</g>
    </svg>
  );
}

/** Вкладка «Строй» (U3): построение, поворот стрелками, базы из ростера, модели по одной, убрать со стола. */
export function FormTab({
  unit,
  angle,
  perModel,
  coherencyNote,
  onFormation,
  onRotate,
  onBase,
  onPerModel,
  onRemove,
}: {
  unit: TAUnit;
  /** поворот отряда, градусы (0 — как выставлен) */
  angle: number;
  perModel: boolean;
  coherencyNote: string | null;
  onFormation: (f: Formation) => void;
  onRotate: (deg: number) => void;
  onBase: (profile: string, change: { pick?: number; custom?: BaseShape | null }) => void;
  onPerModel: () => void;
  onRemove: () => void;
}) {
  const profiles = useMemo(() => unitProfiles(unit), [unit]);
  return (
    <div className="space-y-3.5">
      <div>
        <p className={label}>Формация</p>
        <div className="grid grid-cols-3 gap-1.5">
          {FORMATIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={unit.formation === f.id}
              onClick={() => onFormation(f.id)}
              className={cx('flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl text-[12px]', unit.formation === f.id ? 'bg-accent/15 text-accent ring-2 ring-inset ring-accent' : 'bg-white/[0.06] text-fg-2')}
            >
              <FormationIcon kind={f.id} />
              {f.label}
            </button>
          ))}
        </div>
        {coherencyNote && <p className="mt-1.5 text-[12px] text-fg-3">{coherencyNote}</p>}
      </div>
      {unit.placed && (
        <div>
          <p className={label}>Поворот</p>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Повернуть влево" onClick={() => onRotate(-15)} className="h-12 flex-1 rounded-xl bg-white/10 text-[22px]">
              ↺
            </button>
            <b className="font-display min-w-16 text-center text-[22px] tabular-nums">{angle}°</b>
            <button type="button" aria-label="Повернуть вправо" onClick={() => onRotate(15)} className="h-12 flex-1 rounded-xl bg-white/10 text-[22px]">
              ↻
            </button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {profiles.map((p) => (
          <div key={p.profile}>
            <p className={cx(label, 'flex justify-between gap-2 normal-case tracking-normal')}>
              <span className="uppercase tracking-wider">База{profiles.length > 1 ? ` · ${p.profile}` : ''}</span>
              <span className={p.options.length ? 'text-accent' : 'text-warn'}>{p.options.length ? `из ростера: ${baseLabel(p.options[p.pick] ?? p.options[0]!)} ✓` : 'нет в данных'}</span>
            </p>
            {p.options.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {p.options.map((o, i) => (
                  <button key={i} type="button" onClick={() => onBase(p.profile, { pick: i })} className={cx('h-10 rounded-[10px] px-3 text-[13px]', p.pick === i ? 'bg-accent font-bold text-[#0b0d12]' : 'bg-white/10')}>
                    {baseLabel(o)}
                  </button>
                ))}
              </div>
            )}
            {!p.options.length && <ApproxPicker source={p.source} value={p.custom ?? (p.customMm ? { kind: 'circle', d: p.customMm } : null)} onChange={(custom) => onBase(p.profile, { custom })} />}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" aria-pressed={perModel} onClick={onPerModel} className={cx('h-11 rounded-xl text-[13.5px]', perModel ? 'bg-accent font-bold text-[#0b0d12]' : 'bg-white/10')}>
          Модели по одной
        </button>
        {unit.placed ? (
          <button type="button" onClick={onRemove} className="h-11 rounded-xl text-[13.5px] font-bold text-[#F87171] shadow-[inset_0_0_0_1.5px_#F87171]">
            Убрать со стола
          </button>
        ) : (
          <span />
        )}
      </div>
      <p className="text-[12px] text-fg-3">Тяните базу — едет весь отряд; «Модели по одной» или удержание базы — одна модель.</p>
    </div>
  );
}

/** Модель без размера базы в данных: форма (круг, квадрат, овал) и примерный размер — расстановка ориентировочная. */
function ApproxPicker({ source, value, onChange }: { source: string; value: BaseShape | null; onChange: (b: BaseShape) => void }) {
  const cur = value ? approxOf(value) : { shape: 'circle' as ApproxShape, mm: APPROX_DEFAULT_MM };
  return (
    <div className="space-y-1.5 text-xs">
      <p className="text-warn">
        В данных: «{source || 'нет данных'}» — выберите форму и примерный размер{value ? '' : ` (сейчас круг ${APPROX_DEFAULT_MM} мм)`}.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {APPROX_SHAPES.map((s) => (
          <button key={s.id} type="button" onClick={() => onChange(approxBase(s.id, cur.mm))} className={cx('h-9 rounded-[10px] px-2.5 font-semibold', value && cur.shape === s.id ? 'bg-accent text-[#0b0d12]' : 'bg-white/10')}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {APPROX_SIZES.map((mm) => (
          <button key={mm} type="button" onClick={() => onChange(approxBase(cur.shape, mm))} className={cx('h-9 rounded-[10px] px-2 font-semibold', value && cur.mm === mm ? 'bg-accent text-[#0b0d12]' : 'bg-white/10')}>
            ~{mm} мм
          </button>
        ))}
      </div>
      {value && <p className="text-fg-3">Примерно: {baseLabel(value)}</p>}
    </div>
  );
}

/** Вкладка «Действия» вне режима «Игра»: поставить / переставить, атака, расстояния. */
export function PlaceTab({
  placed,
  side,
  info,
  onPlace,
  onAttack,
}: {
  placed: boolean;
  side: Side;
  info: { objective: { d: number; inRange: boolean } | null; own: { d: number } | null; enemy: { d: number } | null; foe: { d: number } | null } | null;
  onPlace: () => void;
  onAttack?: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={onPlace} className={cx('h-11 rounded-xl text-[13.5px] font-bold', placed ? 'bg-white/10' : 'bg-[#f5c542] text-[#0b0d12]', !onAttack && 'col-span-2')}>
          {placed ? 'Переставить' : 'Поставить'}
        </button>
        {onAttack && (
          <button type="button" onClick={onAttack} className="h-11 rounded-xl bg-accent text-[13.5px] font-bold text-[#0b0d12]">
            ⚔ Атаковать
          </button>
        )}
      </div>
      {info && (
        <div className="grid grid-cols-3 gap-1.5 text-center text-[12px]">
          <div className={cx('rounded-xl px-1.5 py-1.5', info.objective?.inRange ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-white/[0.05]')}>
            <span className="block text-fg-3">до цели</span>
            <b className="text-sm">{info.objective ? fmtInches(info.objective.d) : '—'}</b>
          </div>
          <div className="rounded-xl bg-white/[0.05] px-1.5 py-1.5">
            <span className="block text-fg-3">до своей зоны</span>
            <b className="text-sm">{info.own ? (info.own.d ? fmtInches(info.own.d) : 'в зоне') : '—'}</b>
          </div>
          <div className="rounded-xl bg-white/[0.05] px-1.5 py-1.5">
            <span className="block text-fg-3">до зоны {side === 'attacker' ? 'защитника' : 'атакующего'}</span>
            <b className="text-sm">{info.enemy ? (info.enemy.d ? fmtInches(info.enemy.d) : 'в зоне') : '—'}</b>
          </div>
          {info.foe && (
            <div className="col-span-3 rounded-xl bg-white/[0.05] px-1.5 py-1.5">
              <span className="text-fg-3">до ближайшего врага (от края до края): </span>
              <b className="text-sm">{fmtInches(info.foe.d)}</b>
            </div>
          )}
        </div>
      )}
      <p className="text-[12px] text-fg-3">{placed ? 'Нажмите на поле — отряд встанет туда.' : 'Нажмите на поле, чтобы поставить отряд.'} Действия по фазам — «Игра» внизу.</p>
    </div>
  );
}

/** Вкладка «Профиль» (U4): характеристики, пометки, полная карточка. */
export function ProfileTab({ unit, stats, onInfo }: { unit: TAUnit; stats: string | null; onInfo: () => void }) {
  const parts = (stats ?? '').split(' · ').filter(Boolean);
  const bases = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of unit.models) {
      const b = modelBase(x);
      const k = b.known ? baseLabel(b.shape) : 'база не указана';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m].map(([k, c]) => `${c} × ${k}`).join(' · ');
  }, [unit]);
  return (
    <div className="space-y-3">
      {parts.length > 0 && (
        <div className="grid grid-cols-3 gap-1 text-center sm:grid-cols-6">
          {parts.map((p) => {
            const m = /^(\S+)\s+(.+)$/.exec(p);
            return (
              <div key={p} className="rounded-[10px] bg-white/[0.06] px-1 py-1.5">
                <p className="text-[11px] text-fg-3">{m ? m[1] : ''}</p>
                <p className="font-display text-[17px] leading-tight">{m ? m[2] : p}</p>
              </div>
            );
          })}
        </div>
      )}
      <div className="space-y-0.5 text-[12.5px] text-fg-2">
        <p>Моделей: {unit.models.length} · {bases}</p>
        {unit.leaders.length > 0 && <p>С персонажами: {unit.leaders.join(', ')}</p>}
        {unit.tags?.length ? <p>{unit.tags.join(' · ')}</p> : null}
      </div>
      <button type="button" onClick={onInfo} className="h-11 w-full rounded-xl bg-white/10 text-[13.5px]">
        Полная карточка: оружие и способности
      </button>
    </div>
  );
}
