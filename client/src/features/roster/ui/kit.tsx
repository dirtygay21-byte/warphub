import { useEffect, type ReactNode } from 'react';
import { haptic, pushOverlay } from '../telegram';
import { cx } from './util';
import { WormField } from '@/components/ui/ds/Lime';
import { useEffect as useEffectFs, useState as useStateFs } from 'react';
import { canFullscreen, isFullscreen, onFullscreenChanged, toggleFullscreen } from '@/utils/telegramApp';


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
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  play: 'M8 5l11 7-11 7z',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  distance: 'M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3',
  list: 'M4 6h16M4 12h16M4 18h16',
  target: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 16a4 4 0 110-8 4 4 0 010 8z',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
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
  variant?: 'primary' | 'ghost' | 'danger' | 'outline' | 'ink';
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
        variant === 'ink' && 'min-h-12 bg-[#111110] text-[15px] text-accent',
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
      className={cx('ds-hit flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/80 transition hover:bg-white/[0.08] hover:text-white active:bg-white/10', className)}
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
            {o.hint != null && <span className={cx('block text-xs font-medium', active ? 'text-accent/70' : 'text-fg-3')}>{o.hint}</span>}
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
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-3">{label}</span>
        {hint && <span className="text-xs text-fg-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'danger' | 'warn' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold uppercase leading-none tracking-wide',
        tone === 'muted' && 'bg-white/[0.07] text-fg-2',
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
      {children && <div className="mt-1.5 text-sm text-fg-3">{children}</div>}
    </div>
  );
}



/**
 * Полоса очков ростера (перестройка 15.11.2026): толще, и под ней — сколько осталось или на сколько перебор.
 * Общая для редакторов 40K, AoS, Kill Team и Warcry.
 */
export function PointsBar({ used, limit, unit = 'очк.' }: { used: number; limit: number; unit?: string }) {
  const over = used > limit;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const left = Math.abs(limit - used).toLocaleString('ru-RU');
  return (
    <div className="mt-2.5">
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={cx('h-full rounded-full transition-[width] duration-300', over ? 'bg-danger' : 'bg-accent')} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 flex justify-between text-[12px] font-semibold tabular-nums">
        <span className={over ? 'text-danger' : used === limit ? 'text-accent' : 'text-fg-2'}>
          {over ? `Перебор на ${left} ${unit}` : used === limit ? 'Ровно в лимит' : `Осталось ${left} ${unit}`}
        </span>
        <span className="text-fg-3">{pct}%</span>
      </p>
    </div>
  );
}


/** Червяк в углу цветного блока WarpBuilder (блок — relative overflow-hidden, цвет «Варп»). */
export function HeroWorm() {
  return <WormField />;
}


/** «На весь экран» (15.11.2026): полноэкранный режим Telegram для битв и Test Army; вне Telegram 8.0+ кнопки нет. */
export function FullscreenButton({ className }: { className?: string }) {
  const [on, setOn] = useStateFs(isFullscreen());
  useEffectFs(() => {
    const off = onFullscreenChanged(() => setOn(isFullscreen()));
    // ушли с экрана битвы — выходим из полноэкранного режима, чтобы шапки других экранов не уходили под кнопки Telegram
    return () => {
      off();
      if (isFullscreen()) toggleFullscreen();
    };
  }, []);
  if (!canFullscreen()) return null;
  return (
    <button
      type="button"
      onClick={() => (haptic.tap(), toggleFullscreen())}
      aria-pressed={on}
      aria-label={on ? 'Выйти из полноэкранного режима' : 'На весь экран'}
      title={on ? 'Выйти из полноэкранного режима' : 'На весь экран'}
      className={cx('flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-fg-2 active:bg-white/10', on && 'border-accent/60 text-accent', className)}
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </button>
  );
}
