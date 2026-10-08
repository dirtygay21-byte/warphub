import { useState } from 'react';
import { auxiliaryFit, leaderFit, optionsText, regimentCap, regimentFit, slotsUsed, type AosLookup, type Fit } from '../../aos/engine';
import { nextAuxiliarySurcharge } from '../../aos/rules';
import type { AosRoster, AosWarscroll } from '../../aos/types';
import { haptic } from '../../telegram';
import { Icon, Sheet } from '../kit';
import { cx } from '../util';

export type PickTarget = { kind: 'leader' } | { kind: 'regiment'; regUid: string } | { kind: 'aux' };

/** Группы по роли из Battle Profiles. */
const GROUPS: { key: string; label: string; test: (w: AosWarscroll) => boolean }[] = [
  { key: 'hero', label: 'Герои', test: (w) => w.hero },
  { key: 'infantry', label: 'Пехота', test: (w) => /infantry/i.test(w.role) },
  { key: 'cavalry', label: 'Кавалерия', test: (w) => /cavalry/i.test(w.role) },
  { key: 'beast', label: 'Звери', test: (w) => /beast/i.test(w.role) },
  { key: 'monster', label: 'Монстры', test: (w) => /monster/i.test(w.role) },
  { key: 'machine', label: 'Машины', test: (w) => /war machine/i.test(w.role) },
  { key: 'other', label: 'Прочие', test: () => true },
];
const groupOf = (w: AosWarscroll) => GROUPS.find((g) => g.test(w))!.key;

