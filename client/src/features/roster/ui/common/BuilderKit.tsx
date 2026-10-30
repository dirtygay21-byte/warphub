/**
 * Общие элементы WarpBuilder (R1 30.10.2026): одинаковый вид списков, шапок редакторов и карточек для всех игр
 * (AoS, Kill Team, Warcry). Разметка — как в разделе AoS; данные игр сюда не попадают — только отображение.
 */
import { useRef, useState, type ReactNode } from 'react';
import { haptic } from '../../telegram';
import { Button, Icon, IconButton, Sheet, Tag } from '../kit';
import { cx, fmtPts } from '../util';

/** Карточка ростера в списке: название, подпись, метки, очки справа, меню. */
export function RosterCard({
  name,
  sub,
  tags,
  status,
  points,
  limit,
  updatedAt,
  onOpen,
  onMenu,
}: {
  name: string;
  sub: string;
  tags?: ReactNode;
  status?: { errors: number; warnings: number };
  points?: number | null;
  limit?: number | null;
  updatedAt: number;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const date = new Date(updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return (
    <li className="flex items-stretch overflow-hidden rounded-2xl border border-white/10 bg-app-elevated">
      <button type="button" onClick={() => (haptic.tap(), onOpen())} className="min-w-0 flex-1 px-4 py-3.5 text-left active:bg-white/[0.03]">
        <p className="truncate text-base font-semibold">{name}</p>
        <p className="mt-0.5 truncate text-sm text-white/55">{sub}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags}
          {status && (
            <Tag tone={status.errors ? 'danger' : status.warnings ? 'warn' : 'accent'}>
              {status.errors ? `${status.errors} ош.` : status.warnings ? `${status.warnings} пред.` : 'OK'}
            </Tag>
          )}
          <span className="text-xs text-white/35">{date}</span>
        </div>
      </button>
      {points != null && (
        <div className="flex flex-col items-end justify-center pr-1 text-right">
          <span className={cx('font-display text-xl font-semibold leading-none tabular-nums', limit != null && points > limit ? 'text-danger' : 'text-white')}>{fmtPts(points)}</span>
          {limit != null && <span className="mt-1 text-[11px] text-white/40">из {fmtPts(limit)}</span>}
        </div>
      )}
      <button type="button" aria-label="Действия" onClick={() => (haptic.tap(), onMenu())} className="flex w-12 items-center justify-center text-white/50 active:bg-white/5">
        <Icon name="more" className="size-6" strokeWidth={3} />
      </button>
    </li>
  );
}

/** Плитка инструмента в списке (иконка, название, подпись). */
export function ToolTile({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => (haptic.tap(), onClick())}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition active:bg-white/10"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Icon name={icon} />
      </span>
      <span className="min-w-0">
        <span className="font-display block text-base font-semibold uppercase leading-none">{title}</span>
        <span className="mt-1 block truncate text-[11px] text-white/45">{sub}</span>
      </span>
    </button>
  );
}

/** Шапка списка ростеров игры. */
export function ListHeader({ kicker, title, onBack, onImport }: { kicker: string; title: string; onBack: () => void; onImport?: () => void }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <IconButton icon="back" label="К играм" onClick={onBack} className="mb-0.5 size-9" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-accent">{kicker}</p>
        <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">{title}</h1>
      </div>
      {onImport && <IconButton icon="upload" label="Импорт по коду" onClick={onImport} />}
    </header>
  );
}

/** Нижняя кнопка «Новый …» над списком. */
export function BottomAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-app via-app/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
      <div className="mx-auto max-w-lg lg:flex lg:max-w-4xl lg:justify-end lg:px-4">
        <Button variant="primary" className="h-12 w-full text-base lg:w-auto lg:px-8" onClick={onClick}>
          <Icon name="plus" /> {children}
        </Button>
      </div>
    </div>
  );
}

