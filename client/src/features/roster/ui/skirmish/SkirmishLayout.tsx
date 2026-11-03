import type { ReactNode } from 'react';
import { Icon } from '../kit';
import { cx } from '../util';

/** Та же карточка шага подготовки, что в AoS. */
export function SkirmishStep({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl border bg-white/[0.03] p-4', done ? 'border-white/10' : 'border-accent/30')}>
      <p className="mb-2 flex items-center gap-2">
        <span className={cx('flex size-6 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-accent text-black' : 'bg-white/10 text-fg-2')}>
          {done ? <Icon name="check" className="size-3.5" /> : n}
        </span>
        <span className="font-display text-lg font-semibold uppercase">{title}</span>
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

const LABELS = ['MISSION ACTION', 'ADDITIONAL RULES', 'VICTORY POINTS', 'REVEAL'] as const;

/** Нормализованный текст правила: смысловые заголовки отделены, служебные Unicode-символы не показываются. */
export function SkirmishRuleText({ text }: { text: string }) {
  const clean = text.replace(/\u200b|\u200c|\u200d|\ufeff/g, '').replace(/\s+/g, ' ').trim();
  const marker = new RegExp(`\\b(${LABELS.join('|')})\\b`, 'g');
  const parts = clean.split(marker);
  return (
    <div className="space-y-1.5">
      {parts.map((part, i) => LABELS.includes(part as (typeof LABELS)[number]) ? (
        <p key={i} className="pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-accent/90">{part}</p>
      ) : (
        <p key={i} className="text-[12.5px] leading-relaxed text-fg-2">{part}</p>
      ))}
    </div>
  );
}
