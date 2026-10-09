import { useState, type ReactNode } from 'react';
import {
  auxiliaryFit,
  enhancementFit,
  findUnit,
  formationFit,
  formationsOf,
  loreFit,
  loresOf,
  regimentFit,
  rorFit,
  rorPrice,
  terrainFit,
  terrainOf,
  type AosLookup,
  type Fit,
} from '../../aos/engine';
import { LORE_LABEL, nextAuxiliarySurcharge, seasonLabel } from '../../aos/rules';
import type { AosRor, AosRoster, AosRule, LoreKind } from '../../aos/types';
import { haptic } from '../../telegram';
import { Button, Icon, Sheet, Tag } from '../kit';
import { cx } from '../util';
import { Warscroll } from './AosUnitCard';
import { AosRuleCard } from './AosPanels';
import { cleanRuleText } from '../../text';

const LORE_TITLE: Record<LoreKind, string> = { spell: 'Spell Lore', prayer: 'Prayer Lore', manifestation: 'Manifestation Lore' };

interface Choice {
  id: string;
  title: string;
  sub?: string;
  points: number | null;
  fit: Fit;
  /** выбранный вариант можно «взять» повторно только если он законен (полк славы с изменённым составом) */
  strict?: boolean;
  tags?: string[];
  body?: ReactNode;
}

/** Список вариантов с очками, правилами и причиной, почему вариант недоступен. */
function ChoiceList({ choices, selected, onPick, onClear, clearLabel }: { choices: Choice[]; selected: string | null; onPick: (id: string) => void; onClear?: () => void; clearLabel?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-2 pb-2">
      {onClear && selected && (
        <Button variant="outline" className="w-full border-dashed" onClick={onClear}>
          <Icon name="close" className="size-4" /> {clearLabel ?? 'Убрать выбор'}
        </Button>
      )}
      {choices.length === 0 && <p className="py-8 text-center text-sm text-white/45">Вариантов нет.</p>}
      {choices.map((c) => {
        const sel = c.id === selected;
        const usable = c.fit.ok || (sel && !c.strict);
        return (
          <div key={c.id} className={cx('overflow-hidden rounded-2xl border', sel ? 'border-accent/60 bg-accent/[0.06]' : 'border-white/10 bg-white/[0.02]')}>
            <div className="flex items-start gap-2 px-3 py-2.5">
              <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="min-w-0 flex-1 text-left">
                <p className={cx('text-[14px] font-semibold leading-snug', !usable && 'text-white/45')}>
                  {c.title}
                  {c.body && <Icon name="down" className={cx('ml-1 inline size-3.5 text-white/35 transition', open === c.id && 'rotate-180')} />}
                </p>
                {c.sub && <p className="mt-0.5 text-[12px] leading-snug text-white/45">{c.sub}</p>}
                {!!c.tags?.length && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                )}
                {!c.fit.ok && !sel && <p className="mt-1 text-[12px] leading-snug text-amber-200/80">{c.fit.reason}</p>}
              </button>
              <span className="shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-white/60">{c.points == null ? '—' : c.points ? `+${c.points}` : '0'}</span>
              <Button variant={sel ? 'primary' : 'ghost'} className="h-9 shrink-0 px-3 text-xs" disabled={!usable} onClick={() => (haptic.ok(), onPick(c.id))}>
                {sel ? <Icon name="check" className="size-4" /> : 'Взять'}
              </Button>
            </div>
            {open === c.id && c.body && <div className="space-y-1.5 border-t border-white/[0.06] px-3 pb-3 pt-2">{c.body}</div>}
          </div>
        );
      })}
    </div>
  );
}

const rules = (list: AosRule[], L?: AosLookup) => list.map((a, i) => <AosRuleCard key={i} rule={a} L={L} />);

export function FormationSheet({ open, onClose, roster, L, onPick }: { open: boolean; onClose: () => void; roster: AosRoster; L: AosLookup; onPick: (id: string) => void }) {
  const choices: Choice[] = formationsOf(L).map((f) => ({ id: f.id, title: f.name, sub: seasonLabel(f.season) ?? undefined, points: f.points, fit: formationFit(f, roster, L), body: rules(f.rules, L) }));
  return (
    <Sheet open={open} onClose={onClose} title="Боевое построение" tall>
      <p className="mb-3 text-[12.5px] text-white/50">Армия выбирает одно построение — оно даёт способность на бой. Нажмите на название, чтобы прочитать правило.</p>
      <ChoiceList choices={choices} selected={roster.formationId} onPick={onPick} />
    </Sheet>
  );
}

