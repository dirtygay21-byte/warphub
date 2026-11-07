import { useMemo, useState } from 'react';
import { bandFor, battlelineGrants, copyKey, copyLimit, isBattleline, type ComputedRoster, type DataLookup } from '../engine/compute';
import { dsLabel, outdatedNote } from '../engine/source';
import { compareUnits, typeLabel, typeRank, unitType, type UnitType } from '../engine/sort';
import type { Datasheet, Roster } from '../engine/types';
import { haptic } from '../telegram';
import { Icon, Sheet } from './kit';
import { cx } from './util';
import { cleanRuleText } from '../text';
import { cheapest, fitsPoints, PICKER_SORTS, pickerMatch, sizePriceLine, sortPicker, type PickerSort } from '../engine/picker';
import type { RuOverlay } from '../ru';

/** Сортировка и «Помещается» — на устройстве (удобство; хранилище может быть недоступно — тогда по умолчанию). */
const PREFS = 'warphub:roster-40k-picker';
function readPrefs(): { sort: PickerSort; fits: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS) ?? 'null') as { sort?: string; fits?: boolean } | null;
    const sort = PICKER_SORTS.some((x) => x.key === v?.sort) ? (v!.sort as PickerSort) : 'type';
    return { sort, fits: v?.fits === true };
  } catch {
    return { sort: 'type', fits: false };
  }
}
function savePrefs(p: { sort: PickerSort; fits: boolean }) {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    /* хранилище недоступно — настройка не запоминается */
  }
}

/** Короткие подписи быстрых фильтров — по одной на каждую секцию списка. */
const CHIP: Record<UnitType, string> = {
  epic: 'Эпики',
  character: 'Персонажи',
  battleline: 'Линия',
  transport: 'Транспорт',
  infantry: 'Пехота',
  mounted: 'Кавалерия',
  walker: 'Шагоходы',
  vehicle: 'Техника',
  monster: 'Монстры',
  aircraft: 'Авиация',
  titanic: 'Титаны',
  fortification: 'Укрепления',
  other: 'Прочие',
};

