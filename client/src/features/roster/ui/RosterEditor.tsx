import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadFaction } from '../data';
import { availableDetachments, computeRoster, makeLookup, roleGroup, type ComputedRoster, type ComputedUnit, type DataLookup } from '../engine/compute';
import { BATTLE_SIZES, BATTLE_SIZE_ORDER } from '../engine/rules';
import { legacyIds, migrateRoster } from '../engine/migrate';
import { addUnit, duplicateRoster, duplicateUnit, removeUnit, touch, updateUnit } from '../engine/roster';
import { dispositionsOf, factionCredit, OUTDATED_RULE_NOTE, ruleLabel, visibleStratagem } from '../engine/source';
import type { DataIndex, Datasheet, Detachment, FactionData, Roster } from '../engine/types';
import { confirmAsk, haptic } from '../telegram';
import { Button, Empty, Field, Icon, IconButton, Segmented, Sheet, Tag } from './kit';
import { cx, fmtPts } from './util';
import { UnitCard } from './UnitCard';
import { sortRosterUnits } from '../engine/sort';
import { UnitPicker } from './UnitPicker';
import { ExportSheet } from './ExportSheet';
import { DetachmentPanel, RuleText } from './DetachmentPanel';
import { cleanRuleText } from '../text';
import { w40kPointSystems } from '../points';
import { PointsSheet } from './PointsSheet';

const GROUPS: { key: ReturnType<typeof roleGroup>; title: string }[] = [
  { key: 'characters', title: 'Персонажи' },
  { key: 'battleline', title: 'Боевая линия' },
  { key: 'transports', title: 'Выделенный транспорт' },
  { key: 'other', title: 'Прочие' },
  { key: 'allies', title: 'Союзники' },
];

export function RosterEditor({
  roster,
  index,
  onBack,
  onRules,
  onStartGame,
  onChange,
  onDuplicate,
  onDelete,
  viewOnly = false,
}: {
  roster: Roster;
  index: DataIndex;
  onBack: () => void;
  onRules: () => void;
  onStartGame: () => void;
  onChange: (r: Roster) => void;
  onDuplicate: (r: Roster) => void;
  onDelete: () => void;
  /** только просмотр (режим мастера в игре): без редактирования, меню и переключателя режима */
  viewOnly?: boolean;
}) {
  const [faction, setFaction] = useState<FactionData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  useEffect(() => {
    loadFaction(roster.factionId).then(setFaction, (e) => setLoadErr(String(e.message ?? e)));
  }, [roster.factionId]);

  const L = useMemo(() => (faction ? makeLookup(faction) : null), [faction]);
  const cr = useMemo(() => (L ? computeRoster(roster, L) : null), [roster, L]);

  // перевод сохранённого ростера на обновлённые данные (замены id из FactionData.migrations)
  useEffect(() => {
    if (!L) return;
    const m = migrateRoster(roster, L);
    if (m.changed) onChange(m.roster);
  }, [L, roster, onChange]);

  // кэш итогов для списка ростеров (без изменения updatedAt)
  useEffect(() => {
    if (!cr) return;
    const s = roster.summary;
    if (!s || s.points !== cr.points || s.errors !== cr.errors || s.warnings !== cr.warnings) {
      onChange({ ...roster, summary: { points: cr.points, errors: cr.errors, warnings: cr.warnings } });
    }
  }, [cr, roster, onChange]);

  if (loadErr) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xl uppercase">Не удалось открыть ростер</p>
        <p className="mt-2 text-sm text-white/50">{loadErr}</p>
        <div className="mt-5 flex gap-2">
          <Button onClick={onBack}>К списку</Button>
          <Button variant="primary" onClick={() => (setLoadErr(null), loadFaction(roster.factionId).then(setFaction, (e) => setLoadErr(String(e.message ?? e))))}>
            Повторить
          </Button>
        </div>
      </div>
    );
  }
  if (!L || !cr || !faction) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </div>
    );
  }
  return <Editor roster={roster} L={L} cr={cr} index={index} onBack={onBack} onRules={onRules} onStartGame={onStartGame} onChange={onChange} onDuplicate={onDuplicate} onDelete={onDelete} viewOnly={viewOnly} />;
}

