import type { SimActionDef, SimPhase } from '../../testarmy';
import { cx } from '../util';

/**
 * Симулятор игровых моментов (этап 2, 27.11.2026): полоса фаз и панель действий отряда.
 * Логика — в Board (состояние хода) и testarmy/sim.ts (правила).
 */

export function PhaseBar({
  phases,
  phase,
  round,
  army,
  color,
  onPhase,
  onNext,
  onSwitchArmy,
  onUndo,
  canUndo,
}: {
  phases: SimPhase[];
  phase: number;
  round: number;
  army: string;
  color: string;
  onPhase: (i: number) => void;
  onNext: () => void;
  onSwitchArmy?: () => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  return (
    <div className="border-b border-white/10 bg-[#0b0d12] px-2 pb-1.5 pt-1">
      <div className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-wide">
        <span className="text-[#f5c542]">Раунд {round}</span>
        <button type="button" onClick={onSwitchArmy} className="min-w-0 truncate rounded px-1.5 py-0.5 text-white" style={{ background: `${color}55`, boxShadow: `inset 0 0 0 1px ${color}` }} aria-label="Сменить армию, чей ход">
          ход: {army}
        </button>
        <span className="flex-1" />
        <button type="button" disabled={!canUndo} onClick={onUndo} className="rounded px-1.5 py-0.5 text-white/80 disabled:opacity-30">
          ↶ Отменить
        </button>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-contain">
          {phases.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPhase(i)}
              className={cx('shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold', i === phase ? 'fx-phase text-[#0b0d12]' : 'bg-white/[0.06] text-white/60')}
              style={i === phase ? { background: '#f5c542' } : undefined}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onNext} className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-[12px] font-bold text-white active:bg-white/20">
          Дальше →
        </button>
      </div>
    </div>
  );
}