/** Малый показатель в шапке редактора (значение и подпись). */
export function HeaderStat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className={cx('flex min-w-12 flex-col items-center justify-center rounded-lg px-2 py-1', bad ? 'bg-danger/15 text-danger' : 'bg-white/[0.06] text-white/80')}>
      <span className="font-display text-[15px] font-semibold leading-tight tabular-nums">{value}</span>
      <span className="text-[10px] font-semibold uppercase leading-tight opacity-60">{label}</span>
    </div>
  );
}

/** Название ростера в шапке: правка на месте, пустое не сохраняется. */
export function NameInput({ value, onChange, label = 'Название ростера' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  if (value !== prev) {
    setPrev(value);
    setV(value);
  }
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        if (e.target.value.trim()) onChange(e.target.value);
      }}
      onBlur={() => (v.trim() ? v !== v.trim() && onChange(v.trim()) : setV(value))}
      onKeyDown={(e) => e.key === 'Enter' && ref.current?.blur()}
      aria-label={label}
      className="font-display min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold uppercase outline-none focus:border-white/10 focus:bg-white/[0.04]"
    />
  );
}

export type BuilderIssue = { level: 'error' | 'warning'; message: string };

/**
 * Липкая шапка редактора: назад, название, действия; крупный счёт (очки или численность) с лимитом, показатели,
 * кнопка проблем и полоса заполнения — как в редакторе AoS.
 */
