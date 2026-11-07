/**
 * Элементы управления игровых экранов в оформлении приложения (07.11.2026: Kill Team и Warcry — как AoS и 40K):
 * выбор из списка — строка с подписью и лист выбора (вместо системного <select>), короткий выбор — кнопки-чипы,
 * переключатель — чип (вместо галочки), счётчик — как CP у AoS. Высота нажимаемых элементов — не меньше 44 px.
 */
import { useState, type ReactNode } from 'react';
import { haptic } from '../../telegram';
import { Icon, IconButton, Sheet } from '../kit';
import { cx } from '../util';

export type Choice<T extends string | number> = { value: T; label: string; sub?: string };

/**
 * Выбор из списка: до `inlineMax` вариантов — кнопки-чипы в строку; больше — строка выбора, по нажатию лист со списком.
 * value '' / null — ничего не выбрано (показывается placeholder).
 */
export function ChoiceField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Выбрать',
  inlineMax = 3,
  disabled,
}: {
  label?: string;
  value: T | '' | null;
  options: Choice<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  inlineMax?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  if (options.length <= inlineMax)
    return (
      <div>
        {label && <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-fg-3">{label}</p>}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              disabled={disabled}
              aria-pressed={o.value === value}
              onClick={() => (haptic.select(), onChange(o.value))}
              className={cx(
                'min-h-11 rounded-xl border px-2 py-1.5 text-[13px] font-semibold leading-tight transition disabled:opacity-50',
                o.value === value ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-fg-2 active:bg-white/5',
              )}
            >
              {o.label}
              {o.sub && <span className="block text-[12px] font-normal text-fg-3">{o.sub}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (haptic.tap(), setOpen(true))}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition active:bg-white/5 disabled:opacity-50"
      >
        <span className="min-w-0 flex-1">
          {label && <span className="block text-[12px] font-semibold uppercase tracking-wider text-fg-3">{label}</span>}
          <span className={cx('block truncate text-[14px] font-semibold', current ? 'text-white/90' : 'text-accent')}>{current?.label ?? placeholder}</span>
          {current?.sub && <span className="block truncate text-[12px] text-fg-3">{current.sub}</span>}
        </span>
        <Icon name="chevron" className="size-4 shrink-0 text-fg-3" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label ?? placeholder} tall={options.length > 8}>
        <div className="space-y-1.5 pb-2">
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => (haptic.select(), onChange(o.value), setOpen(false))}
              className={cx(
                'flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition',
                o.value === value ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03] active:bg-white/10',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cx('block text-[14px] font-semibold', o.value === value ? 'text-accent' : 'text-white/90')}>{o.label}</span>
                {o.sub && <span className="block text-[12px] text-fg-3">{o.sub}</span>}
              </span>
              {o.value === value && <Icon name="check" className="size-4 shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** Переключатель-чип (вместо галочки): подпись, отмечено — акцентный. */
export function ToggleChip({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => (haptic.select(), onChange(!checked))}
      className={cx(
        'flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-semibold transition',
        checked ? 'border-accent bg-accent/10 text-accent' : 'border-white/10 text-fg-2 active:bg-white/5',
      )}
    >
      <span className={cx('flex size-5 shrink-0 items-center justify-center rounded-md border', checked ? 'border-accent bg-accent text-black' : 'border-white/30')}>
        {checked && <Icon name="check" className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

/** Счётчик (как CP у AoS): подпись, «−», значение, «+»; readOnly — только значение. */
export function GameCounter({ label, value, onMinus, onPlus, readOnly }: { label: string; value: number; onMinus: () => void; onPlus: () => void; readOnly?: boolean }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <span className="min-w-0 flex-1 text-[12px] text-fg-3">{label}</span>
      {!readOnly && <IconButton icon="minus" label={`${label}: меньше`} onClick={onMinus} className="size-9" />}
      <span className="font-display w-7 text-center text-lg font-semibold tabular-nums">{value}</span>
      {!readOnly && <IconButton icon="plus" label={`${label}: больше`} onClick={onPlus} className="size-9" />}
    </div>
  );
}

/** Подзаголовок внутри игровой карточки (как подписи у AoS). */
export function GameLabel({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{children}</p>;
}