export function LoreSheet({ kind, onClose, roster, L, onPick }: { kind: LoreKind | null; onClose: () => void; roster: AosRoster; L: AosLookup; onPick: (id: string | null) => void }) {
  const list = kind ? loresOf(kind, L) : [];
  const selected = kind ? roster.lores[kind] : null;
  // универсальные лоры манифестаций (одинаковые у всех фракций) свёрнуты, если выбран не один из них
  const [showUniversal, setShowUniversal] = useState(() => list.some((l) => l.universal && l.id === selected));
  const choices: Choice[] = list.map((l) => ({
    id: l.id,
    title: l.name,
    sub: l.universal ? 'Универсальный лор манифестаций' : seasonLabel(l.season) ?? undefined,
    points: l.points,
    fit: loreFit(l, roster, L),
    body: (
      <>
        {rules(l.items, L)}
        {l.summons.map((id) => {
          const w = L.ws.get(id);
          return w ? (
            <div key={id}>
              <p className="mb-1 mt-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Манифестация: {w.name}</p>
              <Warscroll ws={w} />
            </div>
          ) : null;
        })}
      </>
    ),
  }));
  const universal = choices.filter((c) => list.find((l) => l.id === c.id)?.universal);
  const own = choices.filter((c) => !universal.includes(c));
  return (
    <Sheet open={!!kind} onClose={onClose} title={kind ? `${LORE_LABEL[kind]} · ${LORE_TITLE[kind]}` : ''} tall>
      <p className="mb-3 text-[12.5px] text-white/50">
        {kind === 'manifestation'
          ? 'Один лор манифестаций на армию: его знают все WIZARD и PRIEST.'
          : kind === 'spell'
            ? 'Один лор заклинаний на армию: его знают WIZARD с ключевым словом фракции генерала.'
            : 'Один лор молитв на армию: его знают PRIEST с ключевым словом фракции генерала.'}
      </p>
      <ChoiceList
        choices={showUniversal ? choices : own}
        selected={kind ? roster.lores[kind] : null}
        onPick={(id) => onPick(id)}
        onClear={() => onPick(null)}
        clearLabel="Без лора"
      />
      {universal.length > 0 && (
        <Button variant="outline" className="mb-2 w-full" onClick={() => setShowUniversal((v) => !v)} aria-expanded={showUniversal}>
          <Icon name="down" className={cx('size-4 transition', showUniversal && 'rotate-180')} />
          {showUniversal ? 'Скрыть универсальные лоры' : `Показать универсальные лоры · ${universal.length}`}
        </Button>
      )}
    </Sheet>
  );
}

export function TerrainSheet({ open, onClose, roster, L, onPick }: { open: boolean; onClose: () => void; roster: AosRoster; L: AosLookup; onPick: (id: string | null) => void }) {
  const choices: Choice[] = terrainOf(L)
    .filter((t) => roster.showLegends || !t.legends)
    .map((t) => ({ id: t.id, title: t.name, points: t.cost, fit: terrainFit(t, roster, L), body: <Warscroll ws={t} /> }));
  return (
    <Sheet open={open} onClose={onClose} title="Террейн фракции" tall>
      <p className="mb-3 text-[12.5px] text-white/50">Не больше одного террейна фракции. Ставится в своей зоне при деплое.</p>
      <ChoiceList choices={choices} selected={roster.terrainId} onPick={onPick} onClear={() => onPick(null)} clearLabel="Без террейна" />
    </Sheet>
  );
}