export function EditorHeader({
  name,
  onName,
  onBack,
  actions,
  big,
  bigLimit,
  bigUnit,
  stats,
  issues,
}: {
  name: string;
  onName: (v: string) => void;
  onBack: () => void;
  actions?: ReactNode;
  big: number;
  bigLimit?: number | null;
  bigUnit?: string;
  stats?: ReactNode;
  issues: BuilderIssue[];
}) {
  const [open, setOpen] = useState(false);
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.length - errors;
  const over = bigLimit != null && big > bigLimit;
  const pct = bigLimit ? Math.min(100, Math.round((big / bigLimit) * 100)) : null;
  return (
    <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-app/95 px-4 pb-3 pt-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <IconButton icon="back" label="К списку" onClick={onBack} className="size-9" />
        <NameInput value={name} onChange={onName} />
        {actions}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className={cx('font-display text-[32px] font-semibold leading-none tabular-nums max-[359px]:text-[26px]', over ? 'text-danger' : 'text-white')}>{fmtPts(big)}</span>
          {bigLimit != null && <span className="whitespace-nowrap text-sm text-white/40">/ {fmtPts(bigLimit)}</span>}
          {bigUnit && <span className="whitespace-nowrap text-sm text-white/40">{bigUnit}</span>}
        </p>
        <div className="flex gap-1.5">
          {stats}
          <button
            type="button"
            onClick={() => (haptic.tap(), setOpen(true))}
            className={cx(
              'flex min-w-12 flex-col items-center justify-center rounded-lg px-2 py-1 transition active:scale-95',
              errors ? 'bg-danger/15 text-danger' : warnings ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent',
            )}
          >
            <Icon name={errors || warnings ? 'alert' : 'check'} className="size-4" />
            <span className="text-[11px] font-semibold leading-tight">{errors ? errors : warnings ? warnings : 'OK'}</span>
          </button>
        </div>
      </div>
      {pct != null && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div className={cx('h-full rounded-full transition-[width] duration-300', over ? 'bg-danger' : 'bg-accent')} style={{ width: `${pct}%` }} />
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Проверка ростера">
        {!issues.length ? (
          <p className="flex items-center gap-2 text-sm text-accent">
            <Icon name="check" className="size-4" /> Замечаний нет
          </p>
        ) : (
          <ul className="space-y-2 pb-2">
            {issues.map((i, k) => (
              <li key={k} className={cx('flex gap-2 rounded-xl border px-3 py-2 text-[13px] leading-snug', i.level === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-warn/30 bg-warn/10 text-amber-100')}>
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

/** Подзаголовок раздела (как в AoS: мелкие заглавные). */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{children}</p>
      {right}
    </div>
  );
}

/** Поле поиска для списков выбора. */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 focus-within:border-accent">
      <Icon name="search" className="size-4 shrink-0 text-white/40" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
      {value && (
        <button type="button" aria-label="Очистить" onClick={() => onChange('')} className="text-white/40">
          <Icon name="close" className="size-4" />
        </button>
      )}
    </label>
  );
}

/** Плитка выбора (фракция, команда): название, подпись, метки; выбранная подсвечена. */
export function PickTile({ title, sub, chips, active, busy, onClick }: { title: string; sub?: string; chips?: string[]; active?: boolean; busy?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => (haptic.select(), onClick())}
      className={cx(
        'min-h-12 rounded-xl border px-3 py-2 text-left leading-tight transition disabled:opacity-50',
        active ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03] active:bg-white/10',
      )}
    >
      <span className={cx('block text-sm font-semibold', active ? 'text-accent' : 'text-white/90')}>{title}</span>
      {sub && <span className={cx('mt-0.5 block text-[11px] font-medium', active ? 'text-accent/70' : 'text-white/40')}>{sub}</span>}
      {chips && chips.length > 0 && (
        <span className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
              {c}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

/** Характеристики датакарты: плитки «подпись — крупное значение» (как на Wahapedia). */
export function StatTiles({ stats }: { stats: { label: string; value: ReactNode }[] }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg bg-black/25 px-1 py-1.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">{s.label}</p>
          <p className="font-display text-[19px] font-semibold leading-tight tabular-nums">{s.value ?? '—'}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Датакарта бойца: шапка с названием и акцентной линией (как на Wahapedia), метки, характеристики, содержимое.
 * Свёрнутая — шапка, метки и характеристики; open — всё остальное (оружие, способности, управление).
 */
export function DataCard({
  title,
  subtitle,
  badges,
  stats,
  right,
  open,
  onToggle,
  highlight,
  summary,
  children,
}: {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  stats?: { label: string; value: ReactNode }[];
  right?: ReactNode;
  open: boolean;
  onToggle: () => void;
  highlight?: boolean;
  /** что видно и в свёрнутой карточке под характеристиками (например, выбранное оружие) */
  summary?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={cx('overflow-hidden rounded-2xl border bg-app-elevated', highlight ? 'border-accent/45' : 'border-white/10')}>
      <button type="button" onClick={() => (haptic.tap(), onToggle())} className="block w-full px-3.5 pb-3 pt-3 text-left">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-[17px] font-semibold uppercase leading-tight">{title}</p>
            <div className="mt-1 h-0.5 w-12 rounded-full bg-accent" />
            {subtitle && <p className="mt-1 truncate text-[12px] text-white/50">{subtitle}</p>}
          </div>
          {right}
          <Icon name="down" className={cx('mt-1 size-4 shrink-0 text-white/40 transition', open && 'rotate-180')} />
        </div>
        {badges && <div className="mt-2 flex flex-wrap gap-1">{badges}</div>}
        {stats && (
          <div className="mt-2.5">
            <StatTiles stats={stats} />
          </div>
        )}
      </button>
      {summary && <div className="px-3.5 pb-3">{summary}</div>}
      {open && children && <div className="space-y-3 border-t border-white/[0.06] px-3.5 pb-3.5 pt-3">{children}</div>}
    </div>
  );
}

/** Правило/способность: раскрываемая карточка с меткой стоимости справа (AP, Double…). */
export function RuleCard({ name, sub, badge, open, children }: { name: string; sub?: string; badge?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-xl border border-white/10 bg-white/[0.03]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-white/85">{name}</span>
          {sub && <span className="block text-[11px] text-white/40">{sub}</span>}
        </span>
        {badge}
        <Icon name="down" className="size-4 shrink-0 text-white/35 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/[0.06] px-3 py-2">{children}</div>
    </details>
  );
}

/** Метка стоимости правила (AP, CP, Double…) — акцентная плашка. */
export function CostBadge({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'muted' | 'warn' | 'danger' }) {
  return (
    <span
      className={cx(
        'shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide',
        tone === 'accent' && 'bg-accent/15 text-accent',
        tone === 'muted' && 'bg-white/[0.08] text-white/60',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'danger' && 'bg-danger/15 text-danger',
      )}
    >
      {children}
    </span>
  );
}
