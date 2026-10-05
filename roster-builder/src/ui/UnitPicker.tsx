import { useMemo, useState } from 'react';
import { bandFor, battlelineGrants, copyLimit, isBattleline, type ComputedRoster, type DataLookup } from '../engine/compute';
import type { Datasheet, Roster } from '../engine/types';
import { haptic } from '../telegram';
import { Icon, Sheet, Tag, cx } from './kit';

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
  const chapters = L.faction.chapters;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return L.faction.datasheets
      .filter((ds) => {
        if (ds.legends && !roster.showLegends) return false;
        if (ds.group.startsWith('det:') && !roster.detachmentIds.includes(ds.group.slice(4))) return false;
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
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [L, q, tab, roster.showLegends, roster.detachmentIds, grants, chapter, chapters]);

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
            <p key={a.key} className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/55">
              <b className="text-white/80">{a.name}:</b> {a.note}
            </p>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-white/45">Ничего не найдено</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((ds) => {
            const n = counts.get(ds.id) ?? 0;
            const bl = isBattleline(ds, grants);
            const limit = copyLimit(ds, roster.battleSize, bl);
            const next = bandFor(ds, n + 1);
            const price = next?.options[0]?.cost;
            const full = n >= limit;
            return (
              <li key={ds.id}>
                <button
                  type="button"
                  onClick={() => onAdd(ds)}
                  className={cx('flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition active:bg-white/10', full && 'opacity-45')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{ds.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {ds.epicHero ? <Tag tone="accent">Epic Hero</Tag> : ds.character && <Tag>Персонаж</Tag>}
                      {ds.support && <Tag>Support</Tag>}
                      {bl && <Tag>Battleline</Tag>}
                      {ds.legends && <Tag tone="warn">Legends</Tag>}
                      {ds.forgeWorld && <Tag>FW</Tag>}
                      {ds.group.startsWith('det:') && <Tag tone="accent">{L.det.get(ds.group.slice(4))?.name}</Tag>}
                      {ds.group.startsWith('ally:') && <Tag>{L.faction.allies.find((a) => 'ally:' + a.key === ds.group)?.name}</Tag>}
                      <span className={cx('text-[11px] font-semibold tabular-nums', full ? 'text-danger' : n ? 'text-accent' : 'text-white/35')}>
                        {n}/{limit}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-base font-semibold tabular-nums">{price ?? '—'}</p>
                    {next && next.options.length > 1 && <p className="text-[10px] text-white/35">от</p>}
                  </div>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <Icon name="plus" className="size-4" />
                  </span>
                </button>
              </li>
            );
          })}
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
