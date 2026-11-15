/**
 * Боевой лист 40K (07.11.2026): стратагемы ростера по ходу и фазе, кому из юнитов они доступны, и короткие строки
 * характеристик юнитов. Открывается из ростера (меню, режим просмотра) и из игры (ростер игрока).
 */
import { useMemo, useState } from 'react';
import type { ComputedRoster, DataLookup } from '../engine/compute';
import { inPhase, inTurn, matchStratagem, PHASE_LABEL, PHASES, rosterStratagems, type PhaseFilter, type TurnFilter } from '../engine/battlesheet';
import { sortRosterUnits } from '../engine/sort';
import { ruStratagem } from '../ru';
import { RuleText } from './DetachmentPanel';
import { useRu } from './common/useRu';
import { Icon, Segmented, Sheet } from './kit';
import { cx } from './util';
import { haptic } from '../telegram';
import { useEn, useT } from './common/i18n';

const PHASE_EN: Record<string, string> = { Command: 'Command', Movement: 'Movement', Shooting: 'Shooting', Charge: 'Charge', Fight: 'Fight' };

export function BattleSheet({ open, onClose, L, cr, detachmentIds }: { open: boolean; onClose: () => void; L: DataLookup; cr: ComputedRoster; detachmentIds: string[] }) {
  const t = useT();
  const en = useEn();
  const [tab, setTab] = useState<'strats' | 'units'>('strats');
  const [turn, setTurn] = useState<TurnFilter>('all');
  const [phase, setPhase] = useState<PhaseFilter>('all');
  const [q, setQ] = useState('');
  const ru = useRu(L.faction.id);
  const all = useMemo(() => rosterStratagems(cr, L, detachmentIds), [cr, L, detachmentIds]);
  const list = all.filter((s) => inTurn(s.st, turn) && inPhase(s.st, phase) && matchStratagem(s, q, ruStratagem(ru, s.st.id)));
  const groups = [
    { title: t('Детачмент', 'Detachment'), items: list.filter((s) => s.det) },
    { title: t('Армия', 'Army'), items: list.filter((s) => !s.det && !s.core) },
    { title: t('Основные', 'Core'), items: list.filter((s) => s.core) },
  ].filter((g) => g.items.length);
  const units = sortRosterUnits(cr.units.filter((u) => u.ds));

  return (
    <Sheet open={open} onClose={onClose} title={t('Боевой лист', 'Battle sheet')} tall>
      <div className="sticky top-0 z-10 -mx-4 space-y-2.5 bg-app-elevated px-4 pb-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'strats', label: `${t('Стратагемы', 'Stratagems')} ${all.length}` }, { value: 'units', label: `${t('Юниты', 'Units')} ${units.length}` }]} />
        {tab === 'strats' && (
          <>
            <Segmented
              value={turn}
              onChange={(v) => (haptic.select(), setTurn(v))}
              options={[
                { value: 'all', label: t('Любой ход', 'Any turn') },
                { value: 'mine', label: t('Мой', 'Mine') },
                { value: 'opp', label: t('Противника', 'Opponent’s') },
              ]}
            />
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
              {(['all', ...PHASES] as PhaseFilter[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={phase === p}
                  onClick={() => (haptic.select(), setPhase(p))}
                  className={cx('shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition', phase === p ? 'bg-accent text-accent-foreground' : 'bg-white/[0.06] text-fg-2')}
                >
                  {p === 'all' ? t('Все фазы', 'All phases') : en ? PHASE_EN[p] : PHASE_LABEL[p]}
                </button>
              ))}
            </div>
            <label className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 focus-within:border-accent">
              <Icon name="search" className="size-4 text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Поиск по названию и тексту', 'Search by name and text')} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-fg-3" />
              {q && (
                <button type="button" aria-label={t('Очистить', 'Clear')} onClick={() => setQ('')} className="text-fg-3">
                  <Icon name="close" className="size-4" />
                </button>
              )}
            </label>
          </>
        )}
      </div>

      {tab === 'strats' ? (
        groups.length ? (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.title}>
                <h3 className="mb-1.5 flex justify-between px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-3">
                  <span>{g.title}</span>
                  <span className="tabular-nums">{g.items.length}</span>
                </h3>
                <div className="space-y-1.5">
                  {g.items.map(({ st, det, targets }) => (
                    <RuleText
                      key={st.id}
                      name={st.name}
                      sub={[`${st.cp} CP`, st.turn, st.phase, det].filter(Boolean).join(' · ')}
                      text={st.text}
                      ru={ruStratagem(ru, st.id)}
                      extra={targets.length ? <p className="mt-2 text-[12px] leading-snug text-fg-3">{t('Для:', 'For:')} {targets.join(', ')}</p> : null}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-fg-3">{t('Нет стратагем для этого фильтра', 'No Stratagems for this filter')}</p>
        )
      ) : units.length ? (
        <ul className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          {units.map((u) => {
            const ds = u.ds!;
            const host = u.unit.attachedTo ? cr.byUid.get(u.unit.attachedTo)?.ds?.name : null;
            return (
              <li key={u.unit.uid} className="border-b border-white/[0.06] px-3 py-2.5 last:border-b-0">
                <p className="flex items-baseline justify-between gap-2 text-[14px] font-semibold leading-snug">
                  <span className="min-w-0">{ds.name}</span>
                  <span className="shrink-0 text-[12px] font-normal tabular-nums text-fg-3">{u.models} {t('мод.', 'models')}</span>
                </p>
                {host && <p className="text-[12px] text-fg-3">{t('с отрядом', 'with')} {host}</p>}
                <table className="mt-1 w-full table-fixed text-center text-[12.5px] tabular-nums">
                  <thead>
                    <tr className="text-[11px] uppercase text-fg-3">
                      {['M', 'T', 'Sv', 'W', 'Ld', 'OC'].map((k) => (
                        <th key={k} className="font-semibold">
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ds.stats.flatMap((s, i) => [
                      // несколько профилей — подпись модели строкой над значениями (как в карточке юнита)
                      ds.stats.length > 1 ? (
                        <tr key={'n' + i}>
                          <td colSpan={6} className="pt-1 text-left text-[11.5px] text-fg-3">
                            {s.name}
                          </td>
                        </tr>
                      ) : null,
                      <tr key={i}>
                        <td>{s.M}</td>
                        <td>{s.T}</td>
                        <td>
                          {s.Sv}
                          {s.inv ? <span className="text-accent">/{s.inv}+</span> : null}
                        </td>
                        <td>{s.W}</td>
                        <td>{s.Ld}</td>
                        <td>{s.OC}</td>
                      </tr>,
                    ])}
                  </tbody>
                </table>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-fg-3">{t('В ростере нет юнитов', 'No units in the roster')}</p>
      )}
    </Sheet>
  );
}