export function UnitPicker({
  open,
  onClose,
  roster,
  L,
  cr,
  onAdd,
  onToggleLegends,
  ru = null,
}: {
  open: boolean;
  onClose: () => void;
  roster: Roster;
  L: DataLookup;
  cr: ComputedRoster;
  onAdd: (ds: Datasheet) => void;
  onToggleLegends: () => void;
  ru?: RuOverlay | null;
}) {
  const [q, setQ] = useState('');
  const [prefs, setPrefsState] = useState(readPrefs);
  const setPrefs = (p: Partial<typeof prefs>) => {
    const next = { ...prefs, ...p };
    setPrefsState(next);
    savePrefs(next);
  };
  const remaining = cr.pointsLimit > 0 ? cr.pointsLimit - cr.points : null;
  const fitsOn = prefs.fits && remaining != null;
  const [tab, setTab] = useState<string>('all');
  const grants = useMemo(() => battlelineGrants(cr.detachments), [cr.detachments]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    // по названию, как лимит копий в движке (copyKey)
    for (const u of roster.units) {
      const ds = L.ds.get(u.datasheetId);
      const k = ds ? copyKey(ds) : u.datasheetId;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [roster.units, L]);

  const chapter = cr.chapter;
  // союзные правила, которые выбранный детачмент отключает (Reaper’s Wager → Corsairs)
  const disabledAllies = useMemo(() => {
    const off = new Set(cr.detachments.map((d) => d.disablesArmyRule).filter(Boolean));
    return new Set(L.faction.allies.filter((a) => off.has(a.name)).map((a) => a.key));
  }, [cr.detachments, L]);
  const chapters = L.faction.chapters;

  const countOf = (ds: Datasheet) => counts.get(copyKey(ds)) ?? 0;
  const list = useMemo(() => {
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
        if (fitsOn && !fitsPoints(ds, counts.get(copyKey(ds)) ?? 0, chapter, remaining!)) return false;
        return pickerMatch(ds, q, ru);
      })
      .sort((a, b) => compareUnits(a, b, isBattleline(a, grants), isBattleline(b, grants)));
  }, [L, q, ru, roster.showLegends, roster.detachmentIds, grants, chapter, chapters, disabledAllies, fitsOn, remaining, counts]);

  // секции: свои юниты по типу → юниты из детачментов → союзники → Legends
  const sections = useMemo(() => {
    const out: { key: string; title: string; chip: string; items: Datasheet[] }[] = [];
    const push = (key: string, title: string, chip: string, ds: Datasheet) => {
      let s = out.find((x) => x.key === key);
      if (!s) out.push((s = { key, title, chip, items: [] }));
      s.items.push(ds);
    };
    const rank = (ds: Datasheet) => {
      if (ds.legends) return 300;
      if (ds.group.startsWith('ally:')) return 200 + L.faction.allies.findIndex((a) => 'ally:' + a.key === ds.group);
      if (ds.group.startsWith('det:')) return 100;
      return typeRank(unitType(ds, isBattleline(ds, grants)));
    };
    for (const ds of [...list].sort((a, b) => rank(a) - rank(b))) {
      if (ds.legends) push('legends', 'Warhammer Legends', 'Legends', ds);
      else if (ds.group.startsWith('ally:')) {
        const a = L.faction.allies.find((x) => 'ally:' + x.key === ds.group);
        push(ds.group, 'Союзники · ' + (a?.name ?? ''), a?.name ?? 'Союзники', ds);
      } else if (ds.group.startsWith('det:')) {
        const name = L.det.get(ds.group.slice(4))?.name ?? '';
        push(ds.group, 'Детачмент · ' + name, name || 'Детачмент', ds);
      } else {
        const t = unitType(ds, isBattleline(ds, grants));
        push(t, typeLabel(t), CHIP[t], ds);
      }
    }
    return out;
  }, [list, L, grants]);

  const legendsCount = L.faction.datasheets.filter((d) => d.legends).length;
  // фильтр показывает ровно одну секцию; если её не стало (поиск, Legends) — снова «Все»
  const active = tab !== 'all' && sections.some((s) => s.key === tab) ? tab : 'all';
  const bySection = active === 'all' ? sections : sections.filter((s) => s.key === active);
  // А–Я и «По очкам» — одним списком (фильтр раздела действует)
  const visible =
    prefs.sort === 'type'
      ? bySection
      : [{ key: 'flat', title: PICKER_SORTS.find((x) => x.key === prefs.sort)!.title, chip: '', items: sortPicker(bySection.flatMap((x) => x.items), prefs.sort, (ds) => cheapest(ds, countOf(ds), chapter)) }];
  const allyInfo = active.startsWith('ally:') ? L.faction.allies.filter((a) => 'ally:' + a.key === active) : [];

  return (
    <Sheet open={open} onClose={onClose} title="Добавить юнит" tall>
      <div className="sticky top-0 z-10 -mx-4 space-y-2.5 bg-app-elevated px-4 pb-3">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 focus-within:border-accent">
          <Icon name="search" className="size-4 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, ключевое слово или способность" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-fg-3" />
          {q && (
            <button type="button" aria-label="Очистить" onClick={() => setQ('')} className="text-fg-3">
              <Icon name="close" className="size-4" />
            </button>
          )}
        </label>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Сортировка" className="flex min-w-0 flex-1 rounded-lg bg-white/[0.06] p-0.5">
            {PICKER_SORTS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="radio"
                aria-checked={prefs.sort === x.key}
                aria-label={x.title}
                onClick={() => (haptic.select(), setPrefs({ sort: x.key }))}
                className={cx('min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-xs font-semibold transition', prefs.sort === x.key ? 'bg-white/[0.12] text-white' : 'text-fg-3')}
              >
                {x.label}
              </button>
            ))}
          </div>
          {remaining != null && (
            <button
              type="button"
              aria-pressed={prefs.fits}
              onClick={() => (haptic.select(), setPrefs({ fits: !prefs.fits }))}
              className={cx('shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', prefs.fits ? 'bg-accent text-accent-foreground' : 'bg-white/[0.06] text-fg-2')}
            >
              Помещается <span className={cx('tabular-nums', prefs.fits ? 'text-accent-foreground/70' : 'text-fg-3')}>{Math.max(0, remaining)}</span>
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {[{ key: 'all', chip: 'Все', items: list }, ...sections].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => (haptic.select(), setTab(t.key))}
              className={cx('shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition', active === t.key ? 'bg-accent text-accent-foreground' : 'bg-white/[0.06] text-fg-2')}
            >
              {t.chip}
              <span className={cx('ml-1 tabular-nums', active === t.key ? 'text-accent-foreground/60' : 'text-fg-3')}>{t.items.length}</span>
            </button>
          ))}
        </div>
      </div>

      {allyInfo.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {allyInfo.map((a) => (
            <details key={a.key} className="group rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-fg-3">
              <summary className="cursor-pointer list-none">
                <b className="text-white/80">{a.name}:</b> {a.note}
              </summary>
              {a.text && <p className="mt-1.5 whitespace-pre-line leading-relaxed text-fg-2">{cleanRuleText(a.text)}</p>}
            </details>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-3">{fitsOn ? `Ничего не найдено — осталось ${Math.max(0, remaining!)} очк.` : 'Ничего не найдено'}</p>
      ) : (
        <div className="space-y-5">
          {visible.map((sec) => (
            <section key={sec.key}>
              <h3 className="mb-2 flex items-baseline justify-between px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-3">
                <span>{sec.title}</span>
                <span className="tabular-nums text-fg-3">{sec.items.length}</span>
              </h3>
              <ul className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                {sec.items.map((ds) => (
                  <PickerRow
                    key={ds.id}
                    ds={ds}
                    count={counts.get(copyKey(ds)) ?? 0}
                    limit={copyLimit(ds, roster.battleSize, isBattleline(ds, grants))}
                    chapter={cr.chapter}
                    factionName={L.faction.name}
                    onAdd={() => onAdd(ds)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {legendsCount > 0 && (
        <button type="button" onClick={onToggleLegends} className="mt-4 w-full rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs font-semibold text-fg-3">
          {roster.showLegends ? 'Скрыть' : 'Показать'} Warhammer Legends ({legendsCount})
        </button>
      )}
    </Sheet>
  );
}

function PickerRow({ ds, count, limit, chapter, factionName, onAdd }: { ds: Datasheet; count: number; limit: number; chapter: string | null; factionName: string; onAdd: () => void }) {
  const next = bandFor(ds, count + 1, chapter);
  const opts = next?.options ?? [];
  const price = opts[0]?.cost;
  const full = count >= limit;
  const models = [...new Set(opts.map((o) => o.models))];
  const sub: string[] = [];
  const sizes = sizePriceLine(ds, count, chapter);
  if (ds.leads.length) sub.push(ds.support ? 'Support' : 'Leader');
  // размеры с ценами — отдельной строкой («5: 65 · 10: 130»); один размер — число моделей здесь, цена справа
  if (!sizes && models.length && !(models.length === 1 && models[0] === 1)) sub.push(models.join(' / ') + ' мод.');
  if (ds.forgeWorld) sub.push('Forge World');
  // книга-источник, если она не основная книга фракции: так различаются одноимённые версии (Space Marines / Black Templars)
  else if (ds.source && !ds.legends && ds.source !== factionName) sub.push(ds.source);
  if (ds.outdated) sub.push('* данные устарели');
  const noCost = !ds.costs.length;
  if (noCost) sub.push('нет цены в данных — в армию не входит');
  return (
    <li className="border-b border-white/[0.06] last:border-b-0">
      <button type="button" onClick={onAdd} className={cx('flex w-full items-center gap-3 px-3.5 py-3 text-left transition active:bg-white/[0.06]', (full || noCost) && 'opacity-40')}>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug" title={outdatedNote(ds) ?? undefined}>
            {dsLabel(ds)}
          </p>
          {sub.length > 0 && <p className="mt-0.5 text-[12px] leading-snug text-fg-3">{sub.join(' · ')}</p>}
          {sizes && <p className="mt-0.5 text-[12px] leading-snug tabular-nums text-fg-2">{sizes}</p>}
        </div>
        {count > 0 && (
          <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums', full ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent')}>
            {count}/{limit}
          </span>
        )}
        <span className="w-11 shrink-0 text-right">
          {opts.length > 1 && <span className="block text-[12px] leading-none text-fg-3">от</span>}
          <span className="font-display text-[17px] font-semibold leading-tight tabular-nums">{price ?? '—'}</span>
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Icon name="plus" className="size-4" strokeWidth={2.5} />
        </span>
      </button>
    </li>
  );
}