/** Действия выбранного отряда в текущей фазе. */
export function ActionPanel({
  title,
  sub,
  color,
  actions,
  onAction,
  onClose,
  budget,
  order,
  onOrder,
  onEnd,
  embedded,
}: {
  title: string;
  sub: string;
  color: string;
  actions: SimActionDef[];
  onAction: (a: SimActionDef) => void;
  onClose: () => void;
  /** активация: сколько AP / действий осталось */
  budget?: { left: number; of: number; unit: string };
  /** Kill Team: приказ оперативника */
  order?: 'engage' | 'conceal';
  onOrder?: (o: 'engage' | 'conceal') => void;
  /** активация начата — завершить раньше */
  onEnd?: () => void;
  /** внутри карточки отряда (вариант A, 27.11.2026): без своей рамки и заголовка */
  embedded?: boolean;
}) {
  return (
    <div
      className={embedded ? '' : 'sheet-enter absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-10 rounded-2xl bg-[#0b0d12]/95 p-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.6)]'}
      style={embedded ? undefined : { boxShadow: `0 0 0 2px ${color}, 0 12px 32px rgba(0,0,0,0.6)` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {!embedded && <div className="mb-1.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-[15px] font-bold uppercase leading-tight text-white">{title}</p>
          <p className="truncate text-[11.5px] text-white/60">{sub}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[12px] text-white/60" aria-label="Закрыть">
          ✕
        </button>
      </div>}
      {(budget || order) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {budget && (
            <span className="rounded-md bg-[#f5c542]/15 px-2 py-1 text-[12px] font-bold text-[#f5c542]">
              {budget.unit}: {budget.left} из {budget.of}
            </span>
          )}
          {order && onOrder && (
            <span className="flex overflow-hidden rounded-md border border-white/15 text-[12px] font-semibold">
              {(['engage', 'conceal'] as const).map((o) => (
                <button key={o} type="button" onClick={() => onOrder(o)} className={cx('px-2 py-1', order === o ? 'bg-white text-[#0b0d12]' : 'text-white/60')}>
                  {o === 'engage' ? 'Engage' : 'Conceal'}
                </button>
              ))}
            </span>
          )}
          {onEnd && (
            <button type="button" onClick={onEnd} className="ml-auto rounded-md bg-white/10 px-2 py-1 text-[12px] font-semibold text-white">
              Завершить активацию
            </button>
          )}
        </div>
      )}
      {actions.length === 0 ? (
        <p className="text-[12px] text-white/60">В этой фазе у отряда нет действий.</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={!!a.blocked}
              onClick={() => onAction(a)}
              className={cx('rounded-xl px-2.5 py-2 text-left', a.blocked ? 'bg-white/[0.04] opacity-55' : 'bg-white/10 active:bg-white/20')}
              style={a.blocked ? undefined : { boxShadow: `inset 0 0 0 1.5px ${color}` }}
            >
              <span className="block text-[13px] font-semibold leading-tight text-white">
                {a.label}
                {a.ap != null && budget && <span className="ml-1 text-[11px] font-normal text-[#f5c542]">{a.ap}{budget.unit === 'AP' ? 'AP' : ''}</span>}
              </span>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-white/55">{a.blocked ?? a.hint ?? a.en}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Идёт манёвр: сколько пройдено, бросок, нарушения; «Готово» / «Отменить». */
export function MovePanel({
  title,
  color,
  progress,
  roll,
  problems,
  targets,
  onDone,
  onCancel,
  failLabel,
}: {
  title: string;
  color: string;
  progress: string;
  roll?: number[];
  problems: string[];
  targets?: string;
  onDone: () => void;
  onCancel: () => void;
  /** вместо «Готово», когда манёвр не по правилам (нападение — «не удалось») */
  failLabel?: string;
}) {
  return (
    <div className="absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-10 rounded-2xl bg-[#0b0d12]/95 p-2.5" style={{ boxShadow: `0 0 0 2px ${color}, 0 12px 32px rgba(0,0,0,0.6)` }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <p className="font-display min-w-0 flex-1 truncate text-[14px] font-bold uppercase text-white">{title}</p>
        {roll && <Dice values={roll} small />}
      </div>
      <p className="mt-0.5 text-[12px] text-white/75">{progress}</p>
      {targets && <p className="text-[11.5px] text-white/55">Цели: {targets}</p>}
      {problems.map((p) => (
        <p key={p} className="mt-0.5 text-[12px] font-semibold text-[#ff6b6b]">
          ✕ {p}
        </p>
      ))}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={onCancel} className="rounded-xl bg-white/10 py-2 text-[13px] font-semibold text-white active:bg-white/20">
          Отменить
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={problems.length > 0 && !failLabel}
          className="rounded-xl py-2 text-[13px] font-bold text-[#0b0d12] disabled:opacity-40"
          style={{ background: problems.length ? '#ff6b6b' : '#f5c542' }}
        >
          {problems.length && failLabel ? failLabel : 'Готово'}
        </button>
      </div>
    </div>
  );
}

/** Кубы D6 (точки), как в battle report. */
export function Dice({ values, small, color = '#2f7cf6' }: { values: number[]; small?: boolean; color?: string }) {
  const pips: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
  };
  return (
    <span className="inline-flex gap-1.5">
      {values.map((v, i) => (
        <svg key={i} viewBox="0 0 100 100" className={cx('fx-dice fx-strong shrink-0', small ? 'size-6' : 'size-11')} style={{ animationDelay: `${i * 90}ms` }} aria-label={String(v)}>
          <rect x={4} y={4} width={92} height={92} rx={20} fill={color} stroke="#fff" strokeWidth={5} />
          {(pips[v] ?? []).map(([x, y], k) => (
            <circle key={k} cx={x} cy={y} r={9} fill="#fff" />
          ))}
        </svg>
      ))}
    </span>
  );
}

/** Нападение: выбор целей (нажатием на столе) и бросок 2D6. */
export function ChargePanel({ color, targets, onRoll, onCancel }: { color: string; targets: string[]; onRoll: () => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-10 rounded-2xl bg-[#0b0d12]/95 p-2.5" style={{ boxShadow: `0 0 0 2px ${color}, 0 12px 32px rgba(0,0,0,0.6)` }} onPointerDown={(e) => e.stopPropagation()}>
      <p className="font-display text-[14px] font-bold uppercase text-white">Нападение</p>
      <p className="mt-0.5 text-[12px] text-white/70">{targets.length ? `Цели: ${targets.join(', ')}` : 'Нажмите на вражеские отряды в пределах 12″ — это цели нападения.'}</p>
      <p className="text-[11px] text-white/45">Красный пунктир — радиус связывания врагов (2″). Отряд должен закончить в нём со всеми целями и ни с кем больше.</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={onCancel} className="rounded-xl bg-white/10 py-2 text-[13px] font-semibold text-white active:bg-white/20">
          Отменить
        </button>
        <button type="button" onClick={onRoll} disabled={!targets.length} className="rounded-xl py-2 text-[13px] font-bold text-[#0b0d12] disabled:opacity-40" style={{ background: '#f5c542' }}>
          Бросить 2D6
        </button>
      </div>
    </div>
  );
}
