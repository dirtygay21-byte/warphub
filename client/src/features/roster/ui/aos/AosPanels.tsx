import { useState } from 'react';
import { placedUnits, type AosLookup } from '../../aos/engine';
import { activeTables, castInfo, grantsOf, ruleRefs, spellsOf, type CastInfo } from '../../aos/refs';
import { LORE_LABEL, seasonLabel } from '../../aos/rules';
import type { AosEnhancement, AosRoster, AosRule, AosUnit, AosWarscroll } from '../../aos/types';
import { haptic } from '../../telegram';
import { RuleText } from '../DetachmentPanel';
import { Icon, Tag } from '../kit';
import { cx } from '../util';

/*
 * Блоки «Заклинания и молитвы» и «Улучшения армии» на главном экране ростера AoS, а также общий вид правила
 * со значением каста и ссылками на таблицы. Только чтение — выбор по-прежнему в листах выбора.
 */

const CAST_TONE: Record<CastInfo['kind'], string> = {
  spell: 'border-sky-300/40 bg-sky-300/10 text-sky-200',
  prayer: 'border-amber-300/40 bg-amber-300/10 text-amber-200',
  command: 'border-white/20 bg-white/[0.06] text-white/80',
  other: 'border-white/20 bg-white/[0.06] text-white/80',
};