function Editor({
  roster,
  L,
  cr,
  index,
  onBack,
  onRules,
  onStartGame,
  onChange,
  onDuplicate,
  onDelete,
  viewOnly = false,
}: {
  roster: Roster;
  L: DataLookup;
  cr: ComputedRoster;
  index: DataIndex;
  onBack: () => void;
  onRules: () => void;
  onStartGame: () => void;
  onChange: (r: Roster) => void;
  onDuplicate: (r: Roster) => void;
  onDelete: () => void;
  /** только просмотр (режим мастера в игре): без редактирования, меню и переключателя режима */
  viewOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [problems, setProblems] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detSheet, setDetSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(roster.detachmentIds.length === 0);
  const [flash, setFlash] = useState<string | null>(null);
  // режим просмотра: только чтение, без кнопок изменения
  const [viewState, setView] = useState(viewOnly);
  const view = viewOnly || viewState;
  const [detInfo, setDetInfo] = useState<string | null>(null);
  const [pointsInfo, setPointsInfo] = useState(false);
  const closeDetInfo = useCallback(() => setDetInfo(null), []);
  const shownDet = detInfo && cr.detachments.some((d) => d.id === detInfo) ? detInfo : null;
  const toggleDetInfo = (id: string) => {
    haptic.tap();
    setDetInfo((cur) => (cur === id ? null : id));
    window.setTimeout(() => document.getElementById('detachment-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };
  const size = BATTLE_SIZES[roster.battleSize];

  const set = (patch: Partial<Roster>) => onChange(touch({ ...roster, ...patch }));

  const issuesByUid = useMemo(() => {
    const m = new Map<string, ComputedRoster['issues']>();
    for (const i of cr.issues) for (const u of i.unitUids ?? []) m.set(u, [...(m.get(u) ?? []), i]);
    return m;
  }, [cr]);

  const topLevel = sortRosterUnits(cr.units.filter((c) => !c.unit.attachedTo || !cr.byUid.has(c.unit.attachedTo)));
  const grouped = GROUPS.map((g) => ({ ...g, list: topLevel.filter((c) => roleGroup(c) === g.key) })).filter((g) => g.list.length);

  const add = (ds: Datasheet) => {
    const next = addUnit(roster, ds);
    onChange(next);
    haptic.ok();
    setFlash(ds.name);
    window.setTimeout(() => setFlash((f) => (f === ds.name ? null : f)), 1400);
  };

  const scrollToUnit = (uid: string) => {
    setExpanded(uid);
    window.setTimeout(() => document.getElementById('u-' + uid)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  const pct = Math.min(100, (cr.points / size.points) * 100);
  const over = cr.points > size.points;

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-32 lg:max-w-3xl">
      {/* ---- шапка ---- */}
      <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-app/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <IconButton icon="back" label="К списку" onClick={onBack} className="size-9" />
          {view ? (
            <p className="font-display min-w-0 flex-1 truncate px-1.5 py-1 text-lg font-semibold uppercase">{roster.name}</p>
          ) : (
            <NameInput value={roster.name} onChange={(name) => set({ name })} />
          )}
          {!viewOnly && (
            <IconButton
              icon={view ? 'edit' : 'eye'}
              label={view ? 'Редактировать' : 'Режим просмотра'}
              onClick={() => (setView((v) => !v), setExpanded(null))}
              className={cx('size-9', view && 'bg-accent/15 text-accent')}
            />
          )}
          {!view && <IconButton icon="more" label="Меню" onClick={() => setMenu(true)} className="size-9" />}
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <button type="button" onClick={() => (haptic.tap(), setPointsInfo(true))} aria-label="Очки: сборка армии и партия" className="min-w-0 rounded-lg text-left active:opacity-70">
            <div className="flex items-baseline gap-1.5">
              <span className={cx('font-display text-[32px] font-semibold leading-none tabular-nums', over ? 'text-danger' : 'text-white')}>{fmtPts(cr.points)}</span>
              <span className="text-sm text-white/40">/ {fmtPts(size.points)}</span>
              <Icon name="info" className="size-3.5 shrink-0 self-center text-white/35" />
            </div>
          </button>
          <div className="flex gap-1.5">
            <Stat label="DP" value={`${cr.dp}/${cr.dpLimit}`} bad={cr.issues.some((i) => i.code === 'dp')} />
            <Stat label="Улучш." value={`${cr.enhancementsUsed}/${cr.enhancementsLimit}`} bad={cr.issues.some((i) => i.code === 'enh-cap')} />
            <button
              type="button"
              onClick={() => (haptic.tap(), setProblems(true))}
              className={cx(
                'flex min-w-12 flex-col items-center justify-center rounded-lg px-2 py-1 transition active:scale-95',
                cr.errors ? 'bg-danger/15 text-danger' : cr.warnings ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent',
              )}
            >
              <Icon name={cr.errors || cr.warnings ? 'alert' : 'check'} className="size-4" />
              <span className="text-[11px] font-semibold leading-tight">{cr.errors ? cr.errors : cr.warnings ? cr.warnings : 'OK'}</span>
            </button>
          </div>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div className={cx('h-full rounded-full transition-[width] duration-300', over ? 'bg-danger' : 'bg-accent')} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-6 px-4 pt-4">
        {/* ---- армия ---- */}
        <section className="rounded-2xl border border-white/10 bg-app-elevated">
          <button type="button" onClick={() => setSettingsOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
                {L.faction.name}
                {cr.chapter ? ` · ${cr.chapter}` : ''} · {size.label}
              </p>
              <p className="mt-0.5 truncate text-[15px] font-semibold">
                {cr.detachments.length ? cr.detachments.map((d) => d.name).join(' + ') : <span className="text-accent">Выберите детачмент</span>}
              </p>
              {roster.forceDisposition && <p className="mt-0.5 text-sm text-white/55">{roster.forceDisposition}</p>}
            </div>
            <Icon name="down" className={cx('size-5 shrink-0 text-white/40 transition', settingsOpen && 'rotate-180')} />
          </button>
          {settingsOpen && view && (
            <div className="space-y-4 border-t border-white/[0.06] px-4 pb-4 pt-3">
              <div>
                {[
                  ['Размер боя', `${size.label} · ${fmtPts(size.points)}`],
                  ['Орден', L.faction.chapters.length ? roster.chapter ?? cr.chapter ?? '—' : null],
                  ['Детачменты', cr.detachments.map((d) => d.name).join(' + ') || '—'],
                  ['Force Disposition', roster.forceDisposition],
                ]
                  .filter((x): x is [string, string] => !!x[1])
                  .map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] py-1.5 last:border-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{k}</span>
                      <span className="text-right text-[13.5px] font-semibold text-white/85">{v}</span>
                    </div>
                  ))}
              </div>
              {L.faction.armyRules.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Правила армии</p>
                  {L.faction.armyRules.map((id) => {
                    const r = L.faction.rules[id];
                    return r ? <RuleText key={id} name={r.name} text={r.text} /> : null;
                  })}
                </div>
              )}
            </div>
          )}
          {settingsOpen && !view && (
            <div className="space-y-5 border-t border-white/[0.06] px-4 pb-4 pt-4">
              <Field label="Размер боя">
                <Segmented
                  value={roster.battleSize}
                  onChange={(battleSize) => set({ battleSize })}
                  options={BATTLE_SIZE_ORDER.map((s) => ({ value: s, label: BATTLE_SIZES[s].label, hint: `${fmtPts(BATTLE_SIZES[s].points)} · ${BATTLE_SIZES[s].dp} DP` }))}
                />
              </Field>
              {L.faction.chapters.length > 0 && (
                <Field label="Орден" hint="Space Marines">
                  <select
                    value={roster.chapter ?? ''}
                    onChange={(e) => set({ chapter: e.target.value || null })}
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white outline-none focus:border-accent"
                  >
                    <option value="">Без ордена / определить автоматически</option>
                    {L.faction.chapters.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Детачменты" hint={`${cr.dp} из ${cr.dpLimit} DP`}>
                <div className="space-y-1.5">
                  {cr.detachments.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-1.5">
                      <button type="button" onClick={() => toggleDetInfo(d.id)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold">
                          {ruleLabel(d)}
                          <span className="ml-1.5 text-xs font-semibold text-accent">подробнее</span>
                        </p>
                        <p className="text-xs text-white/45">
                          {dpOf(d, cr.chapter)} DP · {dispositionsOf(d).join(' / ') || '—'}
                          {d.tag ? ` · ${d.tag}` : ''}
                        </p>
                      </button>
                      <IconButton
                        icon="close"
                        label="Убрать детачмент"
                        className="size-8 border-0"
                        onClick={() => {
                          const ids = roster.detachmentIds.filter((x) => x !== d.id);
                          const fds = ids.flatMap((x) => { const dd = L.det.get(x); return dd ? dispositionsOf(dd) : []; });
                          set({ detachmentIds: ids, forceDisposition: roster.forceDisposition && fds.includes(roster.forceDisposition) ? roster.forceDisposition : null });
                        }}
                      />
                    </div>
                  ))}
                  <Button variant="outline" className="w-full border-dashed" onClick={() => setDetSheet(true)}>
                    <Icon name="plus" className="size-4" /> {cr.detachments.length ? 'Добавить детачмент' : 'Выбрать детачмент'}
                  </Button>
                </div>
              </Field>
              {L.faction.armyRules.length > 0 && (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/45">Правила армии</span>
                    <span className="flex items-center gap-1 text-xs text-white/40">
                      {L.faction.armyRules.length}
                      <Icon name="down" className="size-3.5 transition group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {L.faction.armyRules.map((id) => {
                      const r = L.faction.rules[id];
                      return r ? <RuleText key={id} name={r.name} text={r.text} /> : null;
                    })}
                  </div>
                </details>
              )}
              {cr.dispositions.length > 0 && (
                <Field label="Force Disposition">
                  <Segmented value={roster.forceDisposition} onChange={(forceDisposition) => set({ forceDisposition })} options={cr.dispositions.map((d) => ({ value: d, label: d }))} />
                </Field>
              )}
            </div>
          )}
        </section>

        {/* ---- детачмент: кнопки и раскрывающаяся карточка ---- */}
        {cr.detachments.length > 0 && (
          <div className="-mt-3 space-y-3">
            {!shownDet && (
              <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
                {cr.detachments.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDetInfo(d.id)}
                    className="flex min-h-9 max-w-full shrink-0 items-center gap-1.5 rounded-xl border border-accent/25 bg-accent/10 px-3 py-1.5 text-left text-xs font-semibold text-accent transition active:scale-[0.98]"
                  >
                    <Icon name="book" className="size-3.5 shrink-0" />
                    <span className="text-accent/70">Детачмент:</span>
                    <span className="truncate text-white/90">{d.name}</span>
                    <Icon name="down" className="size-3.5 shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {shownDet && <DetachmentPanel id={shownDet} cr={cr} L={L} dp={(d) => dpOf(d, cr.chapter)} onSwitch={setDetInfo} onClose={closeDetInfo} />}
          </div>
        )}

        {/* ---- юниты ---- */}
        {grouped.length === 0 ? (
          <Empty title="Нет юнитов">Нажмите «Добавить юнит» внизу.</Empty>
        ) : (
          grouped.map((g) => (
            <section key={g.key}>
              <div className="mb-2.5 flex items-baseline justify-between px-1">
                <h2 className="font-display text-[15px] font-semibold uppercase tracking-wider text-white/70">
                  {g.title}
                  <span className="ml-2 font-sans text-xs font-semibold text-white/30">{g.list.reduce((n, c) => n + 1 + c.attached.length, 0)}</span>
                </h2>
                <span className="text-xs font-semibold tabular-nums text-white/40">{fmtPts(g.list.reduce((s, c) => s + c.total + c.attached.reduce((a, u) => a + (cr.byUid.get(u.uid)?.total ?? 0), 0), 0))}</span>
              </div>
              <div className="space-y-2.5">
                {g.list.map((c) => (
                  <UnitGroup
                    key={c.unit.uid}
                    c={c}
                    cr={cr}
                    roster={roster}
                    L={L}
                    issuesByUid={issuesByUid}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    onChange={onChange}
                    readOnly={view}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        <p className="pt-2 text-center text-xs text-white/30">{factionCredit(L.faction, index)}</p>
      </div>

      {/* ---- нижняя панель ---- */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-app via-app/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto flex max-w-lg gap-2 lg:max-w-3xl lg:px-4">
          {viewOnly ? (
            <Button variant="outline" className="h-12 flex-1 text-base" onClick={onBack}>
              <Icon name="back" /> <span className="whitespace-nowrap">К игре</span>
            </Button>
          ) : view ? (
            <Button variant="outline" className="h-12 flex-1 text-base" onClick={() => setView(false)}>
              <Icon name="edit" /> <span className="whitespace-nowrap">Редактировать</span>
            </Button>
          ) : (
            <Button variant="primary" className="h-12 flex-1 text-base" onClick={() => setPicker(true)}>
              <Icon name="plus" /> <span className="whitespace-nowrap">Добавить юнит</span>
            </Button>
          )}
          <Button variant="ghost" className="h-12 px-4" onClick={() => setExporting(true)}>
            <Icon name="share" /> <span className="max-[359px]:sr-only">Экспорт</span>
          </Button>
        </div>
      </div>

      {flash && (
        <div className="fade-enter pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg">+ {flash}</div>
        </div>
      )}

      <PointsSheet open={pointsInfo} onClose={() => setPointsInfo(false)} systems={w40kPointSystems(roster, L, cr)} />
      <UnitPicker open={picker} onClose={() => setPicker(false)} roster={roster} L={L} cr={cr} onAdd={add} onToggleLegends={() => set({ showLegends: !roster.showLegends })} />

      <DetachmentSheet open={detSheet} onClose={() => setDetSheet(false)} roster={roster} L={L} cr={cr} onPick={(d) => {
        const ids = [...roster.detachmentIds, d.id];
        const patch: Partial<Roster> = { detachmentIds: ids };
        const fds = dispositionsOf(d);
        if (!roster.forceDisposition && fds.length === 1) patch.forceDisposition = fds[0];
        if (d.chapter && !roster.chapter) patch.chapter = d.chapter;
        set(patch);
        setDetSheet(false);
        haptic.ok();
      }} />

      <Sheet open={problems} onClose={() => setProblems(false)} title={cr.issues.length ? `Проверка · ${cr.issues.length}` : 'Проверка'}>
        {cr.issues.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Icon name="check" className="size-6" />
            </div>
            <p className="mt-3 font-semibold">Ростер соответствует правилам</p>
            <p className="mt-1 text-sm text-white/50">Очки, детачменты, улучшения, лимиты и присоединения в порядке.</p>
          </div>
        ) : (
          <ul className="space-y-2 pb-2">
            {cr.issues.map((i, n) => (
              <li key={n}>
                <button
                  type="button"
                  disabled={!i.unitUids?.length}
                  onClick={() => {
                    setProblems(false);
                    if (i.unitUids?.[0]) scrollToUnit(i.unitUids[0]);
                  }}
                  className={cx(
                    'flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left text-sm',
                    i.level === 'error' ? 'border-danger/25 bg-danger/[0.07] text-red-100' : 'border-warn/25 bg-warn/[0.07] text-amber-100',
                  )}
                >
                  <Icon name={i.level === 'error' ? 'alert' : 'info'} className={cx('mt-0.5 size-4 shrink-0', i.level === 'error' ? 'text-danger' : 'text-warn')} />
                  <span className="flex-1">{i.message}</span>
                  {!!i.unitUids?.length && <Icon name="chevron" className="mt-0.5 size-4 shrink-0 opacity-50" />}
                </button>
              </li>
            ))}
            {!!roster.migrationNotes?.length && (
              <li>
                <Button variant="outline" className="w-full" onClick={() => set({ migrationNotes: undefined })}>
                  Скрыть сообщения о заменённых детачментах и улучшениях
                </Button>
              </li>
            )}
          </ul>
        )}
      </Sheet>

      <ExportSheet open={exporting} onClose={() => setExporting(false)} roster={roster} L={L} cr={cr} dataVersion={index.lastUpdate} credit={factionCredit(L.faction, index, 'en')} />

      <Sheet open={menu} onClose={() => setMenu(false)} title="Ростер">
        <div className="space-y-2 pb-2">
          <Button className="w-full justify-start" onClick={() => (setMenu(false), onRules())}>
            <Icon name="book" /> Стратагемы армии и правила
          </Button>
          <Button className="w-full justify-start" onClick={() => (setMenu(false), onStartGame())}>
            <Icon name="map" /> Начать игру с этим ростером
          </Button>
          <Button className="w-full justify-start" onClick={() => (setMenu(false), onDuplicate(duplicateRoster(roster)))}>
            <Icon name="copy" /> Дублировать ростер
          </Button>
          <Button className="w-full justify-start" onClick={() => (setMenu(false), setExporting(true))}>
            <Icon name="share" /> Экспорт / поделиться
          </Button>
          <Button
            variant="danger"
            className="w-full justify-start"
            onClick={async () => {
              if (await confirmAsk(`Удалить ростер «${roster.name}»?`)) onDelete();
            }}
          >
            <Icon name="trash" /> Удалить ростер
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

const dpOf = (d: Detachment, chapter: string | null) => (chapter && d.chapterDp[chapter] != null ? d.chapterDp[chapter] : d.dp);

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className={cx('flex min-w-12 flex-col items-center justify-center rounded-lg px-2 py-1', bad ? 'bg-danger/15 text-danger' : 'bg-white/[0.06] text-white/85')}>
      <span className="text-[13px] font-semibold leading-tight tabular-nums">{value}</span>
      <span className="text-[10px] font-semibold uppercase leading-tight tracking-wide opacity-55">{label}</span>
    </div>
  );
}

function NameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  // название изменилось снаружи (дублирование, импорт) — показываем новое
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
        // сохраняем сразу, чтобы название не потерялось при выходе кнопкой «Назад» без потери фокуса
        if (e.target.value.trim()) onChange(e.target.value);
      }}
      onBlur={() => (v.trim() ? v !== v.trim() && onChange(v.trim()) : setV(value))}
      onKeyDown={(e) => e.key === 'Enter' && ref.current?.blur()}
      aria-label="Название ростера"
      className="font-display min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold uppercase outline-none focus:border-white/10 focus:bg-white/[0.04]"
    />
  );
}

function UnitGroup({
  c,
  cr,
  roster,
  L,
  issuesByUid,
  expanded,
  setExpanded,
  onChange,
  readOnly = false,
}: {
  c: ComputedUnit;
  cr: ComputedRoster;
  roster: Roster;
  L: DataLookup;
  issuesByUid: Map<string, ComputedRoster['issues']>;
  expanded: string | null;
  setExpanded: (u: string | null) => void;
  onChange: (r: Roster) => void;
  readOnly?: boolean;
}) {
  const card = (x: ComputedUnit, nested: boolean) => (
    <UnitCard
      key={x.unit.uid}
      c={x}
      cr={cr}
      roster={roster}
      L={L}
      nested={nested}
      issues={issuesByUid.get(x.unit.uid) ?? []}
      expanded={expanded === x.unit.uid}
      onToggle={() => setExpanded(expanded === x.unit.uid ? null : x.unit.uid)}
      onPatch={(patch) => onChange(updateUnit(roster, x.unit.uid, patch))}
      onWarlord={() => onChange(touch({ ...roster, warlordUid: x.unit.uid }))}
      onDuplicate={() => onChange(duplicateUnit(roster, x.unit.uid))}
      onRemove={() => {
        onChange(removeUnit(roster, x.unit.uid));
        haptic.tap();
      }}
      readOnly={readOnly}
    />
  );
  if (!c.attached.length) return card(c, false);
  // порядок внутри отряда: Leader → Support → телохранители
  const chars = c.attached
    .map((u) => cr.byUid.get(u.uid))
    .filter((x): x is ComputedUnit => !!x)
    .sort((a, b) => Number(!!a.ds?.support) - Number(!!b.ds?.support));
  const total = c.total + chars.reduce((s, x) => s + x.total, 0);
  return (
    <div className="overflow-hidden rounded-2xl border border-accent/25 bg-app-elevated">
      <div className="flex items-baseline justify-between bg-accent/[0.06] px-4 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent/85">Отряд</p>
        <p className="text-[12px] font-semibold tabular-nums text-accent/85">{fmtPts(total)} очк.</p>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {chars.map((x) => card(x, true))}
        {card(c, true)}
      </div>
    </div>
  );
}

function DetachmentSheet({ open, onClose, roster, L, cr, onPick }: { open: boolean; onClose: () => void; roster: Roster; L: DataLookup; cr: ComputedRoster; onPick: (d: Detachment) => void }) {
  const [info, setInfo] = useState<string | null>(null);
  const list = availableDetachments(L, roster.chapter ?? cr.chapter, legacyIds(roster).detachments).filter((d) => !roster.detachmentIds.includes(d.id));
  const usedTags = new Set(cr.detachments.map((d) => d.tag).filter(Boolean));
  const left = cr.dpLimit - cr.dp;
  const sorted = [...list].sort((a, b) => a.dp - b.dp || a.name.localeCompare(b.name));
  return (
    <Sheet open={open} onClose={onClose} title="Детачменты" tall>
      <p className="mb-3 text-sm text-white/55">
        Осталось <b className="text-white">{Math.max(0, left)} DP</b>. Детачменты с одинаковым тегом взять вместе нельзя.
      </p>
      <ul className="space-y-1.5 pb-2">
        {sorted.map((d) => {
          const dp = dpOf(d, roster.chapter ?? cr.chapter);
          const tooMuch = dp > left;
          const tagClash = !!d.tag && usedTags.has(d.tag);
          const enh = L.faction.enhancements.filter((e) => e.detachment === d.id && (!e.outdated || !!d.outdated));
          const open_ = info === d.id;
          return (
            <li key={d.id} className={cx('rounded-xl border bg-white/[0.03]', tooMuch || tagClash ? 'border-white/[0.06]' : 'border-white/10')}>
              <div className="flex items-center gap-2 py-2 pl-3 pr-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setInfo(open_ ? null : d.id)}>
                  <p className={cx('text-sm font-semibold', (tooMuch || tagClash) && 'text-white/45')}>{ruleLabel(d)}</p>
                  {d.outdated && <p className="mt-0.5 text-xs text-amber-200">{OUTDATED_RULE_NOTE} Был в этом ростере — можно вернуть.</p>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Tag tone={tooMuch ? 'danger' : 'accent'}>{dp} DP</Tag>
                    {dispositionsOf(d).map((fd) => (
                      <Tag key={fd}>{fd}</Tag>
                    ))}
                    {d.tag && <Tag tone={tagClash ? 'danger' : 'muted'}>{d.tag}</Tag>}
                    {d.chapter && <Tag tone="warn">{d.chapter}</Tag>}
                  </div>
                </button>
                <Button variant={tooMuch || tagClash ? 'ghost' : 'primary'} className="h-9 min-h-0 px-3" onClick={() => onPick(d)}>
                  Взять
                </Button>
              </div>
              {open_ && (
                <div className="space-y-3 border-t border-white/[0.06] px-3 py-3 text-sm">
                  {d.abilities.map((a, i) => (
                    <div key={i}>
                      <p className="font-semibold text-accent">{a.name}</p>
                      <p className="mt-1 whitespace-pre-line text-white/70">{cleanRuleText(a.text)}</p>
                    </div>
                  ))}
                  {L.faction.stratagems.some((st) => st.detachment === d.id && visibleStratagem(st, L.det)) && (
                    <div>
                      <p className="font-semibold text-white/85">Стратагемы</p>
                      <div className="mt-1 space-y-1.5">
                        {L.faction.stratagems
                          .filter((st) => st.detachment === d.id && visibleStratagem(st, L.det))
                          .map((st) => (
                            <RuleText key={st.id} name={`${st.name} · ${st.cp} CP`} sub={[st.type, st.turn, st.phase].filter(Boolean).join(' · ')} text={st.text} />
                          ))}
                      </div>
                    </div>
                  )}
                  {enh.length > 0 && (
                    <div>
                      <p className="font-semibold text-white/85">Улучшения</p>
                      <ul className="mt-1 space-y-1 text-white/65">
                        {enh.map((e) => (
                          <li key={e.id}>
                            {e.name} — {e.cost} очк.{e.upgrade ? ' · Upgrade' : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