export function AosPicker({
  target,
  onClose,
  roster,
  L,
  onPick,
  onToggleLegends,
}: {
  target: PickTarget | null;
  onClose: () => void;
  roster: AosRoster;
  L: AosLookup;
  onPick: (w: AosWarscroll) => void;
  onToggleLegends: () => void;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [onlyOk, setOnlyOk] = useState(true);
  const reg = target?.kind === 'regiment' ? roster.regiments.find((g) => g.uid === target.regUid) ?? null : null;
  const leader = reg ? L.ws.get(reg.leader.warscrollId) : undefined;

  // считается на каждом рендере: ~100 варскроллов, проверки дешёвые
  const rows = (() => {
    if (!target) return [];
    const needle = q.trim().toLowerCase();
    const fitOf = (w: AosWarscroll): Fit =>
      target.kind === 'leader' ? leaderFit(w, roster, L) : target.kind === 'aux' ? auxiliaryFit(w, roster, L) : reg ? regimentFit(reg, w, roster, L) : { ok: false, reason: 'Полк не найден.' };
    return L.faction.warscrolls
      .filter((w) => w.kind === 'unit' && (target.kind !== 'leader' || w.hero))
      .filter((w) => w.season !== 'ghyran' && !w.aorOnly && (roster.showLegends || !w.legends))
      .filter((w) => !needle || w.name.toLowerCase().includes(needle) || w.keywords.some((k) => k.toLowerCase() === needle))
      .map((w) => ({ w, fit: fitOf(w), group: groupOf(w) }))
      .sort((a, b) => Number(b.fit.ok) - Number(a.fit.ok) || GROUPS.findIndex((g) => g.key === a.group) - GROUPS.findIndex((g) => g.key === b.group) || a.w.name.localeCompare(b.w.name));
  })();

  const chips = GROUPS.map((g) => ({ ...g, n: rows.filter((r) => r.group === g.key && (!onlyOk || r.fit.ok)).length })).filter((g) => g.n);
  // выбранная группа пропала (поиск, «можно взять») — снова «Все»
  const active = chips.some((g) => g.key === tab) ? tab : 'all';
  const visible = rows.filter((r) => (!onlyOk || r.fit.ok) && (active === 'all' || r.group === active));
  const okCount = rows.filter((r) => r.fit.ok).length;
  const legendsCount = L.faction.warscrolls.filter((w) => w.kind === 'unit' && w.legends).length;

  const title = target?.kind === 'leader' ? 'Новый полк: лидер' : target?.kind === 'aux' ? 'Вспомогательный юнит' : `В полк: ${leader?.name ?? ''}`;
  return (
    <Sheet open={!!target} onClose={onClose} title={title} tall>
      <div className="sticky top-0 z-10 -mx-4 space-y-2.5 bg-app-elevated px-4 pb-3">
        {reg && leader && (
          <p className="rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] leading-snug text-white/55">
            Места: {slotsUsed(reg, L)}/{regimentCap(reg, roster)} · Варианты: {optionsText(leader)}
          </p>
        )}
        {target?.kind === 'aux' && (
          <p className="rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] leading-snug text-white/55">
            Юниты вне полков. Каждый следующий дороже: {roster.auxiliaries.length ? `доплата за этот +${nextAuxiliarySurcharge(roster.auxiliaries.length)} очк.` : 'первый — без доплаты, дальше +20, +40, +60…'}
          </p>
        )}
        {target?.kind === 'leader' && <p className="rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] leading-snug text-white/55">Полк — это герой-лидер и до 3 юнитов (у генерала — до 4). В армии до 5 полков.</p>}
        <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 focus-within:border-accent">
          <Icon name="search" className="size-4 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
          {q && (
            <button type="button" aria-label="Очистить" onClick={() => setQ('')} className="text-white/40">
              <Icon name="close" className="size-4" />
            </button>
          )}
        </label>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          <Chip active={onlyOk} onClick={() => setOnlyOk((v) => !v)}>
            {onlyOk && <Icon name="check" className="-ml-0.5 mr-1 inline size-3.5" />}
            Только доступные
            <span className="ml-1 tabular-nums opacity-60">
              {okCount}/{rows.length}
            </span>
          </Chip>
          <Chip active={active === 'all'} onClick={() => setTab('all')}>
            Все
          </Chip>
          {chips.map((g) => (
            <Chip key={g.key} active={active === g.key} onClick={() => setTab(g.key)}>
              {g.label}
              <span className="ml-1 tabular-nums opacity-60">{g.n}</span>
            </Chip>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="py-10 text-center text-sm text-white/45">
          {rows.length && onlyOk ? (
            <>
              Подходящих юнитов нет.
              <button type="button" onClick={() => setOnlyOk(false)} className="mt-2 block w-full font-semibold text-accent">
                Показать все и причины
              </button>
            </>
          ) : (
            'Ничего не найдено'
          )}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          {visible.map(({ w, fit }) => (
            <li key={w.id} className="border-b border-white/[0.06] last:border-b-0">
              <button
                type="button"
                disabled={!fit.ok}
                onClick={() => (haptic.ok(), onPick(w))}
                className={cx('flex w-full items-center gap-3 px-3.5 py-3 text-left transition active:bg-white/[0.06]', !fit.ok && 'cursor-not-allowed')}
              >
                <div className="min-w-0 flex-1">
                  <p className={cx('text-[14px] font-semibold leading-snug', !fit.ok && 'text-white/45')}>{w.name}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-white/40">
                    {[w.role, w.unitSize > 1 ? `${w.unitSize} мод.` : null, w.unique ? 'Unique' : null, w.warmaster ? 'Warmaster' : null, w.season === 'aqshy' ? 'Scourge of Aqshy' : null, w.legends ? 'Legends' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {!fit.ok && <p className="mt-1 text-[12px] leading-snug text-amber-200/80">{fit.reason}</p>}
                </div>
                <span className={cx('font-display w-11 shrink-0 text-right text-[17px] font-semibold tabular-nums', !fit.ok && 'text-white/35')}>{w.cost ?? '—'}</span>
                <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-full', fit.ok ? 'bg-accent/15 text-accent' : 'bg-white/[0.04] text-white/25')}>
                  <Icon name={fit.ok ? 'plus' : 'close'} className="size-4" strokeWidth={2.5} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {legendsCount > 0 && (
        <button type="button" onClick={onToggleLegends} className="mt-4 w-full rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs font-semibold text-white/50">
          {roster.showLegends ? 'Скрыть' : 'Показать'} Warhammer Legends ({legendsCount})
        </button>
      )}
    </Sheet>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => (haptic.select(), onClick())}
      className={cx('shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition', active ? 'bg-accent text-accent-foreground' : 'bg-white/[0.06] text-white/70')}
    >
      {children}
    </button>
  );
}
