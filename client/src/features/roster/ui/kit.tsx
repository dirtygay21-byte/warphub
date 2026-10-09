import { useEffect, type ReactNode } from 'react';
import { haptic, pushOverlay } from '../telegram';
import { cx } from './util';


const paths: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  search: 'M11 18a7 7 0 110-14 7 7 0 010 14zM20 20l-4-4',
  share: 'M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M12 3v12M7 8l5-5 5 5',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  info: 'M12 16v-5M12 8v.01M12 21a9 9 0 110-18 9 9 0 010 18z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13M8 7h7',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
};

export function Icon({ name, className = 'size-5', strokeWidth = 2 }: { name: keyof typeof paths | string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  className,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={() => {
        haptic.tap();
        onClick?.();
      }}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        variant === 'primary' && 'bg-accent text-accent-foreground hover:brightness-105',
        variant === 'ghost' && 'bg-white/[0.05] text-white/85 hover:bg-white/[0.09] active:bg-white/10',
        variant === 'outline' && 'border border-white/10 text-white/85 hover:bg-white/[0.04] active:bg-white/5',
        variant === 'danger' && 'bg-danger/10 text-danger hover:bg-danger/15 active:bg-danger/20',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ icon, onClick, label, className }: { icon: string; onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
      className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/80 transition hover:bg-white/[0.08] hover:text-white active:bg-white/10', className)}
    >
      <Icon name={icon} />
    </button>
  );
}

/** Нижняя шторка. */
export function Sheet({ open, onClose, title, children, footer, tall }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; tall?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const pop = pushOverlay(onClose);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      pop();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <div className="fade-enter absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          'sheet-enter relative flex w-full max-w-lg flex-col rounded-t-3xl border border-white/10 bg-app-elevated sm:rounded-3xl lg:max-w-xl',
          tall ? 'h-[92dvh] sm:h-[85dvh]' : 'max-h-[88dvh]',
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-center gap-3 px-4 pb-2 pt-3">
          <h2 className="font-display min-w-0 flex-1 truncate text-lg font-semibold uppercase">{title}</h2>
          <IconButton icon="close" label="Закрыть" onClick={onClose} className="size-9" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer && <div className="border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T | null; options: { value: T; label: ReactNode; hint?: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => {
              haptic.select();
              onChange(o.value);
            }}
            className={cx(
              'min-h-10 rounded-lg border px-3 py-1.5 text-left text-sm font-semibold transition disabled:opacity-40',
              active ? 'border-accent bg-accent/10 text-accent' : 'border-white/10 bg-white/[0.03] text-white/80 hover:border-white/20 active:bg-white/10',
            )}
          >
            <span className="block leading-tight">{o.label}</span>
            {o.hint != null && <span className={cx('block text-xs font-medium', active ? 'text-accent/70' : 'text-white/45')}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Counter({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const btn = 'flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/80 active:bg-white/10 disabled:opacity-30';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label="Меньше" className={btn} disabled={value <= min} onClick={() => (haptic.select(), onChange(value - 1))}>
        <Icon name="minus" className="size-4" />
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button type="button" aria-label="Больше" className={btn} disabled={value >= max} onClick={() => (haptic.select(), onChange(value + 1))}>
        <Icon name="plus" className="size-4" />
      </button>
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/45">{label}</span>
        {hint && <span className="text-xs text-white/40">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'danger' | 'warn' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide',
        tone === 'muted' && 'bg-white/[0.07] text-white/60',
        tone === 'accent' && 'bg-accent/15 text-accent',
        tone === 'danger' && 'bg-danger/15 text-danger',
        tone === 'warn' && 'bg-warn/15 text-warn',
      )}
    >
      {children}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center">
      <p className="font-display text-base font-semibold uppercase text-white/80">{title}</p>
      {children && <div className="mt-1.5 text-sm text-white/50">{children}</div>}
    </div>
  );
}

