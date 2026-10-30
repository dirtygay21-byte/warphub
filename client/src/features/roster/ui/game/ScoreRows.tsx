import { useState } from 'react';
import type { MissionCard } from '../../data';
import { cardVp, type CatalogCard, type Round, type RowPick, type SecondaryMode } from '../../game';
import { Button, Icon } from '../kit';
import { cx } from '../util';

/** Строка «за каждую …» — со счётчиком; остальные — один раз. */
const perEach = (text: string) => /за кажд/i.test(text);

/**
 * Отметить выполненные строки карты (G3.3, общий для основной и вторичных): галочка, для «за каждую …» — сколько раз.
 * Очки и ошибки — из движка (cardVp), здесь только предпросмотр; засчитывает событие (onScore).
 * blocks — какие блоки карты действуют сейчас (раунд и момент уже проверены вызывающим).
 */
export function ScoreRows({
  card,
  blocks,
  round,
  mode,
  endOfBattle = false,
  onScore,
  label = 'Засчитать',
}: {
  card: MissionCard;
  blocks: number[];
  round: Round;
  mode?: SecondaryMode | null;
  endOfBattle?: boolean;
  onScore: (picks: RowPick[]) => boolean;
  label?: string;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = (b: number, r: number) => `${b}:${r}`;
  const picks: RowPick[] = Object.entries(counts).map(([k, count]) => {
    const [b, r] = k.split(':').map(Number);
    return { block: b!, row: r!, count };
  });
  const preview = picks.length ? cardVp({ card: card as CatalogCard, picks, round, mode: mode ?? undefined, endOfBattle }) : null;

  const toggle = (b: number, r: number) =>
    setCounts((c) => {
      const next = { ...c };
      const k = key(b, r);
      if (next[k]) delete next[k];
      else {
        // «или» — одна строка из цепочки: снять соседние строки той же цепочки
        const rows = card.blocks[b]!.rows;
        let start = r;
        while (start > 0 && rows[start]!.or) start--;
        for (let i = start; i < rows.length && (i === start || rows[i]!.or); i++) delete next[key(b, i)];
        next[k] = 1;
      }
      return next;
    });
  const step = (b: number, r: number, d: number) => setCounts((c) => ({ ...c, [key(b, r)]: Math.max(1, Math.min(99, (c[key(b, r)] ?? 1) + d)) }));

  return (
    <div className="space-y-2">
      {blocks.map((bi) => {
        const block = card.blocks[bi]!;
        return (
          <div key={bi} className="rounded-xl border border-white/10 bg-black/20 p-2.5">
            <p className="text-[12px] font-semibold text-fg-3">Когда: {block.when}</p>
            <ul className="mt-1 space-y-1.5">
              {block.rows.map((row, ri) => {
                const on = counts[key(bi, ri)] != null;
                return (
                  <li key={ri}>
                    {ri > 0 && <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-fg-3">{row.or ? 'или' : row.plus ? 'и сверх того' : 'а также'}</p>}
                    <div className={cx('flex items-start gap-2 rounded-lg border px-2 py-1.5', on ? 'border-accent bg-accent/10' : 'border-white/10')}>
                      <button type="button" onClick={() => toggle(bi, ri)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                        <span className={cx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent text-black' : 'border-white/30')}>
                          {on && <Icon name="check" className="size-3.5" strokeWidth={3} />}
                        </span>
                        <span className="text-[13px] leading-snug text-white/85">{row.text}</span>
                      </button>
                      <span className="shrink-0 text-right">
                        <span className="font-display block text-base font-semibold leading-none">
                          {row.plus ? '+' : ''}
                          {row.vp}
                          <span className="ml-0.5 text-[12px]">ПО</span>
                        </span>
                        {row.max != null && <span className="block text-[12px] text-fg-3">макс. {row.max}</span>}
                      </span>
                    </div>
                    {on && perEach(row.text) && (
                      <div className="mt-1 flex items-center justify-end gap-2 text-sm">
                        <span className="text-[12px] text-fg-3">сколько:</span>
                        <button type="button" onClick={() => step(bi, ri, -1)} className="ds-hit size-8 rounded-lg border border-white/15 active:bg-white/10" aria-label="Меньше">
                          −
                        </button>
                        <span className="w-6 text-center font-semibold tabular-nums">{counts[key(bi, ri)]}</span>
                        <button type="button" onClick={() => step(bi, ri, 1)} className="ds-hit size-8 rounded-lg border border-white/15 active:bg-white/10" aria-label="Больше">
                          +
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {preview && 'error' in preview && <p className="text-xs text-warn">{preview.error}</p>}
      <Button
        variant="primary"
        className="w-full"
        disabled={!preview || 'error' in preview}
        onClick={() => {
          if (onScore(picks)) setCounts({});
        }}
      >
        {label}
        {preview && 'vp' in preview ? ` · ${preview.vp} ПО` : ''}
      </Button>
    </div>
  );
}
