/**
 * Общие элементы WarpBuilder (R1 30.10.2026): одинаковый вид списков, шапок редакторов и карточек для всех игр
 * (AoS, Kill Team, Warcry). Разметка — как в разделе AoS; данные игр сюда не попадают — только отображение.
 */
import { UnitPhotoBlock, UnitThumb } from './UnitPhoto';
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
  accent,
}: {
  name: string;
  sub: string;
  /** цвет фракции — полоса слева (14.11.2026) */
  accent?: string;
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
      {accent && <span aria-hidden="true" className="w-1 shrink-0" style={{ background: accent }} />}
      <button type="button" onClick={() => (haptic.tap(), onOpen())} className="min-w-0 flex-1 px-4 py-3.5 text-left active:bg-white/[0.03]">
        <p className="truncate text-base font-semibold">{name}</p>
        <p className="mt-0.5 truncate text-sm text-fg-2">{sub}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags}
          {status && (
            <Tag tone={status.errors ? 'danger' : status.warnings ? 'warn' : 'accent'}>
              {status.errors ? `${status.errors} ош.` : status.warnings ? `${status.warnings} пред.` : 'OK'}
            </Tag>
          )}
          <span className="text-xs text-fg-3">{date}</span>
        </div>
      </button>
      {points != null && (
        <div className="flex flex-col items-end justify-center pr-1 text-right">
          <span className={cx('font-display text-xl font-semibold leading-none tabular-nums', limit != null && points > limit ? 'text-danger' : 'text-white')}>{fmtPts(points)}</span>
          {limit != null && <span className="mt-1 text-[12px] text-fg-3">из {fmtPts(limit)}</span>}
        </div>
      )}
      <button type="button" aria-label="Действия" onClick={() => (haptic.tap(), onMenu())} className="flex w-12 items-center justify-center text-fg-3 active:bg-white/5">
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
      className="ds-press flex min-h-16 w-full min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-app-elevated px-3 py-3 text-left"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display block text-base font-semibold uppercase leading-none">{title}</span>
        <span className="mt-1 block truncate text-[13px] text-fg-2">{sub}</span>
      </span>
    </button>
  );
}

export type ToolItem = { icon: string; title: string; sub: string; onClick: () => void };

/**
 * Плитки списка игры (07.11.2026, решение владельца): две плитки в ряд — «Правила» и «Игра»; нажатие открывает лист
 * с выбором пунктов (правила, обучение, начало игры, Test Army). Одинаково во всех играх.
 */
