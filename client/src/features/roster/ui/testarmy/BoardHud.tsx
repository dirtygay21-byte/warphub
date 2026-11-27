import { useEffect, useState } from 'react';
import { ARMY_COLORS, type TAUnit } from '../../testarmy';
import { cx } from '../util';
import { Dice } from './GamePanel';

/**
 * Оформление стола Test Army в стиле battle report (27.11.2026): верхняя полоса армий, полосы «Вне стола»
 * (отряды, которые ещё не выставлены) и крупные баннеры событий поверх поля.
 */

export type HudArmy = { key: string; name: string; color: string; placed: number; total: number };

/** Полоса армий: название в цвете армии, сколько отрядов на столе; нажатие на цвет — выбрать другой. */
export function ArmyBar({ armies, onColor }: { armies: HudArmy[]; onColor?: (key: string, hex: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="relative flex items-stretch gap-1.5 border-b border-white/10 bg-[#0b0d12] px-2 py-1.5">
      {armies.map((a, i) => (
        <button
          key={a.key}
          type="button"
          onClick={() => onColor && setOpen((v) => (v === a.key ? null : a.key))}
          className={cx('flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left', i === 1 && 'flex-row-reverse text-right')}
          style={{ background: `${a.color}26`, boxShadow: `inset 0 0 0 1.5px ${a.color}` }}
          aria-label={`${a.name}: цвет армии`}
        >
          <span className="size-3.5 shrink-0 rounded-full border-2 border-white/80" style={{ background: a.color }} />
          <span className="min-w-0 flex-1">
            <span className="font-display block truncate text-[13px] font-bold uppercase leading-tight tracking-wide text-white">{a.name}</span>
            <span className="block text-[10.5px] leading-tight text-white/60">
              на столе {a.placed}/{a.total}
            </span>
          </span>
        </button>
      ))}
      {open && onColor && (
        <div className="ds-pop absolute left-2 right-2 top-full z-20 mt-1 rounded-xl border border-white/10 bg-app-elevated p-2 shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
          <p className="mb-1.5 text-[12px] text-fg-3">Цвет армии «{armies.find((a) => a.key === open)?.name}»</p>
          <div className="grid grid-cols-8 gap-1.5">
            {ARMY_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                onClick={() => (onColor(open, c.hex), setOpen(null))}
                className={cx('aspect-square rounded-full border-2', armies.find((a) => a.key === open)?.color === c.hex ? 'border-white' : 'border-transparent')}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** «Вне стола»: отряды армии, которые ещё не выставлены; нажатие выбирает отряд, следующее нажатие на поле ставит его. */
export function OffTable({ name, color, units, label, selected, onPick }: { name: string; color: string; units: TAUnit[]; label: (u: TAUnit) => string; selected: string | null; onPick: (uid: string) => void }) {
  if (!units.length) return null;
  return (
    <div className="flex items-stretch gap-1.5 border-white/10 bg-[#0b0d12] px-2 py-1.5" style={{ borderTop: `2px solid ${color}` }}>
      <div className="flex w-14 shrink-0 flex-col justify-center">
        <span className="font-display text-[11px] font-bold uppercase leading-none text-[#f5c542]">Вне стола</span>
        <span className="mt-0.5 truncate text-[9.5px] font-semibold uppercase leading-none" style={{ color }}>
          {name}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-contain">
        {units.map((u) => (
          <button
            key={u.uid}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onPick(u.uid)}
            className={cx('flex h-11 w-[5.5rem] shrink-0 flex-col justify-between rounded-md px-1.5 py-1 text-left', selected === u.uid && 'ring-2 ring-[#f5c542]')}
            style={{ background: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}aa` }}
          >
            <span className="flex items-center gap-1">
              <b className="grid size-4 shrink-0 place-items-center rounded-full text-[9.5px] text-white" style={{ background: color }}>
                {label(u)}
              </b>
              <span className="truncate text-[9.5px] text-white/60">{u.models.length} мод.</span>
            </span>
            <span className="line-clamp-1 text-[11px] font-semibold leading-tight text-white">{u.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type BannerSpec = { id: number; title: string; kicker?: string; sub?: string; color?: string; tone?: 'event' | 'good' | 'bad'; dice?: number[] };

/** Крупный баннер события поверх поля (как в battle report); исчезает сам, нажатие закрывает раньше. */
export function Banner({ banner, onDone }: { banner: BannerSpec | null; onDone: () => void }) {
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(onDone, banner.dice ? 3200 : banner.tone === 'event' ? 1700 : 2600);
    return () => window.clearTimeout(t);
  }, [banner, onDone]);
  if (!banner) return null;
  const edge = banner.tone === 'bad' ? '#e5383b' : banner.tone === 'good' ? '#2bb24c' : '#f5c542';
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[34%] z-20 flex justify-center px-4">
    <button
      key={banner.id}
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onDone}
      className="ds-pop pointer-events-auto w-full max-w-[420px] overflow-hidden rounded-2xl bg-[#0b0d12]/95 text-center"
      style={{ boxShadow: `0 0 0 3px ${edge}, 0 16px 48px rgba(0,0,0,0.7)` }}
    >
      {banner.kicker && (
        <span className="block px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-white" style={{ background: banner.color ?? '#1e3a8a' }}>
          {banner.kicker}
        </span>
      )}
      {banner.dice && (
        <span className="flex justify-center pt-2.5">
          <Dice values={banner.dice} color={banner.color ?? '#2f7cf6'} />
        </span>
      )}
      <span className="font-display block px-3 pt-2 text-[30px] font-extrabold uppercase leading-none tracking-wide" style={{ color: edge }}>
        {banner.title}
      </span>
      <span className="block px-3 pb-2.5 pt-1 text-[13px] text-white/80">{banner.sub ?? ''}</span>
    </button>
    </div>
  );
}
