import { useEffect, type ReactNode } from 'react';
import type { ComputedRoster, DataLookup } from '../engine/compute';
import type { Detachment, UnitMatcher } from '../engine/types';
import { pushOverlay } from '../telegram';
import { Icon, IconButton, Tag } from './kit';
import { cx } from './util';

const TURN_RU: Record<string, string> = { 'Your turn': 'ваш ход', 'Opponent’s turn': 'ход противника', 'Either player’s turn': 'любой ход' };

/** Раскрывающееся правило: название, подпись, текст. */
export function RuleText({ name, text, sub, right }: { name: string; text: string; sub?: string; right?: ReactNode }) {
  return (
    <details className="group rounded-xl border border-white/10 bg-white/[0.03]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-white/85">{name}</span>
          {sub && <span className="block text-[11px] text-white/40">{sub}</span>}
        </span>
        {right}
        <Icon name="down" className="size-4 shrink-0 text-white/35 transition group-open:rotate-180" />
      </summary>
      <p className="whitespace-pre-line border-t border-white/[0.06] px-3 py-2 text-[12px] leading-relaxed text-white/65">{text}</p>
    </details>
  );
}

const title = (s: string) => s.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
const matcherText = (m: UnitMatcher) =>
  [...m.names.map(title), ...m.keywords.map((k) => k.map(title).join(' '))].join(', ') + (m.exclude.length ? ` (кроме ${m.exclude.map(title).join(', ')})` : '');

/** Особые условия детачмента, которые знает конструктор: Battleline, разрешённые и запрещённые юниты, лимиты. */
function conditions(d: Detachment): string[] {
  const out: string[] = [];
  if (d.battleline.length) out.push(`Получают Battleline: ${d.battleline.map(title).join(', ')}`);
  for (const g of d.grants) {
    let s = `Можно взять: ${matcherText(g)}`;
    if (g.caps) s += ` — до ${g.caps.join(' / ')} очк. (Incursion / Strike Force / Onslaught)`;
    out.push(s);
    if (g.noWarlord) out.push(`Модели ${title(g.noWarlord)} не могут быть Warlord`);
    if (g.warlordMust) out.push(`Warlord должен быть ${title(g.warlordMust)}`);
  }
  if (d.forbid) out.push(`Нельзя брать: ${matcherText(d.forbid)}`);
  for (const r of d.requires) out.push(`Обязательно: не меньше ${r.min} — ${matcherText(r.matcher)}${r.warlord ? ' (Warlord — один из них)' : ''}`);
  if (d.limitOverride) out.push(`До ${d.limitOverride.max} копий: ${d.limitOverride.names.map(title).join(', ')}`);
  if (d.disablesArmyRule) out.push(`Отключает правило армии: ${d.disablesArmyRule}`);
  return out;
}

function Section({ label, count, open, children }: { label: string; count: number; open?: boolean; children: ReactNode }) {
  if (!count) return null;
  return (
    <details className="group/s" open={open}>
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{label}</span>
        <span className="flex items-center gap-1 text-xs text-white/35">
          {count}
          <Icon name="down" className="size-3.5 transition group-open/s:rotate-180" />
        </span>
      </summary>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </details>
  );
}

/**
 * Карточка выбранного детачмента над списком юнитов: правила, стратагемы, улучшения, особые условия.
 * Закрывается ✕ (и кнопкой «Назад» Telegram). При нескольких детачментах — переключатель сверху.
 */
export function DetachmentPanel({
  id,
  cr,
  L,
  dp,
  onSwitch,
  onClose,
}: {
  id: string;
  cr: ComputedRoster;
  L: DataLookup;
  dp: (d: Detachment) => number;
  onSwitch: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => pushOverlay(onClose), [onClose]);
  const d = cr.detachments.find((x) => x.id === id);
  if (!d) return null;
  const strats = L.faction.stratagems.filter((s) => s.detachment === d.id);
  const enh = L.faction.enhancements.filter((e) => e.detachment === d.id);
  const cond = conditions(d);
  return (
    <section id="detachment-panel" className="sheet-enter rounded-2xl border border-accent/30 bg-app-elevated">
      <div className="flex items-start gap-2 px-4 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent/80">Детачмент</p>
          <h2 className="font-display mt-0.5 text-xl font-semibold uppercase leading-tight">{d.name}</h2>
        </div>
        <IconButton icon="close" label="Закрыть" onClick={onClose} className="size-9" />
      </div>
      {cr.detachments.length > 1 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-2">
          {cr.detachments.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => onSwitch(x.id)}
              className={cx('shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold', x.id === d.id ? 'bg-accent text-accent-foreground' : 'bg-white/[0.06] text-white/70')}
            >
              {x.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1 px-4 pb-3">
        <Tag tone="accent">{dp(d)} DP</Tag>
        {d.forceDisposition && <Tag>{d.forceDisposition}</Tag>}
        {d.tag && <Tag>{d.tag}</Tag>}
        {d.chapter && <Tag tone="warn">{d.chapter}</Tag>}
      </div>
      <div className="space-y-2 border-t border-white/[0.06] px-4 pb-4 pt-3">
        <Section label="Правила детачмента" count={d.abilities.length} open>
          {d.abilities.map((a) => (
            <RuleText key={a.id} name={a.name} text={a.text} />
          ))}
        </Section>
        <Section label="Стратагемы" count={strats.length}>
          {strats.map((s) => (
            <RuleText
              key={s.id}
              name={s.name}
              sub={[s.type.replace(/ Stratagem$/, ''), TURN_RU[s.turn] ?? s.turn, s.phase].filter(Boolean).join(' · ')}
              right={<span className="shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent">{s.cp} CP</span>}
              text={s.text}
            />
          ))}
        </Section>
        <Section label="Улучшения" count={enh.length}>
          {enh.map((e) => (
            <RuleText
              key={e.id}
              name={e.name}
              sub={[e.upgrade ? 'Upgrade · до 3 юнитов' : '', e.restriction].filter(Boolean).join(' · ') || undefined}
              right={<span className="shrink-0 text-xs font-semibold tabular-nums text-white/60">{e.cost} очк.</span>}
              text={e.text}
            />
          ))}
        </Section>
        <Section label="Особые условия" count={cond.length}>
          <ul className="space-y-1 text-[12.5px] leading-relaxed text-white/70">
            {cond.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </Section>
      </div>
    </section>
  );
}