export function ToolMenus({ rules, game }: { rules: ToolItem[]; game: ToolItem[] }) {
  const [open, setOpen] = useState<'rules' | 'game' | null>(null);
  const groups = { rules: { icon: 'book', title: 'Правила', items: rules }, game: { icon: 'map', title: 'Игра', items: game } } as const;
  const shown = open ? groups[open] : null;
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-2">
        {(['rules', 'game'] as const).map((k) => (
          <ToolTile key={k} icon={groups[k].icon} title={groups[k].title} sub={groups[k].items.map((x) => x.title).join(' · ')} onClick={() => setOpen(k)} />
        ))}
      </div>
      <Sheet open={!!shown} onClose={() => setOpen(null)} title={shown?.title ?? ''}>
        <div className="space-y-2 pb-2">
          {shown?.items.map((x) => (
            <ToolTile
              key={x.title}
              icon={x.icon}
              title={x.title}
              sub={x.sub}
              onClick={() => {
                setOpen(null);
                x.onClick();
              }}
            />
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** Шапка списка ростеров игры. */
export function ListHeader({ kicker, title, onBack, onImport }: { kicker: string; title: string; onBack: () => void; onImport?: () => void }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <IconButton icon="back" label="К играм" onClick={onBack} className="mb-0.5" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">{kicker}</p>
        <h1 className="font-display mt-1 text-[32px] font-semibold uppercase leading-none">{title}</h1>
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
      <span className="text-[12px] font-semibold uppercase leading-tight opacity-60">{label}</span>
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

export type BuilderIssue = { level: 'error' | 'warning'; message: string; uids?: string[] };

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
  readOnly = false,
  onOpenIssue,
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
  readOnly?: boolean;
  onOpenIssue?: (issue: BuilderIssue) => void;
}) {
  const [open, setOpen] = useState(false);
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.length - errors;
  const over = bigLimit != null && big > bigLimit;
  const pct = bigLimit ? Math.min(100, Math.round((big / bigLimit) * 100)) : null;
  return (
    <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-app/95 px-4 pb-3 pt-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <IconButton icon="back" label="К списку" onClick={onBack} />
        {readOnly ? <p className="font-display min-w-0 flex-1 truncate px-1.5 py-1 text-lg font-semibold uppercase">{name}</p> : <NameInput value={name} onChange={onName} />}
        {actions}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className={cx('font-display text-[32px] font-semibold leading-none tabular-nums max-[359px]:text-[26px]', over ? 'text-danger' : 'text-white')}>{fmtPts(big)}</span>
          {bigLimit != null && <span className="whitespace-nowrap text-sm text-fg-3">/ {fmtPts(bigLimit)}</span>}
          {bigUnit && <span className="whitespace-nowrap text-sm text-fg-3">{bigUnit}</span>}
        </p>
        <div className="flex gap-1.5">
          {stats}
          <button
            type="button"
            aria-label="Проверка состава"
            onClick={() => (haptic.tap(), setOpen(true))}
            className={cx(
              'flex min-w-12 flex-col items-center justify-center rounded-lg px-2 py-1 transition active:scale-95',
              errors ? 'bg-danger/15 text-danger' : warnings ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent',
            )}
          >
            <Icon name={errors || warnings ? 'alert' : 'check'} className="size-4" />
            <span className="text-[12px] font-semibold leading-tight">{errors ? errors : warnings ? warnings : 'OK'}</span>
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
              <li key={k}>
                <button
                  type="button"
                  disabled={!onOpenIssue || !i.uids?.length}
                  onClick={() => (setOpen(false), onOpenIssue?.(i))}
                  className={cx(
                    'flex w-full gap-2 rounded-xl border px-3 py-2 text-left text-[13px] leading-snug disabled:cursor-default',
                    i.level === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-warn/30 bg-warn/10 text-amber-100',
                  )}
                >
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">{i.message}</span>
                  {!!i.uids?.length && <Icon name="chevron" className="mt-0.5 size-4 shrink-0 opacity-50" />}
                </button>
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
      <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{children}</p>
      {right}
    </div>
  );
}

/** Поле поиска для списков выбора. */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 focus-within:border-accent">
      <Icon name="search" className="size-4 shrink-0 text-fg-3" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-fg-3" />
      {value && (
        <button type="button" aria-label="Очистить" onClick={() => onChange('')} className="text-fg-3">
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
      {sub && <span className={cx('mt-0.5 block text-[12px] font-medium', active ? 'text-accent/70' : 'text-fg-3')}>{sub}</span>}
      {chips && chips.length > 0 && (
        <span className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-fg-3">
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
          <p className="text-[12px] font-semibold uppercase tracking-wide text-fg-3">{s.label}</p>
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
            {subtitle && <p className="mt-1 truncate text-[12px] text-fg-3">{subtitle}</p>}
          </div>
          {right}
          <Icon name="down" className={cx('mt-1 size-4 shrink-0 text-fg-3 transition', open && 'rotate-180')} />
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
          {sub && <span className="block text-[12px] text-fg-3">{sub}</span>}
        </span>
        {badge}
        <Icon name="down" className="size-4 shrink-0 text-fg-3 transition group-open:rotate-180" />
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
        'shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-bold uppercase tracking-wide',
        tone === 'accent' && 'bg-accent/15 text-accent',
        tone === 'muted' && 'bg-white/[0.08] text-fg-2',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'danger' && 'bg-danger/15 text-danger',
      )}
    >
      {children}
    </span>
  );
}

// ---------- блоки редактора как у AoS / 40K (07.11.2026: Kill Team и Warcry собраны из тех же блоков) ----------

/** Блок армии (как у AoS): подпись, название, строка-итог; раскрытый — содержимое. */
export function ArmyBlock({ kicker, title, line, extra, open, onToggle, children }: { kicker: string; title: string; line?: ReactNode; extra?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-app-elevated">
      <button type="button" onClick={() => (haptic.tap(), onToggle())} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">{kicker}</p>
          <p className="mt-0.5 truncate text-[15px] font-semibold">{title}</p>
          {line && <p className="mt-0.5 truncate text-sm text-fg-3">{line}</p>}
          {extra && <div className="mt-1.5 flex flex-wrap gap-1">{extra}</div>}
        </div>
        <Icon name="down" className={cx('size-5 shrink-0 text-fg-3 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-4 border-t border-white/[0.06] px-4 pb-4 pt-4">{children}</div>}
    </section>
  );
}

/** Строка выбора в блоке армии (как «Боевое построение» у AoS): подпись, значение, стрелка. */
export function PickRow({ label, value, empty, warn, right, onClick }: { label: string; value?: string | null; empty: string; warn?: boolean; right?: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={() => (haptic.tap(), onClick?.())}
      className={cx('flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition active:bg-white/5', warn ? 'border-accent/40' : 'border-white/10', !onClick && 'opacity-50')}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold uppercase tracking-wider text-fg-3">{label}</span>
        <span className={cx('block truncate text-[14px] font-semibold', value ? 'text-white/90' : warn ? 'text-accent' : 'text-fg-3')}>{value || empty}</span>
      </span>
      {right}
      {onClick && <Icon name="chevron" className="size-4 shrink-0 text-fg-3" />}
    </button>
  );
}

/** Панель правил (как «Заклинания и молитвы» у AoS): подпись с числом, строка-итог, кнопка «Показать / Скрыть». */
export function RulesPanel({ label, line, open, onToggle, children }: { label: string; line?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-app-elevated" aria-label={label}>
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">{label}</p>
          {line && <p className="mt-0.5 truncate text-[13px] text-fg-2">{line}</p>}
        </div>
        <button
          type="button"
          onClick={() => (haptic.tap(), onToggle())}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[12px] font-semibold text-fg-2 active:bg-white/10"
        >
          {open ? 'Скрыть' : 'Показать'}
          <Icon name="down" className={cx('size-3.5 transition', open && 'rotate-180')} />
        </button>
      </div>
      {open && <div className="space-y-4 border-t border-white/[0.06] px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}

/** Заголовок группы юнитов (как «Полк генерала 2/4 · 340» у AoS). */
export function GroupHeading({ title, count, right }: { title: string; count?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
      <h2 className="font-display text-[15px] font-semibold uppercase tracking-wider text-fg-2">
        {title}
        {count != null && <span className="ml-2 font-sans text-xs font-semibold text-fg-3">{count}</span>}
      </h2>
      {right}
    </div>
  );
}

/** Пунктирная кнопка «добавить в группу» (как «В полк» у AoS). */
export function AddRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => (haptic.tap(), onClick())}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-[13px] font-semibold text-fg-2 active:bg-white/5"
    >
      <Icon name="plus" className="size-4" /> {children}
    </button>
  );
}

/**
 * Карточка юнита (как у AoS): название, строка подробностей, выделенная строка (выбранное), число справа.
 * Раскрытая — замечания, управление, датакарта (children).
 */
export function UnitRowCard({
  id,
  title,
  crown,
  meta,
  accentLine,
  value,
  valueLabel,
  issues = [],
  open,
  onToggle,
  children,
  photo,
}: {
  id?: string;
  title: string;
  /** ключ фото юнита (photos.ts): миниатюра в шапке, блок фото в раскрытой карточке; readOnly — только просмотр */
  photo?: { key: string; readOnly?: boolean };
  crown?: boolean;
  meta?: (string | null | undefined | false)[];
  accentLine?: string | null;
  value?: ReactNode;
  valueLabel?: string;
  issues?: BuilderIssue[];
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const errors = issues.filter((i) => i.level === 'error').length;
  const line = (meta ?? []).filter(Boolean).join(' · ');
  return (
    <div id={id} className={cx('overflow-hidden rounded-2xl border bg-app-elevated transition', errors ? 'border-danger/40' : open ? 'border-white/20' : 'border-white/10')}>
      <button type="button" onClick={() => (haptic.tap(), onToggle())} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        {photo && <UnitThumb photoKey={photo.key} />}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-semibold leading-snug">
            {crown && <Icon name="crown" className="size-4 shrink-0 text-accent" />}
            <span className="min-w-0 break-words">{title}</span>
          </p>
          {line && <p className="mt-0.5 text-[12px] leading-snug text-fg-3">{line}</p>}
          {accentLine && <p className="mt-1 text-[12px] font-semibold leading-snug text-accent/90">{accentLine}</p>}
        </div>
        {errors > 0 && <Icon name="alert" className="size-4 shrink-0 text-danger" />}
        {value != null && (
          <span className="shrink-0 text-right">
            <span className="font-display block text-[19px] font-semibold leading-none tabular-nums">{value}</span>
            {valueLabel && <span className="text-[12px] uppercase text-fg-3">{valueLabel}</span>}
          </span>
        )}
        <Icon name="down" className={cx('size-4 shrink-0 text-fg-3 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/[0.06] px-3.5 pb-3.5 pt-3">
          {issues.map((i, n) => (
            <p key={n} className={cx('rounded-lg px-2.5 py-2 text-[12.5px] leading-snug', i.level === 'error' ? 'bg-danger/10 text-red-100' : 'bg-warn/10 text-amber-100')}>
              {i.message}
            </p>
          ))}
          {children}
          {photo && <UnitPhotoBlock photoKey={photo.key} name={title} readOnly={photo.readOnly} />}
        </div>
      )}
    </div>
  );
}

/** Строка управления в карточке юнита (как «Генерал», «Усиление» у AoS). */
export function ControlRow({ label, value, action, reason, children }: { label: string; value?: ReactNode; action?: ReactNode; reason?: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{label}</p>
          {value != null && <p className="truncate text-[13px] font-semibold text-white/85">{value}</p>}
        </div>
        {action}
      </div>
      {children && <div className="mt-2">{children}</div>}
      {reason && <p className="mt-1 text-[12px] leading-snug text-fg-3">{reason}</p>}
    </div>
  );
}

/** Датакарта внутри карточки юнита (как «Варскролл» у AoS): раскрывается отдельно; в просмотре — сразу открыта. */
export function DatasheetBlock({ label = 'Датакарта', defaultOpen = false, children }: { label?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-fg-2">
        {label}
        <Icon name="down" className={cx('size-4 text-fg-3 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-3 border-t border-white/[0.06] px-3 pb-3 pt-3">{children}</div>}
    </div>
  );
}
