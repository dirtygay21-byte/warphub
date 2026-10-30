import { type ReactNode } from 'react';
import { type PointCategory, type PointSystem } from '../points';
import { openExternal } from '../telegram';
import { Sheet, Tag } from './kit';
import { cx } from './util';

/*
 * Лист «Очки»: очки сборки армии (посчитаны движком ростера) отдельно от очков в партии (VP, CP).
 * Общий для 40K и AoS — содержимое приходит списком PointSystem (points.ts).
 */

const CATEGORY: Record<PointCategory, { title: string; hint: string }> = {
  army: { title: 'Сборка армии', hint: 'Считается по вашему ростеру.' },
  game: { title: 'Во время партии', hint: 'Набираются и тратятся в игре — конструктор их не начисляет.' },
};

const STATUS: Record<PointSystem['status'], { label: string; tone: 'accent' | 'muted' | 'warn' }> = {
  computed: { label: 'по ростеру', tone: 'accent' },
  reference: { label: 'справка', tone: 'muted' },
  unavailable: { label: 'нет данных', tone: 'warn' },
};

function SystemCard({ s }: { s: PointSystem }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">{s.title}</p>
        <Tag tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Tag>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-fg-3">{s.about}</p>
      <div className="mt-2">
        {s.lines.map((l, i) => (
          <div key={i} className="border-b border-white/[0.05] py-1.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-fg-2">{l.label}</span>
              <span className={cx('shrink-0 text-[13.5px] font-semibold tabular-nums', l.bad ? 'text-danger' : 'text-white/90')}>{l.value}</span>
            </div>
            {l.note && <p className="mt-0.5 text-[12px] leading-snug text-fg-3">{l.note}</p>}
          </div>
        ))}
      </div>
      {s.context && <p className="mt-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[12px] leading-snug text-fg-3">{s.context}</p>}
      {!!s.sources?.length && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-fg-3">
          Источник:
          {s.sources.map((src) =>
            src.url ? (
              <button key={src.label} type="button" onClick={() => openExternal(src.url!)} className="font-semibold text-accent/90 underline underline-offset-2">
                {src.label}
              </button>
            ) : (
              <span key={src.label}>{src.label}</span>
            ),
          )}
        </p>
      )}
    </div>
  );
}

export function PointsSheet({ open, onClose, systems, extra }: { open: boolean; onClose: () => void; systems: PointSystem[]; extra?: Partial<Record<PointCategory, ReactNode>> }) {
  return (
    <Sheet open={open} onClose={onClose} title="Очки" tall>
      <div className="space-y-5 pb-2">
        {(['army', 'game'] as PointCategory[]).map((cat) => (
          <section key={cat} className="space-y-2" aria-label={CATEGORY[cat].title}>
            <div className="px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">{CATEGORY[cat].title}</p>
              <p className="text-[12px] text-fg-3">{CATEGORY[cat].hint}</p>
            </div>
            {systems
              .filter((s) => s.category === cat)
              .map((s) => (
                <SystemCard key={s.id} s={s} />
              ))}
            {extra?.[cat]}
          </section>
        ))}
      </div>
    </Sheet>
  );
}