export function RorSheet({ open, onClose, roster, L, onPick }: { open: boolean; onClose: () => void; roster: AosRoster; L: AosLookup; onPick: (v: { id: string; picked: string[] } | null) => void }) {
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const pickedOf = (r: AosRor) => picks[r.id] ?? (roster.ror?.id === r.id ? roster.ror.picked : r.built ? [] : []);
  const choices: Choice[] = L.faction.rors.map((r) => {
    const picked = pickedOf(r);
    const fit = rorFit(r, roster, L, picked);
    return {
      id: r.id,
      strict: true,
      title: r.name,
      sub: [r.built ? 'собирается из героев' : null, r.source].filter(Boolean).join(' · ') || undefined,
      points: rorPrice(r, picked),
      fit,
      tags: r.units.filter((u) => !u.optional).map((u) => `${u.count > 1 ? u.count + '× ' : ''}${L.ws.get(u.id)?.name ?? '?'}`),
      body: (
        <>
          {r.built && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Состав (от 1)</p>
              {r.units
                .filter((u) => u.optional)
                .map((u) => {
                  const on = picked.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setPicks((p) => ({ ...p, [r.id]: on ? picked.filter((x) => x !== u.id) : [...picked, u.id] }))}
                      className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px]', on ? 'bg-accent/15 text-accent' : 'bg-white/[0.04] text-white/75')}
                    >
                      <Icon name={on ? 'check' : 'plus'} className="size-4" />
                      <span className="flex-1">{L.ws.get(u.id)?.name}</span>
                      <span className="tabular-nums">+{u.points}</span>
                    </button>
                  );
                })}
            </div>
          )}
          {rules(r.abilities, L)}
          {r.notes && <p className="whitespace-pre-line text-[12px] text-white/45">{cleanRuleText(r.notes)}</p>}
          {r.units.map((u) => {
            const w = L.ws.get(u.id);
            return w ? <Warscroll key={u.id} ws={w} /> : null;
          })}
        </>
      ),
    };
  });
  return (
    <Sheet open={open} onClose={onClose} title="Полк славы" tall>
      <p className="mb-3 text-[12.5px] text-white/50">
        Regiment of Renown — готовый отряд союзников, не больше одного, сверх 5 полков. Его юниты не могут быть генералом и не получают улучшения и правила вашей фракции.
      </p>
      <ChoiceList choices={choices} selected={roster.ror?.id ?? null} onPick={(id) => onPick({ id, picked: pickedOf(L.ror.get(id)!) })} onClear={() => onPick(null)} clearLabel="Без полка славы" />
    </Sheet>
  );
}

export function EnhancementSheet({
  target,
  onClose,
  roster,
  L,
  onPick,
}: {
  target: { uid: string; typeKey: string } | null;
  onClose: () => void;
  roster: AosRoster;
  L: AosLookup;
  onPick: (itemId: string | null) => void;
}) {
  const unit = target ? findUnit(roster, target.uid) : undefined;
  const type = target ? L.faction.enhancementTypes.find((t) => t.key === target.typeKey) : undefined;
  const choices: Choice[] =
    unit && type
      ? type.tables.flatMap((tb) =>
          tb.items.map((it) => ({
            id: it.id,
            title: it.name,
            sub: [tb.name, seasonLabel(tb.season), tb.eligibility.text].filter(Boolean).join(' · '),
            points: it.points,
            fit: enhancementFit(unit, it.id, roster, L),
            body: <AosRuleCard rule={it} L={L} open />,
          })),
        )
      : [];
  return (
    <Sheet open={!!target} onClose={onClose} title={type?.name ?? ''} tall>
      <p className="mb-3 text-[12.5px] text-white/50">Одно улучшение из каждой таблицы на армию; у юнита — не больше одного улучшения каждого типа; UNIQUE улучшать нельзя.</p>
      <ChoiceList choices={choices} selected={unit && target ? unit.enhancements[target.typeKey] ?? null : null} onPick={onPick} onClear={() => onPick(null)} clearLabel="Убрать улучшение" />
    </Sheet>
  );
}

/** Куда перенести юнит: другой полк или вспомогательные. */
export function MoveSheet({ uid, onClose, roster, L, onMove }: { uid: string | null; onClose: () => void; roster: AosRoster; L: AosLookup; onMove: (target: string | 'aux') => void }) {
  const unit = uid ? findUnit(roster, uid) : undefined;
  const ws = unit ? L.ws.get(unit.warscrollId) : undefined;
  const here = (regUid: string | 'aux') => (regUid === 'aux' ? roster.auxiliaries.some((u) => u.uid === uid) : roster.regiments.find((g) => g.uid === regUid)?.units.some((u) => u.uid === uid));
  const choices: Choice[] =
    ws && uid
      ? [
          ...roster.regiments.map((g) => ({
            id: g.uid,
            title: `Полк: ${L.ws.get(g.leader.warscrollId)?.name ?? '?'}`,
            sub: g.leader.uid === roster.generalUid ? 'полк генерала' : undefined,
            points: null,
            fit: here(g.uid) ? ({ ok: false, reason: 'Юнит уже здесь.' } as Fit) : regimentFit(g, ws, roster, L, uid),
          })),
          {
            id: 'aux',
            title: 'Вспомогательные юниты',
            sub: `доплата за следующий: +${nextAuxiliarySurcharge(roster.auxiliaries.filter((x) => x.uid !== uid).length)} очк.`,
            points: null,
            fit: here('aux') ? ({ ok: false, reason: 'Юнит уже здесь.' } as Fit) : auxiliaryFit(ws, roster, L, uid),
          },
        ]
      : [];
  return (
    <Sheet open={!!uid} onClose={onClose} title={`Перенести: ${ws?.name ?? ''}`}>
      <ChoiceList choices={choices} selected={null} onPick={(id) => onMove(id)} />
    </Sheet>
  );
}
