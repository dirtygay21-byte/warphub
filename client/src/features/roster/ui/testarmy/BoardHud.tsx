import { useEffect, useState } from 'react';
import { ARMY_COLORS } from '../../testarmy';
import { cx } from '../util';
import { Dice } from './GamePanel';

/**
 * Оформление стола Test Army в стиле battle report (27.11.2026): верхняя полоса армий и крупные баннеры событий поверх поля.
 * «Вне стола» (вариант A, 27.11.2026) — кнопка на поле и лист «Отряды» (BoardSheets).
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
