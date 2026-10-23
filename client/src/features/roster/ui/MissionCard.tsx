import { useState } from 'react';
import type { MissionAction, MissionBlock, MissionCard as Card, MissionsData } from '../data';
import { Icon, Segmented, Tag } from './kit';
import { cx } from './util';

/** Раунды блока → подпись бейджа. */
export const ROUNDS_RU: Record<string, string> = {
  any: 'Любой раунд',
  '1': '1-й раунд',
  '1–2': 'Раунды 1–2',
  '2+': 'С 2-го раунда',
  '2–3': 'Раунды 2–3',
  '2–4': 'Раунды 2–4',
  '4+': 'С 4-го раунда',
  '5': '5-й раунд',
  end: 'Конец битвы',
};
const MODE_RU = { fixed: 'Фиксированная', tactical: 'Тактическая' } as const;

/** Карта миссии в оформлении WarpHub: блоки «когда → условие → ПО», действия, подготовка. */
export function MissionCardView({ card, foeName, className }: { card: Card; foeName?: string; className?: string }) {
  const kind = card.type === 'primary' ? 'Основная миссия' : `Вторичная · ${(card.modes ?? []).map((m) => MODE_RU[m]).join(' / ')}`;
  return (
    <article className={cx('overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]', className)}>
      <header className={cx('border-b border-white/10 px-3.5 py-2.5', card.type === 'primary' ? 'bg-accent/10' : 'bg-white/[0.04]')}>
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-white/45">
          {kind}
          {foeName && <> · против: {foeName}</>}
        </p>
        <h3 className="font-display mt-0.5 text-xl font-semibold uppercase leading-tight">{card.name}</h3>
      </header>
      <div className="space-y-2.5 p-3">
        {card.setup && <Lead label="Подготовка">{card.setup}</Lead>}
        {card.drawn && <Lead label="При взятии">{card.drawn}</Lead>}
        {card.blocks.map((b, i) => (
          <Block key={i} block={b} showMode={(card.modes?.length ?? 0) > 1} />
        ))}
        {card.actions?.map((a) => <Action key={a.name} action={a} />)}
        {card.note && <p className="text-[11.5px] leading-snug text-white/50">Примечание: {card.note}</p>}
      </div>
    </article>
  );
}

function Lead({ label, children }: { label: string; children: string }) {
  return (
    <p className="border-l-2 border-accent/60 pl-2.5 text-[13px] leading-snug text-white/75">
      <span className="font-semibold text-white/90">{label}: </span>
      {children}
    </p>
  );
}

function Block({ block, showMode }: { block: MissionBlock; showMode: boolean }) {
  const end = block.rounds === 'end';
  return (
    <section className={cx('rounded-xl border', end ? 'border-accent/30 bg-accent/[0.06]' : 'border-white/10 bg-black/20')}>
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
        <Tag tone={end ? 'accent' : 'muted'}>{ROUNDS_RU[block.rounds] ?? block.rounds}</Tag>
        {showMode && block.mode && <Tag tone={block.mode === 'fixed' ? 'warn' : 'muted'}>{MODE_RU[block.mode]}</Tag>}
      </div>
      {!end && <p className="px-3 pt-1.5 text-[12px] font-semibold leading-snug text-white/60">Когда: {block.when}</p>}
      <ul className="px-3 pb-2.5">
        {block.rows.map((r, i) => (
          <li key={i}>
            {i > 0 && (
              <p className="my-1.5 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-white/35">
                <span className="h-px flex-1 bg-white/10" />
                {r.or ? 'или' : r.plus ? 'и сверх того' : 'а также'}
                <span className="h-px flex-1 bg-white/10" />
              </p>
            )}
            <div className={cx('flex items-start gap-3', i === 0 && 'mt-1.5')}>
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/85">{r.text}</p>
              <span className="flex shrink-0 flex-col items-end">
                <span className={cx('font-display rounded-lg px-2 py-1 text-lg font-semibold leading-none', end ? 'bg-accent text-black' : 'bg-white/10 text-white')}>
                  {r.plus ? '+' : ''}
                  {r.vp}
                  <span className="ml-0.5 text-[10px] font-semibold">ПО</span>
                </span>
                {r.max != null && <span className="mt-1 text-[10px] font-semibold uppercase text-white/45">макс. {r.max} ПО</span>}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Action({ action }: { action: MissionAction }) {
  const rows: [string, string | undefined][] = [
    ['Начало', action.starts],
    ['Кто', action.units],
    ['Сколько раз', action.limit],
    ['Завершение', action.completes],
    ['Эффект', action.effect],
    ['Ограничение', action.restriction],
  ];
  return (
    <section className="rounded-xl border border-warn/30 bg-warn/[0.06]">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <Tag tone="warn">Действие</Tag>
        <p className="min-w-0 text-sm font-semibold">
          {action.nameRu} <span className="font-normal text-white/45">· {action.name}</span>
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 pb-2.5 pt-1.5 text-[12.5px] leading-snug">
        {rows
          .filter((r): r is [string, string] => !!r[1])
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-white/55">{k}</dt>
              <dd className="text-white/85">{v}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

/** Лимиты ПО одной строкой (из missions.json). */
export function CapsNote({ caps }: { caps: MissionsData['caps'] }) {
  return (
    <p className="mt-2 text-[11.5px] leading-snug text-white/50">
      Лимит ПО: основная миссия — до {caps.primaryRound} за раунд и {caps.primaryGame} за битву
      {caps.endOfBattleOutsideRoundCap ? ' (ПО «в конце битвы» в лимит раунда не входят)' : ''}; вторичные — до {caps.secondaryRound} за раунд и{' '}
      {caps.secondaryGame} за битву
      {caps.fixedSecondaryCard ? `, не больше ${caps.fixedSecondaryCard} с одной фиксированной карты` : ''}.
    </p>
  );
}

type Filter = 'all' | 'fixed' | 'tactical';

/** Список вторичных миссий: свёрнутые строки, раскрываются в карту; фильтр по режиму. */
export function SecondaryList({ cards }: { cards: Card[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const shown = cards.filter((c) => filter === 'all' || c.modes?.includes(filter));
  return (
    <div>
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Все', hint: cards.length },
          { value: 'fixed', label: 'Фиксированные', hint: cards.filter((c) => c.modes?.includes('fixed')).length },
          { value: 'tactical', label: 'Тактические', hint: cards.filter((c) => c.modes?.includes('tactical')).length },
        ]}
      />
      <ul className="mt-2 space-y-1.5">
        {shown.map((c) => (
          <li key={c.id}>
            {open === c.id ? (
              <div>
                <button type="button" onClick={() => setOpen(null)} className="mb-1 flex w-full items-center gap-1 text-xs font-semibold text-white/55">
                  <Icon name="down" className="size-4 rotate-180" />
                  Свернуть
                </button>
                <MissionCardView card={c} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(c.id)}
                className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="block text-[11px] text-white/45">{(c.modes ?? []).map((m) => MODE_RU[m]).join(' / ')}</span>
                </span>
                <Icon name="chevron" className="size-4 text-white/40" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