/** Заметная метка значения: «КАСТ 7+», «МОЛИТВА 4+», «КОМАНДА 1 CP». */
export function CastBadge({ value, className }: { value?: string | null; className?: string }) {
  const c = castInfo(value);
  if (!c) return null;
  return (
    <span
      className={cx('flex shrink-0 flex-col items-center justify-center rounded-lg border px-2 py-0.5 leading-none', CAST_TONE[c.kind], className)}
      title={value ?? undefined}
      aria-label={`${c.label} ${c.short}`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wider opacity-75">{c.label}</span>
      <span className="font-display text-[17px] font-semibold tabular-nums">{c.short}</span>
    </span>
  );
}

/** Ссылки правила на таблицы улучшений и лоры: показываются под текстом правила. */
export function RefChips({ text, L }: { text: string; L: AosLookup }) {
  const refs = ruleRefs(text, L);
  if (!refs.tables.length && !refs.lores.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Даёт:</span>
      {refs.tables.map(({ type, table }) => (
        <Tag key={table.id} tone="accent">
          {type.name}: {table.name}
          {seasonLabel(table.season) ? ` · ${seasonLabel(table.season)}` : ''}
        </Tag>
      ))}
      {refs.lores.map((l) => (
        <Tag key={l.id} tone="accent">
          {LORE_LABEL[l.kind]}: {l.name}
        </Tag>
      ))}
    </div>
  );
}

/** Правило AoS: значение каста крупно справа, тайминг подписью, ссылки на таблицы под текстом. */
export function AosRuleCard({ rule, L, open, extraSub }: { rule: AosRule; L?: AosLookup; open?: boolean; extraSub?: string | null }) {
  const cast = castInfo(rule.value);
  const sub = [rule.timing, rule.type, rule.reaction ? 'реакция' : null, extraSub, cast ? null : rule.value].filter(Boolean).join(' · ') || undefined;
  return <RuleText name={rule.name} sub={sub} text={rule.text} open={open} badge={cast ? <CastBadge value={rule.value} /> : undefined} extra={L ? <RefChips text={rule.text} L={L} /> : undefined} />;
}

// ---------- заклинания и молитвы ----------

/**
 * «Заклинания и молитвы»: выбранные лоры и собственные заклинания юнитов — карточками со значением каста,
 * без перехода по листам. Кнопка «Скрыть/Показать» прячет содержимое и запоминает выбор.
 */
export function SpellsPanel({ roster, L, open, onToggle }: { roster: AosRoster; L: AosLookup; open: boolean; onToggle: () => void }) {
  const s = spellsOf(roster, L);
  if (!s.lores.length && !s.own.length && !s.wizards.length && !s.priests.length) return null;
  const casters = [
    s.wizards.length ? `WIZARD: ${s.wizards.map((w) => `${w.name} (${w.wizard})`).join(', ')}` : null,
    s.priests.length ? `PRIEST: ${s.priests.map((w) => `${w.name} (${w.priest})`).join(', ')}` : null,
  ].filter(Boolean);
  return (
    <section className="rounded-2xl border border-white/10 bg-app-elevated" aria-label="Заклинания и молитвы">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Заклинания и молитвы · {s.total}</p>
          <p className="mt-0.5 truncate text-[13px] text-white/60">{s.lores.map((x) => x.lore.name).join(' · ') || 'Лоры не выбраны'}</p>
        </div>
        <button
          type="button"
          onClick={() => (haptic.tap(), onToggle())}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[12px] font-semibold text-white/75 active:bg-white/10"
        >
          {open ? 'Скрыть лоры' : 'Показать лоры'}
          <Icon name="down" className={cx('size-3.5 transition', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div className="space-y-4 border-t border-white/[0.06] px-4 pb-4 pt-3">
          {casters.length > 0 && <p className="text-[12px] leading-snug text-white/45">{casters.join(' · ')}</p>}
          {s.lores.map(({ kind, lore }) => (
            <div key={lore.id} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                {LORE_LABEL[kind]} · {lore.name}
                {seasonLabel(lore.season) ? ` · ${seasonLabel(lore.season)}` : ''}
              </p>
              {lore.items.map((it, i) => (
                <AosRuleCard key={i} rule={it} L={L} />
              ))}
            </div>
          ))}
          {s.own.map((g) => (
            <div key={g.ws.id} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Свои · {g.ws.name}</p>
              {g.rules.map((it, i) => (
                <AosRuleCard key={i} rule={it} L={L} />
              ))}
            </div>
          ))}
          {!s.lores.length && <p className="text-[12.5px] text-white/45">Лоры заклинаний, молитв и манифестаций выбираются в блоке армии выше.</p>}
        </div>
      )}
    </section>
  );
}

// ---------- улучшения армии ----------

interface Holder {
  unit: AosUnit;
  ws: AosWarscroll | undefined;
}

/** Кто из армии взял улучшение. */
function holdersOf(r: AosRoster, L: AosLookup): Map<string, Holder> {
  const m = new Map<string, Holder>();
  for (const p of placedUnits(r, L)) for (const id of Object.values(p.unit.enhancements)) m.set(id, { unit: p.unit, ws: p.ws });
  return m;
}

/**
 * «Улучшения армии»: все таблицы фракции (вместе с сезонными), кто и что из них взял, кому их можно давать,
 * и правила, которые дают улучшения сверх таблиц (например, построение «Endrineers Guild Expeditionary Force»).
 */
export function EnhancementsPanel({ roster, L, onUnit }: { roster: AosRoster; L: AosLookup; onUnit?: (uid: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const holders = holdersOf(roster, L);
  const grants = grantsOf(roster, L).filter((g) => g.refs.tables.length > 0);
  const types = L.faction.enhancementTypes.map((t) => ({ type: t, tables: activeTables(t) })).filter((t) => t.tables.length > 0);
  if (!types.length && !grants.length) return null;
  const taken = [...holders.keys()].filter((id) => L.enh.has(id)).length;
  return (
    <section className="rounded-2xl border border-white/10 bg-app-elevated px-4 py-3" aria-label="Улучшения армии">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Улучшения армии · выбрано {taken}</p>
      <div className="mt-2 space-y-2">
        {types.map(({ type, tables }) => (
          <div key={type.key} className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{type.name}</p>
            {tables.map((tb) => {
              const picked = tb.items.find((it) => holders.has(it.id));
              // сезонная таблица делит слот с обычной того же типа: выбор в одной занимает и другую
              const slot = tb.items[0] ? L.enh.get(tb.items[0].id)?.slot : undefined;
              const elsewhere = !picked && slot ? [...holders.keys()].map((id) => L.enh.get(id)).find((e) => e?.slot === slot) : undefined;
              const isOpen = open === tb.id;
              return (
                <div key={tb.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
                  <button type="button" onClick={() => setOpen(isOpen ? null : tb.id)} className="flex w-full items-start gap-2 px-3 py-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-white/85">
                        {tb.name}
                        {seasonLabel(tb.season) && (
                          <span className="ml-1.5 align-middle">
                            <Tag tone="warn">{seasonLabel(tb.season)}</Tag>
                          </span>
                        )}
                      </span>
                      <span className="block text-[11.5px] leading-snug text-white/45">{tb.eligibility.text}</span>
                      <span className={cx('mt-0.5 block text-[12px] font-semibold', picked ? 'text-accent/90' : 'text-white/40')}>
                        {picked
                          ? `${picked.name} — ${holders.get(picked.id)?.ws?.name ?? 'юнит'}`
                          : elsewhere
                            ? `слот занят: ${elsewhere.item.name} (${elsewhere.table.name}${seasonLabel(elsewhere.table.season) ? ', ' + seasonLabel(elsewhere.table.season) : ''})`
                            : 'не выбрано'}
                      </span>
                    </span>
                    <Icon name="down" className={cx('mt-1 size-4 shrink-0 text-white/35 transition', isOpen && 'rotate-180')} />
                  </button>
                  {isOpen && (
                    <div className="space-y-1.5 border-t border-white/[0.06] px-3 pb-3 pt-2">
                      {tb.items.map((it) => (
                        <EnhancementItem key={it.id} item={it} holder={holders.get(it.id)} L={L} onUnit={onUnit} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {grants.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Улучшения от способностей</p>
            {grants.map((g, i) => (
              <AosRuleCard key={i} rule={g.rule} L={L} extraSub={g.source} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EnhancementItem({ item, holder, L, onUnit }: { item: AosEnhancement; holder?: Holder; L: AosLookup; onUnit?: (uid: string) => void }) {
  return (
    <RuleText
      name={item.name}
      sub={[item.timing, item.points ? `+${item.points} очк.` : 'бесплатно', holder ? `у юнита: ${holder.ws?.name ?? '?'}` : null].filter(Boolean).join(' · ')}
      text={item.text}
      badge={castInfo(item.value) ? <CastBadge value={item.value} /> : undefined}
      extra={
        <>
          <RefChips text={item.text} L={L} />
          {holder && onUnit && (
            <button type="button" onClick={() => onUnit(holder.unit.uid)} className="mt-2 text-[12px] font-semibold text-accent/90">
              Показать юнит →
            </button>
          )}
        </>
      }
    />
  );
}
