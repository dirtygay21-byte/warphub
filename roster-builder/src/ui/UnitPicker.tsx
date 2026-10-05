import { useMemo, useState } from 'react';
import { bandFor, battlelineGrants, copyLimit, isBattleline, type ComputedRoster, type DataLookup } from '../engine/compute';
import { compareUnits, typeLabel, typeRank, unitType } from '../engine/sort';
import type { Datasheet, Roster } from '../engine/types';
import { haptic } from '../telegram';
import { Icon, Sheet, cx } from './kit';

type Tab = 'all' | 'characters' | 'battleline' | 'transports' | 'other' | 'allies';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'characters', label: 'Персонажи' },
  { key: 'battleline', label: 'Линия' },
  { key: 'transports', label: 'Транспорт' },
  { key: 'other', label: 'Прочие' },
  { key: 'allies', label: 'Союзники' },
];

export function UnitPicker({
  open,
  onClose,
  roster,
  L,
  cr,
  onAdd,
  onToggleLegends,
}: {
  open: boolean;
  onClose: () => void;
  roster: Roster;
  L: DataLookup;
  cr: ComputedRoster;
  onAdd: (ds: Datasheet) => void;
  onToggleLegends: () => void;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const grants = useMemo(() => battlelineGrants(cr.detachments), [cr.detachments]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of roster.units) m.set(u.datasheetId, (m.get(u.datasheetId) ?? 0) + 1);
    return m;
  }, [roster.units]);

  const chapter = cr.chapter;
  // союзные правила, которые выбранный детачмент отключает (Reaper’s Wager → Corsairs)
  const disabledAllies = useMemo(() => {
    const off = new Set(cr.detachments.map((d) => d.disablesArmyRule).filter(Boolean));
    return new Set(L.faction.allies.filter((a) => off.has(a.name)).map((a) => a.key));
  }, [cr.detachments, L]);
  const chapters = L.faction.chapters;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return L.faction.datasheets
      .filter((ds) => {
        if (ds.legends && !roster.showLegends) return false;
        if (ds.group.startsWith('det:') && !roster.detachmentIds.includes(ds.group.slice(4))) return false;
        if (ds.group.startsWith('ally:') && disabledAllies.has(ds.group.slice(5))) return false;
        // для Space Marines — скрываем юниты чужих орденов
        if (chapter && chapters.length) {
          const ch = ds.factionKeywords.find((k) => chapters.includes(k));
          if (ch && ch !== chapter) return false;
        }
        if (needle && !ds.name.toLowerCase().includes(needle) && !ds.keywords.some((k) => k.toLowerCase() === needle)) return false;
        const bl = isBattleline(ds, grants);
        const g: Tab = ds.group.startsWith('ally:') ? 'allies' : ds.character ? 'characters' : bl ? 'battleline' : ds.dedicatedTransport ? 'transports' : 'other';
        return tab === 'all' ? true : g === tab;
      })
      .sort((a, b) => compareUnits(a, b, isBattleline(a, grants), isBattleline(b, grants)));
  }, [L, q, tab, roster.showLegends, roster.detachmentIds, grants, chapter, chapters, disabledAllies]);

  // секции: свои юниты по типу → юниты из детачментов → союзники → Legends
  const sections = useMemo(() => {
    const out: { key: string; title: string; note?: string; items: Datasheet[] }[] = [];
    const push = (key: string, title: string, ds: Datasheet, note?: string) => {
      let s = out.find((x) => x.key === key);
      if (!s) out.push((s = { key, title, note, items: [] }));
      s.items.push(ds);
    };
    const rank = (ds: Datasheet) => {
      if (ds.legends) return 300;
      if (ds.group.startsWith('ally:')) return 200 + L.faction.allies.findIndex((a) => 'ally:' + a.key === ds.group);
      if (ds.group.startsWith('det:')) return 100;
      return typeRank(unitType(ds, isBattleline(ds, grants)));
    };
    for (const ds of [...list].sort((a, b) => rank(a) - rank(b))) {
      if (ds.legends) push('legends', 'Warhammer Legends', ds);
      else if (ds.group.startsWith('ally:')) {
        const a = L.faction.allies.find((x) => 'ally:' + x.key === ds.group);
        push(ds.group, 'Союзники · ' + (a?.name ?? ''), ds);
      } else if (ds.group.startsWith('det:')) push(ds.group, 'Детачмент · ' + (L.det.get(ds.group.slice(4))?.name ?? ''), ds);
      else {
        const t = unitType(ds, isBattleline(ds, grants));
        push(t, typeLabel(t), ds);
      }
    }
    return out;
  }, [list, L, grants]);

  const legendsCount = L.faction.datasheets.filter((d) => d.legends).length;

  return (
    <Sheet open={open} onClose={onClose} title="Добавить юнит" tall>
      <div className="sticky top-0 z-10 -mx-4 space-y-2.5 bg-app-elevated px-4 pb-3">
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
          {TABS.filter((t) => t.key !== 'allies' || L.faction.allies.length).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => (haptic.select(), setTab(t.key))}
              className={cx('shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === t.key ? 'bg-accent text-accent-foreground' : 'bg-white/[0.06] text-white/70')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'allies' && (
        <div className="mb-3 space-y-1.5">
          {L.faction.allies.map((a) => (
            <details key={a.key} className="group rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/55">
              <summary className="cursor-pointer list-none">
                <b className="text-white/80">{a.name}:</b> {a.note}
              </summary>
              {a.text && <p className="mt-1.5 whitespace-pre-line leading-relaxed text-white/60">{a.text}</p>}
            </details>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-white/45">Ничего не найдено</p>
      ) : (
        <div className="space-y-5">
          {sections.map((sec) => (
            <section key={sec.key}>
              <h3 className="mb-2 flex items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
                <span>{sec.title}</span>
                <span className="tabular-nums text-white/25">{sec.items.length}</span>
              </h3>
              <ul className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                {sec.items.map((ds) => (
                  <PickerRow
                    key={ds.id}
                    ds={ds}
                    count={counts.get(ds.id) ?? 0}
                    limit={copyLimit(ds, roster.battleSize, isBattleline(ds, grants))}
                    onAdd={() => onAdd(ds)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {legendsCount > 0 && (
        <button type="button" onClick={onToggleLegends} className="mt-4 w-full rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs font-semibold text-white/50">
          {roster.showLegends ? 'Скрыть' : 'Показать'} Warhammer Legends ({legendsCount})
        </button>
      )}
    </Sheet>
  );
}

function PickerRow({ ds, count, limit, onAdd }: { ds: Datasheet; count: number; limit: number; onAdd: () => void }) {
  const next = bandFor(ds, count + 1);
  const opts = next?.options ?? [];
  const price = opts[0]?.cost;
  const full = count >= limit;
  const models = [...new Set(opts.map((o) => o.models))];
  const sub: string[] = [];
  if (ds.leads.length) sub.push(ds.support ? 'Support' : 'Leader');
  if (models.length && !(models.length === 1 && models[0] === 1)) sub.push(models.join(' / ') + ' мод.');
  if (ds.forgeWorld) sub.push('Forge World');
  return (
    <li className="border-b border-white/[0.06] last:border-b-0">
      <button type="button" onClick={onAdd} className={cx('flex w-full items-center gap-3 px-3.5 py-3 text-left transition active:bg-white/[0.06]', full && 'opacity-40')}>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug">{ds.name}</p>
          {sub.length > 0 && <p className="mt-0.5 text-[12px] leading-snug text-white/45">{sub.join(' · ')}</p>}
        </div>
        {count > 0 && (
          <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', full ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent')}>
            {count}/{limit}
          </span>
        )}
        <span className="w-11 shrink-0 text-right">
          {opts.length > 1 && <span className="block text-[10px] leading-none text-white/35">от</span>}
          <span className="font-display text-[17px] font-semibold leading-tight tabular-nums">{price ?? '—'}</span>
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Icon name="plus" className="size-4" strokeWidth={2.5} />
        </span>
      </button>
    </li>
  );
}
